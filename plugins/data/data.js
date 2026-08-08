import { Integer, Rational } from "@ratmath/core";

const stringValue = (value) => ({ type: "string", value: String(value) });
const sequenceValue = (values) => ({ type: "sequence", values });

function mapValue(entries) {
    return { type: "map", entries: new Map(entries), _ext: new Map([["immutable", new Integer(1n)]]) };
}

function entries(value, label) {
    if (value?.type === "map" && value.entries instanceof Map) return value.entries;
    if (value instanceof Map) return value;
    throw new Error(`${label} must be a map`);
}

function field(source, name, fallback = null) {
    const values = source instanceof Map ? source : source?.entries;
    if (!(values instanceof Map)) return fallback;
    if (values.has(name)) return values.get(name);
    const wanted = String(name).toLowerCase();
    for (const [key, value] of values) {
        if (String(key).toLowerCase() === wanted) return value;
    }
    return fallback;
}

function sequence(value, label) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.values)) return value.values;
    throw new Error(`${label} must be a sequence`);
}

function text(value, label) {
    if (value?.type === "string") return value.value;
    if (typeof value === "string") return value;
    throw new Error(`${label} must be a string or colon-string`);
}

function option(options, name, fallback = null) {
    return options === null || options === undefined ? fallback : field(entries(options, "data options"), name, fallback);
}

const TYPE_NAMES = new Map([
    ["any", "Any"],
    ["integer", "Integer"],
    ["rational", "Rational"],
    ["number", "Number"],
    ["string", "String"],
]);

function columnType(value, index) {
    if (value === null || value === undefined) return "Any";
    const source = text(value, `data column ${index + 1} type`).replace(/^:/, "").toLowerCase();
    const result = TYPE_NAMES.get(source);
    if (!result) throw new Error(`data column ${index + 1} type must be Any, Integer, Rational, Number, or String`);
    return result;
}

function normalizeColumns(value) {
    const seen = new Set();
    return Object.freeze(sequence(value, "data schema").map((source, index) => {
        let id;
        let label;
        let type;
        let nullable = true;
        if (source?.type === "string" || typeof source === "string") {
            id = text(source, `data column ${index + 1}`);
            label = id;
            type = "Any";
        } else {
            const spec = entries(source, `data column ${index + 1}`);
            id = text(field(spec, "id", field(spec, "name")), `data column ${index + 1} id`);
            label = field(spec, "label") === null ? id : text(field(spec, "label"), `data column ${index + 1} label`);
            type = columnType(field(spec, "type"), index);
            nullable = truthy(field(spec, "nullable", new Integer(1n)));
        }
        if (!id.trim()) throw new Error(`data column ${index + 1} id must not be empty`);
        const canonical = id.toLowerCase();
        if (seen.has(canonical)) throw new Error(`data schema contains duplicate column '${id}'`);
        seen.add(canonical);
        return Object.freeze({ id, label, type, nullable });
    }));
}

function valueMatchesType(value, type) {
    if (value === null) return true;
    if (type === "Any") return true;
    if (type === "Integer") return value instanceof Integer;
    if (type === "Rational") return value instanceof Integer || value instanceof Rational;
    if (type === "Number") return value instanceof Integer || value instanceof Rational;
    if (type === "String") return value?.type === "string" || typeof value === "string";
    return false;
}

function mapRow(source, columns, rowIndex) {
    const values = entries(source, `data row ${rowIndex + 1}`);
    const known = new Set(columns.map(({ id }) => id.toLowerCase()));
    for (const key of values.keys()) {
        if (!known.has(String(key).toLowerCase())) {
            throw new Error(`data row ${rowIndex + 1} contains unknown column '${key}'`);
        }
    }
    return columns.map(({ id }) => field(values, id, null));
}

function normalizeRows(value, columns) {
    return Object.freeze(sequence(value, "data rows").map((source, rowIndex) => {
        const row = source?.type === "map" || source instanceof Map
            ? mapRow(source, columns, rowIndex)
            : sequence(source, `data row ${rowIndex + 1}`);
        if (row.length !== columns.length) {
            throw new Error(`data row ${rowIndex + 1} has ${row.length} cells; expected ${columns.length}`);
        }
        row.forEach((cell, columnIndex) => {
            const column = columns[columnIndex];
            if (cell === null && !column.nullable) {
                throw new Error(`data row ${rowIndex + 1} column '${column.id}' may not be missing`);
            }
            if (!valueMatchesType(cell, column.type)) {
                throw new Error(`data row ${rowIndex + 1} column '${column.id}' must be ${column.type}`);
            }
        });
        return Object.freeze([...row]);
    }));
}

function relationExtensions() {
    return new Map([
        ["_type", stringValue("data_relation")],
        ["immutable", new Integer(1n)],
    ]);
}

function makeRelation(columns, rows, operations = []) {
    return Object.freeze({
        type: "data_relation",
        schema: "rix.data.relation@1",
        columns,
        rows,
        provenance: Object.freeze({ operations: Object.freeze([...operations]) }),
        _ext: relationExtensions(),
    });
}

function requireRelation(value, label = "data operation") {
    if (value?.type !== "data_relation" || value.schema !== "rix.data.relation@1"
        || !Array.isArray(value.columns) || !Array.isArray(value.rows)) {
        throw new Error(`${label} requires a data Relation`);
    }
    return value;
}

export function createRelation(args) {
    if (args.length !== 2) throw new Error("data.Relation expects schema and rows");
    const columns = normalizeColumns(args[0]);
    if (!columns.length) throw new Error("data.Relation schema must contain at least one column");
    const rows = normalizeRows(args[1], columns);
    return makeRelation(columns, rows, ["relation"]);
}

function selectedColumnIds(value, relation, label) {
    const requested = sequence(value, label).map((entry, index) => text(entry, `${label} entry ${index + 1}`));
    const byId = new Map(relation.columns.map((column, index) => [column.id.toLowerCase(), index]));
    const selected = requested.map((id) => {
        const index = byId.get(id.toLowerCase());
        if (index === undefined) throw new Error(`${label} contains unknown column '${id}'`);
        return index;
    });
    if (new Set(selected).size !== selected.length) throw new Error(`${label} may not repeat a column`);
    return selected;
}

export function projectRelation(args) {
    if (args.length !== 2) throw new Error("data.Project expects a Relation and column sequence");
    const relation = requireRelation(args[0], "data.Project");
    const selected = selectedColumnIds(args[1], relation, "data.Project columns");
    if (!selected.length) throw new Error("data.Project must retain at least one column");
    return makeRelation(
        Object.freeze(selected.map((index) => relation.columns[index])),
        Object.freeze(relation.rows.map((row) => Object.freeze(selected.map((index) => row[index])))),
        [...relation.provenance.operations, "project"],
    );
}

function rowMap(relation, row) {
    return mapValue(relation.columns.map((column, index) => [column.id, row[index]]));
}

function truthy(value) {
    if (value === null || value === undefined || value === false) return false;
    if (value instanceof Integer) return value.value !== 0n;
    if (value instanceof Rational) return value.numerator !== 0n;
    return true;
}

export function filterRelation(args, runtime = {}) {
    if (args.length !== 2) throw new Error("data.Filter expects a Relation and predicate");
    const relation = requireRelation(args[0], "data.Filter");
    if (typeof runtime.invoke !== "function") throw new Error("data.Filter requires an evaluator callback");
    const rows = relation.rows.filter((row, index) => truthy(runtime.invoke(
        args[1],
        [rowMap(relation, row), new Integer(BigInt(index + 1)), relation],
        runtime.context,
        runtime.evaluate,
    )));
    return makeRelation(Object.freeze([...relation.columns]), Object.freeze([...rows]), [...relation.provenance.operations, "filter"]);
}

function exactParts(value) {
    if (value instanceof Integer) return [value.value, 1n];
    if (value instanceof Rational) return [value.numerator, value.denominator];
    return null;
}

function compareValues(left, right, column) {
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
    const leftExact = exactParts(left);
    const rightExact = exactParts(right);
    if (leftExact && rightExact) {
        const difference = leftExact[0] * rightExact[1] - rightExact[0] * leftExact[1];
        return difference < 0n ? -1 : difference > 0n ? 1 : 0;
    }
    const leftText = left?.type === "string" ? left.value : typeof left === "string" ? left : null;
    const rightText = right?.type === "string" ? right.value : typeof right === "string" ? right : null;
    if (leftText !== null && rightText !== null) return leftText === rightText ? 0 : leftText < rightText ? -1 : 1;
    throw new Error(`data.Sort cannot compare values in column '${column.id}'`);
}

export function sortRelation(args) {
    if (args.length < 2 || args.length > 3) throw new Error("data.Sort expects a Relation, columns, and optional options");
    const relation = requireRelation(args[0], "data.Sort");
    const selected = selectedColumnIds(args[1], relation, "data.Sort columns");
    if (!selected.length) throw new Error("data.Sort requires at least one column");
    const descending = truthy(option(args[2], "descending", null));
    const missingFirst = truthy(option(args[2], "missingFirst", null));
    const decorated = relation.rows.map((row, index) => ({ row, index }));
    decorated.sort((left, right) => {
        for (const columnIndex of selected) {
            const leftValue = left.row[columnIndex];
            const rightValue = right.row[columnIndex];
            if (leftValue === null || rightValue === null) {
                if (leftValue !== rightValue) return leftValue === null ? (missingFirst ? -1 : 1) : (missingFirst ? 1 : -1);
                continue;
            }
            const compared = compareValues(leftValue, rightValue, relation.columns[columnIndex]);
            if (compared) return descending ? -compared : compared;
        }
        return left.index - right.index;
    });
    return makeRelation(
        Object.freeze([...relation.columns]),
        Object.freeze(decorated.map(({ row }) => row)),
        [...relation.provenance.operations, "sort"],
    );
}

export function relationTableView(args) {
    if (args.length < 1 || args.length > 2) throw new Error("data.TableView expects a Relation and optional options");
    const relation = requireRelation(args[0], "data.TableView");
    const captionValue = option(args[1], "caption", null);
    const caption = captionValue === null ? null : text(captionValue, "data.TableView caption");
    return Object.freeze({
        type: "output",
        kind: "table",
        columns: Object.freeze(relation.columns.map(({ id, label }) => Object.freeze({ id, label, align: null, format: null }))),
        rows: Object.freeze(relation.rows.map((row) => Object.freeze([...row]))),
        caption,
        options: new Map(),
    });
}

export function relationSchema(args) {
    if (args.length !== 1) throw new Error("data.Schema expects a Relation");
    const relation = requireRelation(args[0], "data.Schema");
    return sequenceValue(relation.columns.map((column) => mapValue([
        ["id", stringValue(column.id)],
        ["label", stringValue(column.label)],
        ["type", stringValue(column.type)],
        ["nullable", column.nullable ? new Integer(1n) : null],
    ])));
}

export function relationRows(args) {
    if (args.length !== 1) throw new Error("data.Rows expects a Relation");
    const relation = requireRelation(args[0], "data.Rows");
    return sequenceValue(relation.rows.map((row) => rowMap(relation, row)));
}
