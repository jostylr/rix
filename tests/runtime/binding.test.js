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
