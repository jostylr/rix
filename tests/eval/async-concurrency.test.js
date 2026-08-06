import { describe, expect, test } from "bun:test";
import {
    createDefaultSystemContext,
    drainBackgroundTasks,
    parseAndEvaluateAsync,
    parseAndEvaluate,
} from "../../src/eval/evaluator.js";
import { Context } from "../../src/runtime/context.js";
import { Integer } from "@ratmath/core";

async function waitUntil(predicate, message = "condition") {
    for (let attempt = 0; attempt < 200; attempt++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error(`Timed out waiting for ${message}`);
}

function asyncSystem(name, implementation) {
    const systemContext = createDefaultSystemContext({ frozen: false });
    systemContext.registerHost(name, { impl: implementation });
    systemContext.freeze();
    return systemContext;
}

describe("RiX async and concurrency", () => {
    test("explicit arrays admit work in source order up to the scope limit", async () => {
        const starts = [];
        const releases = new Map();
        let active = 0;
        let maxActive = 0;
        const systemContext = asyncSystem("work", ([value]) => new Promise((resolve) => {
            const number = Number(value.value);
            starts.push(number);
            active++;
            maxActive = Math.max(maxActive, active);
            releases.set(number, () => {
                releases.delete(number);
                active--;
                resolve(value);
            });
        }));

        const evaluation = parseAndEvaluateAsync(
            "{$:2$ [.work(1), .work(2), .work(3)] };",
            { systemContext },
        );
        await waitUntil(() => releases.size === 2, "first two array tasks");
        expect(starts).toEqual([1, 2]);
        releases.get(2)();
        await waitUntil(() => releases.has(3), "third array task");
        expect(starts).toEqual([1, 2, 3]);
        releases.get(1)();
        releases.get(3)();

        const result = await evaluation;
        expect(result.values.map((value) => Number(value.value))).toEqual([1, 2, 3]);
        expect(maxActive).toBe(2);
    });

    test("nested collection parents do not consume permits", async () => {
        const starts = [];
        const releases = new Map();
        const systemContext = asyncSystem("work", ([value]) => new Promise((resolve) => {
            const number = Number(value.value);
            starts.push(number);
            releases.set(number, () => {
                releases.delete(number);
                resolve(value);
            });
        }));

        const evaluation = parseAndEvaluateAsync(
            "{$:2$ {= a=[.work(1), .work(2)], b=.work(3) } };",
            { systemContext },
        );
        await waitUntil(() => releases.size === 2, "nested array leaves");
        expect(starts).toEqual([1, 2]);
        releases.get(2)();
        await waitUntil(() => releases.has(3), "map sibling");
        expect(starts).toEqual([1, 2, 3]);
        releases.get(1)();
        releases.get(3)();

        const result = await evaluation;
        expect(result.entries.get("a").values.map((value) => Number(value.value))).toEqual([1, 2]);
        expect(Number(result.entries.get("b").value)).toBe(3);
    });

    test("async code blocks support import headers and await statements in order", async () => {
        const events = [];
        const systemContext = asyncSystem("record", async ([value]) => {
            events.push(Number(value.value));
            return value;
        });
        const result = await parseAndEvaluateAsync(
            "x := 4; {$ <a~x> .record(a); .record(a + 1) }; 9;",
            { systemContext },
        );
        expect(events).toEqual([4, 5]);
        expect(result.value).toBe(9n);
    });

    test("map and filter pipe stages run promise-aware callbacks concurrently", async () => {
        let active = 0;
        let maxActive = 0;
        const systemContext = asyncSystem("double", async ([value]) => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 2));
            active--;
            return new Integer(value.value * 2n);
        });
        const result = await parseAndEvaluateAsync(
            "{$:2$ [1, 2, 3] |>> ((x) -> .double(x)) |>? ((x) -> x > 2) };",
            { systemContext },
        );
        expect(result.values.map((value) => Number(value.value))).toEqual([4, 6]);
        expect(maxActive).toBe(2);
    });

    test("an item continues through a fused pipe before a slower sibling resolves", async () => {
        const events = [];
        const sourceReleases = new Map();
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("source", {
            impl: ([value]) => new Promise((resolve) => {
                const number = Number(value.value);
                events.push(`source:${number}`);
                sourceReleases.set(number, () => resolve(value));
            }),
        });
        systemContext.registerHost("stage", {
            impl: async ([value]) => {
                events.push(`stage:${Number(value.value)}`);
                return value;
            },
        });
        systemContext.freeze();

        const evaluation = parseAndEvaluateAsync(
            "{$:2$ [.source(1), .source(2)] |>> ((x) -> .stage(x)) };",
            { systemContext },
        );
        await waitUntil(() => sourceReleases.size === 2, "two fused source items");
        sourceReleases.get(2)();
        await waitUntil(() => events.includes("stage:2"), "second item downstream stage");
        expect(events).toEqual(["source:1", "source:2", "stage:2"]);
        sourceReleases.get(1)();

        const result = await evaluation;
        expect(result.values.map((value) => Number(value.value))).toEqual([1, 2]);
        expect(events).toEqual(["source:1", "source:2", "stage:2", "stage:1"]);
    });

    test("|>|| is an ordered Find even when later predicates finish first", async () => {
        const systemContext = asyncSystem("passes", async ([value]) => {
            const delay = value.value === 2n ? 8 : 1;
            await new Promise((resolve) => setTimeout(resolve, delay));
            return value.value >= 2n ? value : null;
        });
        const result = await parseAndEvaluateAsync(
            "{$:3$ [1, 2, 3] |>|| ((x) -> .passes(x)) };",
            { systemContext },
        );
        expect(result.value).toBe(2n);
    });

    test("|>&& quantifies the values that remain after a fused filter", async () => {
        const result = await parseAndEvaluateAsync(
            "{$:2$ [1, 2, 3, 4] |>? ((x) -> x > 2) |>&& ((x) -> x < 5) };",
        );
        expect(result.value).toBe(4n);
    });

    test("named async break races by completion and cancels queued siblings", async () => {
        const starts = [];
        const systemContext = asyncSystem("delay", async ([value, milliseconds]) => {
            starts.push(Number(value.value));
            await new Promise((resolve) => setTimeout(resolve, Number(milliseconds.value)));
            return value;
        });
        const result = await parseAndEvaluateAsync(
            "{$race:2$ ["
                + ".delay(1, 12) |> ((x) -> {!$race! x }), "
                + ".delay(2, 2) |> ((x) -> {!$race! x }), "
                + ".delay(3, 1) |> ((x) -> {!$race! x })"
                + "] };",
            { systemContext },
        );
        expect(result.value).toBe(2n);
        expect(starts).toEqual([1, 2]);
    });

    test("an item failure stops queued admission and fails the awaited scope", async () => {
        const starts = [];
        const systemContext = asyncSystem("fail", async ([value]) => {
            starts.push(Number(value.value));
            throw new Error("planned failure");
        });
        await expect(parseAndEvaluateAsync(
            "{$:1$ [.fail(1), .fail(2)] };",
            { systemContext },
        )).rejects.toThrow("planned failure");
        expect(starts).toEqual([1]);
    });

    test("detached blocks return null immediately and are runtime-supervised", async () => {
        const context = new Context();
        const events = [];
        const systemContext = asyncSystem("record", async ([value]) => {
            await new Promise((resolve) => setTimeout(resolve, 5));
            events.push(Number(value.value));
            return value;
        });
        const result = await parseAndEvaluateAsync(
            "x := 7; {$$ <x> .record(x) }; 9;",
            { context, systemContext },
        );
        expect(result.value).toBe(9n);
        expect(events).toEqual([]);
        expect(await drainBackgroundTasks(context)).toEqual([]);
        expect(events).toEqual([7]);
    });

    test("detached blocks can publish through an explicitly imported reactive cell", async () => {
        const context = new Context();
        await parseAndEvaluateAsync(
            "$$status := :starting; {$$ <status=status> $status := :finished }; $status;",
            { context },
        );
        expect(await drainBackgroundTasks(context)).toEqual([]);
        expect(parseAndEvaluate("$status;", { context }).value).toBe("finished");
    });
});
