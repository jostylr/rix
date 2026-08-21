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
            .toEqual(["rix.data.relation@1", "rix.data.groups@1", "rix.data.row-source@1"]);
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

    test("joins, groups, and exact aggregates preserve relation semantics", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("data");
            sales := .data.Relation([
                {= id="team", type=:String, nullable=0 },
                {= id="amount", type=:Rational }
            ], [["red", 1/3], ["blue", 2/3], ["red", 5/3], ["green", _]]);
            labels := .data.Relation([
                {= id="team", type=:String, nullable=0 },
                {= id="label", type=:String, nullable=0 }
            ], [["red", "R"], ["blue", "B"], ["gold", "G"]]);
            joined := .data.Join(sales, labels, ["team"], {= type=:full });
            totals := .data.Aggregate(.data.Group(sales, ["team"]), [
                {= id="n", op=:count },
                {= id="known", column="amount", op=:count },
                {= id="total", column="amount", op=:sum },
                {= id="average", column="amount", op=:mean }
            ]);
            [.data.Rows(joined), .data.Rows(totals), .data.Schema(joined)];
        `, options);

        expect(nativeRows(result.values[0])).toEqual([
            { team: "red", amount: "1/3", label: "R" },
            { team: "blue", amount: "2/3", label: "B" },
            { team: "red", amount: "1..2/3", label: "R" },
            { team: "green", amount: null, label: null },
            { team: "gold", amount: null, label: "G" },
        ]);
        expect(nativeRows(result.values[1])).toEqual([
            { team: "red", n: "2", known: "2", total: "2", average: "1" },
            { team: "blue", n: "1", known: "1", total: "2/3", average: "2/3" },
            { team: "green", n: "1", known: "0", total: null, average: null },
        ]);
        expect(result.values[2].values.find((column) => column.entries.get("id").value === "amount").entries.get("nullable")).not.toBeNull();
        expect(parseAndEvaluate('.Plugin.Info("data").Get("provides")', options).values.map(({ value }) => value))
            .toEqual(["rix.data.relation@1", "rix.data.groups@1", "rix.data.row-source@1"]);
    });

    test("calculated columns, explicit missing policy, and bounded row sources compose", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("data");
            source := .data.Relation([
                {= id="x", type=:Integer, nullable=0 },
                {= id="y", type=:Rational }
            ], [[1, 1/2], [2, _], [3, 3/2]]);
            filled := .data.Missing(source, ["y"], :fill, 0);
            calculated := .data.Calculate(filled, {= id="twice", type=:Rational, nullable=0 }, row -> 2*row["y"]);
            rows := .data.RowSource([
                {= id="index", type=:Integer, nullable=0 },
                {= id="square", type=:Integer, nullable=0 }
            ], index -> [index, index^2], {= maxRows=10 });
            [.data.Rows(calculated), .data.Rows(.data.Collect(rows, 3)), .data.Rows(.data.Missing(source, ["y"], :drop))];
        `, options);

        expect(nativeRows(result.values[0])).toEqual([
            { x: "1", y: "1/2", twice: "1" },
            { x: "2", y: "0", twice: "0" },
            { x: "3", y: "1..1/2", twice: "3" },
        ]);
        expect(nativeRows(result.values[1])).toEqual([
            { index: "1", square: "1" },
            { index: "2", square: "4" },
            { index: "3", square: "9" },
        ]);
        expect(nativeRows(result.values[2])).toHaveLength(2);
        expect(() => parseAndEvaluate('.data.Missing(source, ["y"], :error)', options)).toThrow("found 1 row");
    });

    test("empty global groups and outer-join key schemas remain valid", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("data");
            empty := .data.Relation([{= id="value", type=:Rational }], []);
            global := .data.Aggregate(.data.Group(empty, []), [
                {= id="count", op=:count },
                {= id="total", column="value", op=:sum }
            ]);
            integers := .data.Relation([{= id="key", type=:Integer, nullable=0 }], [[1]]);
            rationals := .data.Relation([{= id="key", type=:Rational, nullable=0 }], [[3/2]]);
            combined := .data.Join(integers, rationals, ["key"], {= type=:full });
            [.data.Rows(global), .data.Rows(combined), .data.Schema(combined)];
        `, options);
        expect(nativeRows(result.values[0])).toEqual([{ count: "0", total: null }]);
        expect(nativeRows(result.values[1])).toEqual([{ key: "1" }, { key: "1..1/2" }]);
        expect(result.values[2].values[0].entries.get("type").value).toBe("Rational");
        expect(() => parseAndEvaluate(`
            .data.Missing(.data.Relation(["a","b"],[[_ ,_]]),["a","b"],:fill,{= a=0 })
        `, options)).toThrow("omit selected column 'b'");
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
