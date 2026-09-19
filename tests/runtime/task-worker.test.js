import { Integer, Rational, Fraction } from "@ratmath/core";
import { expect, test } from "bun:test";
import { Context, createDefaultRegistry, createDefaultSystemContext, parse, lower, parseAndEvaluate, parseAndEvaluateAsync, formatValue } from "../../src/index.js";
import { TaskWorkerPool } from "../../src/runtime/task-worker-pool.js";
import { prepareTaskRequest, TASK_WORKER_PROTOCOL, encodeTaskValue, inertTaskMessage, validateTaskRequest } from "../../src/runtime/task-worker-protocol.js";
import { createEvaluationBudget } from "../../src/runtime/evaluation-budget.js";
import { createReactiveGraph } from "../../src/runtime/reactive-graph.js";
const state = () => ({ context: new Context(), registry: createDefaultRegistry(), systemContext: createDefaultSystemContext() });
const request = (source, runtime) => prepareTaskRequest(lower(parse(source))[0], runtime.context, runtime.registry, runtime.systemContext);
const actualPool = () => new TaskWorkerPool({ workerFactory: () => new Worker(new URL("../../src/runtime/task-worker-entry.js", import.meta.url), { type: "module" }), maxTimeMs: 10000 });
class FakeWorker {
    listeners = new Map(); messages = []; terminated = false;
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
    reply(value, id = this.messages[0].id) { this.listeners.get("message")({ data: { protocol: TASK_WORKER_PROTOCOL, kind: "result", id, value: encodeTaskValue(value), random: null, steps: 1 } }); }
}
test("task protocol rejects effects, overridden arithmetic, live captures and accessors", () => {
    const runtime = state();
    expect(request("1/3+2/3", runtime)).not.toBeNull();
    expect(request('.Files.Read("private")', runtime)).toBeNull();
    expect(request('x := 2', runtime)).toBeNull();
    parseAndEvaluate('f := x -> x+1', runtime);
    expect(request('f(2)', runtime)).toBeNull();
    runtime.registry.register("ADD", () => new Integer(9n), { pure: true });
    expect(request("1+2", runtime)).toBeNull();
    let read = false;
    expect(() => inertTaskMessage({ get value() { read = true; return 1; } })).toThrow("accessor");
    expect(read).toBe(false);
    runtime.context.set("danger", Object.create({ get type() { read = true; return "sequence"; } }));
    expect(request("danger", runtime)).toBeNull(); expect(read).toBe(false);
    const task = request("2*3", state()); task.ir = { fn: "SYS_CALL", args: ["FILES"] };
    expect(() => validateTaskRequest(task)).toThrow("Unsupported worker capability");
});
test("real task workers preserve exact arithmetic, captures, tensor views, RNG, and scheduler order", async () => {
    const pool = actualPool();
    try {
        const runtime = state();
        parseAndEvaluate('x := 9007199254740993123456789/7; a := [1,2;3,4]; b := a.Permute({: 2,1})', runtime);
        for (const source of ["x*7+1/9", "b", "[x/3, 7:2, b]"]) {
            const task = request(source, runtime); expect(task).not.toBeNull();
            expect(formatValue(await pool.runTask(task))).toBe(formatValue(parseAndEvaluate(source, runtime)));
        }
        const source = '.RandomSeed(123); {$:2$ [1/3+2/3, 2^40, 5/7] }';
        const workerState = state(); workerState.context.setEnv("__async_task_worker_pool__", pool);
        expect(formatValue(await parseAndEvaluateAsync(source, workerState))).toBe(formatValue(await parseAndEvaluateAsync(source, state())));
        expect(pool.snapshot().completed).toBeGreaterThanOrEqual(6);
        const randomSource = '.RandomSeed(456); {$:2$ [(0:1) :% 1, (0:1) :% 1] }';
        const completed = pool.snapshot().completed;
        expect(formatValue(await parseAndEvaluateAsync(randomSource, workerState))).toBe(formatValue(await parseAndEvaluateAsync(randomSource, state())));
        expect(pool.snapshot().completed - completed).toBe(2);
    } finally { await pool.dispose(); }
    expect(pool.snapshot().workers).toBe(0);
});
test("bounded worker queue cancels stale commits and replaces noncooperative workers", async () => {
    const workers = [], pool = new TaskWorkerPool({ workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; }, maxWorkers: 1, maxQueued: 1, graceMs: 5 });
    const task = request("2+3", state()), controller = new AbortController(); let published = 0;
    const first = pool.runTask(task, { signal: controller.signal, commit() { published++; } }); first.catch(() => {});
    const second = pool.runTask(task);
    await expect(pool.runTask(task)).rejects.toThrow("queue limit");
    controller.abort(new Error("rerun")); await expect(first).rejects.toThrow("rerun");
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(workers[0].terminated).toBe(true); expect(workers).toHaveLength(2);
    workers[0].reply(new Integer(99n)); expect(published).toBe(0);
    workers[1].reply(new Integer(5n)); expect((await second).toString()).toBe("5");
    await pool.dispose(); expect(workers[1].terminated).toBe(true);
});
test("owner-routed worker literal batches publish once and validate all targets first", async () => {
    const graph = createReactiveGraph({ evaluateFormula: (formula) => formula.args[0] });
    graph.addSource("a", new Integer(1n)); graph.addComputed("b", { fn: "DEFER", args: [new Integer(2n)] });
    const events = []; graph.subscribe((event) => events.push(event));
    const worker = new FakeWorker(), pool = new TaskWorkerPool({ workerFactory: () => worker });
    const result = pool.runTask(request("3", state()), { commit(value) { graph.replaceValues([{ name: "a", value }, { name: "b", value }]); } });
    worker.reply(new Integer(3n)); await result;
    expect(events).toHaveLength(1); expect(graph.get("a").toString()).toBe("3"); expect(graph.get("b").toString()).toBe("3");
    expect(() => graph.replaceValues([{ name: "a", value: new Integer(9n) }, { name: "missing", value: null }])).toThrow();
    expect(graph.get("a").toString()).toBe("3"); expect(events).toHaveLength(1);
    await pool.dispose();
});
test("bounded deterministic bursts retain FIFO results and a fixed worker count", async () => {
    const workers = [], pool = new TaskWorkerPool({ workerFactory: () => { const worker = new FakeWorker(); workers.push(worker); return worker; }, maxWorkers: 2, maxQueued: 8 });
    const task = request("1", state());
    for (let batch = 0; batch < 10; batch++) {
        const pending = Array.from({ length: 10 }, () => pool.runTask(task));
        expect(pool.snapshot()).toMatchObject({ workers: 2, active: 2, queued: 8 });
        while (pool.snapshot().active) for (const slot of [...pool.slots]) if (slot.job) slot.worker.reply(new Integer(BigInt(slot.job.id)), slot.job.id);
        expect((await Promise.all(pending)).map((value) => Number(value.value))).toEqual(Array.from({ length: 10 }, (_, index) => batch * 10 + index + 1));
    }
    expect(pool.snapshot()).toMatchObject({ completed: 100, active: 0, queued: 0, workers: 2 });
    await pool.dispose();
});

test("falsy owner commit failures remain failures", async () => {
    const worker = new FakeWorker(), pool = new TaskWorkerPool({ workerFactory: () => worker });
    const pending = pool.runTask(request("1", state()), { commit() { throw 0; } });
    worker.reply(new Integer(1n)); await expect(pending).rejects.toThrow("0");
    await pool.dispose();
});

test("queued worker tasks reject exhausted owner budgets before posting", async () => {
    const runtime = state(), task = request("1", runtime);
    for (const exhausted of ["steps", "deadline", "signal"]) {
        const worker = new FakeWorker(), pool = new TaskWorkerPool({ workerFactory: () => worker, maxWorkers: 1 });
        const controller = new AbortController();
        const budget = createEvaluationBudget({ maxSteps: 10, maxTimeMs: 60_000, signal: controller.signal });
        runtime.context.setEnv("__evaluation_budget__", budget);
        const first = pool.runTask(task), queued = pool.runTask(task, { context: runtime.context }); queued.catch(() => {});
        if (exhausted === "steps") budget.steps = budget.maxSteps;
        if (exhausted === "deadline") budget.deadline = Date.now() - 1;
        if (exhausted === "signal") controller.abort(new Error("owner cancelled"));
        worker.reply(new Integer(1n)); await first;
        await expect(queued).rejects.toThrow(exhausted === "signal" ? "owner cancelled" : "budget exhausted");
        expect(worker.messages).toHaveLength(1);
        expect(pool.snapshot()).toMatchObject({ active: 0, queued: 0, completed: 1 });
        await pool.dispose();
    }
});
test("queued workers receive the current smaller owner step and time limits", async () => {
    const runtime = state(), task = request("1", runtime), worker = new FakeWorker();
    const pool = new TaskWorkerPool({ workerFactory: () => worker, maxWorkers: 1, maxTimeMs: 60_000 });
    const budget = createEvaluationBudget({ maxSteps: 10, maxTimeMs: 60_000 });
    runtime.context.setEnv("__evaluation_budget__", budget);
    const first = pool.runTask(task), queued = pool.runTask(task, { context: runtime.context });
    budget.steps = 7; budget.deadline = Date.now() + 30_000;
    worker.reply(new Integer(1n)); await first;
    expect(worker.messages[1].maxSteps).toBe(3);
    expect(worker.messages[1].maxTimeMs).toBeGreaterThan(0);
    expect(worker.messages[1].maxTimeMs).toBeLessThanOrEqual(30_000);
    worker.reply(new Integer(1n), worker.messages[1].id); await queued;
    await pool.dispose();
});
test("numeric capture serialization never drops own fields or extension behavior", () => {
    const runtime = state(); let invoked = false;
    for (const make of [() => new Integer(2n), () => new Rational(2, 3), () => new Fraction(2, 3)]) {
        runtime.context.set("n", make()); expect(request("n", runtime)).not.toBeNull();
        for (const customize of [
            (value) => { value.add = () => { invoked = true; return new Integer(99n); }; },
            (value) => { value._ext = new Map([["custom", { type: "string", value: "kept by owner" }]]); },
            (value) => { value.label = "custom number"; },
            (value) => { value[Symbol("custom")] = true; },
        ]) {
            const value = make(); customize(value); runtime.context.set("n", value);
            expect(request("n", runtime)).toBeNull();
        }
    }
    const altered = new Fraction(2, 3); altered._isInfinite = true;
    runtime.context.set("n", altered); expect(request("n", runtime)).toBeNull();
    expect(invoked).toBe(false);
});
