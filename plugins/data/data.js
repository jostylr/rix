import { Integer, Rational, RationalInterval } from "@ratmath/core";

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
    ["interval", "Interval"],
    ["rationalinterval", "Interval"],
    ["string", "String"],
]);

function columnType(value, index) {
    if (value === null || value === undefined) return "Any";
    const source = text(value, `data column ${index + 1} type`).replace(/^:/, "").toLowerCase();
    const result = TYPE_NAMES.get(source);
    if (!result) throw new Error(`data column ${index + 1} type must be Any, Integer, Rational, Number, Interval, or String`);
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
    if (type === "Interval") return value instanceof Integer || value instanceof Rational || value instanceof RationalInterval;
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

export function renameRelation(args) {
    if (args.length !== 2) throw new Error("data.Rename expects a Relation and rename map");
    const relation = requireRelation(args[0], "data.Rename");
    const requested = entries(args[1], "data.Rename map");
    if (!requested.size) return makeRelation(Object.freeze([...relation.columns]), Object.freeze([...relation.rows]), [...relation.provenance.operations, "rename"]);
    const renames = new Map();
    for (const [sourceValue, targetValue] of requested) {
        const source = String(sourceValue);
        const target = text(targetValue, `data.Rename target for '${source}'`);
        const index = columnIndex(relation, source, "data.Rename map");
        if (!target.trim()) throw new Error(`data.Rename target for '${source}' must not be empty`);
        if (renames.has(index)) throw new Error(`data.Rename repeats source column '${source}'`);
        renames.set(index, target);
    }
    const ids = relation.columns.map((column, index) => (renames.has(index) ? renames.get(index) : column.id));
    if (new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) throw new Error("data.Rename would create duplicate column ids");
    const columns = relation.columns.map((column, index) => {
        if (!renames.has(index)) return column;
        const id = renames.get(index);
        return Object.freeze({ ...column, id, label: column.label === column.id ? id : column.label });
    });
    return makeRelation(Object.freeze(columns), Object.freeze([...relation.rows]), [...relation.provenance.operations, "rename"]);
}

export function distinctRelation(args) {
    if (args.length < 1 || args.length > 2) throw new Error("data.Distinct expects a Relation and optional columns");
    const relation = requireRelation(args[0], "data.Distinct");
    const selected = args.length === 1
        ? relation.columns.map((_, index) => index)
        : selectedColumnIds(args[1], relation, "data.Distinct columns");
    if (!selected.length) throw new Error("data.Distinct requires at least one column");
    const seen = new Set();
    const rows = relation.rows.filter((row) => {
        const signature = keySignature(row, selected);
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
    });
    return makeRelation(Object.freeze([...relation.columns]), Object.freeze(rows), [...relation.provenance.operations, "distinct"]);
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

function rationalCompare(left, right) {
    const difference = left.numerator * right.denominator - right.numerator * left.denominator;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function measurementParts(value) {
    if (value instanceof RationalInterval) return [value.low, value.high];
    const exact = exactParts(value);
    if (!exact) return null;
    const point = new Rational(exact[0], exact[1]);
    return [point, point];
}

function compareValues(left, right, column, operation = "Sort") {
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
    const leftExact = exactParts(left);
    const rightExact = exactParts(right);
    if (leftExact && rightExact) {
        const difference = leftExact[0] * rightExact[1] - rightExact[0] * leftExact[1];
        return difference < 0n ? -1 : difference > 0n ? 1 : 0;
    }
    const leftMeasurement = measurementParts(left);
    const rightMeasurement = measurementParts(right);
    if (leftMeasurement && rightMeasurement) {
        const low = rationalCompare(leftMeasurement[0], rightMeasurement[0]);
        return low || rationalCompare(leftMeasurement[1], rightMeasurement[1]);
    }
    const leftText = left?.type === "string" ? left.value : typeof left === "string" ? left : null;
    const rightText = right?.type === "string" ? right.value : typeof right === "string" ? right : null;
    if (leftText !== null && rightText !== null) return leftText === rightText ? 0 : leftText < rightText ? -1 : 1;
    throw new Error(`data.${operation} cannot compare values in column '${column.id}'`);
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

function operationName(value, label, fallback = null) {
    if (value === null || value === undefined) return fallback;
    return text(value, label).replace(/^:/, "").toLowerCase();
}

function columnIndex(relation, value, label) {
    const id = text(value, label);
    const index = relation.columns.findIndex((column) => column.id.toLowerCase() === id.toLowerCase());
    if (index < 0) throw new Error(`${label} contains unknown column '${id}'`);
    return index;
}

function joinColumns(value, left, right) {
    if (value?.type === "map" || value instanceof Map) {
        const pairs = [...entries(value, "data.Join keys")].map(([leftId, rightId]) => [
            columnIndex(left, String(leftId), "data.Join left keys"),
            columnIndex(right, rightId, "data.Join right keys"),
        ]);
        if (!pairs.length) throw new Error("data.Join requires at least one key column");
        return pairs;
    }
    const keys = sequence(value, "data.Join keys");
    if (!keys.length) throw new Error("data.Join requires at least one key column");
    return keys.map((key, index) => [
        columnIndex(left, key, `data.Join key ${index + 1}`),
        columnIndex(right, key, `data.Join key ${index + 1}`),
    ]);
}

function joinedKeyType(leftColumn, rightColumn) {
    if (leftColumn.type === rightColumn.type) return leftColumn.type;
    if (leftColumn.type === "Any" || rightColumn.type === "Any") return "Any";
    const numeric = new Set(["Integer", "Rational", "Number", "Interval"]);
    if (numeric.has(leftColumn.type) && numeric.has(rightColumn.type)) {
        if (leftColumn.type === "Interval" || rightColumn.type === "Interval") return "Interval";
        if (leftColumn.type === "Number" || rightColumn.type === "Number") return "Number";
        return "Rational";
    }
    throw new Error(`data.Join key columns '${leftColumn.id}' and '${rightColumn.id}' have incompatible types`);
}

function joinKeyMatches(leftRow, rightRow, pairs, left, right, missingMatches) {
    return pairs.every(([leftIndex, rightIndex]) => {
        const leftValue = leftRow[leftIndex];
        const rightValue = rightRow[rightIndex];
        if (leftValue === null || rightValue === null) return missingMatches && leftValue === rightValue;
        return compareValues(leftValue, rightValue, left.columns[leftIndex], "Join") === 0;
    });
}

export function joinRelations(args) {
    if (args.length < 3 || args.length > 4) throw new Error("data.Join expects two Relations, keys, and optional options");
    const left = requireRelation(args[0], "data.Join left input");
    const right = requireRelation(args[1], "data.Join right input");
    const pairs = joinColumns(args[2], left, right);
    if (new Set(pairs.map(([index]) => index)).size !== pairs.length
        || new Set(pairs.map(([, index]) => index)).size !== pairs.length) {
        throw new Error("data.Join key columns may not repeat on either side");
    }
    const pairTypes = new Map(pairs.map(([leftIndex, rightIndex]) => [
        leftIndex,
        {
            type: joinedKeyType(left.columns[leftIndex], right.columns[rightIndex]),
            nullable: left.columns[leftIndex].nullable || right.columns[rightIndex].nullable,
        },
    ]));
    const kind = operationName(option(args[3], "type", stringValue("inner")), "data.Join type");
    if (!["inner", "left", "right", "full"].includes(kind)) {
        throw new Error("data.Join type must be inner, left, right, or full");
    }
    const suffix = text(option(args[3], "suffix", stringValue("_right")), "data.Join suffix");
    const missingMatches = truthy(option(args[3], "missingMatches", null));
    const rightKeys = new Set(pairs.map(([, index]) => index));
    const used = new Set(left.columns.map((column) => column.id.toLowerCase()));
    const retainedRight = [];
    for (let index = 0; index < right.columns.length; index += 1) {
        if (rightKeys.has(index)) continue;
        const column = right.columns[index];
        let id = column.id;
        if (used.has(id.toLowerCase())) id += suffix;
        if (!id || used.has(id.toLowerCase())) {
            throw new Error(`data.Join cannot make a unique result column for '${column.id}'`);
        }
        used.add(id.toLowerCase());
        retainedRight.push({
            index,
            column: Object.freeze({
                ...column,
                id,
                label: id === column.id ? column.label : `${column.label}${suffix}`,
                nullable: column.nullable || kind === "left" || kind === "full",
            }),
        });
    }
    const leftColumns = left.columns.map((column, index) => Object.freeze({
        ...column,
        type: (kind === "right" || kind === "full") && pairTypes.has(index) ? pairTypes.get(index).type : column.type,
        nullable: column.nullable
            || ((kind === "right" || kind === "full") && (!pairTypes.has(index) || pairTypes.get(index).nullable)),
    }));
    const columns = Object.freeze([
        ...leftColumns,
        ...retainedRight.map(({ column }) => column),
    ]);
    const rows = [];
    const matchedRight = new Set();
    for (const leftRow of left.rows) {
        let matched = false;
        right.rows.forEach((rightRow, rightIndex) => {
            if (!joinKeyMatches(leftRow, rightRow, pairs, left, right, missingMatches)) return;
            matched = true;
            matchedRight.add(rightIndex);
            rows.push(Object.freeze([...leftRow, ...retainedRight.map(({ index }) => rightRow[index])]));
        });
        if (!matched && (kind === "left" || kind === "full")) {
            rows.push(Object.freeze([...leftRow, ...retainedRight.map(() => null)]));
        }
    }
    if (kind === "right" || kind === "full") {
        right.rows.forEach((rightRow, rightIndex) => {
            if (matchedRight.has(rightIndex)) return;
            const leftCells = left.columns.map((_, leftIndex) => {
                const pair = pairs.find(([index]) => index === leftIndex);
                return pair ? rightRow[pair[1]] : null;
            });
            rows.push(Object.freeze([...leftCells, ...retainedRight.map(({ index }) => rightRow[index])]));
        });
    }
    return makeRelation(columns, Object.freeze(rows), [
        ...left.provenance.operations,
        ...right.provenance.operations.map((name) => `right:${name}`),
        `join:${kind}`,
    ]);
}

function keySignature(row, selected) {
    return selected.map((index) => {
        const value = row[index];
        if (value === null) return "missing";
        const exact = exactParts(value);
        if (exact) return `q:${exact[0]}/${exact[1]}`;
        const measurement = measurementParts(value);
        if (measurement) {
            if (rationalCompare(measurement[0], measurement[1]) === 0) {
                return `q:${measurement[0].numerator}/${measurement[0].denominator}`;
            }
            return `i:${measurement[0].numerator}/${measurement[0].denominator}:${measurement[1].numerator}/${measurement[1].denominator}`;
        }
        if (value?.type === "string") return `s:${value.value}`;
        if (typeof value === "string") return `s:${value}`;
        throw new Error("data.Group keys must be missing, exact numeric, interval, or string values");
    }).map((part) => `${part.length}:${part}`).join("|");
}

export function groupRelation(args) {
    if (args.length !== 2) throw new Error("data.Group expects a Relation and key columns");
    const relation = requireRelation(args[0], "data.Group");
    const selected = selectedColumnIds(args[1], relation, "data.Group columns");
    const groups = [];
    const bySignature = new Map();
    if (!selected.length) {
        const group = { key: Object.freeze([]), rowIndices: [], rows: [] };
        bySignature.set("", group);
        groups.push(group);
    }
    relation.rows.forEach((row, index) => {
        const signature = keySignature(row, selected);
        let group = bySignature.get(signature);
        if (!group) {
            group = { key: Object.freeze(selected.map((columnIndexValue) => row[columnIndexValue])), rowIndices: [], rows: [] };
            bySignature.set(signature, group);
            groups.push(group);
        }
        group.rowIndices.push(index);
        group.rows.push(row);
    });
    return Object.freeze({
        type: "data_groups",
        schema: "rix.data.groups@1",
        relation,
        keyIndices: Object.freeze(selected),
        groups: Object.freeze(groups.map((group) => Object.freeze({
            key: group.key,
            rowIndices: Object.freeze(group.rowIndices),
            rows: Object.freeze(group.rows),
        }))),
        _ext: new Map([["_type", stringValue("data_groups")], ["immutable", new Integer(1n)]]),
    });
}

function requireGroups(value) {
    if (value?.type !== "data_groups" || value.schema !== "rix.data.groups@1" || !Array.isArray(value.groups)) {
        throw new Error("data.Aggregate requires data Groups");
    }
    return value;
}

function exactRational(value, label) {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value.value, 1n);
    throw new Error(`${label} requires exact Integer or Rational values`);
}

function collapseRational(value) {
    return value.denominator === 1n ? new Integer(value.numerator) : value;
}

function aggregateSpec(value, groups, index) {
    const spec = entries(value, `data.Aggregate specification ${index + 1}`);
    const op = operationName(field(spec, "op"), `data.Aggregate specification ${index + 1} op`);
    if (!["count", "sum", "mean", "min", "max", "first"].includes(op)) {
        throw new Error(`data.Aggregate specification ${index + 1} has unsupported operation '${op}'`);
    }
    const columnValue = field(spec, "column", null);
    const sourceIndex = columnValue === null ? null : columnIndex(groups.relation, columnValue, `data.Aggregate specification ${index + 1}`);
    if (op !== "count" && sourceIndex === null) throw new Error(`data.Aggregate ${op} requires a column`);
    const defaultId = sourceIndex === null ? "count" : `${op}_${groups.relation.columns[sourceIndex].id}`;
    const id = text(field(spec, "id", stringValue(defaultId)), `data.Aggregate specification ${index + 1} id`);
    const missing = operationName(field(spec, "missing", stringValue("skip")), `data.Aggregate specification ${index + 1} missing policy`);
    if (!["skip", "propagate", "error"].includes(missing)) throw new Error("data.Aggregate missing policy must be skip, propagate, or error");
    const sourceType = sourceIndex === null ? "Integer" : groups.relation.columns[sourceIndex].type;
    const type = op === "count" ? "Integer" : op === "mean" && sourceType !== "Interval" ? "Rational" : sourceType;
    return { op, sourceIndex, id, missing, column: Object.freeze({ id, label: id, type, nullable: op !== "count" }) };
}

function aggregateValue(group, spec, relation) {
    if (spec.op === "count" && spec.sourceIndex === null) return new Integer(BigInt(group.rows.length));
    const cells = group.rows.map((row) => row[spec.sourceIndex]);
    if (cells.some((value) => value === null)) {
        if (spec.missing === "error") throw new Error(`data.Aggregate encountered a missing value for '${spec.id}'`);
        if (spec.missing === "propagate") return null;
    }
    const values = cells.filter((value) => value !== null);
    if (spec.op === "count") return new Integer(BigInt(values.length));
    if (!values.length) return null;
    if (spec.op === "first") return values[0];
    if ((spec.op === "min" || spec.op === "max") && relation.columns[spec.sourceIndex].type === "Interval") {
        const measurements = values.map((value) => measurementParts(value));
        const low = measurements.slice(1).reduce((best, value) => {
            const endpoint = value[0];
            const compared = rationalCompare(endpoint, best);
            return spec.op === "min" ? (compared < 0 ? endpoint : best) : (compared > 0 ? endpoint : best);
        }, measurements[0][0]);
        const high = measurements.slice(1).reduce((best, value) => {
            const endpoint = value[1];
            const compared = rationalCompare(endpoint, best);
            return spec.op === "min" ? (compared < 0 ? endpoint : best) : (compared > 0 ? endpoint : best);
        }, measurements[0][1]);
        return new RationalInterval(low, high);
    }
    if (spec.op === "min" || spec.op === "max") {
        return values.slice(1).reduce((best, value) => {
            const compared = compareValues(value, best, relation.columns[spec.sourceIndex], "Aggregate");
            return spec.op === "min" ? (compared < 0 ? value : best) : (compared > 0 ? value : best);
        }, values[0]);
    }
    const intervalSource = relation.columns[spec.sourceIndex].type === "Interval";
    const total = values.reduce((sum, value) => sum.add(intervalSource ? value : exactRational(value, `data.Aggregate ${spec.op}`)), new Rational(0n, 1n));
    return collapseRational(spec.op === "mean" ? total.divide(new Rational(BigInt(values.length), 1n)) : total);
}

export function aggregateGroups(args) {
    if (args.length !== 2) throw new Error("data.Aggregate expects Groups and aggregate specifications");
    const groups = requireGroups(args[0]);
    const specs = sequence(args[1], "data.Aggregate specifications").map((value, index) => aggregateSpec(value, groups, index));
    if (!specs.length) throw new Error("data.Aggregate requires at least one aggregate specification");
    const keyColumns = groups.keyIndices.map((index) => groups.relation.columns[index]);
    const ids = [...keyColumns.map(({ id }) => id.toLowerCase()), ...specs.map(({ id }) => id.toLowerCase())];
    if (new Set(ids).size !== ids.length) throw new Error("data.Aggregate result contains duplicate column ids");
    const rows = groups.groups.map((group) => Object.freeze([
        ...group.key,
        ...specs.map((spec) => aggregateValue(group, spec, groups.relation)),
    ]));
    return makeRelation(Object.freeze([...keyColumns, ...specs.map(({ column }) => column)]), Object.freeze(rows), [
        ...groups.relation.provenance.operations,
        "group",
        "aggregate",
    ]);
}

export function frequencyRelation(args) {
    if (args.length < 2 || args.length > 3) throw new Error("data.Frequency expects a Relation, columns, and optional options");
    const relation = requireRelation(args[0], "data.Frequency");
    const selected = selectedColumnIds(args[1], relation, "data.Frequency columns");
    if (!selected.length) throw new Error("data.Frequency requires at least one column");
    const groups = [];
    const bySignature = new Map();
    for (const row of relation.rows) {
        const signature = keySignature(row, selected);
        let group = bySignature.get(signature);
        if (!group) {
            group = { key: selected.map((index) => row[index]), count: 0 };
            bySignature.set(signature, group);
            groups.push(group);
        }
        group.count += 1;
    }
    const countId = text(option(args[2], "count", stringValue("count")), "data.Frequency count column");
    const proportionId = text(option(args[2], "proportion", stringValue("proportion")), "data.Frequency proportion column");
    const includeProportion = truthy(option(args[2], "includeProportion", new Integer(1n)));
    const baseColumns = selected.map((index) => relation.columns[index]);
    const columns = [
        ...baseColumns,
        Object.freeze({ id: countId, label: countId, type: "Integer", nullable: false }),
        ...(includeProportion ? [Object.freeze({ id: proportionId, label: proportionId, type: "Rational", nullable: false })] : []),
    ];
    if (new Set(columns.map(({ id }) => id.toLowerCase())).size !== columns.length) throw new Error("data.Frequency result contains duplicate column ids");
    const total = relation.rows.length;
    const rows = groups.map(({ key, count }) => Object.freeze([
        ...key,
        new Integer(BigInt(count)),
        ...(includeProportion ? [collapseRational(new Rational(BigInt(count), BigInt(total)))] : []),
    ]));
    return makeRelation(Object.freeze(columns), Object.freeze(rows), [...relation.provenance.operations, "frequency"]);
}

export function contingencyRelation(args) {
    if (args.length < 3 || args.length > 4) throw new Error("data.Contingency expects a Relation, row column, column column, and optional options");
    const relation = requireRelation(args[0], "data.Contingency");
    const rowIndex = columnIndex(relation, args[1], "data.Contingency row column");
    const columnIndexValue = columnIndex(relation, args[2], "data.Contingency column column");
    if (rowIndex === columnIndexValue) throw new Error("data.Contingency row and column variables must differ");
    const missing = operationName(option(args[3], "missing", stringValue("drop")), "data.Contingency missing policy");
    if (!["drop", "error"].includes(missing)) throw new Error("data.Contingency missing policy must be drop or error");
    const rowLevels = [];
    const columnLevels = [];
    const rowLookup = new Map();
    const columnLookup = new Map();
    const kept = [];
    for (const row of relation.rows) {
        if (row[rowIndex] === null || row[columnIndexValue] === null) {
            if (missing === "error") throw new Error("data.Contingency encountered a missing category");
            continue;
        }
        const rowSignature = keySignature(row, [rowIndex]);
        const columnSignature = keySignature(row, [columnIndexValue]);
        if (!rowLookup.has(rowSignature)) {
            rowLookup.set(rowSignature, rowLevels.length);
            rowLevels.push(row[rowIndex]);
        }
        if (!columnLookup.has(columnSignature)) {
            columnLookup.set(columnSignature, columnLevels.length);
            columnLevels.push(row[columnIndexValue]);
        }
        kept.push({ rowSignature, columnSignature });
    }
    if (rowLevels.length < 2 || columnLevels.length < 2) throw new Error("data.Contingency requires at least two observed levels for each variable");
    const counts = rowLevels.map(() => columnLevels.map(() => 0));
    for (const { rowSignature, columnSignature } of kept) counts[rowLookup.get(rowSignature)][columnLookup.get(columnSignature)] += 1;
    const countValues = counts.map((row) => row.map((value) => new Integer(BigInt(value))));
    const rowTotals = countValues.map((row) => row.reduce((sum, value) => sum.add(value), new Integer(0n)));
    const columnTotals = columnLevels.map((_, column) => countValues.reduce((sum, row) => sum.add(row[column]), new Integer(0n)));
    return mapValue([
        ["valuekind", stringValue("dataContingency")],
        ["schema", stringValue("rix.data.contingency@1")],
        ["rowvariable", stringValue(relation.columns[rowIndex].id)],
        ["columnvariable", stringValue(relation.columns[columnIndexValue].id)],
        ["rowlevels", sequenceValue(rowLevels)],
        ["columnlevels", sequenceValue(columnLevels)],
        ["counts", sequenceValue(countValues.map((row) => sequenceValue(row)))],
        ["rowtotals", sequenceValue(rowTotals)],
        ["columntotals", sequenceValue(columnTotals)],
        ["total", new Integer(BigInt(kept.length))],
        ["exact", new Integer(1n)],
    ]);
}

export function calculateRelation(args, runtime = {}) {
    if (args.length !== 3) throw new Error("data.Calculate expects a Relation, column specification, and function");
    const relation = requireRelation(args[0], "data.Calculate");
    if (typeof runtime.invoke !== "function") throw new Error("data.Calculate requires an evaluator callback");
    const columns = normalizeColumns(sequenceValue([args[1]]));
    const column = columns[0];
    if (relation.columns.some(({ id }) => id.toLowerCase() === column.id.toLowerCase())) {
        throw new Error(`data.Calculate column '${column.id}' already exists`);
    }
    const values = relation.rows.map((row, index) => runtime.invoke(
        args[2],
        [rowMap(relation, row), new Integer(BigInt(index + 1)), relation],
        runtime.context,
        runtime.evaluate,
    ));
    const rows = normalizeRows(sequenceValue(relation.rows.map((row, index) => sequenceValue([...row, values[index]]))), Object.freeze([...relation.columns, column]));
    return makeRelation(Object.freeze([...relation.columns, column]), rows, [...relation.provenance.operations, "calculate"]);
}

export function missingRelation(args) {
    if (args.length < 3 || args.length > 4) throw new Error("data.Missing expects a Relation, columns, policy, and optional replacement");
    const relation = requireRelation(args[0], "data.Missing");
    const selected = selectedColumnIds(args[1], relation, "data.Missing columns");
    const policy = operationName(args[2], "data.Missing policy");
    if (!["drop", "error", "fill"].includes(policy)) throw new Error("data.Missing policy must be drop, error, or fill");
    const affected = relation.rows.filter((row) => selected.some((index) => row[index] === null));
    if (policy === "error" && affected.length) throw new Error(`data.Missing found ${affected.length} row(s) with missing values`);
    let rows = relation.rows;
    if (policy === "drop") rows = relation.rows.filter((row) => selected.every((index) => row[index] !== null));
    if (policy === "fill") {
        if (args.length !== 4) throw new Error("data.Missing fill requires a replacement value or map");
        const replacements = args[3]?.type === "map" || args[3] instanceof Map ? entries(args[3], "data.Missing replacements") : null;
        if (replacements) {
            for (const index of selected) {
                const id = relation.columns[index].id;
                const hasReplacement = [...replacements.keys()].some((key) => String(key).toLowerCase() === id.toLowerCase());
                if (!hasReplacement) throw new Error(`data.Missing replacements omit selected column '${id}'`);
            }
        }
        rows = relation.rows.map((row) => row.map((value, index) => {
            if (value !== null || !selected.includes(index)) return value;
            return replacements ? field(replacements, relation.columns[index].id, null) : args[3];
        }));
    }
    const normalized = normalizeRows(sequenceValue(rows.map((row) => sequenceValue(row))), relation.columns);
    return makeRelation(Object.freeze([...relation.columns]), normalized, [...relation.provenance.operations, `missing:${policy}`]);
}

export function createRowSource(args) {
    if (args.length < 2 || args.length > 3) throw new Error("data.RowSource expects a schema, producer, and optional options");
    const columns = normalizeColumns(args[0]);
    if (!columns.length) throw new Error("data.RowSource schema must contain at least one column");
    const maxRowsValue = option(args[2], "maxRows", new Integer(1000n));
    if (!(maxRowsValue instanceof Integer) || maxRowsValue.value < 0n || maxRowsValue.value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("data.RowSource maxRows must be a nonnegative safe Integer");
    }
    return Object.freeze({
        type: "data_row_source",
        schema: "rix.data.row-source@1",
        columns,
        producer: args[1],
        maxRows: Number(maxRowsValue.value),
        _ext: new Map([["_type", stringValue("data_row_source")], ["immutable", new Integer(1n)]]),
    });
}

export function collectRowSource(args, runtime = {}) {
    if (args.length < 1 || args.length > 2) throw new Error("data.Collect expects a RowSource and optional limit");
    const source = args[0];
    if (source?.type !== "data_row_source" || source.schema !== "rix.data.row-source@1") throw new Error("data.Collect requires a data RowSource");
    if (typeof runtime.invoke !== "function") throw new Error("data.Collect requires an evaluator callback");
    let limit = source.maxRows;
    if (args.length === 2) {
        if (!(args[1] instanceof Integer) || args[1].value < 0n || args[1].value > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new Error("data.Collect limit must be a nonnegative safe Integer");
        }
        limit = Math.min(limit, Number(args[1].value));
    }
    const rows = [];
    for (let index = 0; index < limit; index += 1) {
        const row = runtime.invoke(source.producer, [new Integer(BigInt(index + 1))], runtime.context, runtime.evaluate);
        if (row === null) break;
        rows.push(row);
    }
    return makeRelation(source.columns, normalizeRows(sequenceValue(rows), source.columns), ["rowSource", `collect:${rows.length}`]);
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
