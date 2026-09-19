import { describe, expect, test } from "bun:test";
import { Context } from "../../src/runtime/context.js";
import { createDefaultSystemContext, parseAndEvaluate, parseAndEvaluateAsync, drainBackgroundTasks } from "../../src/eval/evaluator.js";
import { disposeAsyncResources } from "../../src/runtime/async-runtime.js";
import { Integer } from "@ratmath/core";

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
const strings = (value) => value.values.map((item) => item.toString());
function system(definitions) {
    const result = createDefaultSystemContext({ frozen: false });
    for (const [name, definition] of Object.entries(definitions)) result.registerHost(name, definition);
    result.freeze();
    return result;
}

describe("RiX owner safety and task provenance", () => {
    test("unknown host effects serialize while opt-in safe capabilities overlap", async () => {
        for (const concurrent of [false, true]) {
            const firstStarted = deferred();
            const gate = deferred();
            const starts = [];
            const systemContext = system({ work: {
                ...(concurrent ? { effect: "read", concurrency: "safe", cancellation: "cooperative" } : {}),
                async impl([value], _context, _evaluate, execution) {
                    starts.push(Number(value.value));
                    expect(execution.signal).toBeInstanceOf(AbortSignal);
                    firstStarted.resolve();
                    await gate.promise;
                    return value;
                },
            } });
            const evaluation = parseAndEvaluateAsync("{$:3$ [.work(1), .work(2), .work(3)] }", { systemContext });
            await firstStarted.promise;
            await flush();
            expect(starts).toEqual(concurrent ? [1, 2, 3] : [1]);
            gate.resolve();
            expect(strings(await evaluation)).toEqual(["1", "2", "3"]);
        }
    });

    test("nested source/task paths reach output and failure with the host cap enforced", async () => {
        const context = new Context();
        context.setEnv("asyncLimits", { concurrency: 1 });
        const outputs = [];
        const paths = [];
        context.setEnv("__output_sink__", (value) => outputs.push(value));
        const systemContext = system({ inspect: { concurrency: "safe", impl([value], _context, _evaluate, execution) { paths.push(execution.taskPath); return value; } } });
        await parseAndEvaluateAsync('{$Outer:99$ [{$Inner:99$ [.Out("a.txt", .inspect(1))] }] }', { context, systemContext });
        expect(paths[0].filter((part) => part.startsWith("scope"))).toHaveLength(2);
        expect(paths[0].filter((part) => part.startsWith("branch"))).toHaveLength(2);
        expect(outputs[0].taskPath).toEqual(paths[0]);
        expect(paths[0].join(" / ")).toContain("line 1");
        let error;
        try { await parseAndEvaluateAsync('{$Outer:2$ [{$Inner:1$ [1/0] }] }', { context }); }
        catch (failure) { error = failure; }
        expect(error.asyncTaskPath).toContain("scope outer");
        expect(error.asyncTaskPath).toContain("scope inner");
        expect(error.asyncTaskSegments.filter((part) => part.startsWith("branch"))).toHaveLength(2);
    });

    test("low output and background limits fail before unbounded retention", async () => {
        const context = new Context();
        context.setEnv("asyncLimits", { outputItems: 2, background: 1 });
        await expect(parseAndEvaluateAsync("{$:2$ [1,2,3] }", { context })).rejects.toMatchObject({ code: "ASYNC_LIMIT_EXCEEDED" });
        const started = deferred();
        const gate = deferred();
        const systemContext = system({ wait: { concurrency: "safe", impl() { started.resolve(); return gate.promise; } } });
        await parseAndEvaluateAsync("{$$ .wait() }", { context, systemContext });
        await started.promise;
        await expect(parseAndEvaluateAsync("{$$ .wait() }", { context, systemContext })).rejects.toMatchObject({ code: "ASYNC_LIMIT_EXCEEDED" });
        gate.resolve(null);
        await drainBackgroundTasks(context);
        expect(await disposeAsyncResources(context)).toEqual([]);
    });

    test("multiple ready named breaks settle and clean up each admitted item once", async () => {
        const gate = deferred();
        const ready = deferred();
        let entered = 0;
        const cleaned = [];
        const systemContext = system({
            ready: { concurrency: "safe", async impl([value]) { if (++entered === 3) ready.resolve(); await gate.promise; return value; } },
            close: { impl([value]) { cleaned.push(Number(value.value)); return null; } },
        });
        const evaluation = parseAndEvaluateAsync('{$Race:3$ [1,2,3] |>> ((x) -> {; y := x ##_ .close; .ready(y); {!$Race! y } }) }', { systemContext });
        await ready.promise;
        gate.resolve();
        const value = await evaluation;
        expect(["1", "2", "3"]).toContain(value.toString());
        expect(cleaned.sort()).toEqual([1, 2, 3]);
    });
});

describe("promise-aware RiX recurrences", () => {
    test("arithmetic, indexed, history, transforms, filters and predicate bounds keep sync parity", async () => {
        for (const source of [
            "[2 |+2 |;5]", "[|:(i)->i^2 |;5]", "[1,1 |>(a,b)->a+b |;7]",
            "[2 |+3 |>(x)->x^2 |?(x)->x%2==0 |;5]", "[2 |+2 |;(x)->x>10]",
        ]) expect(strings(await parseAndEvaluateAsync(source))).toEqual(strings(parseAndEvaluate(source)));
    });

    test("async recurrence callbacks never place promises in values or source history", async () => {
        const systemContext = system({
            step: { concurrency: "safe", async impl([a, b = new Integer(0n)]) { await Promise.resolve(); return a.add(b); } },
            even: { concurrency: "safe", async impl([value]) { await Promise.resolve(); return value.value % 2n === 0n ? new Integer(1n) : null; } },
            stop: { concurrency: "safe", async impl([value]) { await Promise.resolve(); return value.value >= 8n ? new Integer(1n) : null; } },
        });
        expect(strings(await parseAndEvaluateAsync("[1,1 |> .step(_2,_1) |;7]", { systemContext }))).toEqual(["1", "1", "2", "3", "5", "8", "13"]);
        expect(strings(await parseAndEvaluateAsync("[|:(i)->.step(i,i) |?(x)->.even(x) |;(x)->.stop(x)]", { systemContext }))).toEqual(["2", "4", "6", "8"]);
        const context = new Context();
        const result = await parseAndEvaluateAsync("g := [|:(i)->.step(i,i) |^5]; [g[3], g[-1], g.First()]", { context, systemContext });
        expect(strings(result)).toEqual(["6", "10", "2"]);
        const lazy = context.get("g")._lazy;
        expect(lazy.cache.every((value) => typeof value.then !== "function")).toBe(true);
        expect(lazy.state.sourceHistory.every((value) => typeof value.then !== "function")).toBe(true);
        expect(lazy.cache.map(String)).toEqual(["2", "4", "6", "8", "10"]);
    });

    test("lazy async recurrence pipes, explicit materialization and spreads await their values", async () => {
        const systemContext = system({ double: { concurrency: "safe", async impl([value]) { return value.multiply(new Integer(2n)); } } });
        expect(strings(await parseAndEvaluateAsync("g := [|:(i)->.double(i) |^4]; g.Materialize()", { systemContext }))).toEqual(["2", "4", "6", "8"]);
        expect(strings(await parseAndEvaluateAsync("g := [|:(i)->.double(i) |^4]; (g |>> (x)->x+1).Collect()", { systemContext }))).toEqual(["3", "5", "7", "9"]);
        expect(strings(await parseAndEvaluateAsync("g := [|:(i)->.double(i) |^4]; [...g]", { systemContext }))).toEqual(["2", "4", "6", "8"]);
        expect(strings(await parseAndEvaluateAsync("g := [|:(i)->.double(i) |^4]; it := g.Iterator(); [it.Next(2), it.Peek(1), it.Next()]", { systemContext }))).toEqual(["4", "6", "6"]);
    });
});

test("suspension checkpoints stop the next loop iteration without pretending to undo synchronous work", async () => {
    const controller = new AbortController();
    const reason = new Error("cancel after suspension");
    let effects = 0;
    const systemContext = system({ pause: {
        cancellation: "none",
        async impl() {
            effects++;
            await Promise.resolve();
            controller.abort(reason);
            // Synchronous statements already entered still complete.
            effects++;
            return null;
        },
    } });
    await expect(parseAndEvaluateAsync("{$ {@ i := 0; i < 10; .pause(); i += 1; i } }", { systemContext, signal: controller.signal })).rejects.toThrow("cancel after suspension");
    expect(effects).toBe(2);
});

test("cleanup faults retain source and cleanup task paths", async () => {
    const systemContext = system({ close: { impl() { throw Object.freeze(new Error("close failed")); } } });
    let failure;
    try { await parseAndEvaluateAsync("{$Outer$ [1 ##_ .close] }", { systemContext }); } catch (error) { failure = error; }
    expect(failure.message).toContain("close failed");
    expect(failure.asyncTaskSegments.at(-1)).toBe("cleanup");
    expect(failure.rixLocation).toContain("line 1");
});

test("trace retention is bounded and discloses omitted events", async () => {
    const { getDiagnostics } = await import("../../src/runtime/diagnostics.js");
    const context = new Context();
    context.setEnv("asyncLimits", { traceEvents: 2 });
    await parseAndEvaluateAsync('.Trace("bounded", 10, [], () -> {$ F := (x)->x+1; [F(1), F(2), F(3)] })', { context });
    const data = getDiagnostics(context).events.at(-1).entries.get("data").entries;
    expect(data.get("calls").values).toHaveLength(2);
    expect(data.get("droppedEvents").value).toBeGreaterThan(0n);
    expect(data.get("calls").values.some((call) => call.entries.has("taskPath"))).toBe(true);
});

test("self-dependent recurrence reads committed history and rejects a pending self read", async () => {
    expect(strings(await parseAndEvaluateAsync("[1 |:(i,self)->self[i-1]+1 |;5]"))).toEqual(["1", "2", "3", "4", "5"]);
    await expect(parseAndEvaluateAsync("[|:(i,self)->self[i] |;2]")).rejects.toThrow("already committed");
});

test("host cache limits cover arithmetic lazy sources and recurrence history stays bounded", async () => {
    const context = new Context();
    context.setEnv("asyncLimits", { outputItems: 2 });
    await expect(parseAndEvaluateAsync("g := 1:5 ::5; g[3]", { context })).rejects.toMatchObject({ code: "ASYNC_LIMIT_EXCEEDED" });
    const historyContext = new Context();
    await parseAndEvaluateAsync("g := [1 |+1 |^100]; g[100]", { context: historyContext });
    expect(historyContext.get("g")._lazy.state.sourceHistory).toHaveLength(1);
    expect(historyContext.get("g")._lazy.cache).toHaveLength(100);
});
