import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    formatValue,
    parseAndEvaluate,
} from "../../src/index.js";
import { parseCsvRecords } from "../../plugins/render-csv/csv-import.js";

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
    test("CSV import record parsing handles CRLF, quotes, embedded newlines, and comments", () => {
        const parsed = parseCsvRecords(
            '# source: fixture\r\nname,note\r\n"comma,here","line\nbreak"\r\nquote,"say ""yes"""\r\n',
        );
        expect(parsed.comments).toEqual([{ text: "source: fixture", line: 1 }]);
        expect(parsed.records.map(({ fields, line }) => ({ fields: [...fields], line }))).toEqual([
            { fields: ["name", "note"], line: 2 },
            { fields: ["comma,here", "line\nbreak"], line: 3 },
            { fields: ["quote", 'say "yes"'], line: 5 },
        ]);
        expect(() => parseCsvRecords('name\n"unfinished')).toThrow("unterminated quoted field");
    });

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
            .toEqual(["rix.data.relation@1", "rix.data.groups@1", "rix.data.contingency@1", "rix.data.row-source@1"]);
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
            .toEqual(["rix.data.relation@1", "rix.data.groups@1", "rix.data.contingency@1", "rix.data.row-source@1"]);
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

    test("JSONL pulls exact tagged records lazily and renders deterministically", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("data");
            schema := [
                {= id="n", type=:Integer, nullable=0 },
                {= id="ratio", type=:Rational, nullable=0 },
                {= id="band", type=:Interval, nullable=0 }
            ];
            lines := """{"n":{"$integer":"1"},"ratio":{"$rational":["1","3"]},"band":{"$interval":[{"$integer":"0"},{"$rational":["1","2"]}]}}

{"n":{"$integer":"2"},"ratio":{"$rational":["2","3"]},"band":{"$interval":[{"$rational":["1","2"]},{"$integer":"1"}]}}
{"n":
""";
            source := .data.ParseJSONL(schema, lines, {= maxRows=3 });
            firstTwo := .data.Collect(source, 2);
            [
                .data.Rows(firstTwo),
                .data.RenderJSONL(firstTwo, {= finalNewline=0 }),
                .data.RenderJSONL(source, {= limit=1, finalNewline=0 })
            ];
        `, options);

        expect(nativeRows(result.values[0])).toEqual([
            { n: "1", ratio: "1/3", band: "0:1/2" },
            { n: "2", ratio: "2/3", band: "1/2:1" },
        ]);
        expect(result.values[1].value).toBe([
            '{"n":{"$integer":"1"},"ratio":{"$rational":["1","3"]},"band":{"$interval":[{"$rational":["0","1"]},{"$rational":["1","2"]}]}}',
            '{"n":{"$integer":"2"},"ratio":{"$rational":["2","3"]},"band":{"$interval":[{"$rational":["1","2"]},{"$rational":["1","1"]}]}}',
        ].join("\n"));
        expect(result.values[2].value).toBe('{"n":{"$integer":"1"},"ratio":{"$rational":["1","3"]},"band":{"$interval":[{"$rational":["0","1"]},{"$rational":["1","2"]}]}}');
        expect(() => parseAndEvaluate('.data.Collect(source, 3)', options)).toThrow("physical line 4");
    });

    test("JSONL reports exact-tag, blank-line, and schema diagnostics", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("data"); schema := [{= id="n",type=:Integer,nullable=0 }]', options);
        expect(() => parseAndEvaluate('.data.Collect(.data.ParseJSONL(schema, """{"n":1.5}"""),1)', options))
            .toThrow("exact $integer");
        expect(() => parseAndEvaluate('.data.ParseJSONL(schema, """{"n":1}\n\n{"n":2}""", {= blankLines=:error })', options))
            .toThrow("blank physical line at line 2");
        expect(() => parseAndEvaluate('.data.Collect(.data.ParseJSONL(schema, """{"other":1}"""),1)', options))
            .toThrow("unknown column 'other'");
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
        expect(parseAndEvaluate('.Plugin.Info("csv").Get("provides")', options).values.map(({ value }) => value)).toEqual([
            "rix.renderer.csv@1",
            "rix.renderer.csv@2",
            "rix.csv.import@1",
            "rix.csv.sidecar@1",
        ]);
    });

    test("CSV rejects nested values with a path unless tagged JSON flattening is explicit", () => {
        const options = runtime();
        expect(() => parseAndEvaluate(`
            .Plugin.Load("csv");
            .csv.Render(.Table(["nested"], [[[1, 2]]]));
        `, options)).toThrow("csv nested cell at row[1].column1 requires flatten=:json");

        const result = parseAndEvaluate(`
            flattened := .csv.Render(
                .Table(["nested"], [[{= b=1/2, a=[2, 3] }]]),
                {= flatten=:json, metadata={= source="demo" }, comments=["lossless tags"] }
            );
            [flattened.Get("content"), flattened.Get("diagnostics"), flattened.Get("metadata")];
        `, options);
        expect(result.values[0].value).toContain('# source: demo\n# lossless tags\nnested\n');
        expect(result.values[0].value).toContain('"$rational"');
        expect(result.values[1].values[0].entries.get("code").value).toBe("csv-flattened-cell");
        expect(result.values[1].values[0].entries.get("path").value).toBe("row[1].column1");
        expect(result.values[2].entries.get("flattening").entries.get("count").value).toBe(1n);
    });

    test("typed CSV import uses explicit locale policy and preserves sidecars", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("csv");
            .Plugin.Load("data");
            schema := [
                {= id="name", type=:String, nullable=0 },
                {= id="amount", type=:Rational },
                {= id="band", type=:Interval }
            ];
            input := """# source: lab
name;amount;band
a;1,5;1,4:1,6
b;;2:2
""";
            parsed := .csv.Parse(input, schema, {=
                delimiter=:semicolon, decimal=:locale, locale="de-DE"
            });
            [.data.Rows(parsed), .csv.Sidecar(parsed)];
        `, options);

        expect(nativeRows(result.values[0])).toEqual([
            { name: "a", amount: "1..1/2", band: "1..2/5:1..3/5" },
            { name: "b", amount: null, band: "2:2" },
        ]);
        const sidecar = result.values[1].entries;
        expect(sidecar.get("metadata").entries.get("source").value).toBe("lab");
        expect(sidecar.get("comments").values[0].entries.get("line").value).toBe(1n);
        expect(sidecar.get("dialect").entries.get("decimalMark").value).toBe(",");
        expect(sidecar.get("rowCount").value).toBe(2n);
    });

    test("CSV row streams compose with data collection and both rendering entry points", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("csv");
            .Plugin.Load("data");
            schema := [
                {= id="x", type=:Integer, nullable=0 },
                {= id="y", type=:Rational }
            ];
            stream := .csv.ParseStream("""x,y
1,1/2
2,3/2
""", schema);
            [
                .data.Rows(.csv.Collect(stream, 1)),
                .csv.Render(stream).Get("content"),
                .Render(stream, :csv, {= limit=1 }).Get("content"),
                .csv.Sidecar(stream).Get("rowCount")
            ];
        `, options);

        expect(nativeRows(result.values[0])).toEqual([{ x: "1", y: "1/2" }]);
        expect(result.values[1].value).toBe("x,y\n1,1/2\n2,3/2\n");
        expect(result.values[2].value).toBe("x,y\n1,1/2\n");
        expect(result.values[3].value).toBe(2n);
    });

    test("locale decimal export remains exact and rejects ambiguous or repeating forms", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("csv")', options);
        const content = parseAndEvaluate(`
            .csv.Render(.Table(["value"], [[3/2], [10005]]), {=
                delimiter=:semicolon, decimal=:locale, locale="de-DE", grouping=1
            }).Get("content")
        `, options);
        expect(content.value).toBe("value\n1,5\n10.005\n");
        expect(() => parseAndEvaluate(`
            .csv.Render(.Table(["value"], [[1/3]]), {= decimal=:locale })
        `, options)).toThrow("nonterminating decimal expansion");
        expect(() => parseAndEvaluate(`
            .csv.Parse("value\\n1,5\\n", [{= id="value", type=:Rational }], {=
                decimal=:locale, locale="de-DE"
            })
        `, options)).toThrow("delimiter must differ from the locale decimal mark");
    });
});
