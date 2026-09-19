import { expect, test } from "bun:test";
import { Context } from "../../src/runtime/context.js";
import { createDefaultSystemContext, parseAndEvaluateAsync } from "../../src/eval/evaluator.js";
import { getDiagnostics } from "../../src/runtime/diagnostics.js";
import { FakeStreamClock, flushStreamJobs } from "../helpers/stream-clock.js";
import { ASYNC_STREAM_CLOCK_ENV } from "../../src/runtime/async-stream-clock.js";

const numbers = (value) => value.values.map((entry) => entry?.values ? numbers(entry) : Number(entry.value));
async function waitFor(predicate) { for (let i = 0; i < 500; i++) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 1)); } throw new Error("Stream segment fixture failed to progress"); }

test("RiX ChunkBy/Merge preserve method and pipe semantics outside a scope", async () => {
    expect(numbers(await parseAndEvaluateAsync('.Stream([1,2,3,4,5]).ChunkBy((x) -> x % 2 == 0).Collect()'))).toEqual([[1, 2], [3, 4], [5]]);
    const merged = numbers(await parseAndEvaluateAsync('.Stream([1,2]).Merge(.Stream([10,20])).Collect()'));
    expect(merged.filter((x) => x < 10)).toEqual([1, 2]); expect(merged.filter((x) => x >= 10)).toEqual([10, 20]);
});

test("scheduler concurrency resumes after each barrier within its shared ceiling", async () => {
    const systemContext = createDefaultSystemContext({ frozen: false });
    const starts = []; const releases = new Map(); let active = 0, maximum = 0;
    systemContext.registerHost("work", { concurrency: "safe", impl: ([value]) => new Promise((resolve) => {
        const key = value?.values ? Number(value.values[0].value) : Number(value.value);
        starts.push(key); active++; maximum = Math.max(maximum, active);
        releases.set(key, () => { active--; releases.delete(key); resolve(value); });
    }) }); systemContext.freeze();
    const result = parseAndEvaluateAsync('{$:2$ .Stream([1,2,3,4,5,6]).Chunk(2).Map(.work).Window(1).Map((x)->x[1]).Collect() }', { systemContext });
    result.catch(() => {});
    await waitFor(() => releases.has(1) && releases.has(3));
    releases.get(3)(); await waitFor(() => releases.has(5)); releases.get(5)(); releases.get(1)();
    expect(numbers(await result)).toEqual([[1, 2], [3, 4], [5, 6]]);
    expect(maximum).toBe(2); expect(active).toBe(0);
});

test("stream trace exposes bounded queue/running counts, task paths and ordered publication", async () => {
    const context = new Context();
    const value = await parseAndEvaluateAsync('.Trace("stream", 4, [], () -> {$:2$ .Stream([1,2,3,4]).Chunk(2).Map((x)->x[1]).Collect() })', { context });
    expect(numbers(value)).toEqual([1, 3]);
    const data = getDiagnostics(context).events.at(-1).entries.get("data").entries;
    const calls = data.get("calls").values.filter((event) => event.entries.has("stream"));
    expect(calls.length).toBeGreaterThan(2);
    const output = calls.filter((event) => event.entries.get("event").value === "stream-publish");
    expect(output.map((event) => event.entries.get("stream").entries.get("outputIndex").value)).toEqual([1n, 2n]);
    const closed = calls.find((event) => event.entries.get("event").value === "stream-close");
    expect(closed.entries.get("stream").entries.get("queued").value).toBe(0n);
    expect(closed.entries.get("stream").entries.get("running").value).toBe(0n);
    expect(closed.entries.get("scheduler").entries.get("executor").value).toBe("event-loop");
    expect(closed.entries.has("taskPath")).toBe(true);
});

test("TimerStream uses the host clock and new transport capabilities remain denied by default", async () => {
    const clock = new FakeStreamClock(); const context = new Context(); context.setEnv(ASYNC_STREAM_CLOCK_ENV, clock);
    const result = parseAndEvaluateAsync('.TimerStream(10,2).Collect()', { context });
    await waitFor(() => clock.timers.size > 0); await clock.advance(20); await flushStreamJobs();
    expect(numbers(await result)).toEqual([1, 2]); expect(clock.timers.size).toBe(0);
    await expect(parseAndEvaluateAsync('.HttpStream("http://fixture/data").Collect()')).rejects.toThrow("grant");
});

test("worker trace identifies the task executor and retains exact ordered results", async () => {
    const { TaskWorkerPool } = await import("../../src/runtime/task-worker-pool.js");
    const pool = new TaskWorkerPool({ maxWorkers: 1, maxTimeMs: 10000, workerFactory: () => new Worker(new URL("../../src/runtime/task-worker-entry.js", import.meta.url), { type: "module" }) });
    const context = new Context(); context.setEnv("__async_task_worker_pool__", pool);
    try {
        expect(numbers(await parseAndEvaluateAsync('.Trace("workers",4,[],()->{$:2$ [1+2,2+3] })', { context }))).toEqual([3, 5]);
        const calls = getDiagnostics(context).events.at(-1).entries.get("data").entries.get("calls").values;
        const results = calls.filter((event) => event.entries.get("event").value === "worker-result");
        expect(results).toHaveLength(2);
        expect(results.every((event) => event.entries.get("worker").entries.get("executor").value === "task-worker")).toBe(true);
        expect(results.every((event) => event.entries.get("taskPath").values.length > 0)).toBe(true);
        expect(pool.snapshot().active).toBe(0); expect(pool.snapshot().queued).toBe(0);
    } finally { await pool.dispose(); }
});

test("early structured terminals cancel blocked downstream demands before closing their pipeline", async () => {
    for (const operation of ["Chunk(1)", "Latest()", "Debounce(5)"]) {
        const clock = new FakeStreamClock(); const context = new Context(); context.setEnv(ASYNC_STREAM_CLOCK_ENV, clock);
        const result = parseAndEvaluateAsync(`{$:2$ .TimerStream(10).${operation}.First() }`, { context }); result.catch(() => {});
        await waitFor(() => clock.timers.size > 0); await clock.advance(operation === "Debounce(5)" ? 15 : 10);
        const value = await result;
        expect(value?.values ? value.values[0].value : value.value).toBe(1n);
        expect(clock.timers.size).toBe(0);
    }
});

test("stateful predicates share the same scheduler and a stricter ancestor limit", async () => {
    const systemContext = createDefaultSystemContext({ frozen: false });
    let active = 0, maximum = 0;
    systemContext.registerHost("step", { concurrency: "safe", async impl([value]) {
        active++; maximum = Math.max(maximum, active);
        try { await flushStreamJobs(10); return value; } finally { active--; }
    } }); systemContext.freeze();
    const result = await parseAndEvaluateAsync('{$:1$ {$:4$ .Stream([1,2,3,4]).Map(.step).ChunkBy(.step).Map(.step).Collect() } }', { systemContext });
    expect(numbers(result)).toEqual([[1], [2], [3], [4]]);
    expect(maximum).toBe(1); expect(active).toBe(0);
});

test("actual imported scripts need Net and cannot grant it to a restricted descendant", async () => {
    const { createBrowserHostAdapter, HOST_ADAPTER_ENV } = await import("../../src/runtime/host-adapter.js");
    const { createStreamHostServices } = await import("../../src/runtime/async-stream-adapters.js");
    let requests = 0;
    const services = createStreamHostServices({ permissions: ["NET"], authorize: ({ reference }) => reference === "http://fixture/data", fetch: () => { requests++; return new Response("fixture"); } });
    const host = createBrowserHostAdapter({ baseURL: "https://fixture/scripts/", streams: services, sources: new Map([
        ["https://fixture/scripts/child.rix", '.HttpStream("http://fixture/data").Collect()'],
        ["https://fixture/scripts/parent.rix", '<"child" /+Net/>'],
    ]) });
    const run = (code) => { const context = new Context(); context.setEnv(HOST_ADAPTER_ENV, host); return parseAndEvaluateAsync(code, { context }); };
    await expect(run('<"child">')).rejects.toThrow("grant");
    expect((await run('<"child" /+Net/>')).values[0].value).toBe("fixture");
    await expect(run('<"parent" /-Net/>')).rejects.toThrow();
    expect(requests).toBe(1);
});
