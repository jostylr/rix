import { Integer } from "@ratmath/core";
import { OperationalFault } from "./operational-fault.js";
import { registerAsyncResource } from "./async-runtime.js";
import { expectedErrorArgs } from "./expected-error.js";
import { UNDECIDED, decisionState } from "./decision.js";

let nextStreamId = 1;

function abortError(signal) {
    return signal?.reason || Object.assign(new Error("Async stream operation cancelled"), { kind: "cancellation" });
}

function positiveInteger(value, label, { allowZero = false } = {}) {
    let number;
    if (value instanceof Integer) number = Number(value.value);
    else if (typeof value === "bigint") number = Number(value);
    else number = Number(value);
    const minimum = allowZero ? 0 : 1;
    if (!Number.isSafeInteger(number) || number < minimum) {
        throw new Error(`${label} must be a ${allowZero ? "non-negative" : "positive"} safe integer`);
    }
    return number;
}

function stringOption(value, label) {
    const raw = value?.type === "string" ? value.value : value;
    if (typeof raw !== "string") throw new Error(`${label} must be a string or colon-string`);
    return raw.replace(/^:/, "").toLowerCase();
}

function rixSequence(values) {
    return { type: "sequence", values, _ext: new Map([['_mutable', new Integer(1n)]]) };
}

function createRoot(options) {
    const root = {
        id: nextStreamId++,
        label: options.label || "stream",
        finite: options.finite === true,
        status: "open",
        pulled: 0,
        closeCount: 0,
        terminalOwner: null,
        pullTail: Promise.resolve(),
        nextImpl: options.next,
        closeImpl: options.close || (() => undefined),
        inspect: options.inspect || null,
        closePromise: null,
    };
    if (typeof root.nextImpl !== "function") throw new Error("Async stream requires a Next implementation");
    return root;
}

export function isAsyncStream(value) {
    return Boolean(value && value.type === "async_stream" && value._stream?.root);
}

export function createAsyncStream(options) {
    return {
        type: "async_stream",
        _stream: {
            id: nextStreamId++,
            root: createRoot(options),
            stages: [],
            finite: options.finite === true,
            label: options.label || "stream",
            callbackSource: options.callbackSource ?? null,
        },
        _ext: options.ext ? new Map(options.ext) : new Map(),
    };
}

function derive(source, stage, options = {}) {
    if (!isAsyncStream(source)) throw new Error("Expected an async stream");
    return {
        type: "async_stream",
        _stream: {
            id: nextStreamId++,
            root: source._stream.root,
            stages: [...source._stream.stages, stage],
            finite: options.finite ?? source._stream.finite,
            label: options.label || `${source._stream.label}.${stage.kind}`,
            callbackSource: source._stream.callbackSource,
        },
        _ext: new Map(),
    };
}

export function mapAsyncStream(source, mapper) {
    return derive(source, { kind: "map", callable: mapper });
}

export function filterAsyncStream(source, predicate) {
    return derive(source, { kind: "filter", callable: predicate });
}

export function expectedErrorAsyncStream(source, handler) {
    return derive(source, { kind: "expected_error", callable: handler });
}

export function takeAsyncStream(source, countValue) {
    const count = positiveInteger(countValue, "Stream Take count", { allowZero: true });
    return derive(source, { kind: "take", count, seen: 0 }, { finite: true });
}

export function dropAsyncStream(source, countValue) {
    const count = positiveInteger(countValue, "Stream Drop count", { allowZero: true });
    return derive(source, { kind: "drop", count, seen: 0 });
}

export function chunkAsyncStream(source, sizeValue) {
    const size = positiveInteger(sizeValue, "Stream Chunk size");
    return derive(source, { kind: "chunk", size, buffer: [] });
}

export function windowAsyncStream(source, sizeValue, stepValue = new Integer(1n)) {
    const size = positiveInteger(sizeValue, "Stream Window size");
    const step = positiveInteger(stepValue, "Stream Window step");
    return derive(source, { kind: "window", size, step, buffer: [], sinceEmit: 0 });
}

export function asyncStreamSupportsConcurrentItems(stream) {
    return isAsyncStream(stream) && stream._stream.stages.every((stage) =>
        stage.kind === "map" || stage.kind === "filter" || stage.kind === "expected_error");
}

export function asyncStreamCanCompleteWithoutPull(stream) {
    return isAsyncStream(stream)
        && stream._stream.stages.some((stage) => stage.kind === "take" && stage.seen >= stage.count);
}

export function claimAsyncStream(stream) {
    if (!isAsyncStream(stream)) throw new Error("Expected an async stream");
    const root = stream._stream.root;
    if (root.terminalOwner !== null && root.terminalOwner !== stream._stream.id) {
        throw new Error("Async streams are linear and cannot be consumed by two derived handles");
    }
    root.terminalOwner = stream._stream.id;
}

export async function closeAsyncStream(stream, reason = null) {
    if (!isAsyncStream(stream)) throw new Error("Expected an async stream");
    const root = stream._stream.root;
    if (root.closePromise) return root.closePromise;
    const terminalStatus = root.status === "done" || root.status === "faulted" ? root.status : null;
    root.status = terminalStatus || "closing";
    root.closeCount++;
    root.closePromise = Promise.resolve()
        .then(() => root.closeImpl(reason))
        .then(() => {
            root.status = terminalStatus || "closed";
            return null;
        }, (error) => {
            root.status = "faulted";
            throw error;
        });
    return root.closePromise;
}

export function asyncStreamStatus(stream) {
    if (!isAsyncStream(stream)) throw new Error("Expected an async stream");
    const root = stream._stream.root;
    const entries = new Map([
        ["label", { type: "string", value: stream._stream.label }],
        ["status", { type: "string", value: root.status }],
        ["pulled", new Integer(BigInt(root.pulled))],
        ["finite", root.finite || stream._stream.finite ? new Integer(1n) : null],
    ]);
    if (typeof root.inspect === "function") {
        const extra = root.inspect();
        for (const [key, value] of Object.entries(extra || {})) {
            entries.set(key, typeof value === "number" ? new Integer(BigInt(value)) : value);
        }
    }
    return { type: "map", entries };
}

export function asyncStreamDone(stream) {
    const status = stream?._stream?.root?.status;
    return status === "done" || status === "closed" || status === "faulted";
}

export async function pullRawAsyncStream(stream, signal = null) {
    if (!isAsyncStream(stream)) throw new Error("Expected an async stream");
    const root = stream._stream.root;
    if (signal?.aborted) throw abortError(signal);
    if (root.status === "done" || root.status === "closed") return { done: true };
    if (root.status === "faulted") throw new Error(`Async stream '${root.label}' is faulted`);

    const operation = root.pullTail.then(async () => {
        if (signal?.aborted) throw abortError(signal);
        if (root.status !== "open") return { done: true };
        let result;
        try {
            result = await root.nextImpl(signal);
        } catch (error) {
            if (signal?.aborted) throw abortError(signal);
            root.status = "faulted";
            throw error;
        }
        if (!result || result.done === true) {
            root.status = "done";
            await closeAsyncStream(stream, { kind: "complete" });
            return { done: true };
        }
        root.pulled++;
        return { done: false, value: result.value, sourceIndex: root.pulled };
    });
    root.pullTail = operation.catch(() => {});
    return operation;
}

async function applyStage(stage, values, stream, execution) {
    const callbackSource = stream._stream.callbackSource ?? stream;
    if (stage.kind === "map") {
        const mapped = [];
        for (const entry of values) {
            mapped.push(await execution.invoke(stage.callable, [entry, new Integer(BigInt(execution.sourceIndex)), callbackSource]));
        }
        return { values: mapped, stop: false };
    }
    if (stage.kind === "filter") {
        const kept = [];
        for (const entry of values) {
            const result = await execution.invoke(stage.callable, [entry, new Integer(BigInt(execution.sourceIndex)), callbackSource]);
            const state = decisionState(result);
            if (state === "undecided") return { values: [], stop: true, unresolved: UNDECIDED };
            if (state === "truth") kept.push(entry);
        }
        return { values: kept, stop: false };
    }
    if (stage.kind === "expected_error") {
        const recovered = [];
        for (const entry of values) {
            const args = expectedErrorArgs(entry);
            if (args === null) {
                recovered.push(entry);
                continue;
            }
            const result = await execution.invoke(stage.callable, args);
            if (result !== null && result !== undefined) recovered.push(result);
        }
        return { values: recovered, stop: false };
    }
    if (stage.kind === "drop") {
        const kept = [];
        for (const entry of values) {
            stage.seen++;
            if (stage.seen > stage.count) kept.push(entry);
        }
        return { values: kept, stop: false };
    }
    if (stage.kind === "take") {
        const kept = [];
        let stop = false;
        for (const entry of values) {
            if (stage.seen >= stage.count) {
                stop = true;
                break;
            }
            stage.seen++;
            kept.push(entry);
            if (stage.seen >= stage.count) stop = true;
        }
        return { values: kept, stop };
    }
    if (stage.kind === "chunk") {
        const emitted = [];
        for (const entry of values) {
            stage.buffer.push(entry);
            if (stage.buffer.length === stage.size) {
                emitted.push(rixSequence(stage.buffer));
                stage.buffer = [];
            }
        }
        return { values: emitted, stop: false };
    }
    if (stage.kind === "window") {
        const emitted = [];
        for (const entry of values) {
            stage.buffer.push(entry);
            if (stage.buffer.length > stage.size) stage.buffer.shift();
            stage.sinceEmit++;
            if (stage.buffer.length === stage.size && stage.sinceEmit >= stage.step) {
                emitted.push(rixSequence([...stage.buffer]));
                stage.sinceEmit = 0;
            }
        }
        return { values: emitted, stop: false };
    }
    throw new Error(`Unknown async stream stage '${stage.kind}'`);
}

export async function processAsyncStreamItem(stream, raw, execution) {
    let values = [raw.value];
    let stop = false;
    const stageExecution = { ...execution, sourceIndex: raw.sourceIndex };
    for (const stage of stream._stream.stages) {
        const result = await applyStage(stage, values, stream, stageExecution);
        if (result.unresolved !== undefined) {
            return { values: [], stop: true, unresolved: result.unresolved, sourceIndex: raw.sourceIndex };
        }
        values = result.values;
        stop ||= result.stop;
        if (values.length === 0 && !stop) break;
    }
    return { values, stop, sourceIndex: raw.sourceIndex };
}

export async function flushAsyncStreamStages(stream, execution) {
    const stages = stream._stream.stages;
    const values = [];
    for (let index = 0; index < stages.length; index++) {
        const stage = stages[index];
        if (stage.kind !== "chunk" || stage.buffer.length === 0) continue;
        let pending = [rixSequence(stage.buffer)];
        stage.buffer = [];
        for (let tail = index + 1; tail < stages.length; tail++) {
            const result = await applyStage(stages[tail], pending, stream, { ...execution, sourceIndex: execution.sourceIndex || 0 });
            pending = result.values;
        }
        values.push(...pending);
    }
    return values;
}

export async function consumeAsyncStreamSequential(stream, terminal, execution) {
    let result = terminal.kind === "collect" ? [] : terminal.initial;
    let count = 0;
    let reason = { kind: "complete" };
    let primary = null;
    let claimed = false;
    let uncertain = false;
    try {
        claimAsyncStream(stream);
        claimed = true;
        if (terminal.kind === "count" && !stream._stream.finite && terminal.bound === null) {
            throw new Error("Count requires a finite or explicitly bounded async stream");
        }
        if (terminal.bound === 0 || asyncStreamCanCompleteWithoutPull(stream)) {
            reason = { kind: "early terminal" };
            if (terminal.kind === "collect") return rixSequence([]);
            if (terminal.kind === "count") return new Integer(0n);
            if (terminal.kind === "forEach" || terminal.kind === "first" || terminal.kind === "find" || terminal.kind === "all") return null;
            return result;
        }
        while (true) {
            const raw = await pullRawAsyncStream(stream, execution.signal);
            if (raw.done) break;
            const processed = await processAsyncStreamItem(stream, raw, execution);
            if (processed.unresolved !== undefined) return processed.unresolved;
            for (const value of processed.values) {
                count++;
                if (terminal.kind === "collect") result.push(value);
                else if (terminal.kind === "forEach") await execution.invoke(terminal.callable, [value, new Integer(BigInt(count)), stream._stream.callbackSource ?? stream]);
                else if (terminal.kind === "reduce") result = await execution.invoke(terminal.callable, [result, value, new Integer(BigInt(count)), stream._stream.callbackSource ?? stream]);
                else if (terminal.kind === "first") {
                    reason = { kind: "early terminal" };
                    return value;
                }
                else if (terminal.kind === "find") {
                    const match = await execution.invoke(terminal.callable, [value, new Integer(BigInt(count)), stream._stream.callbackSource ?? stream]);
                    const state = decisionState(match);
                    if (state === "truth") {
                        reason = { kind: "early terminal" };
                        return value;
                    }
                    if (state === "undecided") uncertain = true;
                }
                else if (terminal.kind === "all") {
                    const match = await execution.invoke(terminal.callable, [value, new Integer(BigInt(count)), stream._stream.callbackSource ?? stream]);
                    const state = decisionState(match);
                    if (state === "null") {
                        reason = { kind: "early terminal" };
                        return null;
                    }
                    if (state === "undecided") uncertain = true;
                    else if (!uncertain) result = value;
                }
                if (terminal.bound !== null && count >= terminal.bound) {
                    reason = { kind: "early terminal" };
                    if (terminal.kind === "collect") return rixSequence(result);
                    if (terminal.kind === "count") return new Integer(BigInt(count));
                    return result;
                }
            }
            if (processed.stop) {
                reason = { kind: "early terminal" };
                break;
            }
        }
        const flushed = await flushAsyncStreamStages(stream, execution);
        for (const value of flushed) {
            count++;
            if (terminal.kind === "collect") result.push(value);
            else if (terminal.kind === "forEach") await execution.invoke(terminal.callable, [value, new Integer(BigInt(count)), stream]);
            else if (terminal.kind === "reduce") result = await execution.invoke(terminal.callable, [result, value, new Integer(BigInt(count)), stream]);
            else if (terminal.kind === "first") return value;
            else if (terminal.kind === "find") {
                const match = await execution.invoke(terminal.callable, [value, new Integer(BigInt(count)), stream]);
                const state = decisionState(match);
                if (state === "truth") return value;
                if (state === "undecided") uncertain = true;
            }
            else if (terminal.kind === "all") {
                const match = await execution.invoke(terminal.callable, [value, new Integer(BigInt(count)), stream]);
                const state = decisionState(match);
                if (state === "null") return null;
                if (state === "undecided") uncertain = true;
                else if (!uncertain) result = value;
            }
        }
        if (terminal.kind === "collect") return rixSequence(result);
        if (terminal.kind === "count") return new Integer(BigInt(count));
        if (terminal.kind === "forEach") return null;
        if (terminal.kind === "first") return null;
        if (terminal.kind === "find") return uncertain ? UNDECIDED : null;
        if (terminal.kind === "all") return count === 0 ? null : uncertain ? UNDECIDED : result;
        return result;
    } catch (error) {
        reason = error;
        primary = error;
        throw error;
    } finally {
        if (claimed) {
            try {
                await closeAsyncStream(stream, reason);
            } catch (cleanupError) {
                if (!primary) throw cleanupError;
                const existing = Array.isArray(primary.suppressed) ? primary.suppressed : [];
                primary.suppressed = [...existing, cleanupError];
            }
        }
    }
}

function iterableValues(value) {
    if (value?.type === "map" && value.entries instanceof Map) return [...value.entries.values()];
    if (value?.type === "string") return Array.from(value.value).map((entry) => ({ type: "string", value: entry }));
    if (value && Array.isArray(value.values)) return [...value.values];
    if (Array.isArray(value)) return [...value];
    if (value && typeof value[Symbol.iterator] === "function") return [...value];
    throw new Error(".Stream expects a finite iterable collection or a host async iterable");
}

export function asyncStreamFromIterable(source, options = {}) {
    if (source && typeof source[Symbol.asyncIterator] === "function") {
        const iterator = source[Symbol.asyncIterator]();
        return createAsyncStream({
            label: options.label || "async iterable",
            finite: options.finite === true,
            next: (signal) => iterator.next(signal),
            close: (reason) => iterator.return?.(reason),
        });
    }
    const values = iterableValues(source);
    let index = 0;
    return createAsyncStream({
        label: options.label || "iterable",
        finite: true,
        async next(signal) {
            if (signal?.aborted) throw abortError(signal);
            if (index >= values.length) return { done: true };
            return { done: false, value: values[index++] };
        },
    });
}

export function createHotAsyncStream(options = {}) {
    const capacity = positiveInteger(options.capacity ?? 16, "Hot stream capacity");
    const policy = stringOption(options.overflowPolicy ?? "drop_oldest", "Hot stream overflow policy");
    if (!["drop_oldest", "drop_latest", "error", "block"].includes(policy)) {
        throw new Error(`Unknown hot stream overflow policy '${policy}'`);
    }
    const queue = [];
    const waiters = [];
    const blocked = [];
    let ended = false;
    let failure = null;

    const admitBlocked = () => {
        if (blocked.length === 0 || queue.length >= capacity || ended || failure) return;
        const entry = blocked.shift();
        queue.push(entry.value);
        entry.resolve(true);
    };
    const stream = createAsyncStream({
        label: options.label || "hot",
        finite: false,
        inspect: () => ({ queued: queue.length, capacity, policy: { type: "string", value: policy } }),
        next(signal) {
            if (failure) throw failure;
            if (queue.length > 0) {
                const value = queue.shift();
                admitBlocked();
                return { done: false, value };
            }
            if (ended) return { done: true };
            return new Promise((resolve, reject) => {
                let abort = null;
                const settle = (callback, result) => {
                    if (abort && signal) signal.removeEventListener("abort", abort);
                    callback(result);
                };
                const waiter = {
                    resolve: (result) => settle(resolve, result),
                    reject: (error) => settle(reject, error),
                };
                waiters.push(waiter);
                if (signal) {
                    abort = () => {
                        const index = waiters.indexOf(waiter);
                        if (index >= 0) waiters.splice(index, 1);
                        waiter.reject(abortError(signal));
                    };
                    if (signal.aborted) abort();
                    else signal.addEventListener("abort", abort, { once: true });
                }
            });
        },
        close() {
            ended = true;
            queue.length = 0;
            for (const waiter of waiters.splice(0)) waiter.resolve({ done: true });
            for (const entry of blocked.splice(0)) entry.resolve(false);
            options.unsubscribe?.();
        },
    });

    const push = (value) => {
        if (ended || failure) return false;
        if (waiters.length > 0) {
            waiters.shift().resolve({ done: false, value });
            return true;
        }
        if (queue.length < capacity) {
            queue.push(value);
            return true;
        }
        if (policy === "drop_oldest") {
            queue.shift();
            queue.push(value);
            return true;
        }
        if (policy === "drop_latest") return false;
        if (policy === "error") {
            failure = new OperationalFault("Hot async stream buffer overflow", {
                code: "ASYNC_STREAM_OVERFLOW",
                data: { capacity, policy },
            });
            for (const waiter of waiters.splice(0)) waiter.reject(failure);
            return false;
        }
        return new Promise((resolve, reject) => blocked.push({ value, resolve, reject }));
    };
    const end = () => {
        ended = true;
        for (const waiter of waiters.splice(0)) waiter.resolve({ done: true });
        for (const entry of blocked.splice(0)) entry.resolve(false);
    };
    const fault = (error) => {
        failure = error instanceof OperationalFault
            ? error
            : new OperationalFault(error?.message || String(error), { code: "ASYNC_STREAM_SOURCE", cause: error });
        for (const waiter of waiters.splice(0)) waiter.reject(failure);
        for (const entry of blocked.splice(0)) entry.reject(failure);
    };
    return { stream, push, end, fault };
}

export const asyncStreamCapabilities = {
    STREAM: {
        impl(args, context) {
            const stream = asyncStreamFromIterable(args[0], {
                label: args[1]?.type === "string" ? args[1].value : "collection stream",
            });
            registerAsyncResource(context, stream._stream.root, (_root, reason) => closeAsyncStream(stream, reason));
            return stream;
        },
        doc: "Create a cold, pull-based async stream from a finite collection",
        groups: ["Collections", "Async"],
    },
};

export const asyncStreamMethodHelpers = {
    positiveInteger,
    mapAsyncStream,
    filterAsyncStream,
    takeAsyncStream,
    dropAsyncStream,
    chunkAsyncStream,
    windowAsyncStream,
    closeAsyncStream,
    asyncStreamStatus,
    asyncStreamDone,
};
