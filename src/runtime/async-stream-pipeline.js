import { Integer } from "@ratmath/core";
import {
    createAsyncStream, claimAsyncStream, closeAsyncStream, pullRawAsyncStream,
    processAsyncStreamItem, applyAsyncStreamStage,
} from "./async-stream.js";
import { asyncLimitFault, appendAsyncFailures } from "./async-policy.js";
import { OperationalFault } from "./operational-fault.js";
import { defaultStreamClock, abortableStreamWait, streamAlarm, streamAbortReason } from "./async-stream-clock.js";

const safe = (stage) => ["map", "filter", "expected_error"].includes(stage.kind);
export const needsAsyncStreamPipeline = (stream) => stream._stream.stages.some((stage) => !safe(stage));
const done = Object.freeze({ done: true });
const sequence = (values) => ({ type: "sequence", values, _ext: new Map([["_mutable", new Integer(1n)]]) });

/** Compile a linear handle into ordered cursors. Only elementwise regions fan out.
 * The evaluator supplies run() so every callback shares its existing scheduler,
 * effect lane, cancellation, task paths, and evaluation budget.
 */
export async function prepareAsyncStreamPipeline(stream, execution = {}) {
    const limits = execution.limits || stream._stream.root.limits;
    const controller = new AbortController();
    const signal = controller.signal;
    const parentAbort = () => controller.abort(streamAbortReason(execution.signal));
    if (execution.signal?.aborted) parentAbort();
    else execution.signal?.addEventListener("abort", parentAbort, { once: true });
    const clock = execution.clock || stream._stream.root.clock || defaultStreamClock;
    const owned = new Set();
    const tasks = new Set();
    const stats = { segments: 0, queued: 0, running: 0, maxQueued: 0, maxRunning: 0, published: 0, dropped: 0, buffered: 0, executor: execution.run ? "scheduler" : "event-loop", cancellation: "" };
    stream._stream.root.pipelineStats = stats;
    let segmentCount = 0;
    const seen = new Set();
    let window = 1;
    const track = (promise) => {
        tasks.add(promise);
        promise.then(() => tasks.delete(promise), () => tasks.delete(promise));
        return promise;
    };
    const wait = (promise) => abortableStreamWait(promise, signal);
    const note = (event, extra = {}) => execution.trace?.({ event, stream: stream._stream.label, ...stats, ...extra });
    let closePromise;
    const close = (reason = { kind: "complete" }) => closePromise ||= (async () => {
        execution.signal?.removeEventListener("abort", parentAbort);
        stats.cancellation = reason?.kind || reason?.code || "closed";
        controller.abort(reason);
        execution.cancel?.(reason);
        const errors = [];
        const closing = await Promise.allSettled([...owned].map(async (source) => {
            try { await closeAsyncStream(source, reason); } finally {
                for (const stage of source._stream.stages) if (stage.buffer) stage.buffer.length = 0;
                execution.release?.(source);
            }
        }));
        for (const result of closing) if (result.status === "rejected") errors.push(result.reason);
        await Promise.allSettled([...tasks]);
        await execution.dispose?.();
        stats.queued = 0;
        stats.buffered = 0;
        note("stream-close");
        if (errors.length) { appendAsyncFailures(errors[0], errors.slice(1), limits.errors); throw errors[0]; }
    })();

    function parallelCursor(upstream, stages, input, segment) {
        const queue = [];
        let ended = false;
        let failure;
        let started = false;
        let notify;
        let space;
        let index = 0;
        async function produce() {
            try {
                while (!signal.aborted) {
                    if (queue.length >= window) await wait(new Promise((resolve) => { space = resolve; }));
                    if (signal.aborted) break;
                    const raw = await wait(upstream.next());
                    if (raw.done) break;
                    const taskIndex = ++index;
                    stats.queued++;
                    stats.maxQueued = Math.max(stats.maxQueued, stats.queued);
                    const work = async (invoke = execution.invoke) => {
                        stats.running++;
                        stats.maxRunning = Math.max(stats.maxRunning, stats.running);
                        note("stream-item-start", { segment, itemIndex: taskIndex });
                        try {
                            if (raw.unresolved !== undefined) return raw;
                            const result = await processAsyncStreamItem({ ...input, _stream: { ...input._stream, stages } }, raw, { ...execution, signal, invoke });
                            return { ...raw, ...result };
                        } finally { stats.running--; note("stream-item-end", { segment, itemIndex: taskIndex }); }
                    };
                    const job = track(Promise.resolve().then(() => execution.run ? execution.run(work, { segment, index: taskIndex, signal }) : work()));
                    job.catch(() => {});
                    queue.push(job);
                    notify?.(); notify = null;
                }
            } catch (error) { failure = error; }
            finally { ended = true; notify?.(); notify = null; }
        }
        return (async function* () {
            if (!started) { started = true; track(produce()); }
            while (true) {
                if (!queue.length && !ended) await wait(new Promise((resolve) => { notify = resolve; }));
                if (!queue.length) { if (failure) throw failure; return; }
                const result = await wait(queue[0]);
                queue.shift(); stats.queued--; space?.(); space = null;
                if (result.unresolved !== undefined) { yield result; return; }
                for (const value of result.values || [result.value]) yield { done: false, value, sourceIndex: result.sourceIndex };
                if (result.stop) return;
            }
        })();
    }

    function barrierCursor(upstream, stage, input, segment) {
        return (async function* () {
            let lastIndex = 0;
            if (stage.kind === "take" && stage.count === 0) return;
            while (true) {
                const raw = await wait(upstream.next());
                if (raw.done) break;
                if (raw.unresolved !== undefined) { yield raw; return; }
                lastIndex = raw.sourceIndex;
                const previousSize = stage.buffer?.length || 0;
                const reserved = stage.kind === "chunk_by" ? 1
                    : stage.kind === "chunk" ? (previousSize + 1 === stage.size ? -previousSize : 1)
                    : stage.kind === "window" && previousSize < stage.size ? 1 : 0;
                if (stats.buffered + reserved > limits.outputItems) throw asyncLimitFault("stream stateful buffers", limits.outputItems);
                stats.buffered += reserved;
                const apply = (invoke = execution.invoke) => applyAsyncStreamStage(stage, [raw.value], input, { ...execution, signal, invoke, sourceIndex: lastIndex });
                let result;
                if (stage.kind === "chunk_by") {
                    stats.queued++; stats.maxQueued = Math.max(stats.maxQueued, stats.queued);
                    const work = async (invoke) => {
                        stats.running++; stats.maxRunning = Math.max(stats.maxRunning, stats.running);
                        note("stream-item-start", { segment, itemIndex: lastIndex });
                        try { return await apply(invoke); }
                        finally { stats.running--; note("stream-item-end", { segment, itemIndex: lastIndex }); }
                    };
                    try { result = execution.run ? await wait(track(execution.run(work, { segment, index: lastIndex, signal }))) : await work(); }
                    finally { stats.queued--; }
                } else result = await apply();
                stats.buffered += (stage.buffer?.length || 0) - previousSize - reserved;
                if (result.unresolved !== undefined) { yield { done: false, unresolved: result.unresolved }; return; }
                for (const value of result.values) yield { done: false, value, sourceIndex: lastIndex };
                if (result.stop) break;
            }
            if (["chunk", "chunk_by"].includes(stage.kind) && stage.buffer.length) {
                const value = sequence(stage.buffer); stats.buffered -= stage.buffer.length; stage.buffer = [];
                yield { done: false, value, sourceIndex: lastIndex };
            }
        })();
    }

    function mergeCursor(inputs) {
        return (async function* () {
            const ready = [];
            let active = inputs.length;
            let wake;
            const start = (index) => {
                track(wait(inputs[index].next()).then(
                    (raw) => { ready.push({ index, raw }); wake?.(); wake = null; },
                    (error) => { ready.push({ index, error }); wake?.(); wake = null; },
                ));
            };
            inputs.forEach((_input, index) => start(index));
            while (active) {
                if (!ready.length) await wait(new Promise((resolve) => { wake = resolve; }));
                const { index, raw, error } = ready.shift();
                if (error) throw error;
                if (raw.done) { active--; continue; }
                yield raw;
                if (raw.unresolved !== undefined) return;
                start(index);
            }
        })();
    }

    function timedCursor(upstream, stage) {
        return (async function* () {
            let pending = null;
            let previous = -Infinity;
            let lastObserved = -Infinity;
            const next = () => pending ||= wait(upstream.next());
            if (stage.kind === "throttle") {
                while (true) {
                    const raw = await next(); pending = null;
                    if (raw.done) return;
                    if (raw.unresolved !== undefined) { yield raw; return; }
                    const now = clock.now();
                    if (!Number.isFinite(now) || now < lastObserved) throw new Error("Stream clock must be finite and monotonic");
                    lastObserved = now;
                    if (now - previous >= stage.duration) { previous = now; yield raw; }
                    else stats.dropped++;
                }
            }
            let held = null;
            while (true) {
                if (stage.kind === "debounce" && held === null) {
                    held = await next(); pending = null;
                    if (held.done) return;
                    if (held.unresolved !== undefined) { yield held; return; }
                }
                const alarm = streamAlarm(clock, stage.duration, signal);
                let raced;
                try {
                    raced = await Promise.race([next().then((raw) => ({ raw })), alarm.promise.then(() => ({ timeout: true }))]);
                } finally { alarm.cancel(); }
                if (raced.timeout) {
                    if (stage.kind === "timeout") throw new OperationalFault("Async stream demand timed out", { code: "ASYNC_STREAM_TIMEOUT", data: { milliseconds: stage.duration } });
                    yield held; held = null;
                } else {
                    pending = null;
                    const raw = raced.raw;
                    if (raw.unresolved !== undefined) { yield raw; return; }
                    if (raw.done) { if (held) yield held; return; }
                    if (stage.kind === "timeout") yield raw;
                    else { if (held) stats.dropped++; held = raw; }
                }
            }
        })();
    }

    function latestCursor(upstream) {
        let held;
        let ended = false;
        let failure;
        let wake;
        return (async function* () {
            track((async () => {
                let count = 0;
                try {
                    while (true) {
                        const raw = await wait(upstream.next());
                        if (raw.done) break;
                        if (held) stats.dropped++;
                        held = raw; wake?.(); wake = null;
                        if (raw.unresolved !== undefined) break;
                        // A synchronous infinite producer must still yield to cancellation/timers.
                        if (++count % 64 === 0) {
                            const alarm = streamAlarm(clock, 0, signal);
                            try { await alarm.promise; } finally { alarm.cancel(); }
                        }
                    }
                } catch (error) { failure = error; }
                finally { ended = true; wake?.(); wake = null; }
            })());
            while (true) {
                if (!held && !ended) await wait(new Promise((resolve) => { wake = resolve; }));
                if (failure) throw failure;
                if (!held) return;
                const value = held; held = null; yield value;
                if (value.unresolved !== undefined) return;
            }
        })();
    }

    function records(iterator) {
        return { async next() {
            const result = await iterator.next();
            return result.done ? done : result.value;
        } };
    }
    function compile(input) {
        claimAsyncStream(input); owned.add(input);
        let pulls = 0;
        let cursor = { async next() {
            execution.checkpoint?.();
            if (++pulls % 64 === 0) {
                const alarm = streamAlarm(clock, 0, signal);
                try { await alarm.promise; } finally { alarm.cancel(); }
            }
            return pullRawAsyncStream(input, signal);
        } };
        const stages = input._stream.stages;
        for (let index = 0; index < stages.length; index++) {
            const stage = stages[index];
            const segment = ++stats.segments;
            if (safe(stage)) {
                const group = [stage];
                while (safe(stages[index + 1] || {})) group.push(stages[++index]);
                cursor = parallelCursor(cursor, group, input, segment);
            } else if (stage.kind === "merge") cursor = mergeCursor([cursor, compile(stage.other)]);
            else if (["timeout", "debounce", "throttle"].includes(stage.kind)) cursor = timedCursor(cursor, stage);
            else if (stage.kind === "latest") cursor = latestCursor(cursor);
            else cursor = barrierCursor(cursor, stage, input, segment);
            cursor = records(cursor);
        }
        return cursor;
    }
    let cursor;
    try {
        claimAsyncStream(stream); owned.add(stream);
        const pending = [{ input: stream, depth: 0 }];
        while (pending.length) {
            const { input, depth } = pending.pop();
            if (depth > 64) throw asyncLimitFault("stream merge depth", 64);
            if (seen.has(input._stream.root)) throw new Error("A stream pipeline cannot consume the same linear source twice");
            seen.add(input._stream.root);
            segmentCount += input._stream.stages.length + 1;
            if (segmentCount > limits.outstanding) throw asyncLimitFault("stream stages", limits.outstanding);
            for (const stage of input._stream.stages) if (stage.kind === "merge") pending.push({ input: stage.other, depth: depth + 1 });
        }
        window = Math.max(1, Math.min((execution.run ? (execution.concurrency || 1) * 2 : 1), limits.queued, Math.floor(limits.outstanding / segmentCount)));
        cursor = compile(stream);
    } catch (error) {
        try { await close(error); } catch (cleanup) { appendAsyncFailures(error, [cleanup], limits.errors); }
        throw error;
    }
    note("stream-open", { window });
    return createAsyncStream({
        finite: stream._stream.finite,
        limits, label: stream._stream.label, callbackSource: stream._stream.callbackSource ?? stream,
        inspect: () => ({ ...stats }), close,
        async next(demandSignal) {
            const result = await abortableStreamWait(wait(cursor.next()), demandSignal);
            if (demandSignal?.aborted) throw streamAbortReason(demandSignal);
            if (result.done) return done;
            const raw = result;
            stats.published++;
            note("stream-publish", { outputIndex: stats.published });
            return raw;
        },
    });
}
