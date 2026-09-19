import { expect, test } from "bun:test";
import { Integer } from "@ratmath/core";
import { UNDECIDED } from "../../src/runtime/decision.js";
import {
    createAsyncStream, createHotAsyncStream, asyncStreamFromIterable, consumeAsyncStreamSequential,
    mapAsyncStream, chunkAsyncStream, chunkByAsyncStream, takeAsyncStream, windowAsyncStream,
    debounceAsyncStream, throttleAsyncStream, timeoutAsyncStream, latestAsyncStream, mergeAsyncStream,
    closeAsyncStream, pullRawAsyncStream,
} from "../../src/runtime/async-stream.js";
import { prepareAsyncStreamPipeline } from "../../src/runtime/async-stream-pipeline.js";
import { FakeStreamClock, flushStreamJobs } from "../helpers/stream-clock.js";

const integer = (number) => new Integer(BigInt(number));
const collect = (stream, execution = {}) => consumeAsyncStreamSequential(stream, { kind: "collect", bound: null }, { invoke: (callable, args) => callable(...args), ...execution });
const numbers = (value) => value.values.map((entry) => entry?.values ? numbers(entry) : Number(entry.value));
const source = (...values) => asyncStreamFromIterable(values.map(integer));
const truth = (condition) => condition ? integer(1) : null;

test("ChunkBy has after-item boundaries, final partial chunks, uncertainty and bounded buffering", async () => {
    expect(numbers(await collect(chunkByAsyncStream(source(1, 2, 3, 4, 5), (value) => truth(value.value % 2n === 0n))))).toEqual([[1, 2], [3, 4], [5]]);
    expect(await collect(chunkByAsyncStream(source(1, 2), () => UNDECIDED))).toBe(UNDECIDED);
    const bounded = asyncStreamFromIterable([1, 2, 3], { limits: { outputItems: 2 } });
    await expect(collect(chunkByAsyncStream(bounded, () => null))).rejects.toMatchObject({ code: "ASYNC_LIMIT_EXCEEDED" });
    expect(bounded._stream.root.closeCount).toBe(1);
});

test("safe regions on both sides of stateful barriers overlap but publish in source order", async () => {
    const starts = [];
    const releases = new Map();
    const pending = (tag, value) => new Promise((resolve) => {
        starts.push(tag); releases.set(tag, () => resolve(value));
    });
    const first = mapAsyncStream(source(1, 2, 3, 4), (value) => pending(`a${value.value}`, value));
    const second = mapAsyncStream(chunkAsyncStream(first, 2), (value) => pending(`b${value.values[0].value}`, value));
    const stream = mapAsyncStream(windowAsyncStream(second, 1), (value) => value.values[0]);
    const result = collect(stream, { concurrency: 2, run: (work) => work() });
    await flushStreamJobs();
    expect(starts).toEqual(["a1", "a2", "a3", "a4"]);
    releases.get("a2")(); releases.get("a1")();
    await flushStreamJobs();
    expect(starts).toContain("b1");
    releases.get("a4")(); releases.get("a3")();
    await flushStreamJobs();
    expect(starts).toContain("b3");
    releases.get("b3")(); releases.get("b1")();
    expect(numbers(await result)).toEqual([[1, 2], [3, 4]]);
    expect(first._stream.root.pipelineStats.maxRunning).toBeGreaterThan(1);
    expect(first._stream.root.pipelineStats.queued).toBe(0);
    expect(first._stream.root.pipelineStats.running).toBe(0);
});

test("Take zero and bounded early terminals close all sources without starting adapters", async () => {
    let pulls = 0; let closes = 0;
    const original = createAsyncStream({ next: () => { pulls++; return { value: integer(1) }; }, close: () => closes++ });
    expect(numbers(await collect(takeAsyncStream(mapAsyncStream(original, (x) => x), 0)))).toEqual([]);
    expect(pulls).toBe(0); expect(closes).toBe(1);
});

test("Merge observes readiness order, preserves each source order, and owns both closes", async () => {
    let closes = 0;
    const a = createHotAsyncStream({ unsubscribe: () => closes++ });
    const b = createHotAsyncStream({ unsubscribe: () => closes++ });
    const prepared = await prepareAsyncStreamPipeline(mergeAsyncStream(a.stream, b.stream));
    const first = pullRawAsyncStream(prepared); await flushStreamJobs();
    b.push(integer(10)); await flushStreamJobs(); a.push(integer(1));
    expect((await first).value.value).toBe(10n);
    expect((await pullRawAsyncStream(prepared)).value.value).toBe(1n);
    await closeAsyncStream(prepared, { kind: "cancel-test" });
    expect(closes).toBe(2);
    expect(() => mergeAsyncStream(source(1), source(2))).not.toThrow();
    expect(() => mergeAsyncStream(a.stream, a.stream)).toThrow("linear");
});

test("Timeout measures outstanding demand and clears its timer and pending pull", async () => {
    const clock = new FakeStreamClock(); let closes = 0;
    const hot = createHotAsyncStream({ unsubscribe: () => closes++ });
    const result = collect(timeoutAsyncStream(hot.stream, integer(10)), { clock });
    result.catch(() => {});
    await clock.advance(10); await expect(result).rejects.toMatchObject({ code: "ASYNC_STREAM_TIMEOUT" });
    expect(clock.timers.size).toBe(0); expect(closes).toBe(1);
    expect(hot.stream._stream.root.pendingPulls).toBe(0);
});

test("Debounce resets quiet time, flushes on completion, and cancels all timers", async () => {
    const clock = new FakeStreamClock();
    const hot = createHotAsyncStream();
    const prepared = await prepareAsyncStreamPipeline(debounceAsyncStream(hot.stream, integer(10)), { clock });
    let firstValue;
    const first = pullRawAsyncStream(prepared).then((raw) => { firstValue = raw.value; });
    await flushStreamJobs(); hot.push(integer(1)); await clock.advance(5);
    hot.push(integer(2)); await clock.advance(9); expect(firstValue).toBeUndefined();
    await clock.advance(1); await first; expect(firstValue.value).toBe(2n);
    const second = pullRawAsyncStream(prepared); await flushStreamJobs();
    hot.push(integer(3)); await flushStreamJobs(); hot.end();
    expect((await second).value.value).toBe(3n);
    expect((await pullRawAsyncStream(prepared)).done).toBe(true);
    expect(clock.timers.size).toBe(0);
});

test("Throttle is leading-only and Latest keeps one most recent pending value", async () => {
    const clock = new FakeStreamClock();
    const hot = createHotAsyncStream();
    const result = collect(throttleAsyncStream(hot.stream, integer(10)), { clock });
    await flushStreamJobs(); hot.push(integer(1)); await clock.advance(5);
    hot.push(integer(2)); await clock.advance(5);
    hot.push(integer(3)); await flushStreamJobs(); hot.end();
    expect(numbers(await result)).toEqual([1, 3]); expect(clock.timers.size).toBe(0);

    const events = createHotAsyncStream();
    const prepared = await prepareAsyncStreamPipeline(latestAsyncStream(events.stream));
    const first = pullRawAsyncStream(prepared); await flushStreamJobs();
    events.push(integer(1)); expect((await first).value.value).toBe(1n);
    for (const value of [2, 3, 4]) { events.push(integer(value)); await flushStreamJobs(); }
    events.end(); await flushStreamJobs();
    expect((await pullRawAsyncStream(prepared)).value.value).toBe(4n);
    expect((await pullRawAsyncStream(prepared)).done).toBe(true);
    expect(events.stream._stream.root.pipelineStats.dropped).toBe(2);
});

test("cancelling a timed Merge rejects demand, closes once, and preserves cleanup failures", async () => {
    const clock = new FakeStreamClock(); const controller = new AbortController();
    let closes = 0;
    const make = () => createHotAsyncStream({ unsubscribe: () => { closes++; throw new Error("fixture cleanup"); } });
    const a = make(), b = make();
    const result = collect(debounceAsyncStream(mergeAsyncStream(a.stream, b.stream), integer(10)), { clock, signal: controller.signal });
    result.catch(() => {});
    await flushStreamJobs(); controller.abort(new Error("cancel fixture")); await expect(result).rejects.toThrow("cancel fixture");
    expect(closes).toBe(2); expect(clock.timers.size).toBe(0);
});

test("aggregate state buffers and stage budgets fail closed with no retained chunks", async () => {
    const input = asyncStreamFromIterable([1,2,3,4,5].map(integer), { limits: { outputItems: 3 } });
    const window = windowAsyncStream(windowAsyncStream(input, 2), 2);
    await expect(collect(window)).rejects.toMatchObject({ code: "ASYNC_LIMIT_EXCEEDED" });
    expect(window._stream.stages.every((stage) => stage.buffer.length === 0)).toBe(true);
    expect(input._stream.root.closeCount).toBe(1);
    const bounded = asyncStreamFromIterable([integer(1)], { limits: { outstanding: 1 } });
    await expect(collect(chunkAsyncStream(bounded, 1))).rejects.toMatchObject({ code: "ASYNC_LIMIT_EXCEEDED" });
    expect(bounded._stream.root.closeCount).toBe(1);
});

test("a continuously suppressed cold source yields so cancellation is not starved", async () => {
    const clock = new FakeStreamClock(); const controller = new AbortController();
    let pulls = 0, closes = 0;
    const input = createAsyncStream({ next: () => ({ value: integer(++pulls) }), close: () => closes++ });
    const result = collect(throttleAsyncStream(input, 100), { clock, signal: controller.signal }); result.catch(() => {});
    await flushStreamJobs(5000);
    expect(pulls).toBe(63); expect(clock.timers.size).toBe(1);
    controller.abort(new Error("stop suppressed source"));
    await expect(result).rejects.toThrow("stop suppressed source");
    expect(closes).toBe(1); expect(clock.timers.size).toBe(0);
});
