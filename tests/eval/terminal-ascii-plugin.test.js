import { describe, expect, test } from "bun:test";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

const content = (value) => value.entries.get("content").value;

describe("terminalAscii Phase 1 renderer", () => {
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
});
