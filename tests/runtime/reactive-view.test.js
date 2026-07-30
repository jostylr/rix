import { describe, expect, test } from "bun:test";
import {
    formatValue,
    parseAndEvaluate,
    renderOutputHtml,
} from "../../src/index.js";

describe("LiveView", () => {
    test("rederives arbitrary output when a FormulaSheet commits", () => {
        const live = parseAndEvaluate(`
            model := .FormulaSheet([[
                @{1},
                @{ grid[1,1] + 1 }
            ]]);
            .LiveView(model, @{ .Sheet(source, {= title="Derived results" }) })
        `);
        const events = [];
        const unsubscribe = live.subscribe((event) => events.push(event));

        expect(live.kind).toBe("live_view");
        expect(live.current.kind).toBe("sheet");
        expect(live.revision).toBe(0);
        expect(formatValue(live.current.cells[0][1].value)).toBe("2");
        expect(renderOutputHtml(live, formatValue)).toContain('data-rix-live-revision="0"');

        live.source.setFormula([1, 1], parseAndEvaluate("@{10}"), { source: "10" });

        expect(live.revision).toBe(1);
        expect(formatValue(live.current.cells[0][1].value)).toBe("11");
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe("live:commit");
        expect(renderOutputHtml(live, formatValue)).toContain('data-rix-live-revision="1"');
        unsubscribe();
        live.dispose();
    });

    test("uses the same observable contract for Binding sources", () => {
        const live = parseAndEvaluate(`
            point := [2, 3];
            lens := .Bind(point);
            .LiveView(lens, @{ .Table(
                ["coordinate", "value"],
                [["x", source.At(1).Get()], ["y", source.At(2).Get()]]
            ) })
        `);

        expect(formatValue(live.current.rows[0][1])).toBe("2");
        live.source.at(1).set(parseAndEvaluate("8"));
        expect(live.revision).toBe(1);
        expect(formatValue(live.current.rows[0][1])).toBe("8");
        live.dispose();
    });

    test("requires an observable source and deferred derivation", () => {
        expect(() => parseAndEvaluate(".LiveView([1,2], @{ source })")).toThrow("must support subscriptions");
        expect(() => parseAndEvaluate(`
            model := .FormulaSheet([[@{1}]]);
            .LiveView(model, 1)
        `)).toThrow("must use deferred syntax");
    });
});
