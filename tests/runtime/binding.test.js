import { describe, expect, test } from "bun:test";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    createWidgetSession,
    formatValue,
    parseAndEvaluate,
} from "../../src/index.js";

function session() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

describe("Binding lenses", () => {
    test(".Bind captures Cell identity and supports Get, At, Set, and subscriptions", () => {
        const state = session();
        const binding = parseAndEvaluate(`
            m := {:2x2: 1, 2; 3, 4};
            .Bind(m)
        `, state);
        const events = [];
        const unsubscribe = binding.subscribe((event) => events.push(event));

        expect(binding.name).toBe("m");
        expect(formatValue(binding.get())).toContain("{:2x2:");
        expect(formatValue(binding.at(2, 1).get())).toBe("3");
        binding.at(2, 1).set(parseAndEvaluate("9"));
        expect(formatValue(state.context.get("m").data[2])).toBe("9");
        expect(events).toHaveLength(1);
        expect(events[0].path).toHaveLength(2);

        parseAndEvaluate("m := {:1x1: 100}", state);
        binding.at(1, 2).set(parseAndEvaluate("8"));
        expect(formatValue(binding.at(1, 2).get())).toBe("8");
        expect(formatValue(state.context.get("m"))).toContain("100");
        unsubscribe();
    });

    test("Binding methods are callable from RiX", () => {
        const value = parseAndEvaluate(`
            m := {:2x2: 1, 2; 3, 4};
            lens := .Bind(m);
            lens.At(2, 2).Set(12);
            lens.At(2, 2).Get()
        `);
        expect(formatValue(value)).toBe("12");
    });

    test(".Bind rejects computed values so lvalue identity stays explicit", () => {
        expect(() => parseAndEvaluate(".Bind([1, 2, 3])")).toThrow("requires a variable name");
    });
});

describe("WidgetSession", () => {
    test("routes semantic sheet:set events through a Binding and refreshes the snapshot", () => {
        const state = session();
        const sheet = parseAndEvaluate(`
            m := {:2x2: 1, 2; 3, 4};
            .Sheet(.Bind(m), {= title="Live matrix" })
        `, state);
        const changes = [];
        const widget = createWidgetSession(sheet, {
            onChange: (change) => changes.push(change),
        });

        expect(sheet.editable).toBe(true);
        expect(sheet.addressBase).toBe("m");
        expect(sheet.bindingId).toBe(sheet.binding.id);
        const updated = widget.dispatch({
            type: "sheet:set",
            index: [2, 1],
            value: parseAndEvaluate("17"),
        });

        expect(widget.revision).toBe(1);
        expect(formatValue(state.context.get("m").data[2])).toBe("17");
        expect(formatValue(updated.cells[1][0].value)).toBe("17");
        expect(widget.current()).toBe(updated);
        expect(widget.snapshot().editable).toBe(false);
        expect(widget.snapshot().binding).toBeNull();
        expect(changes).toHaveLength(1);
        expect(changes[0].bindingEvent.metadata.index).toEqual([2, 1]);
        widget.dispose();
    });

    test("refresh preserves complete-map Sheet presentation options", () => {
        const sheet = parseAndEvaluate(`
            m := {:1x2: 1, 2};
            .Sheet({=
                data=.Bind(m),
                title="Mapped live view",
                address="coefficients",
                axes=["term", "power"]
            })
        `);
        const widget = createWidgetSession(sheet);
        const updated = widget.dispatch({
            type: "sheet:set",
            index: [1, 2],
            value: parseAndEvaluate("9"),
        });
        expect(updated.title).toBe("Mapped live view");
        expect(updated.addressBase).toBe("coefficients");
        expect(updated.axes).toEqual(["term", "power"]);
        widget.dispose();
    });

    test("routes formula edits and refreshes all dependent values", () => {
        const sheet = parseAndEvaluate(`
            model := .FormulaSheet([[
                @{1},
                @{ grid[1,1] + 1 },
                @{ grid[1,2] + 1 }
            ]]);
            .Sheet(model, {= title="Formula model" })
        `);
        const changes = [];
        const widget = createWidgetSession(sheet, { onChange: (change) => changes.push(change) });
        const updated = widget.dispatch({
            type: "sheet:formula",
            index: [1, 1],
            source: "10",
            assignmentMode: "~=",
        });

        expect(widget.editMode).toBe("formula");
        expect(widget.revision).toBe(1);
        expect(updated.cells[0].map((cell) => formatValue(cell.value))).toEqual(["10", "11", "12"]);
        expect(updated.cells[0][0].formulaSource).toBe("10");
        expect(updated.cells[0][0].assignmentMode).toBe("~=");
        expect(updated.cells[0][0].slotId).toBe(sheet.cells[0][0].slotId);
        expect(widget.cellUpdates(formatValue).map(({ text }) => text)).toEqual(["10", "11", "12"]);
        expect(widget.cellUpdates(formatValue)[1].dependencies).toEqual(["1,1"]);
        expect(changes[0].formulaEvent.type).toBe("formula:commit");

        const explicit = widget.dispatch({
            type: "sheet:formula",
            index: [1, 1],
            source: "::= 20",
        });
        expect(explicit.cells[0][0].formulaSource).toBe("20");
        expect(explicit.cells[0][0].assignmentMode).toBe("::=");

        const labeled = widget.dispatch({
            type: "sheet:header",
            axis: 2,
            coordinate: 2,
            label: "Middle",
        });
        expect(labeled.columnHeaders).toEqual(["A · 1", "Middle · 2", "C · 3"]);
        expect(labeled.axisLabels[1]).toEqual([null, "Middle", null]);
        expect(widget.revision).toBe(3);
        widget.dispose();
    });

    test("refreshes failed formula edits with last-good values and diagnostics", () => {
        const sheet = parseAndEvaluate(`
            model := .FormulaSheet([[@{2}, @{ grid[1,1] * 3 }]]);
            .Sheet(model)
        `);
        const changes = [];
        const widget = createWidgetSession(sheet, { onChange: (change) => changes.push(change) });

        expect(() => widget.dispatch({
            type: "sheet:formula",
            index: [1, 1],
            source: "1 +",
        })).toThrow();
        expect(widget.revision).toBe(1);
        expect(formatValue(widget.current().cells[0][0].value)).toBe("2");
        expect(widget.current().cells[0][0]).toMatchObject({
            state: "error",
            diagnosticKind: "parse",
            diagnosticSource: "1 +",
        });
        expect(widget.cellUpdates(formatValue)[0]).toMatchObject({
            text: "2",
            state: "error",
            diagnosticKind: "parse",
            diagnosticSource: "1 +",
        });
        expect(changes.at(-1).formulaEvent.type).toBe("formula:error");

        expect(() => widget.dispatch({
            type: "sheet:formula",
            index: [1, 1],
            source: "grid[1,1] + 1",
        })).toThrow("Formula cycle");
        expect(widget.revision).toBe(2);
        expect(widget.current().cells[0][0].diagnosticKind).toBe("cycle");

        const recovered = widget.dispatch({
            type: "sheet:formula",
            index: [1, 1],
            source: "4",
        });
        expect(widget.revision).toBe(3);
        expect(recovered.cells[0][0].state).toBe("clean");
        expect(recovered.cells[0][0].diagnostics).toEqual([]);
        expect(recovered.cells[0].map((cell) => formatValue(cell.value))).toEqual(["4", "12"]);
        widget.dispose();
    });

    test("routes semantic graphic:position events into reactive definitions", () => {
        const state = session();
        const graphic = parseAndEvaluate(`
            $$origin := {: 20,30};
            $$point := $origin;
            $$total := {; p := $point; p[1] + p[2] };
            .Graphics.Graphic([200,120], [
                .Graphics.DragPoint($$point, 8, {= fill="#7c3aed" }, "Move test point")
            ])
        `, state);
        const changes = [];
        const widget = createWidgetSession(graphic, { onChange: (change) => changes.push(change) });
        const targetId = graphic.children[0].targetId;
        const result = widget.dispatch({
            type: "graphic:position",
            targetId,
            position: [40.5, 50],
            source: "pointer",
        });

        expect(widget.editMode).toBe("position");
        expect(widget.revision).toBe(1);
        expect(formatValue(result)).toBe("( 40..1/2, 50 )");
        expect(formatValue(state.context.get("point").peek())).toBe("( 40..1/2, 50 )");
        expect(formatValue(state.context.get("total").peek())).toBe("90..1/2");
        expect(state.context.get("point").live().dependencies).toEqual([]);
        expect(state.context.get("origin").live().dependents).toEqual([]);
        state.context.get("origin").replaceValue(parseAndEvaluate("{: 1,2}"));
        expect(formatValue(state.context.get("point").peek())).toBe("( 40..1/2, 50 )");
        expect(changes).toHaveLength(1);
        expect(changes[0].sourceEvent.cause.metadata).toMatchObject({
            widgetKind: "graphic",
            eventType: "graphic:position",
            targetId,
            inputSource: "pointer",
            replacedDependencies: ["origin"],
        });
        expect(() => widget.dispatch({
            type: "graphic:position",
            targetId: "missing",
            position: [1, 2],
        })).toThrow("Unknown Graphic drag target");
        widget.dispose();
    });

    test("rejects malformed and out-of-range events", () => {
        const sheet = parseAndEvaluate(`
            m := {:1x2: 1, 2};
            .Sheet(.Bind(m))
        `);
        const widget = createWidgetSession(sheet);
        expect(() => widget.dispatch({ type: "click", index: [1, 1], value: null })).toThrow("Unsupported widget event");
        expect(() => widget.dispatch({ type: "sheet:set", index: [1, 3], value: null })).toThrow("out of range");
        widget.dispose();
    });
});
