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

    test("basic scene primitives compose into safe SVG", () => {
        const graphic = parseAndEvaluate(`
            .Graphic([360, 220], [
                .Draw.Rectangle([0, 0], [360, 220], {= fill="#f8fafc", stroke="#cbd5e1" }),
                .Draw.Clip([
                    .Draw.Transform([
                        .Draw.Group([
                            .Draw.Circle([80, 80], 45, {= fill="#bfdbfe", stroke="#2563eb", width=2 }),
                            .Draw.Rectangle([60, 60], [80, 40], {= fill="#fde68a", stroke="#d97706", width=2 }),
                            .Draw.Text([100, 85], "RiX", {= anchor=:middle, size=18, weight="bold" })
                        ], {= opacity=1 })
                    ], {= translate=[80, 15], rotate=18, origin=[100, 85] })
                ], [20, 20, 320, 160])
            ])
        `);
        expect(graphic.children.map((node) => node.kind)).toEqual(["rectangle", "clip"]);
        const html = renderOutputHtml(graphic, formatValue);
        expect(html).toContain("<defs><clipPath");
        expect(html).toContain("<circle");
        expect(html).toContain("<rect");
        expect(html).toContain("<text");
        expect(html).toContain('transform="translate(80 15) rotate(18 100 85)"');
        expect(html).toContain("RiX</text>");
    });

    test("Draw.Transform accepts an explicit map specification", () => {
        const graphic = parseAndEvaluate(`
            .Graphic([100, 100], [
                .Draw.Transform({=
                    children = [.Draw.Circle([10, 10], 5, {= stroke="#000", width=1 })],
                    translate = [20, 30],
                    scale = 2
                })
            ])
        `);
        expect(graphic.children[0].kind).toBe("transform");
        expect(renderOutputHtml(graphic, formatValue)).toContain('transform="translate(20 30) scale(2 2)"');
    });

    test("2D leaf constructors do not reserve global capability names", () => {
        expect(() => parseAndEvaluate(".Group([])")).toThrow("Unknown system capability: GROUP");
        expect(parseAndEvaluate(".Draw.Group([])").kind).toBe("group");
    });
});
