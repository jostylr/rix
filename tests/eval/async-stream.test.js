import { describe, expect, test } from "bun:test";
import { Integer } from "@ratmath/core";
import {
    createDefaultSystemContext,
    drainBackgroundTasks,
    parseAndEvaluate,
    parseAndEvaluateAsync,
} from "../../src/eval/evaluator.js";
import { formatValue } from "../../src/eval/format.js";
import { Context } from "../../src/runtime/context.js";
import { createAsyncStream } from "../../src/runtime/async-stream.js";
import { disposeAsyncResources } from "../../src/runtime/async-runtime.js";
import { OperationalFault } from "../../src/runtime/operational-fault.js";
import { lower } from "../../src/eval/lower.js";
import { parse } from "../../src/parser/parser.js";

const values = (sequence) => sequence.values.map((value) => Number(value.value));

async function waitUntil(predicate, label = "condition") {
    for (let index = 0; index < 300; index++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error(`Timed out waiting for ${label}`);
}

describe("RiX async streams", () => {
    test("streams format as handles and pipes remain lazy until a terminal", async () => {
        const stream = await parseAndEvaluateAsync(".Stream([1, 2, 3]) |>> ((x) -> x * 2) |>? ((x) -> x > 2)");
        expect(stream.type).toBe("async_stream");
        expect(stream._stream.root.pulled).toBe(0);
        expect(formatValue(stream)).toContain("AsyncStream");
        expect(formatValue(stream)).not.toContain("1, 2, 3");

        const result = await parseAndEvaluateAsync(
            "(.Stream([1, 2, 3]) |>> ((x) -> x * 2) |>? ((x) -> x > 2)).Collect()",
        );
        expect(values(result)).toEqual([4, 6]);
        expect(result.values.some((value) => value instanceof Promise)).toBe(false);
    });

    test("receiver methods cover ordered stateful transforms and terminals", async () => {
        const collected = await parseAndEvaluateAsync(
            ".Stream([1,2,3,4,5,6]).Drop(1).Take(4).Chunk(2).Collect()",
        );
        expect(collected.values.map(values)).toEqual([[2, 3], [4, 5]]);

        const reduced = await parseAndEvaluateAsync(
            ".Stream([1,2,3,4]).Reduce(0, (acc, value) -> acc + value)",
        );
        expect(reduced.value).toBe(10n);
        const first = await parseAndEvaluateAsync(".Stream([3,4,5]).First()");
        expect(first.value).toBe(3n);
        const found = await parseAndEvaluateAsync(".Stream([3,4,5]).Find((x) -> x > 3)");
        expect(found.value).toBe(4n);
        const count = await parseAndEvaluateAsync(".Stream([3,4,5]).Count()");
        expect(count.value).toBe(3n);
    });

    test("bounded terminals can consume an unbounded source and close early", async () => {
        let next = 0;
        let closes = 0;
        const context = new Context();
        context.set("source", createAsyncStream({
            label: "unbounded",
            async next() { return { done: false, value: new Integer(BigInt(++next)) }; },
            close() { closes++; },
        }));
        const result = await parseAndEvaluateAsync("source.Collect(3)", { context });
        expect(values(result)).toEqual([1, 2, 3]);
        expect(next).toBe(3);
        expect(closes).toBe(1);
    });

    test("zero bounds and Take(0) close without pulling", async () => {
        let pulls = 0;
        let closes = 0;
        const makeSource = () => createAsyncStream({
            label: "zero pull",
            async next() { pulls++; return { done: false, value: new Integer(1n) }; },
            close() { closes++; },
        });
        const firstContext = new Context();
        firstContext.set("source", makeSource());
        expect(values(await parseAndEvaluateAsync("source.Collect(0)", { context: firstContext }))).toEqual([]);
        const secondContext = new Context();
        secondContext.set("source", makeSource());
        expect(values(await parseAndEvaluateAsync("source.Take(0).Collect()", { context: secondContext }))).toEqual([]);
        expect(pulls).toBe(0);
        expect(closes).toBe(2);
    });

    test("structured terminals enforce L execution and the 2L unpublished window", async () => {
        const starts = [];
        const releases = new Map();
        let active = 0;
        let maxActive = 0;
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("work", {
            impl: ([value]) => new Promise((resolve) => {
                const number = Number(value.value);
                starts.push(number);
                active++;
                maxActive = Math.max(maxActive, active);
                releases.set(number, () => {
                    releases.delete(number);
                    active--;
                    resolve(value);
                });
            }),
        });
        systemContext.freeze();

        const evaluation = parseAndEvaluateAsync(
            "{$:2$ (.Stream([1,2,3,4,5,6]) |>> .work).Collect() }",
            { systemContext },
        );
        await waitUntil(() => starts.length >= 2, "first stream admissions");
        releases.get(2)();
        await waitUntil(() => releases.has(3), "third stream admission");
        releases.get(3)();
        await waitUntil(() => releases.has(4), "fourth stream admission");
        releases.get(4)();
        await new Promise((resolve) => setTimeout(resolve, 2));
        expect(starts).toEqual([1, 2, 3, 4]);
        expect(maxActive).toBe(2);
        releases.get(1)();
        await waitUntil(() => releases.has(5), "fifth stream admission after publication");
        releases.get(5)();
        await waitUntil(() => releases.has(6), "sixth stream admission");
        releases.get(6)();
        expect(values(await evaluation)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    test("Any and All pipe terminals consume streams lazily and close on an early result", async () => {
        const sequential = await parseAndEvaluateAsync(
            ".Stream([1,2,3]) |>|| ((x) -> x == 2)",
        );
        expect(sequential.value).toBe(2n);

        let pulls = 0;
        let closes = 0;
        const makeStream = () => createAsyncStream({
            label: "terminal source",
            async next() {
                pulls++;
                return { done: false, value: new Integer(BigInt(pulls)) };
            },
            close() { closes++; },
        });

        const anyContext = new Context();
        anyContext.set("source", makeStream());
        const found = await parseAndEvaluateAsync(
            "{$:2$ <s~source> s |>|| ((x) -> x == 3) }",
            { context: anyContext },
        );
        expect(found.value).toBe(3n);
        expect(pulls).toBeLessThanOrEqual(6);
        expect(closes).toBe(1);

        const allContext = new Context();
        allContext.set("source", makeStream());
        const all = await parseAndEvaluateAsync(
            "{$:2$ <s~source> s |>&& ((x) -> x < 3) }",
            { context: allContext },
        );
        expect(all).toBeNull();
        expect(closes).toBe(2);
    });

    test("bounded async terminals stop unbounded lazy sequences", async () => {
        const found = await parseAndEvaluateAsync("{$:2$ [1 |+1] |>|| ((x) -> x == 3) }");
        expect(found.value).toBe(3n);
        const all = await parseAndEvaluateAsync("{$:2$ [1 |+1] |>&& ((x) -> x < 3) }");
        expect(all).toBeNull();
    });

    test("timeout cancels Next, closes the source, and can be recovered as a typed fault", async () => {
        let closes = 0;
        const context = new Context();
        context.set("source", createAsyncStream({
            label: "waiting source",
            next(signal) {
                return new Promise((_, reject) => {
                    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
                });
            },
            close() { closes++; },
        }));
        const result = await parseAndEvaluateAsync(
            "({$:1,1$ <s~source> s.Collect() }) ##!> ((fault) -> :timed_out)",
            { context },
        );
        expect(result.value).toBe("timed_out");
        expect(closes).toBe(1);
    });

    test("early Find and terminal faults close exactly once", async () => {
        let closes = 0;
        const context = new Context();
        context.set("source", createAsyncStream({
            finite: true,
            label: "fault source",
            async next() { throw new OperationalFault("source failed", { code: "SOURCE_FAILED" }); },
            close() { closes++; },
        }));
        const recovered = await parseAndEvaluateAsync(
            "source.Collect() ##!> ((fault) -> :recovered)",
            { context },
        );
        expect(recovered.value).toBe("recovered");
        expect(closes).toBe(1);
    });

    test("a terminal fault stays primary and a close fault is suppressed", async () => {
        const primary = new OperationalFault("read failed", { code: "READ_FAILED" });
        const cleanup = new OperationalFault("close failed", { code: "CLOSE_FAILED" });
        const context = new Context();
        context.set("source", createAsyncStream({
            finite: true,
            async next() { throw primary; },
            close() { throw cleanup; },
        }));
        try {
            await parseAndEvaluateAsync("source.Collect()", { context });
            throw new Error("expected stream failure");
        } catch (error) {
            expect(error).toBe(primary);
            expect(error.suppressed).toContain(cleanup);
        }
    });

    test("per-item typed fault recovery can produce an ordinary outcome value", async () => {
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("maybe", {
            impl([value]) {
                if (value.value === 2n) {
                    throw new OperationalFault("item failed", { code: "ITEM_FAILED" });
                }
                return value;
            },
        });
        systemContext.freeze();
        const result = await parseAndEvaluateAsync(
            "{$:2$ (.Stream([1,2,3]) |>> ((x) -> (.maybe(x) ##!> ((fault) -> 0)))).Collect() }",
            { systemContext },
        );
        expect(values(result)).toEqual([1, 0, 3]);
    });

    test("First cancels an in-flight transformation and custom ##_ ..Close is idempotent", async () => {
        let cancelled = 0;
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("work", {
            impl: ([value], _context, _evaluate, options) => {
                if (value.value === 1n) return value;
                return new Promise((_, reject) => {
                    options.signal.addEventListener("abort", () => {
                        cancelled++;
                        reject(options.signal.reason);
                    }, { once: true });
                });
            },
        });
        systemContext.freeze();
        const first = await parseAndEvaluateAsync(
            "{$:2$ (.Stream([1,2,3]) |>> .work).First() }",
            { systemContext },
        );
        expect(first.value).toBe(1n);
        expect(cancelled).toBeGreaterThanOrEqual(1);

        let closes = 0;
        const context = new Context();
        const source = createAsyncStream({
            label: "custom cleanup",
            async next() { return { done: true }; },
            close() { closes++; },
        });
        context.set("source", source);
        const returned = await parseAndEvaluateAsync("{; <s~source> held := s ##_ ..Close; held }", { context });
        expect(returned).toBe(source);
        expect(closes).toBe(1);
        await disposeAsyncResources(context);
        expect(closes).toBe(1);
    });

    test("nested scopes retain the stricter stream execution limit", async () => {
        let active = 0;
        let maxActive = 0;
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("work", {
            async impl([value]) {
                active++;
                maxActive = Math.max(maxActive, active);
                await Promise.resolve();
                active--;
                return value;
            },
        });
        systemContext.freeze();
        const result = await parseAndEvaluateAsync(
            "{$outer:4$ {$inner:2$ (.Stream([1,2,3,4,5]) |>> .work).Collect() } }",
            { systemContext },
        );
        expect(values(result)).toEqual([1, 2, 3, 4, 5]);
        expect(maxActive).toBeLessThanOrEqual(2);
    });

    test("prefix method lifting parses, lowers, and works for collections and streams", async () => {
        const ast = parse("..Slice(2, 4)")[0];
        expect(ast.type).toBe("MethodLift");
        expect(ast.method).toBe("SLICE");
        expect(lower([ast])[0].fn).toBe("METHOD_LIFT");

        expect(formatValue(await parseAndEvaluateAsync('["ab", "cd"] |>> ..Upper'))).toBe("[AB, CD]");
        const streamed = await parseAndEvaluateAsync(
            '(.Stream(["ab", "cd"]) |>> ..Upper).Collect()',
        );
        expect(streamed.values.map((value) => value.value)).toEqual(["AB", "CD"]);
        expect(() => parse("x..Upper")).toThrow("a..name is no longer supported");
    });

    test("background consumption can publish to an explicitly imported reactive cell", async () => {
        const context = new Context();
        await parseAndEvaluateAsync(
            "$$latest := 0; {$$ <latest=latest> .Stream([1,2,3]).ForEach((item) -> ($latest := item)) }; 9",
            { context },
        );
        expect(await drainBackgroundTasks(context)).toEqual([]);
        expect(parseAndEvaluate("$latest", { context }).value).toBe(3n);
    });

    test("session disposal cancels detached stream consumption and closes its source", async () => {
        let nextStarted = false;
        let closes = 0;
        const context = new Context();
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("open", {
            impl() {
                return createAsyncStream({
                    label: "background source",
                    next(signal) {
                        nextStarted = true;
                        return new Promise((_, reject) => {
                            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
                        });
                    },
                    close() { closes++; },
                });
            },
        });
        systemContext.freeze();
        await parseAndEvaluateAsync("{$$ .open().ForEach((item) -> item) }", { context, systemContext });
        await waitUntil(() => nextStarted, "detached stream pull");
        expect(await disposeAsyncResources(context, { kind: "test shutdown" })).toEqual([]);
        expect(await drainBackgroundTasks(context)).toEqual([]);
        expect(closes).toBe(1);
    });

    test("detached blocks cannot snapshot or alias a linear stream handle", async () => {
        const context = new Context();
        context.set("source", createAsyncStream({
            async next() { return { done: true }; },
        }));
        await expect(parseAndEvaluateAsync("{$$ <source> source.Collect() }", { context }))
            .rejects.toThrow("cannot be copied into detached blocks");
        await expect(parseAndEvaluateAsync("{$$ <copy=source> copy.Collect() }", { context }))
            .rejects.toThrow("requires a reactive cell");
    });

    test("sync evaluation rejects terminals and host disposal closes retained handles", async () => {
        expect(() => parseAndEvaluate(".Stream([1]).Collect()"))
            .toThrow("requires promise-aware RiX evaluation");
        const context = new Context();
        const stream = await parseAndEvaluateAsync(".Stream([1,2,3])", { context });
        expect(stream._stream.root.status).toBe("open");
        expect(await disposeAsyncResources(context)).toEqual([]);
        expect(stream._stream.root.status).toBe("closed");
        expect(stream._stream.root.closeCount).toBe(1);
    });
});
