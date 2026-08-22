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

    test("builds reusable reports with citations, assets, regions, and numbering policies", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("document");
            bibliography := .document.Bibliography([
                {= key="knuth84", author="Donald Knuth", year=1984, title="Literate Programming" },
                {= key="rix26", author="RiX Project", year=2026, title="RiX Manual" }
            ]);
            assets := .document.AssetManifest([
                {= id="logo", path="images/logo.svg", mime="image/svg+xml", alt="Project logo", checksum="sha256:abc" }
            ]);
            numbering := .document.Numbering({=
                style=:roman, sectionStart=2, tableStart=3,
                citationStyle="author-year", numberSections=0
            });
            template := .document.Template("course-report", {=
                author="Ada", theme=:compact, numbering=numbering,
                bibliography=bibliography, assets=assets,
                header=.document.Header(.Paragraph("Course header")),
                footer=.document.Footer(.Paragraph("Course footer"))
            });
            prose := @"""
            h1: Evidence #evidence

            p: See @{.document.Citation(["knuth84", "rix26"], {= prefix="compare " })} and @{.document.Ref("tbl-data")}.
            """;
            table := .document.Label("tbl-data", .Table(["x"], [[1]], {= caption="Data" }));
            report := .document.ApplyTemplate(template, {= title="Template report", children=[prose, table] });
            raw := .document.TargetMarkup(:latex, "\\\\newcommand{\\\\private}{x}", "[LaTeX-only]");
            [.document.References(report), .document.Asset(assets, "logo"), report, raw];
        `, options);
        expect(result.values[0].values.map((entry) => entry.entries.get("displayNumber").value)).toEqual(["II", "III"]);
        expect(result.values[1].entries.get("path").value).toBe("images/logo.svg");
        const report = result.values[2];
        expect(report).toMatchObject({ documentVersion: 2, documentTemplate: "course-report" });
        expect(report.documentCitations).toEqual(["knuth84", "rix26"]);
        expect(report.children[0].documentRegion).toBe("header");
        expect(report.children.at(-1).documentRegion).toBe("footer");
        const html = renderOutputHtml(report, formatValue);
        expect(html).toContain("compare Donald Knuth, 1984; RiX Project, 2026");
        expect(html).toContain("Table III. Data");
        expect(html).toContain(">Evidence<");
        expect(result.values[3].documentTargetMarkup).toMatchObject({ target: "latex" });
        expect(renderOutputHtml(result.values[3], formatValue)).toContain("[LaTeX-only]");
        expect(renderOutputHtml(result.values[3], formatValue)).not.toContain("newcommand");
    });

    test("rejects unsafe manifests, duplicate bibliography keys, and unresolved citations", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("document")', options);
        expect(() => parseAndEvaluate(`.document.AssetManifest([{= id="x", path="../secret" }])`, options))
            .toThrow("safe relative paths");
        expect(() => parseAndEvaluate(`.document.Bibliography([
            {= key="same", title="One" }, {= key="same", title="Two" }
        ])`, options)).toThrow("duplicate key 'same'");
        expect(() => parseAndEvaluate(`
            .document.Report("Bad", [.Paragraph([.document.Citation("missing")])]);
        `, options)).toThrow("cannot resolve citation 'missing'");
    });
});
