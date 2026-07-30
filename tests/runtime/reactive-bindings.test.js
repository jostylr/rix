import { describe, expect, test } from "bun:test";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    formatValue,
    getDiagnostics,
    parseAndEvaluate,
} from "../../src/index.js";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

describe("reactive dollar bindings", () => {
    test("declares cells, records explicit dependencies, and propagates updates", () => {
        const options = runtime();
        parseAndEvaluate(`
            $$source1 := 5;
            $$target1 := $source1 * 4
        `, options);

        expect(formatValue(parseAndEvaluate("[source1, target1]", options))).toBe("[5, 20]");
        expect(options.context.get("target1").live().dependencies).toEqual(["source1"]);

        parseAndEvaluate("$source1 := 7", options);
        expect(formatValue(parseAndEvaluate("[source1, target1]", options))).toBe("[7, 28]");
    });

    test("plain reads are snapshots and do not record dependencies", () => {
        const options = runtime();
        parseAndEvaluate(`
            $$source1 := 5;
            $$tracked := $source1 * 4;
            $$snapshot := source1 * 4
        `, options);

        expect(options.context.get("tracked").live().dependencies).toEqual(["source1"]);
        expect(options.context.get("snapshot").live().dependencies).toEqual([]);

        parseAndEvaluate("$source1 := 9", options);
        expect(formatValue(parseAndEvaluate("[tracked, snapshot]", options))).toBe("[36, 20]");
        expect(
            getDiagnostics(options.context).events.some((event) =>
                event.entries.get("label")?.value.includes("Untracked reactive read 'source1'")),
        ).toBe(true);
    });

    test("double-dollar reads expose identity and new names may alias it", () => {
        const options = runtime();
        parseAndEvaluate(`
            $$source1 := 7;
            $$target1 := $source1 * 4;
            $$source2 := $$source1;
            $source2 := 5
        `, options);

        expect(options.context.get("source2")).toBe(options.context.get("source1"));
        expect(formatValue(parseAndEvaluate("[source1, source2, target1]", options))).toBe("[5, 5, 20]");
    });

    test("reactive declarations cannot replace existing names", () => {
        const options = runtime();
        parseAndEvaluate("$$source1 := 5", options);
        expect(() => parseAndEvaluate("$$source1 := 7", options))
            .toThrow("Reactive declaration requires a new name: source1");
        expect(() => parseAndEvaluate("value := 1; $$value := 2", options))
            .toThrow("Reactive declaration requires a new name: value");
        expect(formatValue(parseAndEvaluate("source1", options))).toBe("5");
    });

    test("clearing a RiX context also clears its implicit reactive graph", () => {
        const options = runtime();
        parseAndEvaluate("$$source1 := 5", options);
        options.context.clear();
        expect(formatValue(parseAndEvaluate("$$source1 := 7; source1", options))).toBe("7");
    });

    test("reactive updates preserve cell identity while replacing dependencies", () => {
        const options = runtime();
        parseAndEvaluate(`
            $$left := 2;
            $$right := 3;
            $$result := $left + $right
        `, options);
        const cell = options.context.get("result");

        parseAndEvaluate("$result := $left * 10", options);
        expect(options.context.get("result")).toBe(cell);
        expect(cell.live().dependencies).toEqual(["left"]);
        parseAndEvaluate("$right := 20; $left := 4", options);
        expect(formatValue(parseAndEvaluate("result", options))).toBe("40");
    });

    test("$$Fun declares a reactive function with tracked and untracked calls", () => {
        const options = runtime();
        parseAndEvaluate(`
            $$source := 2;
            $$Fun := x -> x * $source;
            $$result := $Fun(3)
        `, options);

        expect(formatValue(parseAndEvaluate("$$Fun", options))).toBe("[Reactive function FUN]");
        expect(formatValue(parseAndEvaluate("[Fun(4), result]", options))).toBe("[8, 6]");
        parseAndEvaluate("$source := 5", options);
        expect(formatValue(parseAndEvaluate("[Fun(4), result]", options))).toBe("[20, 15]");

        parseAndEvaluate("$Fun := x -> x + $source", options);
        expect(formatValue(parseAndEvaluate("[Fun(4), result]", options))).toBe("[9, 8]");
        parseAndEvaluate("$source := 7", options);
        expect(formatValue(parseAndEvaluate("[Fun(4), result]", options))).toBe("[11, 10]");
    });

    test("uppercase and lowercase reactive names keep distinct identities", () => {
        const options = runtime();
        parseAndEvaluate(`
            $$source := 2;
            $$fun := 3;
            $$Fun := x -> x * $source
        `, options);

        expect(options.context.get("fun")).not.toBe(options.context.get("FUN"));
        expect(formatValue(parseAndEvaluate("[fun, Fun(4)]", options))).toBe("[3, 8]");
    });

    test("transaction declarations support forward references and commit once", () => {
        const options = runtime();
        parseAndEvaluate(`
            \${
                $$target2 := $target1 * 4;
                $$source1 := 2;
                $$source2 := 3;
                $$target1 := $source1 + $source2
            }
        `, options);

        const graph = options.context.get("source1").graph;
        expect(graph.epoch).toBe(1);
        expect(formatValue(parseAndEvaluate("[target1, target2]", options))).toBe("[5, 20]");
    });

    test("transaction updates recompute their closure in one atomic epoch", () => {
        const options = runtime();
        parseAndEvaluate(`
            \${
                $$source1 := 2;
                $$source2 := 3;
                $$target1 := $source1 + $source2;
                $$target2 := $target1 * 4
            }
        `, options);
        const graph = options.context.get("source1").graph;
        const events = [];
        graph.subscribe((event) => events.push(event));

        parseAndEvaluate("${ $source1 := 10; $source2 := 4 }", options);
        expect(graph.epoch).toBe(2);
        expect(events).toHaveLength(1);
        expect(formatValue(parseAndEvaluate("[target1, target2]", options))).toBe("[14, 56]");
    });

    test("failed transaction definitions roll back without bindings", () => {
        const options = runtime();
        expect(() => parseAndEvaluate(`
            \${
                $$first := $second + 1;
                $$second := $first + 1
            }
        `, options)).toThrow("Reactive cycle");

        expect(options.context.has("first")).toBe(false);
        expect(options.context.has("second")).toBe(false);
    });

    test("failed transaction updates retain the previous committed graph", () => {
        const options = runtime();
        parseAndEvaluate(`
            \${
                $$source := 2;
                $$target := $source * 3
            }
        `, options);
        const source = options.context.get("source");
        const previousFormula = source.formula;

        expect(() => parseAndEvaluate("${ $source := $target + 1 }", options))
            .toThrow("Reactive cycle");
        expect(source.formula).toBe(previousFormula);
        expect(source.state).toBe("clean");
        expect(formatValue(parseAndEvaluate("[source, target]", options))).toBe("[2, 6]");
    });

    test("definitions join the ReactiveGraph of explicitly tracked FormulaSheet cells", () => {
        const options = runtime();
        const sheet = parseAndEvaluate(`
            values := .FormulaSheet([[@{12}, @{20}, @{3}]]);
            graph := values.Graph();
            first = graph.Node("slot_1_1");
            second = graph.Node("slot_1_2");
            third = graph.Node("slot_1_3");
            $$average := ($first + $second) / 2;
            $$functionvalue := $first * $third;
            values
        `, options);

        expect(options.context.get("average").graph).toBe(sheet.graph);
        expect(formatValue(parseAndEvaluate("[average, functionvalue]", options))).toBe("[16, 36]");
        sheet.setFormula([1, 1], parseAndEvaluate("@{28}"), { source: "28" });
        expect(formatValue(parseAndEvaluate("[average, functionvalue]", options))).toBe("[24, 84]");
    });

    test("$sheet[index] tracks FormulaSheet cells and updates their deferred formulas", () => {
        const options = runtime();
        const sheet = parseAndEvaluate(`
            values := .FormulaSheet({:2x2:
                @{10}, @{ grid[1,1] + 1 };
                @{3}, @{4}
            });
            $$total := $values[1,1] + $values[2,2];
            values
        `, options);

        expect(options.context.get("total").graph).toBe(sheet.graph);
        expect(options.context.get("total").live().dependencies)
            .toEqual(["slot_1_1", "slot_2_2"]);
        expect(formatValue(parseAndEvaluate("[values[1,2], total]", options))).toBe("[11, 14]");

        parseAndEvaluate("$values[1,1] := @{20}", options);
        expect(formatValue(parseAndEvaluate("[values[1,2], total]", options))).toBe("[21, 24]");
        expect(parseAndEvaluate("$$values[1,2]", options)).toBe(sheet.reactiveNode([1, 2]));
    });

    test("updated FormulaSheet formulas can read named nodes in the same graph", () => {
        const options = runtime();
        parseAndEvaluate(`
            values := .FormulaSheet({:1x2: @{2}, @{0}});
            $$x := $values[1,1];
            $$y := $values[1,1] * 3;
            $values[1,2] := @{ x + $y }
        `, options);

        expect(formatValue(parseAndEvaluate("values[1,2]", options))).toBe("8");
        parseAndEvaluate("$values[1,1] := @{4}", options);
        expect(formatValue(parseAndEvaluate("values[1,2]", options))).toBe("16");
    });

    test("reactive FormulaSheet updates batch with ordinary graph changes", () => {
        const options = runtime();
        const sheet = parseAndEvaluate(`
            values := .FormulaSheet({:1x2: @{2}, @{3}});
            $$product := $values[1,1] * $values[1,2];
            values
        `, options);
        const events = [];
        sheet.graph.subscribe((event) => events.push(event));

        parseAndEvaluate(`
            \${ 
                $values[1,1] := @{5};
                $values[1,2] := @{7}
            }
        `, options);

        expect(events).toHaveLength(1);
        expect(formatValue(parseAndEvaluate("product", options))).toBe("35");
    });

    test("a raw $$ cell can drive a LiveView over its dependent values", () => {
        const options = runtime();
        const view = parseAndEvaluate(`
            $$source := 2;
            $$target := $source * 4;
            .LiveView($$source, @{ .Text(target) })
        `, options);

        expect(formatValue(view.current)).toBe("8");
        parseAndEvaluate("$source := 3", options);
        expect(view.revision).toBe(1);
        expect(formatValue(view.current)).toBe("12");
    });

    test("dollar adjacency leaves callable self and parent self intact", () => {
        expect(formatValue(parseAndEvaluate("Again(x) -> x > 0 ?? $(x - 1) ?: 7; Again(2)"))).toBe("7");
        expect(() => parseAndEvaluate("$ source1")).toThrow("Self reference '$'");
        expect(() => parseAndEvaluate("$$ source1")).toThrow("Parent self reference '$$'");
    });
});
