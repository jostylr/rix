import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    formatValue,
    parseAndEvaluate,
} from "../../src/index.js";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

function nativeRows(value) {
    return value.values.map((row) => Object.fromEntries(
        [...row.entries].map(([key, cell]) => [key, cell === null ? null : formatValue(cell)]),
    ));
}

describe("data and csv plugins", () => {
    test("typed relations project, filter, and stably sort exact rows", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("data");
            source := .data.Relation([
                {= id="name", label="Name", type=:String, nullable=0 },
                {= id="score", label="Score", type=:Rational },
                {= id="group", type=:String }
            ], [
                ["beta", 1/2, "b"],
                ["missing", _, "z"],
                ["alpha", 3/2, "a"],
                ["also alpha", 3/2, "a"]
            ]);
            known := .data.Filter(source, row -> row["score"] != _);
            ordered := .data.Sort(known, ["score"], {= descending=1 });
            projected := .data.Project(ordered, ["name", "score"]);
            [.data.Rows(projected), .data.Schema(projected), .data.TableView(projected, {= caption="Exact scores" })];
        `, options);

        expect(nativeRows(result.values[0])).toEqual([
            { name: "alpha", score: "1..1/2" },
            { name: "also alpha", score: "1..1/2" },
            { name: "beta", score: "1/2" },
        ]);
        expect(result.values[1].values.map((column) => column.entries.get("type").value)).toEqual(["String", "Rational"]);
        expect(result.values[2]).toMatchObject({ type: "output", kind: "table", caption: "Exact scores" });
        expect(result.values[2].rows).toHaveLength(3);
        expect(parseAndEvaluate('.Plugin.Info("data").Get("provides")', options).values.map(({ value }) => value))
            .toEqual(["rix.data.relation@1"]);
    });

    test("relation schema and row diagnostics reject malformed data", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("data")', options);
        expect(() => parseAndEvaluate('.data.Relation([{= id="x", type=:Integer }], [[1/2]])', options))
            .toThrow("row 1 column 'x' must be Integer");
        expect(() => parseAndEvaluate('.data.Relation([{= id="x" }, {= id="X" }], [[1, 2]])', options))
            .toThrow("duplicate column 'X'");
        expect(() => parseAndEvaluate('.data.Relation([{= id="x", nullable=0 }], [[_]])', options))
            .toThrow("column 'x' may not be missing");
        expect(() => parseAndEvaluate('.data.Relation(["x"], [{= y=1 }])', options))
            .toThrow("unknown column 'y'");
    });

    test("CSV and TSV match byte fixtures and retain canonical rational text", async () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("csv");
            table := .Table(["label", "value", "note"], [
                ["comma,here", 3/2, """quote "yes""""],
                ["plain", _, """line
break"""]
            ]);
            [
                .csv.Render(table).Get("content"),
                .Render(table, "tsv").Get("content"),
                .csv.Render(table, {= newline=:crlf, header=0, missing="NA", finalNewline=0 }).Get("content")
            ];
        `, options);
        const fixtureRoot = path.resolve(import.meta.dir, "../fixtures/renderers");
        const csvFixture = await Bun.file(path.join(fixtureRoot, "table.csv")).text();
        const tsvFixture = await Bun.file(path.join(fixtureRoot, "table.tsv")).text();

        expect(new TextEncoder().encode(result.values[0].value)).toEqual(new TextEncoder().encode(csvFixture));
        expect(new TextEncoder().encode(result.values[1].value)).toEqual(new TextEncoder().encode(tsvFixture));
        expect(result.values[2].value).toBe('"comma,here",3/2,"quote ""yes"""\r\nplain,NA,"line\nbreak"');
        expect(parseAndEvaluate('.Renderer.Info("tsv").Get("target")', options).value).toBe("csv");
    });

    test("CSV refuses nested values instead of flattening them", () => {
        const options = runtime();
        expect(() => parseAndEvaluate(`
            .Plugin.Load("csv");
            .csv.Render(.Table(["nested"], [[[1, 2]]]));
        `, options)).toThrow("csv cells must be missing, strings, or exact numeric scalars");
    });
});
