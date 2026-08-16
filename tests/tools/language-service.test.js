import { describe, expect, test } from "bun:test";
import { RixParseError, parse } from "../../src/parser/index.js";
import {
    analyzeRixDocument,
    codeActionsForRange,
    completionAt,
    definitionsAt,
    formatRix,
    hoverAt,
    offsetToPosition,
    positionToOffset,
    referencesAt,
    renameAt,
} from "../../src/tools/language-service/index.js";

const SOURCE = `settings := {= bounds={: -3, 3 }, samples=[1/4, 1/2, 3/4], exact=1 };
total := settings[:samples] |>? (x) -> x > 1/3 |>> (x) -> x^2 + 1;
total ##@ > 0;`;

describe("portable RiX language service", () => {
    test("uses UTF-16 positions and clamps line offsets", () => {
        const source = "😀x\nvalue";
        expect(offsetToPosition(source, 2)).toEqual({ line: 0, character: 2 });
        expect(positionToOffset(source, { line: 0, character: 2 })).toBe(2);
        expect(positionToOffset(source, { line: 20, character: 20 })).toBe(source.length);
    });

    test("parser failures expose stable structured location data", () => {
        let error;
        try { parse("value := ("); } catch (caught) { error = caught; }
        expect(error).toBeInstanceOf(RixParseError);
        expect(error).toMatchObject({ code: "RXP1000", offset: 10, line: 1, column: 11 });

        const analysis = analyzeRixDocument("value := (", { uri: "file:///broken.rix", version: 4 });
        expect(analysis.diagnostics[0]).toMatchObject({
            uri: "file:///broken.rix", version: 4, code: "RXP1000", source: "rix-parser",
        });
    });

    test("normalizes lint diagnostics and safe code actions", () => {
        const source = "x=1; {; x; };";
        const analysis = analyzeRixDocument(source, { uri: "file:///capture.rix", version: 2 });
        const diagnostic = analysis.diagnostics.find(({ code }) => code === "RX1001");
        expect(diagnostic).toBeDefined();
        expect(source.slice(diagnostic.range.start, diagnostic.range.end)).toBe("x");
        const actions = codeActionsForRange(analysis, diagnostic.range);
        expect(actions[0]).toMatchObject({ kind: "quickfix" });
        expect(actions[0].edits[0]).toMatchObject({ text: "@" });
    });

    test("warns when active-base and decimal components are mixed", () => {
        const division = analyzeRixDocument("<* \"b\"; #101/11;");
        expect(division.diagnostics.find(({ code }) => code === "RX1707")?.message)
            .toContain("mixes an active-base");

        const redundant = analyzeRixDocument("<* \"b\"; #101..#11/#1100;");
        expect(redundant.diagnostics.find(({ code }) => code === "RX1707")?.message)
            .toContain("repeated '#' markers");

        expect(analyzeRixDocument("<* \"b\"; #101..11/1100; #101/#11;").diagnostics
            .filter(({ code }) => code === "RX1707")).toHaveLength(0);
    });

    test("indexes symbols, definitions, references, rename, hover, and completion", () => {
        const analysis = analyzeRixDocument(SOURCE, { uri: "file:///sample.rix", version: 1 });
        expect(analysis.symbols.find(({ name }) => name === "settings")).toMatchObject({ kind: "variable" });
        const useOffset = SOURCE.indexOf("settings[:samples]") + 2;
        expect(definitionsAt(analysis, useOffset)[0].range).toEqual({ start: 0, end: 8 });
        expect(referencesAt(analysis, useOffset)).toHaveLength(2);
        expect(renameAt(analysis, useOffset, "config")).toHaveLength(2);
        expect(hoverAt(analysis, useOffset).markdown).toContain("settings");
        expect(completionAt(analysis, SOURCE.indexOf("settings") + 3).map(({ label }) => label)).toContain("settings");
        expect(completionAt(analysis, SOURCE.length).map(({ label }) => label)).toContain("total");
    });

    test("indexes lexical plugin selections as local function declarations", () => {
        const source = '.Plugin.Load("numerics"); .numerics[:Exp, :Log]; Exp(1);';
        const analysis = analyzeRixDocument(source);
        expect(analysis.symbols.find(({ name }) => name === "EXP")).toMatchObject({
            kind: "function",
            detail: "lexically imported plugin function",
        });
        const useOffset = source.lastIndexOf("Exp") + 1;
        expect(definitionsAt(analysis, useOffset)).toHaveLength(1);
    });

    test("discovers inline checks with stable source ranges", () => {
        const analysis = analyzeRixDocument(SOURCE);
        expect(analysis.checks).toHaveLength(1);
        expect(analysis.checks[0]).toMatchObject({ checkKind: "predicate", source: "total ##@ > 0;" });
        expect(analysis.checks[0].id).toBe("predicate:3:6");

        const tapped = analyzeRixDocument("value:=1; value ##! Dump();");
        expect(tapped.checks).toEqual([]);
        expect(tapped.diagnosticTaps[0]).toMatchObject({ kind: "diagnostic", source: "value:=1; value ##! Dump();" });
    });
});

describe("RiX formatter profiles", () => {
    const readable = `settings := {=
    bounds = {: -3, 3 },
    samples = [1/4, 1/2, 3/4],
    exact = 1
};
total := settings[:samples]
    |>? (x) -> x > 1/3
    |>> (x) -> x^2 + 1;
total ##@ > 0;
`;

    const compact = `settings := {= bounds = {: -3, 3 }, samples = [1/4, 1/2, 3/4], exact = 1 };
total := settings[:samples]
    |>? (x) -> x > 1/3
    |>> (x) -> x^2 + 1;
total ##@ > 0;
`;

    test("Candidate B is the readable default and is idempotent", () => {
        expect(formatRix(SOURCE)).toBe(readable);
        expect(formatRix(readable)).toBe(readable);
    });

    test("Candidate A is the explicit compact profile", () => {
        expect(formatRix(SOURCE, { profile: "compact" })).toBe(compact);
    });

    test("comments and postfix checks stay on their logical lines", () => {
        const formatted = formatRix("## Keep this comment\nvalue:=1 ##@ > 0;");
        expect(formatted).toBe("## Keep this comment\nvalue := 1 ##@ > 0;\n");
    });
});
