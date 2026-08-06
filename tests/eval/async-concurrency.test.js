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

    test("ordered publication limits straggler lookahead to twice the execution limit", async () => {
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
            "{$:2$ [.work(1), .work(2), .work(3), .work(4), .work(5), .work(6)] };",
            { systemContext },
        );
        await waitUntil(() => releases.has(1) && releases.has(2), "first two lookahead tasks");
        releases.get(2)();
        await waitUntil(() => releases.has(3), "third lookahead task");
        releases.get(3)();
        await waitUntil(() => releases.has(4), "fourth lookahead task");
        releases.get(4)();
        await Promise.resolve();
        expect(starts).toEqual([1, 2, 3, 4]);

        releases.get(1)();
        await waitUntil(() => releases.has(5) && releases.has(6), "window after first publication");
        releases.get(5)();
        releases.get(6)();
        const result = await evaluation;
        expect(result.values.map((value) => Number(value.value))).toEqual([1, 2, 3, 4, 5, 6]);
    });

    test("item cleanup completes before its execution permit is released", async () => {
        const events = [];
        const cleanupReleases = new Map();
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("work", {
            impl: ([value]) => {
                events.push(`work:${Number(value.value)}`);
                return value;
            },
        });
        systemContext.registerHost("close", {
            impl: ([value]) => new Promise((resolve) => {
                const number = Number(value.value);
                events.push(`close:${number}`);
                cleanupReleases.set(number, resolve);
            }),
        });
        systemContext.freeze();

        const evaluation = parseAndEvaluateAsync(
            "{$:1$ [{; .work(1) ##_ .close }, {; .work(2) ##_ .close }] };",
            { systemContext },
        );
        await waitUntil(() => cleanupReleases.has(1), "first item cleanup");
        expect(events).toEqual(["work:1", "close:1"]);
        cleanupReleases.get(1)();
        await waitUntil(() => cleanupReleases.has(2), "second item cleanup");
        expect(events).toEqual(["work:1", "close:1", "work:2", "close:2"]);
        cleanupReleases.get(2)();
        await evaluation;
    });

    test("nested collection parents use hierarchical sibling-first admission without permits", async () => {
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
        await waitUntil(() => releases.size === 2, "sibling-first leaves");
        expect(starts).toEqual([1, 3]);
        releases.get(3)();
        await waitUntil(() => releases.has(2), "second nested array leaf");
        expect(starts).toEqual([1, 3, 2]);
        releases.get(1)();
        releases.get(2)();

        const result = await evaluation;
        expect(result.entries.get("a").values.map((value) => Number(value.value))).toEqual([1, 2]);
        expect(Number(result.entries.get("b").value)).toBe(3);
    });

    test("a function defined outside the async scope keeps sequential collection semantics", async () => {
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
            "Build() -> [.work(1), .work(2)]; {$:2$ <Build> [Build()] };",
            { systemContext },
        );
        await waitUntil(() => releases.has(1), "first called-function child");
        expect(starts).toEqual([1]);
        releases.get(1)();
        await waitUntil(() => releases.has(2), "second called-function child");
        releases.get(2)();

        const result = await evaluation;
        expect(result.values[0].values.map((value) => Number(value.value))).toEqual([1, 2]);
    });

    test("a function defined inside an async scope retains lexical concurrency after escaping", async () => {
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
            "Build = {$:2$ () -> [.work(1), .work(2)] }; Build();",
            { systemContext },
        );
        await waitUntil(() => releases.size === 2, "escaped function children");
        expect(starts).toEqual([1, 2]);
        releases.get(2)();
        releases.get(1)();

        const result = await evaluation;
        expect(result.values.map((value) => Number(value.value))).toEqual([1, 2]);
    });

    test("concurrent items cannot write captured ordinary bindings", async () => {
        const context = new Context();
        await expect(parseAndEvaluateAsync(
            "total := 0; {$:2$ <total> [@total = 1, @total = 2] };",
            { context },
        )).rejects.toThrow("cannot write captured ordinary binding 'total'");
        expect(context.get("total").value).toBe(0n);
    });

    test("concurrent composite captures are isolated mutable snapshots", async () => {
        const context = new Context();
        const result = await parseAndEvaluateAsync(
            "items := [0]; {$:2$ <items> [1,2] |>> ((x) -> {; items.Push!(x); .LEN(items) }) }",
            { context },
        );
        expect(result.values.map((value) => Number(value.value))).toEqual([2, 2]);
        expect(context.get("items").values.map((value) => Number(value.value))).toEqual([0]);
    });

    test("an external function can opt into an explicit nested async scope at limit one", async () => {
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
            "Build() -> {$:1$ [.work(1), .work(2)] }; {$:1$ <Build> [Build()] };",
            { systemContext },
        );
        await waitUntil(() => releases.has(1), "first explicit nested-scope child");
        expect(starts).toEqual([1]);
        releases.get(1)();
        await waitUntil(() => releases.has(2), "second explicit nested-scope child");
        releases.get(2)();

        const result = await evaluation;
        expect(result.values[0].values.map((value) => Number(value.value))).toEqual([1, 2]);
    });

    test("an outside-defined function processes async pipe items sequentially", async () => {
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
            "Transform(xs) -> xs |>> ((x) -> .work(x)); {$:3$ <Transform> [Transform([1, 2, 3])] };",
            { systemContext },
        );
        await waitUntil(() => releases.has(1), "first sequential pipe item");
        expect(starts).toEqual([1]);
        releases.get(1)();
        await waitUntil(() => releases.has(2), "second sequential pipe item");
        expect(starts).toEqual([1, 2]);
        releases.get(2)();
        await waitUntil(() => releases.has(3), "third sequential pipe item");
        releases.get(3)();

        const result = await evaluation;
        expect(result.values[0].values.map((value) => Number(value.value))).toEqual([1, 2, 3]);
    });

    test("tensor literal cells fan out and retain row-major assembly", async () => {
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
            "{$:2$ {:2x2: .work(1), .work(2); .work(3), .work(4)} };",
            { systemContext },
        );
        await waitUntil(() => releases.size === 2, "first tensor cells");
        expect(starts).toEqual([1, 2]);
        releases.get(2)();
        await waitUntil(() => releases.has(3), "third tensor cell");
        releases.get(1)();
        await waitUntil(() => releases.has(4), "fourth tensor cell");
        releases.get(3)();
        releases.get(4)();

        const result = await evaluation;
        expect(result.shape).toEqual([2, 2]);
        expect(result.data.map((value) => Number(value.value))).toEqual([1, 2, 3, 4]);
    });

    test("a nested scope enforces its stricter limit without escaping the parent cap", async () => {
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
            "{$:3$ {$:1$ [.work(1), .work(2), .work(3)] } };",
            { systemContext },
        );
        await waitUntil(() => releases.has(1), "first nested task");
        expect(starts).toEqual([1]);
        releases.get(1)();
        await waitUntil(() => releases.has(2), "second nested task");
        expect(starts).toEqual([1, 2]);
        releases.get(2)();
        await waitUntil(() => releases.has(3), "third nested task");
        releases.get(3)();

        const result = await evaluation;
        expect(result.values.map((value) => Number(value.value))).toEqual([1, 2, 3]);
        expect(maxActive).toBe(1);
    });

    test("a nested named break cancels only that scope's queued descendants", async () => {
        const starts = [];
        const releases = new Map();
        const systemContext = asyncSystem("finish", ([value]) => new Promise((resolve) => {
            const number = Number(value.value);
            starts.push(number);
            releases.set(number, () => {
                releases.delete(number);
                resolve(value);
            });
        }));

        const evaluation = parseAndEvaluateAsync(
            "{$:2$ ["
                + "{$inner:1$ ["
                + ".finish(1) |> ((x) -> {!$inner! x }), "
                + ".finish(2) |> ((x) -> {!$inner! x })"
                + "] }, "
                + ".finish(3)"
                + "] };",
            { systemContext },
        );
        await waitUntil(() => releases.has(1) && releases.has(3), "nested racer and outer sibling");
        expect(starts).toEqual([1, 3]);
        releases.get(1)();
        await waitUntil(() => !releases.has(1), "nested break cleanup");
        expect(starts).toEqual([1, 3]);
        releases.get(3)();

        const result = await evaluation;
        expect(result.values.map((value) => Number(value.value))).toEqual([1, 3]);
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

    test("loops, case arms, hole coalescing, and destructuring await their selected work", async () => {
        const events = [];
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("step", {
            impl: async ([value]) => {
                await Promise.resolve();
                events.push(Number(value.value));
                return value;
            },
        });
        systemContext.registerHost("no", { impl: async () => null });
        systemContext.registerHost("pair", {
            impl: async () => ({ type: "sequence", values: [new Integer(4n), new Integer(5n)] }),
        });
        systemContext.freeze();

        const loop = await parseAndEvaluateAsync(
            "{$ {@ i := 0; i < 3; .step(i); i += 1; i } }",
            { systemContext },
        );
        expect(loop.value).toBe(3n);
        expect(events).toEqual([0, 1, 2]);

        const selected = await parseAndEvaluateAsync(
            "{$ {? .no() ? .step(8); .step(9) } }",
            { systemContext },
        );
        expect(selected.value).toBe(9n);
        const coalesced = await parseAndEvaluateAsync(
            "{$ [1,,3][2] ?| .step(10) }",
            { systemContext },
        );
        expect(coalesced.value).toBe(10n);
        const destructured = await parseAndEvaluateAsync(
            "{$ [a, b] := .pair(); a + b }",
            { systemContext },
        );
        expect(destructured.value).toBe(9n);
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

    test("tensor map stages preserve shape and receive index-tuple locators", async () => {
        const locators = [];
        const systemContext = asyncSystem("withIndex", async ([value, locator]) => {
            locators.push(locator.values.map((index) => Number(index.value)));
            await Promise.resolve();
            return value;
        });
        const result = await parseAndEvaluateAsync(
            "matrix := {:2x2: 1, 2; 3, 4}; "
                + "{$:2$ <matrix> matrix |>> ((x, index) -> .withIndex(x, index)) };",
            { systemContext },
        );
        expect(result.shape).toEqual([2, 2]);
        expect(result.data.map((value) => Number(value.value))).toEqual([1, 2, 3, 4]);
        expect(locators).toEqual([[1, 1], [1, 2], [2, 1], [2, 2]]);
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

    test("ordered Any stops queued work and cooperatively cancels active siblings", async () => {
        const starts = [];
        const releases = new Map();
        let cancellations = 0;
        const systemContext = asyncSystem("probe", ([value], _context, _evaluate, options) => {
            const number = Number(value.value);
            starts.push(number);
            if (number >= 3) {
                return new Promise((_, reject) => {
                    options.signal.addEventListener("abort", () => {
                        cancellations++;
                        reject(options.signal.reason);
                    }, { once: true });
                });
            }
            return new Promise((resolve) => releases.set(number, () => resolve(number === 2 ? value : null)));
        });

        const evaluation = parseAndEvaluateAsync(
            "{$:2$ [1,2,3,4,5,6] |>|| .probe }",
            { systemContext },
        );
        await waitUntil(() => releases.has(1) && releases.has(2), "ordered Any leaders");
        releases.get(1)();
        await waitUntil(() => starts.includes(3), "ordered Any lookahead");
        releases.get(2)();

        expect((await evaluation).value).toBe(2n);
        expect(starts).not.toContain(5);
        expect(starts).not.toContain(6);
        expect(cancellations).toBeGreaterThanOrEqual(1);
    });

    test("seeded concurrent random streams are stable by source branch", async () => {
        const systemContext = asyncSystem("jitter", async ([value]) => {
            await new Promise((resolve) => setTimeout(resolve, 4 - Number(value.value)));
            return value;
        });
        const code = ".RANDOMSEED(731); {$:3$ [1,2,3] |>> ((x) -> {; .jitter(x); .RAND_NAME(8) }) }";

        const first = await parseAndEvaluateAsync(code, { systemContext });
        const second = await parseAndEvaluateAsync(code, { systemContext });
        expect(first.values.map((value) => value.value)).toEqual(second.values.map((value) => value.value));
        expect(new Set(first.values.map((value) => value.value)).size).toBe(3);
    });

    test("ordered reduce waits for concurrent upstream work and awaits one accumulator at a time", async () => {
        const starts = [];
        const releases = new Map();
        const reduced = [];
        let activeReducers = 0;
        let maxReducers = 0;
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("source", {
            impl: ([value]) => new Promise((resolve) => {
                const number = Number(value.value);
                starts.push(number);
                releases.set(number, () => {
                    releases.delete(number);
                    resolve(value);
                });
            }),
        });
        systemContext.registerHost("sum", {
            impl: async ([accumulator, value]) => {
                reduced.push(Number(value.value));
                activeReducers++;
                maxReducers = Math.max(maxReducers, activeReducers);
                await Promise.resolve();
                activeReducers--;
                return new Integer(accumulator.value + value.value);
            },
        });
        systemContext.freeze();

        const evaluation = parseAndEvaluateAsync(
            "{$:3$ [.source(1), .source(2), .source(3)] "
                + "|>> ((x) -> x * 2) "
                + "|:> 0 >: ((acc, x) -> .sum(acc, x)) };",
            { systemContext },
        );
        await waitUntil(() => releases.size === 3, "concurrent reduce source items");
        expect(starts).toEqual([1, 2, 3]);
        releases.get(3)();
        releases.get(1)();
        releases.get(2)();

        const result = await evaluation;
        expect(result.value).toBe(12n);
        expect(reduced).toEqual([2, 4, 6]);
        expect(maxReducers).toBe(1);
    });

    test("sort is a stable barrier with a promise-aware comparator", async () => {
        const comparisons = [];
        const systemContext = asyncSystem("compare", async ([left, right]) => {
            const leftKey = left.values[0].value;
            const rightKey = right.values[0].value;
            comparisons.push([Number(leftKey), Number(rightKey)]);
            await Promise.resolve();
            return new Integer(leftKey < rightKey ? -1n : leftKey > rightKey ? 1n : 0n);
        });
        const result = await parseAndEvaluateAsync(
            "{$ [{: 2, 1 }, {: 1, 2 }, {: 2, 3 }] "
                + "|<> ((a, b) -> .compare(a, b)) };",
            { systemContext },
        );
        expect(result.values.map((tuple) => Number(tuple.values[1].value))).toEqual([2, 1, 3]);
        expect(comparisons.length).toBeGreaterThan(0);
    });

    test("elementwise regions resume after sort and slice barriers", async () => {
        const result = await parseAndEvaluateAsync(
            "{$:2$ [3, 1, 4, 2] "
                + "|>> ((x) -> x * 10) "
                + "|<> ((a, b) -> a - b) "
                + "|>/ 2:3 "
                + "|>> ((x) -> x + 1) };",
        );
        expect(result.values.map((value) => Number(value.value))).toEqual([21, 31]);
    });

    test("split and chunk barriers await promise-aware predicates in order", async () => {
        const visits = [];
        const systemContext = asyncSystem("even", async ([value]) => {
            visits.push(Number(value.value));
            await Promise.resolve();
            return value.value % 2n === 0n ? value : null;
        });
        const split = await parseAndEvaluateAsync(
            "{$ [1, 2, 3, 4] |>/| ((x) -> .even(x)) };",
            { systemContext },
        );
        expect(split.values.map((piece) => piece.values.map((value) => Number(value.value))))
            .toEqual([[1], [3], []]);
        expect(visits).toEqual([1, 2, 3, 4]);

        visits.length = 0;
        const chunked = await parseAndEvaluateAsync(
            "{$ [1, 2, 3, 4] |>#| ((x) -> .even(x)) };",
            { systemContext },
        );
        expect(chunked.values.map((piece) => piece.values.map((value) => Number(value.value))))
            .toEqual([[1, 2], [3, 4]]);
        expect(visits).toEqual([1, 2, 3, 4]);
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

    test("cancellation does not roll back an effect completed before failure", async () => {
        const effects = [];
        const systemContext = asyncSystem("effectThenFail", ([value]) => {
            effects.push(Number(value.value));
            throw new Error("after effect");
        });
        await expect(parseAndEvaluateAsync(
            "{$:1$ [.effectThenFail(1), .effectThenFail(2)] }",
            { systemContext },
        )).rejects.toThrow("after effect");
        expect(effects).toEqual([1]);
    });

    test("timeout headers abort capability work, drain, clean up, and expose a recoverable fault", async () => {
        const events = [];
        const systemContext = createDefaultSystemContext({ frozen: false });
        systemContext.registerHost("open", { impl: ([value]) => value });
        systemContext.registerHost("close", {
            impl: ([value]) => {
                events.push(`close:${Number(value.value)}`);
                return null;
            },
        });
        systemContext.registerHost("wait", {
            impl: (args, context, evaluate, { signal }) => new Promise((resolve, reject) => {
                if (signal?.aborted) {
                    reject(signal.reason);
                    return;
                }
                signal?.addEventListener("abort", () => {
                    events.push("aborted");
                    reject(signal.reason);
                }, { once: true });
            }),
        });
        systemContext.freeze();

        const result = await parseAndEvaluateAsync(
            "({$job:limit=2,timeout=1$ resource := .open(7) ##_ .close; .wait() }) "
                + "##!> ((fault) -> 99);",
            { systemContext },
        );
        expect(result.value).toBe(99n);
        expect(events).toEqual(["aborted", "close:7"]);
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

    test("multiple background reactive writers commit in arrival order", async () => {
        const releases = new Map();
        const systemContext = asyncSystem("gate", ([value]) => new Promise((resolve) => {
            releases.set(Number(value.value), resolve);
        }));
        const context = new Context();
        await parseAndEvaluateAsync(
            "$$status := :idle; "
                + "{$$ <status=status> .gate(1); $status := :one }; "
                + "{$$ <status=status> .gate(2); $status := :two }; _;",
            { context, systemContext },
        );
        await waitUntil(() => releases.size === 2, "background reactive writers");
        releases.get(2)();
        await waitUntil(() => parseAndEvaluate("$status", { context }).value === "two", "second writer commit");
        releases.get(1)();
        expect(await drainBackgroundTasks(context)).toEqual([]);
        expect(parseAndEvaluate("$status", { context }).value).toBe("one");
    });

    test("detached ordinary imports are deep snapshots and ordinary aliases are rejected", async () => {
        const context = new Context();
        const recorded = [];
        const systemContext = asyncSystem("record", async ([value]) => {
            recorded.push(value.values.map((item) => Number(item.value)));
            return null;
        });

        await parseAndEvaluateAsync(
            "items := [1]; {$$ <items~items> items.Push!(2); .record(items) }; items;",
            { context, systemContext },
        );
        expect(context.get("items").values.map((item) => Number(item.value))).toEqual([1]);
        expect(await drainBackgroundTasks(context)).toEqual([]);
        expect(recorded).toEqual([[1, 2]]);

        await expect(parseAndEvaluateAsync(
            "value := 1; {$$ <value=value> value };",
            { context },
        )).rejects.toThrow("requires a reactive cell");
    });

    test("detached blocks silence unlisted functions", async () => {
        const context = new Context();
        await parseAndEvaluateAsync("Hidden() -> 7; {$$ Hidden() }; 1;", { context });
        const errors = await drainBackgroundTasks(context);
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain("Undefined callable: HIDDEN");
    });

    test("reactive formula evaluation cannot launch detached work", async () => {
        const context = new Context();
        context.setEnv("__reactive_active_graph__", {});
        await expect(parseAndEvaluateAsync("{$$ 1 }", { context }))
            .rejects.toThrow("cannot start detached background tasks");
    });
});
