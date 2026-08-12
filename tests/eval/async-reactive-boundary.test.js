import { describe, expect, test } from "bun:test";
import {
    createDefaultSystemContext,
    parseAndEvaluateAsync,
} from "../../src/eval/evaluator.js";
import {
    REACTIVE_BINDING_GRAPH_ENV,
} from "../../src/eval/functions/reactive-bindings.js";
import { Context } from "../../src/runtime/context.js";

function asyncIdentitySystem() {
    const systemContext = createDefaultSystemContext({ frozen: false });
    systemContext.registerHost("slow", {
        impl: async ([value]) => {
            await Promise.resolve();
            return value;
        },
    });
    systemContext.freeze();
    return systemContext;
}

describe("promise-aware reactive boundary", () => {
    test("rejects direct and nested suspended formula values before declaration commit", async () => {
        for (const source of [
            "$$value := .slow(7)",
            "$$value := [.slow(7)]",
        ]) {
            const context = new Context();
            await expect(parseAndEvaluateAsync(source, {
                context,
                systemContext: asyncIdentitySystem(),
            })).rejects.toThrow(
                "Reactive formulas cannot suspend; resolve async work before publishing a literal value",
            );

            expect(context.has("value")).toBe(false);
            const graph = context.getEnv(REACTIVE_BINDING_GRAPH_ENV, null);
            expect(graph?.nodeCount ?? 0).toBe(0);
            expect(graph?.epoch ?? 0).toBe(0);
        }
    });

    test("rolls back a reactive transaction containing a suspended formula", async () => {
        const context = new Context();
        await expect(parseAndEvaluateAsync(
            "${ $$first := .slow(3); $$second := $first + 1 }",
            { context, systemContext: asyncIdentitySystem() },
        )).rejects.toThrow("Reactive formulas cannot suspend");

        const graph = context.getEnv(REACTIVE_BINDING_GRAPH_ENV, null);
        expect(graph?.nodeCount ?? 0).toBe(0);
        expect(graph?.epoch ?? 0).toBe(0);
        expect(context.has("first")).toBe(false);
        expect(context.has("second")).toBe(false);
    });

    test("retains the previous formula, value, dependencies, and epoch after a rejected update", async () => {
        const context = new Context();
        const systemContext = asyncIdentitySystem();
        await parseAndEvaluateAsync("$$source := 1; $$derived := $source + 1", {
            context,
            systemContext,
        });

        const source = context.get("source");
        const derived = context.get("derived");
        const previousFormula = source.formula;
        const previousEpoch = source.graph.epoch;

        await expect(parseAndEvaluateAsync("$source := .slow(7)", {
            context,
            systemContext,
        })).rejects.toThrow("Reactive formulas cannot suspend");

        expect(context.get("source")).toBe(source);
        expect(source.formula).toBe(previousFormula);
        expect(source.peek().value).toBe(1n);
        expect(derived.peek().value).toBe(2n);
        expect(source.state).toBe("clean");
        expect(derived.state).toBe("clean");
        expect(derived.live().dependencies).toEqual(["source"]);
        expect(source.graph.epoch).toBe(previousEpoch);
    });

    test("keeps synchronous dollar formulas and transactions working through the async entry point", async () => {
        const value = await parseAndEvaluateAsync(`
            \${
                $$source := 2;
                $$derived := $source + 3
            };
            $source := 4;
            [source, derived]
        `);

        expect(value.values.map((entry) => entry.value)).toEqual([4n, 7n]);
    });

    test("retains synchronous evaluators for explicit ReactiveGraph formulas", async () => {
        const value = await parseAndEvaluateAsync(`
            graph := .ReactiveGraph("async-entry");
            source := graph.Source("source", 2);
            first := graph.Derive("first", @{ source + 1 });
            second := graph.Derive("second", @{ first * 2 });
            graph.Get("second")
        `);

        expect(value.value).toBe(6n);
    });

    test("retains FormulaSheet and RiXCel dependency evaluation through the async entry point", async () => {
        const value = await parseAndEvaluateAsync(`
            sheet := .FormulaSheet([[@{ 1 }, @{ grid[1,1] + 1 }]]);
            saved := .RiXCelExport(sheet);
            restored := .RiXCelImport(saved);
            [sheet[1,2], restored[1,2]]
        `);

        expect(value.values.map((entry) => entry.value)).toEqual([2n, 2n]);
    });
});
