import { describe, expect, test } from "bun:test";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    formatValue,
    parseAndEvaluate,
} from "../../src/index.js";

describe(".RG notation", () => {
    test("defines sources with $ or source and derives ordinary assignments", () => {
        const graph = parseAndEvaluate(`
            graph := \`.RG.Init.Set:
                $source1 := 2
                source source2 := 3
                target2 := target1 * 4
                target1 := source1 + source2
            \`;
            graph
        `);

        expect(formatValue(graph.get("target1"))).toBe("5");
        expect(formatValue(graph.get("target2"))).toBe("20");
        expect(graph.node("source1").kind).toBe("source");
        expect(graph.node("source2").kind).toBe("source");
        expect(graph.node("target1").kind).toBe("computed");

        graph.node("source1").set(parseAndEvaluate("10"));
        expect(formatValue(graph.get("target1"))).toBe("13");
        expect(formatValue(graph.get("target2"))).toBe("52");
    });

    test("plain RG blocks extend the context-local default graph", () => {
        const result = parseAndEvaluate(`
            graph := \`.RG.Init.Set:$source1 := 2\`;
            \`.RG:
                $ source2 := 3
                target1 := source1 + source2
                target2 := target1 * 4
            \`;
            graph.Get("target2")
        `);
        expect(formatValue(result)).toBe("20");
    });

    test("RG declarations allow ordinary line and block comments", () => {
        const result = parseAndEvaluate(`
            graph := \`.RG.Init:
                ## editable inputs
                $source1 := 2
                /** derived result **/
                target := source1 + 1
            \`;
            graph.Get("target")
        `);
        expect(formatValue(result)).toBe("3");
    });

    test("Use is one-shot while Set changes the default graph", () => {
        const result = parseAndEvaluate(`
            first := \`.RG.Init.Set:$a := 1\`;
            second := \`.RG.Init:$b := 10\`;
            \`.RG.Use(second):twice := b * 2\`;
            \`.RG:plus := a + 1\`;
            before := [second.Get("twice"), first.Get("plus")];
            \`.RG.Set(second):triple := b * 3\`;
            \`.RG:after := triple + 1\`;
            [before, second.Get("after")]
        `);
        expect(formatValue(result)).toBe("[[20, 2], 31]");
    });

    test("normal RiX can analyze and apply deferred RG plans", () => {
        const graph = parseAndEvaluate(`
            plan := .RG.Analyze(@{
                source1 := .RG.Source(2);
                source2 := .RG.Source(3);
                target1 := source1 + source2;
                target2 := target1 * 4
            });
            graph := .RG.Init("planned", plan);
            graph
        `);
        expect(graph.id).toBe("planned");
        expect(formatValue(graph.get("target2"))).toBe("20");
    });

    test("Analyze also accepts RG source strings and Apply extends a graph", () => {
        const result = parseAndEvaluate(`
            graph := .RG.Init(.RG.Analyze("$a := 4"));
            plan := .RG.Analyze("double := a * 2");
            .RG.Apply(graph, plan);
            graph.Get("double")
        `);
        expect(formatValue(result)).toBe("8");
    });

    test("Use can add named computations to a FormulaSheet graph", () => {
        const sheet = parseAndEvaluate(`
            values := .FormulaSheet([[@{12}, @{20}, @{3}]]);
            graph := values.Graph();
            \`.RG.Use(graph):
                average := (grid[1,1] + grid[1,2]) / 2
                functionvalue := {;
                    Scale(x) -> x * grid[1,3];
                    Scale(grid[1,1])
                }
            \`;
            values
        `);

        expect(formatValue(sheet.graph.get("average"))).toBe("16");
        expect(formatValue(sheet.graph.get("functionvalue"))).toBe("36");
        sheet.setFormula([1, 1], parseAndEvaluate("@{28}"), { source: "28" });
        expect(formatValue(sheet.graph.get("average"))).toBe("24");
        expect(formatValue(sheet.graph.get("functionvalue"))).toBe("84");
    });

    test("failed definition batches do not leave partial nodes", () => {
        const context = new Context();
        const options = {
            context,
            registry: createDefaultRegistry(),
            systemContext: createDefaultSystemContext(),
        };
        parseAndEvaluate('graph := `.RG.Init:$seed := 1`', options);

        expect(() => parseAndEvaluate(`
            \`.RG.Use(graph):
                first := second + 1
                second := first + 1
            \`
        `, options)).toThrow("Reactive cycle: first -> second -> first");
        expect(context.get("graph").bindings().has("first")).toBe(false);
        expect(context.get("graph").bindings().has("second")).toBe(false);
        expect(formatValue(context.get("graph").get("seed"))).toBe("1");
    });

    test("computed declarations remain isolated from caller bindings", () => {
        expect(() => parseAndEvaluate(`
            outside := 10;
            graph := \`.RG.Init:
                $inside := 2
                result := outside + inside
            \`;
            graph
        `)).toThrow("Undefined variable: outside");
    });

    test("a missing default graph gives an actionable error", () => {
        expect(() => parseAndEvaluate("`.RG:$value := 1`"))
            .toThrow(".RG has no default graph");
    });

    test("$ retains its ordinary callable-self meaning outside RG notation", () => {
        expect(formatValue(parseAndEvaluate("Again(x) -> x > 0 ?? $(x - 1) ?: 7; Again(2)"))).toBe("7");
        expect(() => parseAndEvaluate("$source1 := 3"))
            .toThrow("Self reference '$' is only valid within a function body");
    });
});
