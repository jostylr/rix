import { describe, expect, test } from "bun:test";
import { formatValue, parseAndEvaluate } from "../../src/index.js";

describe("ReactiveGraph", () => {
    test("propagates source changes through computed-node chains", () => {
        const graph = parseAndEvaluate(`
            graph := .ReactiveGraph("totals");
            source1 := graph.Source("source1", 2);
            source2 := graph.Source("source2", 3);
            target1 := graph.Derive("target1", @{ source1 + source2 });
            target2 := graph.Derive("target2", @{ target1 * 4 });
            graph
        `);

        expect(formatValue(graph.get("target1"))).toBe("5");
        expect(formatValue(graph.get("target2"))).toBe("20");
        expect(graph.node("target1").live().dependencies).toEqual(["source1", "source2"]);
        expect(graph.node("target1").live().dependents).toEqual(["target2"]);

        const events = [];
        const unsubscribe = graph.subscribe((event) => events.push(event));
        graph.node("source1").set(parseAndEvaluate("10"));

        expect(formatValue(graph.get("target1"))).toBe("13");
        expect(formatValue(graph.get("target2"))).toBe("52");
        expect(events).toHaveLength(1);
        expect(events[0].changed).toEqual(["source1", "target1", "target2"]);
        unsubscribe();
    });

    test("updates dynamic edges and skips disconnected computations", () => {
        const graph = parseAndEvaluate(`
            graph := .ReactiveGraph();
            chooseLeft := graph.Source("chooseLeft", 1);
            left := graph.Source("left", 10);
            right := graph.Source("right", 20);
            selected := graph.Derive("selected", @{ chooseLeft > 0 ?? left ?: right });
            unrelated := graph.Derive("unrelated", @{ 99 });
            graph
        `);

        expect(graph.node("selected").live().dependencies).toEqual(["chooseleft", "left"]);
        graph.node("chooseLeft").set(parseAndEvaluate("0"));
        expect(formatValue(graph.get("selected"))).toBe("20");
        expect(graph.node("selected").live().dependencies).toEqual(["chooseleft", "right"]);
        expect(graph.node("right").live().dependents).toEqual(["selected"]);
        expect(graph.node("left").live().dependents).toEqual([]);
    });

    test("replaces a computed definition with a literal while preserving identity", () => {
        const point = parseAndEvaluate(`
            $$origin := 4;
            $$point := $origin * 2;
            $$downstream := $point + 1;
            $$point
        `);
        const graph = point.graph;

        expect(formatValue(point.get())).toBe("8");
        expect(point.live().dependencies).toEqual(["origin"]);
        point.replaceValue(parseAndEvaluate("12"), { source: "test" });

        expect(graph.node("point")).toBe(point);
        expect(formatValue(point.get())).toBe("12");
        expect(formatValue(graph.get("downstream"))).toBe("13");
        expect(point.live().dependencies).toEqual([]);
        graph.node("origin").replaceValue(parseAndEvaluate("9"));
        expect(formatValue(point.get())).toBe("12");
        expect(formatValue(graph.get("downstream"))).toBe("13");
    });

    test("detects cycles and retains the last committed epoch", () => {
        const graph = parseAndEvaluate(`
            graph := .ReactiveGraph();
            source := graph.Source("source", 2);
            first := graph.Derive("first", @{ source + 1 });
            second := graph.Derive("second", @{ first * 2 });
            graph
        `);
        const previous = graph.get("first");
        const cyclic = parseAndEvaluate("@{ second + 1 }");

        expect(() => graph.node("first").setFormula(cyclic, { source: "second + 1" }))
            .toThrow("Reactive cycle: first -> second -> first");
        expect(graph.node("first").formula).toBe(cyclic);
        expect(graph.node("first").value).toBe(previous);
        expect(graph.node("first").state).toBe("error");
    });

    test("FormulaSheet coordinates and named computations share one graph", () => {
        const sheet = parseAndEvaluate(`
            values := .FormulaSheet([[@{12}, @{20}, @{3}]]);
            graph := values.Graph();
            average := graph.Derive("average", @{ (grid[1,1] + grid[1,2]) / 2 });
            scaled := graph.Derive("scaled", @{ average * grid[1,3] });
            functionvalue := graph.Derive("functionvalue", @{
                Scale(x) -> x * grid[1,3];
                Scale(grid[1,1])
            });
            values
        `);

        expect(formatValue(sheet.graph.get("average"))).toBe("16");
        expect(formatValue(sheet.graph.get("scaled"))).toBe("48");
        expect(formatValue(sheet.graph.get("functionvalue"))).toBe("36");
        expect(sheet.graph.node("average").live().dependencies).toEqual(["slot_1_1", "slot_1_2"]);
        expect(sheet.graph.node("average").live().dependents).toEqual(["scaled"]);
        expect(sheet.graph.node("functionvalue").live().dependencies).toEqual(["slot_1_1", "slot_1_3"]);

        sheet.setFormula([1, 1], parseAndEvaluate("@{28}"), { source: "28" });
        expect(formatValue(sheet.graph.get("average"))).toBe("24");
        expect(formatValue(sheet.graph.get("scaled"))).toBe("72");
        expect(formatValue(sheet.graph.get("functionvalue"))).toBe("84");
    });

    test("FormulaSheet reserves its contextual binding names", () => {
        const sheet = parseAndEvaluate("values := .FormulaSheet([[@{1}]]); values");
        expect(() => sheet.graph.addComputed("grid", parseAndEvaluate("@{1}")))
            .toThrow("FormulaSheet graph node name is reserved: grid");
        expect(() => sheet.graph.addSource("row", parseAndEvaluate("1")))
            .toThrow("FormulaSheet graph node name is reserved: row");
    });

    test("reactive formulas cannot access arbitrary caller bindings", () => {
        expect(() => parseAndEvaluate(`
            outside := 10;
            graph := .ReactiveGraph();
            value := graph.Derive("value", @{ outside + 1 });
            graph
        `)).toThrow("Undefined variable: outside");
    });
});
