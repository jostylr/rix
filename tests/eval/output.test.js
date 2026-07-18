import { describe, expect, test } from "bun:test";
import { formatValue, parseAndEvaluate, renderOutputHtml } from "../../src/index.js";

describe("portable structured output", () => {
    test("Table accepts positional shorthand and keeps its semantic structure", () => {
        const table = parseAndEvaluate('.Table(["x", "F(x)"], [[1, 1], [2, 4]])');
        expect(table.type).toBe("output");
        expect(table.kind).toBe("table");
        expect(table.columns.map((column) => column.label)).toEqual(["x", "F(x)"]);
        expect(formatValue(table)).toContain("F(x)");
        expect(renderOutputHtml(table, formatValue)).toContain("rix-output-table");
    });

    test("Algebra.SyntheticDivision returns a ruled Grid with exact arithmetic", () => {
        const division = parseAndEvaluate(".Algebra.SyntheticDivision(1, [2, -6, 2, -1])");
        expect(division.type).toBe("output");
        expect(division.kind).toBe("grid");
        expect(division.semantic.bottom.map(formatValue)).toEqual(["2", "-4", "-2", "-3"]);
        expect(formatValue(division)).toContain("│");
        expect(renderOutputHtml(division, formatValue)).toContain("rix-grid-rule-top");
    });

    test("Fragments and slides preserve child output values", () => {
        const deck = parseAndEvaluate(`
            content := .Fragment([.Heading(1, "Results"), .Paragraph("Exact output")]);
            .Slides([.Slide(content, "First")])
        `);
        expect(deck.kind).toBe("slides");
        expect(deck.slides[0].content.kind).toBe("fragment");
        expect(formatValue(deck)).toContain("Slide 1");
        expect(renderOutputHtml(deck, formatValue)).toContain("rix-output-slides");
    });

    test("@ quoted strings interpolate RiX expressions", () => {
        const result = parseAndEvaluate('@"The value is @{2 + 3}."');
        expect(formatValue(result)).toBe("The value is 5.");
    });

    test("@ triple-quoted strings create document Fragments", () => {
        const document = parseAndEvaluate(`
            values := .Table(["x", "x²"], [[1, 1], [2, 4]]);
            @"""
            h1: Square values

            table: A small table #tbl:squares
                @{values}
            """
        `);
        expect(document.kind).toBe("fragment");
        expect(document.children.map((child) => child.kind)).toEqual(["heading", "figure"]);
        expect(document.children[1].content.kind).toBe("table");
        expect(renderOutputHtml(document, formatValue)).toContain("tbl:squares");
    });

    test("Plot.Polynomial produces a portable SVG Graphic", () => {
        const graphic = parseAndEvaluate(".Plot.Polynomial([1, 0, -1], [-2, 2])");
        expect(graphic.kind).toBe("graphic");
        const html = renderOutputHtml(graphic, formatValue);
        expect(html).toContain("<svg");
        expect(html).toContain("<path");
        expect(html).toContain('viewBox="0 0 640 360"');
    });
});
