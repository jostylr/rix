import { describe, expect, test } from "bun:test";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

const content = (value) => value.entries.get("content").value;

describe("terminalAscii renderer", () => {
    test("renders a fixed-width Table with strict ASCII", () => {
        const rendered = parseAndEvaluate(`
            .Plugin.Load("terminal-ascii");
            .terminalAscii.Render(.Table(
                [{= id="name", label="name" }, {= id="value", label="value", align="right" }],
                [["half", 1/2], ["third", 1/3]],
                {= caption="Exact values" }
            ), {= width=40 });
        `);
        expect(content(rendered)).toBe(
            "Exact values\n"
            + "+-------+-------+\n"
            + "| name  | value |\n"
            + "+-------+-------+\n"
            + "| half  |   1/2 |\n"
            + "| third |   1/3 |\n"
            + "+-------+-------+\n",
        );
        expect([...content(rendered)].every((character) => character === "\n" || (character.codePointAt(0) >= 32 && character.codePointAt(0) <= 126))).toBe(true);
    });

    test("preserves synthetic-division rules and reports width truncation", () => {
        const division = parseAndEvaluate(`
            .Plugin.Load("terminal-ascii");
            .terminalAscii.Render(.Algebra.SyntheticDivision(1, [2, -6, 2, -1]), {= width=40 });
        `);
        expect(content(division)).toBe("1 | 2  -6   2  -1\n  |     2  -4  -2\n  +--------------\n  | 2  -4  -2  -3\n");

        const narrow = parseAndEvaluate(`
            .Plugin.Load("terminal-ascii");
            .terminalAscii.Render(.Table(["long heading", "other"], [["abcdefghijk", "uvwxyz"]]), {= width=20 });
        `);
        expect(content(narrow).split("\n").every((line) => line.length <= 20)).toBe(true);
        expect(narrow.entries.get("diagnostics").values[0].entries.get("code").value).toBe("terminal-width-truncated");
        expect(content(narrow)).toContain("~");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("terminal-ascii");
            .terminalAscii.Render(.Table(["x"], [[1]]), {= width=10 });
        `)).toThrow("between 20 and 240");
    });

    test("renders Fragments and deterministic polynomial Graphics", () => {
        const rendered = parseAndEvaluate(`
            .Plugin.Load("plot"); .Plugin.Load("terminal-ascii");
            plot := .plot.Polynomial([1,0,-1], [-2,2], {= size=[320,180], samples=41 });
            .terminalAscii.Render(.Fragment([.Heading(1, "ASCII plot"), plot]), {= width=32, height=8 });
        `);
        const output = content(rendered);
        expect(output).toStartWith("# ASCII plot\n\n");
        const plotLines = output.split("\n").slice(2, -1);
        expect(plotLines).toHaveLength(8);
        expect(plotLines.every((line) => line.length === 32)).toBe(true);
        expect(plotLines.join("\n")).toContain("*");
        expect([...output].every((character) => character === "\n" || (character.codePointAt(0) >= 32 && character.codePointAt(0) <= 126))).toBe(true);
    });

    test("reports non-ASCII replacement and unsupported Graphic nodes", () => {
        const rendered = parseAndEvaluate(`
            .Plugin.Load("terminal-ascii");
            graphic := .Graphics.Graphic([20,20], [.Graphics.Group([])]);
            .terminalAscii.Render(.Fragment([.Paragraph("café × 2"), graphic]), {= width=20, height=4 });
        `);
        expect(content(rendered)).toContain("cafe x 2");
        expect(content(rendered)).toContain("?");
        const codes = rendered.entries.get("diagnostics").values.map((entry) => entry.entries.get("code").value);
        expect(codes).toContain("terminal-non-ascii-replaced");
        expect(codes).toContain("terminal-graphic-node-unsupported");
    });

    test("Phase 2 word-wraps table cells while retaining column alignment", () => {
        const rendered = parseAndEvaluate(`
            .Plugin.Load("terminal-ascii");
            .terminalAscii.Render(.Table(
                [
                    {= id="description", label="description" },
                    {= id="value", label="value", align="right" }
                ],
                [["alpha beta gamma delta", 12]]
            ), {= width=24, wrap=:word });
        `);
        const output = content(rendered);
        expect(output.split("\n").every((line) => line.length <= 24)).toBe(true);
        expect(output).not.toContain("~");
        expect(output).toContain("alpha");
        expect(output).toContain("delta");
        expect(output.split("\n").some((line) => /\s12\s\|$/.test(line))).toBe(true);
        const codes = rendered.entries.get("diagnostics").values.map((entry) => entry.entries.get("code").value);
        expect(codes).toContain("terminal-width-wrapped");
        expect(rendered.entries.get("metadata").entries.get("wrap").value).toBe("word");
    });

    test("Phase 2 paginates deterministically within the configured terminal height", () => {
        const rendered = parseAndEvaluate(`
            .Plugin.Load("terminal-ascii");
            text := .Fragment([.Paragraph("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen")]);
            .terminalAscii.Render(text, {= width=20, wrap=:word, pageHeight=4 });
        `);
        const output = content(rendered).trimEnd();
        const metadata = rendered.entries.get("metadata").entries;
        const pageCount = Number(String(metadata.get("pageCount")));
        expect(pageCount).toBeGreaterThan(1);
        expect(output).toContain(`--- page 1/${pageCount} ---`);
        expect(output).toContain(`--- page ${pageCount}/${pageCount} ---`);
        const pages = output.split(/(?=--- page \d+\/\d+ ---)/);
        expect(pages.every((page) => page.trimEnd().split("\n").length <= 4)).toBe(true);
        const codes = rendered.entries.get("diagnostics").values.map((entry) => entry.entries.get("code").value);
        expect(codes).toContain("terminal-paginated");
    });

    test("Phase 2 renders portable Slide and Slides values without a richer terminal mode", () => {
        const rendered = parseAndEvaluate(`
            .Plugin.Load("terminal-ascii");
            deck := .Slides([
                .Slide(.Paragraph("Exact first result"), "First"),
                .Slide(.Paragraph("Exact second result"), "Second")
            ], "Demo deck");
            .terminalAscii.Render(deck, {= width=32 });
        `);
        expect(content(rendered)).toBe(
            "Deck: Demo deck\n\n"
            + "--- slide 1/2: First ---\n"
            + "Exact first result\n\n"
            + "--- slide 2/2: Second ---\n"
            + "Exact second result\n",
        );
        expect(() => parseAndEvaluate(`
            .Plugin.Load("terminal-ascii");
            .terminalAscii.Render(.Fragment([.Paragraph("x")]), {= wrap=:unknown });
        `)).toThrow("wrap must be");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("terminal-ascii");
            .terminalAscii.Render(.Fragment([.Paragraph("x")]), {= pageHeight=3 });
        `)).toThrow("between 4 and 200");
    });

    test("Phase 3 negotiates explicit Unicode and ANSI color modes without changing strict ASCII", () => {
        const rendered = parseAndEvaluate(`
            .Plugin.Load("terminal-ascii");
            table := .Table(["name", "value"], [["café", "2 × 3"]], {= caption="Métrique" });
            [
                .terminalAscii.Render(table),
                .terminalAscii.Render(table, {= mode=:unicode }),
                .terminalAscii.Render(table, {= mode=:unicodeColor })
            ];
        `);
        const [ascii, unicode, rich] = rendered.values;
        expect(content(ascii)).toContain("Metrique");
        expect(content(ascii)).toContain("cafe");
        expect(content(ascii)).not.toContain("\u001b[");
        expect(content(unicode)).toContain("Métrique");
        expect(content(unicode)).toContain("café");
        expect(content(unicode)).toContain("2 × 3");
        expect(content(unicode)).toContain("┌");
        expect(content(unicode)).toContain("┘");
        expect(content(unicode)).not.toContain("\u001b[");
        expect(content(rich)).toContain("\u001b[36m");
        expect(content(rich).replaceAll(/\u001b\[[0-9;]*m/g, "")).toBe(content(unicode));

        const asciiMetadata = ascii.entries.get("metadata").entries;
        const unicodeMetadata = unicode.entries.get("metadata").entries;
        const richMetadata = rich.entries.get("metadata").entries;
        expect(asciiMetadata.get("schema").value).toBe("rix.terminal-ascii@1");
        expect(asciiMetadata.get("mode").value).toBe("ascii");
        expect(unicodeMetadata.get("schema").value).toBe("rix.terminal-rich@1");
        expect(unicodeMetadata.get("characterSet").value).toBe("Unicode");
        expect(unicodeMetadata.get("color").value).toBe("none");
        expect(richMetadata.get("color").value).toBe("ansi16");
        expect(richMetadata.get("controlSequences").value).toBe(1n);

        expect(() => parseAndEvaluate(`
            .Plugin.Load("terminal-ascii");
            .terminalAscii.Render(.Fragment([.Paragraph("x")]), {= mode=:automatic });
        `)).toThrow("mode must be");
    });
});
