import { describe, expect, test } from "bun:test";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    formatValue,
    parseAndEvaluate,
    renderOutputHtml,
} from "../../src/index.js";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

const reportSource = `
    .Plugin.Load("document");
    intro := @"""
    h1: Results #results

    p: Read @{.document.Ref("fig-curve")} and @{.document.Ref("tbl-values")}.
    """;
    table := .document.Label("tbl-values", .Table(
        ["name", "value"], [["half", 1/2]], {= caption="Exact values" }
    ));
    figure := .document.Label("fig-curve", .Figure(
        .Graphics.Graphic([20, 20], [.Graphics.Circle([10, 10], 4)]),
        "A small diagram"
    ));
    report := .document.Report("Numbered report", [intro, table, figure], {=
        author="Ada",
        theme=.document.Theme(:compact, {= accent="#275dad" })
    });
`;

describe("document plugin", () => {
    test("resolves forward references and numbers core output deterministically", () => {
        const options = runtime();
        const result = parseAndEvaluate(`${reportSource}
            [.document.References(report), report];
        `, options);
        const references = result.values[0].values.map((entry) => ({
            id: entry.entries.get("id").value,
            kind: entry.entries.get("kind").value,
            number: entry.entries.get("number").value,
        }));
        expect(references).toEqual([
            { id: "results", kind: "Section", number: 1n },
            { id: "tbl-values", kind: "Table", number: 1n },
            { id: "fig-curve", kind: "Figure", number: 1n },
        ]);
        const report = result.values[1];
        expect(report).toMatchObject({ type: "output", kind: "fragment", documentSchema: "rix.document.report@1" });
        expect(report.children[2].children[0].title[0].value.value).toBe("1. ");
        expect(report.children[3]).toMatchObject({ kind: "table", label: "tbl-values", caption: "Table 1. Exact values" });
        expect(report.children[4]).toMatchObject({ kind: "figure", label: "fig-curve", caption: "Figure 1. A small diagram" });
        const html = renderOutputHtml(report, formatValue);
        expect(html).toContain('href="#fig-curve"');
        expect(html).toContain('id="tbl-values"');
        expect(html).toContain("By Ada");
    });

    test("Markdown, Quarto, and LaTeX preserve anchors and resolved links", () => {
        const options = runtime();
        const result = parseAndEvaluate(`${reportSource}
            .Plugin.Load("markdown"); .Plugin.Load("quarto"); .Plugin.Load("latex");
            [
                .markdown.Render(report).Get("content"),
                .quarto.Render(report).Get("content"),
                .latex.Render(report).Get("content")
            ];
        `, options);
        expect(result.values[0].value).toContain("[Figure 1](#fig-curve)");
        expect(result.values[0].value).toContain('<a id="tbl-values"></a>');
        expect(result.values[1].value).toContain("::: {#tbl-values}");
        expect(result.values[2].value).toContain("\\href{#fig-curve}{Figure 1}");
        expect(result.values[2].value).toContain("\\hypertarget{tbl-values}{}");
    });

    test("rejects duplicate, unresolved, malformed, and unsupported labels", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("document")', options);
        expect(() => parseAndEvaluate(`
            .document.Report("Bad", [
                .document.Label("same", .Table(["x"], [[1]])),
                .document.Label("same", .Figure(.Graphics.Graphic([10,10], [])))
            ]);
        `, options)).toThrow("duplicate label 'same'");
        expect(() => parseAndEvaluate(`
            .document.Report("Bad", [.Paragraph([.document.Ref("missing")])]);
        `, options)).toThrow("cannot resolve reference 'missing'");
        expect(() => parseAndEvaluate('.document.Label("bad label", .Table(["x"], [[1]]))', options))
            .toThrow("must start with a letter");
        expect(() => parseAndEvaluate('.document.Label("value", .Paragraph("no"))', options))
            .toThrow("accepts Heading, Section, Figure, or Table");
        expect(() => parseAndEvaluate('.document.Theme(:compact, {= accent="blue" })', options))
            .toThrow("six-digit hex color");
    });
});
