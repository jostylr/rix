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
    });
});
