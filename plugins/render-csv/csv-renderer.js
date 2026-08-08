import { Integer, Rational } from "@ratmath/core";
import { UnsupportedRenderError } from "../../src/runtime/renderer-registry.js";
import { mapEntries } from "../renderers/common.js";

const MISSING = Symbol("missing option");

function option(options, name, fallback) {
    const values = mapEntries(options);
    if (values) {
        if (values.has(name)) return values.get(name);
        const wanted = name.toLowerCase();
        for (const [key, value] of values) {
            if (String(key).toLowerCase() === wanted) return value;
        }
    } else if (options && typeof options === "object") {
        if (Object.hasOwn(options, name)) return options[name];
        const key = Object.keys(options).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
        if (key !== undefined) return options[key];
    }
    return fallback;
}

function stringOption(value, label) {
    if (value?.type === "string") return value.value;
    if (typeof value === "string") return value;
    throw new Error(`${label} must be a string or colon-string`);
}

function booleanOption(value, fallback) {
    if (value === MISSING) return fallback;
    if (value === null || value === undefined || value === false) return false;
    if (value instanceof Integer) return value.value !== 0n;
    if (value instanceof Rational) return value.numerator !== 0n;
    return Boolean(value);
}

function newlineOption(value) {
    if (value === MISSING) return "\n";
    const newline = stringOption(value, "csv newline").toLowerCase();
    if (newline === "lf" || newline === "\n") return "\n";
    if (newline === "crlf" || newline === "\r\n") return "\r\n";
    throw new Error('csv newline must be :lf, :crlf, "\\n", or "\\r\\n"');
}

function delimiterOption(value, requestedTarget) {
    if (value === MISSING) {
        return requestedTarget === "tsv" || requestedTarget === "text/tab-separated-values" ? "\t" : ",";
    }
    const delimiter = stringOption(value, "csv delimiter");
    if (["tab", "\\t"].includes(delimiter.toLowerCase())) return "\t";
    if (["comma"].includes(delimiter.toLowerCase())) return ",";
    if (["semicolon"].includes(delimiter.toLowerCase())) return ";";
    if (["\r", "\n", '"'].includes(delimiter) || [...delimiter].length !== 1) {
        throw new Error("csv delimiter must be one character other than quote, CR, or LF");
    }
    return delimiter;
}

function tableRows(value) {
    return {
        columns: value.columns.map((column, index) => ({
            id: column.id || `column${index + 1}`,
            label: column.label || column.id || `column${index + 1}`,
        })),
        rows: value.rows,
    };
}

function relationRows(value) {
    if (value.schema !== "rix.data.relation@1" || !Array.isArray(value.columns) || !Array.isArray(value.rows)) {
        throw new UnsupportedRenderError("csv requires a rix.data.relation@1 value", { target: "csv" });
    }
    return {
        columns: value.columns.map(({ id, label }) => ({ id, label: label || id })),
        rows: value.rows,
    };
}

function scalarText(value, missing) {
    if (value === null || value === undefined) return missing;
    if (value?.type === "string") return value.value;
    if (typeof value === "string") return value;
    if (value instanceof Integer) return value.value.toString();
    if (value instanceof Rational) return value.toString();
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    throw new Error(`csv cells must be missing, strings, or exact numeric scalars; received ${value?.type || typeof value}`);
}

function quote(text, delimiter) {
    const source = String(text);
    return source.includes(delimiter) || /["\r\n]/.test(source)
        ? `"${source.replaceAll('"', '""')}"`
        : source;
}

export function renderCsv(value, { options = {}, requestedTarget = "csv" } = {}) {
    const source = value?.type === "output" && value.kind === "table"
        ? tableRows(value)
        : value?.type === "data_relation"
            ? relationRows(value)
            : null;
    if (!source) {
        throw new UnsupportedRenderError("csv accepts Table and data Relation values", { target: "csv" });
    }

    const delimiter = delimiterOption(option(options, "delimiter", MISSING), requestedTarget);
    const newline = newlineOption(option(options, "newline", MISSING));
    const includeHeader = booleanOption(option(options, "header", MISSING), true);
    const finalNewline = booleanOption(option(options, "finalNewline", MISSING), true);
    const missingValue = option(options, "missing", MISSING);
    const missing = missingValue === MISSING ? "" : stringOption(missingValue, "csv missing value");
    const rows = [];
    if (includeHeader) rows.push(source.columns.map(({ label }) => quote(label, delimiter)).join(delimiter));
    for (const [rowIndex, row] of source.rows.entries()) {
        if (!Array.isArray(row) || row.length !== source.columns.length) {
            throw new Error(`csv row ${rowIndex + 1} has ${row?.length ?? 0} cells; expected ${source.columns.length}`);
        }
        rows.push(row.map((cell) => quote(scalarText(cell, missing), delimiter)).join(delimiter));
    }
    const content = rows.join(newline) + (finalNewline && rows.length ? newline : "");
    return {
        content,
        diagnostics: [],
        metadata: {
            schema: "rix.csv.render@1",
            delimiter,
            newline: newline === "\r\n" ? "crlf" : "lf",
            header: includeHeader,
            rowCount: source.rows.length,
            columnCount: source.columns.length,
        },
    };
}
