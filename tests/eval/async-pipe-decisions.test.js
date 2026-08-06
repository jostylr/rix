import { describe, expect, test } from "bun:test";
import { Integer } from "@ratmath/core";
import {
    createDefaultSystemContext,
    parseAndEvaluate,
    parseAndEvaluateAsync,
} from "../../src/eval/evaluator.js";
import { Context } from "../../src/runtime/context.js";
import { isHole } from "../../src/runtime/hole.js";

const numbers = (value) => value.values.map((entry) => Number(entry.value));

async function waitUntil(predicate, label = "condition") {
    for (let index = 0; index < 300; index++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error(`Timed out waiting for ${label}`);
}

describe("|>_ ForEach pipe", () => {
    test("drains finite and lazy sources with locator/source arguments and returns null", () => {
        const calls = [];
        const context = new Context();
        context.set("record", (value, locator, source) => {
            calls.push([Number(value.value), Number(locator.value), source.values?.length ?? source._lazy?.cache.length]);
            return new Integer(999n);
        });

        expect(parseAndEvaluate("[10,20,30] |>_ record", { context })).toBeNull();
        expect(calls).toEqual([[10, 1, 3], [20, 2, 3], [30, 3, 3]]);
        calls.length = 0;
        expect(parseAndEvaluate("[1 |+ 1 |^ 3] |>_ record", { context })).toBeNull();
        expect(calls.map(([value, locator]) => [value, locator])).toEqual([[1, 1], [2, 2], [3, 3]]);
    });

    test("uses bounded concurrency in an async scope and awaits every handler", async () => {
        const starts = [];
        const releases = new Map();
        let active = 0;
        let maxActive = 0;
        const context = new Context();
        context.set("items", { type: "sequence", values: [1, 2, 3, 4].map((n) => new Integer(BigInt(n))) });
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("work", {
            impl([value]) {
                const n = Number(value.value);
                starts.push(n);
                active++;
                maxActive = Math.max(maxActive, active);
                return new Promise((resolve) => releases.set(n, () => {
                    active--;
                    releases.delete(n);
                    resolve(new Integer(999n));
                }));
            },
        });
        systemContext.freeze();

        const evaluation = parseAndEvaluateAsync("{$:2$ <items> items |>_ .work }", { context, systemContext });
        await waitUntil(() => starts.length === 2, "two ForEach handlers");
        expect(maxActive).toBe(2);
        releases.get(2)();
        await waitUntil(() => releases.has(3), "third ForEach handler");
        releases.get(1)();
        await waitUntil(() => releases.has(4), "fourth ForEach handler");
        releases.get(3)();
        releases.get(4)();
        expect(await evaluation).toBeNull();
        expect(starts).toEqual([1, 2, 3, 4]);
    });

    test("fails fast and does not admit queued handlers after a fatal error", async () => {
        const starts = [];
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("work", {
            impl([value], _context, _evaluate, options) {
                const n = Number(value.value);
                starts.push(n);
                if (n === 2) throw new Error("handler failed");
                return new Promise((_, reject) => {
                    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
                });
            },
        });
        systemContext.freeze();
        await expect(parseAndEvaluateAsync("{$:2$ [1,2,3,4] |>_ .work }", { systemContext }))
            .rejects.toThrow("handler failed");
        expect(starts).toEqual([1, 2]);
    });

    test("is a terminal barrier when a later collection pipe is written", async () => {
        let mapped = 0;
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("effect", { impl() { return new Integer(99n); } });
        systemContext.registerHost("mapped", { impl() { mapped++; return new Integer(1n); } });
        systemContext.freeze();
        const result = await parseAndEvaluateAsync(
            "{$:2$ [1,2] |>_ .effect |>> .mapped }",
            { systemContext },
        );
        expect(result).toBeNull();
        expect(mapped).toBe(0);
    });
});

describe("|>! expected error values", () => {
    test("handles canonical tuples positionally and passes ordinary values unchanged", () => {
        expect(parseAndEvaluate("{: :error, :timeout, 6 } |>! ((kind, value) -> value * 2)").value).toBe(12n);
        expect(parseAndEvaluate("7 |>! ((kind) -> 99)").value).toBe(7n);
    });

    test("null recovery skips collection items and later fused stages", async () => {
        const result = await parseAndEvaluateAsync(
            "{$:2$ [{: :error, :bad, 2}, 3, {: :error, :replace, 4}] "
            + "|>! ((kind, value) -> kind == :bad ?? _ ?: value * 10) "
            + "|>> ((value) -> value + 1) }",
        );
        expect(numbers(result)).toEqual([4, 41]);
    });

    test("scalar null recovery short-circuits later pipes and materializes as null, never a hole", () => {
        const context = new Context();
        const result = parseAndEvaluate(
            "value := ({: :error, :bad } |>! ((kind) -> _) |> ((x) -> 99)); value",
            { context },
        );
        expect(result).toBeNull();
        expect(context.get("value")).toBeNull();
        expect(isHole(result)).toBe(false);
    });

    test("does not catch thrown errors or invoke a handler for non-error values", () => {
        let handled = 0;
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("explode", { impl() { throw new Error("boom"); } });
        systemContext.registerHost("handled", { impl() { handled++; return new Integer(1n); } });
        systemContext.freeze();
        expect(() => parseAndEvaluate(".explode() |>! .handled", { systemContext })).toThrow("boom");
        expect(parseAndEvaluate("5 |>! .handled", { systemContext }).value).toBe(5n);
        expect(handled).toBe(0);
    });

    test("remains lazy on streams and skips before a terminal drain", async () => {
        const seen = [];
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("record", { impl([value]) { seen.push(Number(value.value)); return null; } });
        systemContext.freeze();
        const result = await parseAndEvaluateAsync(
            "(.Stream([{: :error, :drop}, 2, {: :error, :replace, 3}]) "
            + "|>! ((kind, value) -> kind == :drop ?? _ ?: value * 10) "
            + "|>> ((value) -> value + 1)) |>_ .record",
            { systemContext },
        );
        expect(result).toBeNull();
        expect(seen).toEqual([3, 31]);
    });
});

describe(".Retry", () => {
    test("is registered as an Async capability", () => {
        const systemContext = createDefaultSystemContext();
        expect(systemContext.get("Retry")?.groups).toContain("Async");
        expect(systemContext.getCapabilityGroups().Async).toContain("RETRY");
        expect(parseAndEvaluate("@_Retry(1, @{ 7 })", { systemContext }).value).toBe(7n);
    });

    test("retries expected errors until success and returns the final ordinary value", () => {
        let attempts = 0;
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("attempt", {
            impl() {
                attempts++;
                return attempts < 3
                    ? { type: "tuple", values: [{ type: "string", value: "error" }, { type: "string", value: "unavailable" }] }
                    : new Integer(42n);
            },
        });
        systemContext.freeze();
        expect(parseAndEvaluate(".Retry(4, @{ .attempt() })", { systemContext }).value).toBe(42n);
        expect(attempts).toBe(3);
    });

    test("exhaustion returns the final tuple and kinds can stop retry immediately", () => {
        let attempts = 0;
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("attempt", {
            impl() {
                attempts++;
                return { type: "tuple", values: [
                    { type: "string", value: "error" },
                    { type: "string", value: "timeout" },
                    new Integer(BigInt(attempts)),
                ] };
            },
        });
        systemContext.freeze();
        const recovered = parseAndEvaluate(
            ".Retry(2, @{ .attempt() }) |>! ((kind, count) -> count)",
            { systemContext },
        );
        expect(recovered.value).toBe(2n);
        expect(attempts).toBe(2);
        attempts = 0;
        parseAndEvaluate(
            ".Retry({= attempts=4, kinds=[:unavailable] }, @{ .attempt() })",
            { systemContext },
        );
        expect(attempts).toBe(1);
    });

    test("drains each attempt cleanup before starting the next attempt", () => {
        const events = [];
        let attempts = 0;
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("open", { impl() { events.push("open"); return new Integer(1n); } });
        systemContext.registerHost("close", { impl() { events.push("close"); return null; } });
        systemContext.registerHost("attempt", {
            impl() {
                attempts++;
                events.push(`attempt${attempts}`);
                return { type: "tuple", values: [{ type: "string", value: "error" }, { type: "string", value: "timeout" }] };
            },
        });
        systemContext.freeze();
        parseAndEvaluate(
            ".Retry(2, @{ resource := .open() ##_ .close; .attempt() })",
            { systemContext },
        );
        expect(events).toEqual(["open", "attempt1", "close", "open", "attempt2", "close"]);
    });

    test("keeps one source-item permit across all of that item's attempts", async () => {
        const events = [];
        const attempts = new Map();
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("attemptItem", {
            impl([item]) {
                const number = Number(item.value);
                const count = (attempts.get(number) || 0) + 1;
                attempts.set(number, count);
                events.push(`${number}.${count}`);
                return count === 1
                    ? { type: "tuple", values: [
                        { type: "string", value: "error" },
                        { type: "string", value: "unavailable" },
                    ] }
                    : item;
            },
        });
        systemContext.freeze();

        await parseAndEvaluateAsync(
            "{$:1$ [1,2] |>_ ((item) -> .Retry(2, @{ .attemptItem(item) })) }",
            { systemContext },
        );
        expect(events).toEqual(["1.1", "1.2", "2.1", "2.2"]);
    });

    test("does not retry thrown failures and validates policy fields", () => {
        let attempts = 0;
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("explode", { impl() { attempts++; throw new Error("boom"); } });
        systemContext.freeze();
        expect(() => parseAndEvaluate(".Retry(4, @{ .explode() })", { systemContext })).toThrow("boom");
        expect(attempts).toBe(1);
        expect(() => parseAndEvaluate(".Retry(0, @{ 1 })")).toThrow("positive safe integer");
        expect(() => parseAndEvaluate(".Retry({= attempts=2, delay=-1 }, @{ 1 })")).toThrow("non-negative");
        expect(() => parseAndEvaluate(".Retry({= attempts=2, backoff=-1 }, @{ 1 })")).toThrow("non-negative");
        expect(() => parseAndEvaluate(".Retry(2, 1)")).toThrow("deferred");
    });

    test("scope timeout cancels a pending backoff without another attempt", async () => {
        let attempts = 0;
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("attempt", {
            impl() {
                attempts++;
                return { type: "tuple", values: [{ type: "string", value: "error" }, { type: "string", value: "timeout" }] };
            },
        });
        systemContext.freeze();
        const result = await parseAndEvaluateAsync(
            "({$:1,1$ .Retry({= attempts=5, delay=5 }, @{ .attempt() }) }) "
            + "##!> ((fault) -> :cancelled)",
            { systemContext },
        );
        expect(result.value).toBe("cancelled");
        expect(attempts).toBe(1);
    });
});
