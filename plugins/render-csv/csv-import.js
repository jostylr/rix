import { Integer, Rational, RationalInterval } from "@ratmath/core";
import { createRelation } from "../data/data.js";
import { mapEntries } from "../renderers/common.js";

const stringValue = (value) => ({ type: "string", value: String(value) });
const sequenceValue = (values) => ({ type: "sequence", values });
const mapValue = (entries) => ({
    type: "map",
    entries: new Map(entries),
    _ext: new Map([["immutable", new Integer(1n)]]),
});

const LOCALES = Object.freeze({
    invariant: Object.freeze({ decimalMark: ".", groupMark: "" }),
    "en-us": Object.freeze({ decimalMark: ".", groupMark: "," }),
    "de-de": Object.freeze({ decimalMark: ",", groupMark: "." }),
    "fr-fr": Object.freeze({ decimalMark: ",", groupMark: "\u202f" }),
});

function field(source, name, fallback = null) {
    const values = mapEntries(source);
    if (values) {
        if (values.has(name)) return values.get(name);
        const wanted = name.toLowerCase();
        for (const [key, value] of values) {
            if (String(key).toLowerCase() === wanted) return value;
        }
        return fallback;
    }
    if (source && typeof source === "object") {
        if (Object.hasOwn(source, name)) return source[name];
        const key = Object.keys(source).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
        return key === undefined ? fallback : source[key];
    }
    return fallback;
}

function text(value, label) {
    if (value?.type === "string") return value.value;
    if (typeof value === "string") return value;
    throw new Error(`${label} must be a string or colon-string`);
}

function booleanValue(value, fallback) {
    if (value === undefined) return fallback;
    if (value === null || value === false) return false;
    if (value instanceof Integer) return value.value !== 0n;
    if (value instanceof Rational) return value.numerator !== 0n;
    return Boolean(value);
}

function sequence(value, label) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.values)) return value.values;
    throw new Error(`${label} must be a sequence`);
}

function delimiterValue(value, fallback = ",") {
    if (value === undefined || value === null) return fallback;
    const delimiter = text(value, "csv delimiter");
    if (delimiter.toLowerCase() === "comma") return ",";
    if (["tab", "\\t"].includes(delimiter.toLowerCase())) return "\t";
    if (delimiter.toLowerCase() === "semicolon") return ";";
    if (["\r", "\n", "\""].includes(delimiter) || [...delimiter].length !== 1) {
        throw new Error("csv delimiter must be one character other than quote, CR, or LF");
    }
    return delimiter;
}

function localePolicy(options, delimiter) {
    const locale = text(field(options, "locale", stringValue("invariant")), "csv locale").toLowerCase();
    const known = LOCALES[locale];
    if (!known) throw new Error("csv locale must be invariant, en-US, de-DE, or fr-FR");
    const decimal = text(field(options, "decimal", stringValue("canonical")), "csv decimal policy").toLowerCase();
    if (!["canonical", "locale"].includes(decimal)) throw new Error("csv decimal policy must be canonical or locale");
    const decimalMark = decimal === "canonical"
        ? "."
        : text(field(options, "decimalMark", stringValue(known.decimalMark)), "csv decimal mark");
    const groupMark = decimal === "canonical"
        ? ""
        : text(field(options, "groupMark", stringValue(known.groupMark)), "csv group mark");
    if ([...decimalMark].length !== 1 || /[\r\n\d+-]/.test(decimalMark)) {
        throw new Error("csv decimal mark must be one nonnumeric character");
    }
    if (groupMark && ([...groupMark].length !== 1 || /[\r\n\d+-]/.test(groupMark))) {
        throw new Error("csv group mark must be empty or one nonnumeric character");
    }
    if (groupMark && groupMark === decimalMark) throw new Error("csv decimal and group marks must differ");
    if (decimal === "locale" && delimiter === decimalMark) {
        throw new Error("csv delimiter must differ from the locale decimal mark; use semicolon or tab for decimal commas");
    }
    return Object.freeze({ locale, decimal, decimalMark, groupMark });
}

function commentPrefix(options) {
    const value = field(options, "comment", stringValue("#"));
    if (value === null) return null;
    const prefix = text(value, "csv comment prefix");
    if (prefix === "") return null;
    if ([...prefix].length !== 1 || /[\r\n\"]/.test(prefix)) {
        throw new Error("csv comment prefix must be empty or one character other than quote, CR, or LF");
    }
    return prefix;
}

/** RFC-style record parser with record-start comments and physical line diagnostics. */
export function parseCsvRecords(source, { delimiter = ",", comment = "#", skipBlank = true } = {}) {
    const textSource = String(source);
    const records = [];
    const comments = [];
    let row = [];
    let cell = "";
    let quoted = false;
    let closedQuote = false;
    let line = 1;
    let recordLine = 1;
    let index = 0;

    const finishRecord = () => {
        row.push(cell);
        if (!(skipBlank && row.length === 1 && row[0] === "")) {
            records.push(Object.freeze({ fields: Object.freeze(row), line: recordLine }));
        }
        row = [];
        cell = "";
        closedQuote = false;
    };

    while (index < textSource.length) {
        const character = textSource[index];
        if (!quoted && row.length === 0 && cell === "" && comment && character === comment) {
            const start = index + 1;
            let end = start;
            while (end < textSource.length && textSource[end] !== "\r" && textSource[end] !== "\n") end += 1;
            comments.push(Object.freeze({ text: textSource.slice(start, end).trim(), line }));
            index = end;
            if (textSource[index] === "\r" && textSource[index + 1] === "\n") index += 2;
            else if (textSource[index] === "\r" || textSource[index] === "\n") index += 1;
            line += 1;
            recordLine = line;
            continue;
        }
        if (quoted) {
            if (character === "\"") {
                if (textSource[index + 1] === "\"") {
                    cell += "\"";
                    index += 2;
                    continue;
                }
                quoted = false;
                closedQuote = true;
                index += 1;
                continue;
            }
            if (character === "\r" && textSource[index + 1] === "\n") {
                cell += "\r\n";
                index += 2;
                line += 1;
                continue;
            }
            if (character === "\r" || character === "\n") line += 1;
            cell += character;
            index += 1;
            continue;
        }
        if (closedQuote && character !== delimiter && character !== "\r" && character !== "\n") {
            throw new Error(`csv line ${line} has text after a closing quote`);
        }
        if (character === "\"") {
            if (cell !== "") throw new Error(`csv line ${line} has a quote inside an unquoted field`);
            quoted = true;
            index += 1;
            continue;
        }
        if (character === delimiter) {
            row.push(cell);
            cell = "";
            closedQuote = false;
            index += 1;
            continue;
        }
        if (character === "\r" || character === "\n") {
            finishRecord();
            if (character === "\r" && textSource[index + 1] === "\n") index += 2;
            else index += 1;
            line += 1;
            recordLine = line;
            continue;
        }
        cell += character;
        index += 1;
    }
    if (quoted) throw new Error(`csv line ${recordLine} has an unterminated quoted field`);
    if (row.length || cell !== "" || closedQuote) finishRecord();
    return Object.freeze({ records: Object.freeze(records), comments: Object.freeze(comments) });
}

function schemaMap(columns) {
    return sequenceValue(columns.map((column) => mapValue([
        ["id", stringValue(column.id)],
        ["label", stringValue(column.label)],
        ["type", stringValue(column.type)],
        ["nullable", column.nullable ? new Integer(1n) : null],
    ])));
}

function inferredSchema(header) {
    const used = new Set();
    return sequenceValue(header.map((label, index) => {
        const base = label.trim() || `column${index + 1}`;
        let id = base;
        let suffix = 2;
        while (used.has(id.toLowerCase())) id = `${base}_${suffix++}`;
        used.add(id.toLowerCase());
        return mapValue([
            ["id", stringValue(id)],
            ["label", stringValue(label || id)],
            ["type", stringValue("String")],
            ["nullable", new Integer(1n)],
        ]);
    }));
}

function missingTokens(options) {
    const value = field(options, "missing", stringValue(""));
    const values = value?.type === "sequence" || Array.isArray(value) ? sequence(value, "csv missing tokens") : [value];
    return new Set(values.map((entry, index) => text(entry, `csv missing token ${index + 1}`)));
}

function ungroup(integerPart, groupMark, label) {
    if (!groupMark || !integerPart.includes(groupMark)) return integerPart;
    const sign = /^[+-]/.test(integerPart) ? integerPart[0] : "";
    const digits = sign ? integerPart.slice(1) : integerPart;
    const groups = digits.split(groupMark);
    if (!/^\d{1,3}$/.test(groups[0]) || groups.slice(1).some((part) => !/^\d{3}$/.test(part))) {
        throw new Error(`${label} has invalid digit grouping`);
    }
    return sign + groups.join("");
}

function normalizedExact(textSource, policy, label) {
    const source = textSource.trim();
    if (!source) throw new Error(`${label} is empty`);
    if (policy.decimal === "canonical") return source;
    if (source.includes("/") || source.includes("..")) {
        if (policy.groupMark && source.includes(policy.groupMark)) throw new Error(`${label} may not group digits in a fraction`);
        if (policy.decimalMark !== "." && source.includes(policy.decimalMark)) throw new Error(`${label} mixes a locale decimal with fraction notation`);
        return source;
    }
    const parts = source.split(policy.decimalMark);
    if (parts.length > 2) throw new Error(`${label} has more than one decimal mark`);
    const integerPart = ungroup(parts[0] || "0", policy.groupMark, label);
    const fractionPart = parts[1];
    if (fractionPart !== undefined && !/^\d+$/.test(fractionPart)) throw new Error(`${label} has invalid decimal digits`);
    return fractionPart === undefined ? integerPart : `${integerPart}.${fractionPart}`;
}

function exactValue(source, policy, label) {
    let value;
    try {
        value = new Rational(normalizedExact(source, policy, label));
    } catch (error) {
        throw new Error(`${label} is not an exact number: ${error.message}`);
    }
    return value.denominator === 1n ? new Integer(value.numerator) : value;
}

function typedCell(source, column, policy, missing, rowNumber) {
    const label = `csv row ${rowNumber} column '${column.id}'`;
    if (missing.has(source)) {
        if (!column.nullable) throw new Error(`${label} may not be missing`);
        return null;
    }
    if (column.type === "String" || column.type === "Any") return stringValue(source);
    if (column.type === "Integer") {
        const value = exactValue(source, policy, label);
        if (!(value instanceof Integer)) throw new Error(`${label} must be an Integer`);
        return value;
    }
    if (["Rational", "Number"].includes(column.type)) return exactValue(source, policy, label);
    if (column.type === "Interval") {
        const separator = source.indexOf(":", 1);
        if (separator < 0) return exactValue(source, policy, label);
        const low = exactValue(source.slice(0, separator), policy, `${label} lower bound`);
        const high = exactValue(source.slice(separator + 1), policy, `${label} upper bound`);
        return new RationalInterval(new Rational(low), new Rational(high));
    }
    throw new Error(`${label} has unsupported schema type '${column.type}'`);
}

function metadataFromComments(comments) {
    const metadata = {};
    for (const comment of comments) {
        const match = comment.text.match(/^([^:]+):\s*(.*)$/);
        if (match) metadata[match[1].trim()] = match[2];
    }
    return Object.freeze(metadata);
}

function parseArguments(args) {
    if (args.length < 1 || args.length > 3) throw new Error("csv.Parse expects text, optional schema, and optional options");
    const source = text(args[0], "csv input");
    let schema = null;
    let options = null;
    if (args.length >= 2) {
        if (Array.isArray(args[1]) || args[1]?.type === "sequence") schema = args[1];
        else options = args[1];
    }
    if (args.length === 3) {
        schema = args[1];
        options = args[2];
    }
    if (options !== null && !mapEntries(options) && typeof options !== "object") throw new Error("csv import options must be a map");
    return { source, schema, options: options || mapValue([]) };
}

function prepareImport(args) {
    const { source, schema: requestedSchema, options } = parseArguments(args);
    const delimiter = delimiterValue(field(options, "delimiter", undefined));
    const policy = localePolicy(options, delimiter);
    const comment = commentPrefix(options);
    const header = booleanValue(field(options, "header", new Integer(1n)), true);
    const parsed = parseCsvRecords(source, {
        delimiter,
        comment,
        skipBlank: booleanValue(field(options, "skipBlank", new Integer(1n)), true),
    });
    if (!parsed.records.length && !requestedSchema) throw new Error("csv import requires a header or an explicit schema");
    const headerFields = header && parsed.records.length ? parsed.records[0].fields : null;
    const schema = requestedSchema || inferredSchema(headerFields);
    const empty = createRelation([schema, sequenceValue([])]);
    const records = parsed.records.slice(header ? 1 : 0);
    if (!header && !requestedSchema) throw new Error("csv import without a header requires an explicit schema");
    if (headerFields && requestedSchema) {
        const headerPolicy = text(field(options, "headerPolicy", stringValue("labels")), "csv header policy").toLowerCase();
        if (!["labels", "ids", "ignore"].includes(headerPolicy)) throw new Error("csv header policy must be labels, ids, or ignore");
        const expected = empty.columns.map((column) => headerPolicy === "ids" ? column.id : column.label);
        if (headerPolicy !== "ignore" && (headerFields.length !== expected.length || headerFields.some((entry, index) => entry !== expected[index]))) {
            throw new Error(`csv header does not match schema ${headerPolicy}: expected ${expected.join(delimiter)}`);
        }
    }
    const missing = missingTokens(options);
    for (const record of records) {
        if (record.fields.length !== empty.columns.length) {
            throw new Error(`csv line ${record.line} has ${record.fields.length} fields; expected ${empty.columns.length}`);
        }
    }
    const sidecar = Object.freeze({
        schema: "rix.csv.sidecar@1",
        comments: Object.freeze(parsed.comments.map(({ text: value, line }) => Object.freeze({ text: value, line }))),
        metadata: metadataFromComments(parsed.comments),
        dialect: Object.freeze({
            delimiter,
            header,
            comment: comment || "",
            locale: policy.locale,
            decimal: policy.decimal,
            decimalMark: policy.decimalMark,
            groupMark: policy.groupMark,
        }),
        rowCount: records.length,
        columnCount: empty.columns.length,
    });
    const convert = (record, index) => sequenceValue(record.fields.map((cell, columnIndex) => (
        typedCell(cell, empty.columns[columnIndex], policy, missing, index + 1)
    )));
    return { schema: schemaMap(empty.columns), columns: empty.columns, records, convert, sidecar };
}

function attachSidecar(value, sidecar) {
    return Object.freeze({
        ...value,
        provenance: Object.freeze({
            ...value.provenance,
            operations: Object.freeze([...(value.provenance?.operations || []), "csv:parse"]),
        }),
        csvSidecar: sidecar,
    });
}

export function parseCsv(args) {
    const prepared = prepareImport(args);
    const rows = sequenceValue(prepared.records.map(prepared.convert));
    return attachSidecar(createRelation([prepared.schema, rows]), prepared.sidecar);
}

export function parseCsvStream(args) {
    const prepared = prepareImport(args);
    const producer = (indexValue) => {
        if (!(indexValue instanceof Integer)) throw new Error("csv row source index must be an Integer");
        const index = Number(indexValue.value) - 1;
        if (!Number.isSafeInteger(index) || index < 0 || index >= prepared.records.length) return null;
        return prepared.convert(prepared.records[index], index);
    };
    return Object.freeze({
        type: "data_row_source",
        schema: "rix.data.row-source@1",
        columns: prepared.columns,
        producer,
        maxRows: prepared.records.length,
        csvSidecar: prepared.sidecar,
        _ext: new Map([["_type", stringValue("data_row_source")], ["immutable", new Integer(1n)]]),
    });
}

export function csvSidecar(args) {
    if (args.length !== 1) throw new Error("csv.Sidecar expects one imported relation or row source");
    const sidecar = args[0]?.csvSidecar;
    if (!sidecar || sidecar.schema !== "rix.csv.sidecar@1") throw new Error("csv.Sidecar requires a csv imported relation or row source");
    return mapValue([
        ["schema", stringValue(sidecar.schema)],
        ["comments", sequenceValue(sidecar.comments.map((comment) => mapValue([
            ["text", stringValue(comment.text)],
            ["line", new Integer(BigInt(comment.line))],
        ])))],
        ["metadata", mapValue(Object.entries(sidecar.metadata).map(([key, value]) => [key, stringValue(value)]))],
        ["dialect", mapValue(Object.entries(sidecar.dialect).map(([key, value]) => [key,
            typeof value === "boolean" ? (value ? new Integer(1n) : null) : stringValue(value),
        ]))],
        ["rowCount", new Integer(BigInt(sidecar.rowCount))],
        ["columnCount", new Integer(BigInt(sidecar.columnCount))],
    ]);
}
