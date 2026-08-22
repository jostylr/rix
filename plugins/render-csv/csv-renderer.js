import { Integer, Rational, RationalInterval } from "@ratmath/core";
import { UnsupportedRenderError } from "../../src/runtime/renderer-registry.js";
import { mapEntries } from "../renderers/common.js";

const MISSING = Symbol("missing option");
const LOCALES = Object.freeze({
    invariant: Object.freeze({ decimalMark: ".", groupMark: "" }),
    "en-us": Object.freeze({ decimalMark: ".", groupMark: "," }),
    "de-de": Object.freeze({ decimalMark: ",", groupMark: "." }),
    "fr-fr": Object.freeze({ decimalMark: ",", groupMark: "\u202f" }),
});

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

function safeIntegerOption(value, label, fallback) {
    if (value === MISSING) return fallback;
    if (!(value instanceof Integer) || value.value < 0n || value.value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error(`${label} must be a nonnegative safe Integer`);
    }
    return Number(value.value);
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
    if (delimiter.toLowerCase() === "comma") return ",";
    if (delimiter.toLowerCase() === "semicolon") return ";";
    if (["\r", "\n", '"'].includes(delimiter) || [...delimiter].length !== 1) {
        throw new Error("csv delimiter must be one character other than quote, CR, or LF");
    }
    return delimiter;
}

function sequence(value, label) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.values)) return value.values;
    throw new Error(`${label} must be a sequence`);
}

function tableRows(value) {
    return {
        columns: value.columns.map((column, index) => ({
            id: column.id || `column${index + 1}`,
            label: column.label || column.id || `column${index + 1}`,
        })),
        rows: value.rows,
        streaming: false,
    };
}

function relationRows(value) {
    if (value.schema !== "rix.data.relation@1" || !Array.isArray(value.columns) || !Array.isArray(value.rows)) {
        throw new UnsupportedRenderError("csv requires a rix.data.relation@1 value", { target: "csv" });
    }
    return {
        columns: value.columns.map(({ id, label }) => ({ id, label: label || id })),
        rows: value.rows,
        streaming: false,
    };
}

function rowSourceRows(value, runtime, options) {
    if (value.schema !== "rix.data.row-source@1" || !Array.isArray(value.columns) || typeof value.producer === "undefined") {
        throw new UnsupportedRenderError("csv requires a rix.data.row-source@1 value", { target: "csv" });
    }
    if (typeof runtime?.invoke !== "function") {
        throw new Error("csv rendering of a data RowSource requires an evaluator callback");
    }
    const requested = safeIntegerOption(option(options, "limit", MISSING), "csv stream limit", value.maxRows);
    const limit = Math.min(requested, value.maxRows);
    return {
        columns: value.columns.map(({ id, label }) => ({ id, label: label || id })),
        streaming: true,
        *rows() {
            for (let index = 0; index < limit; index += 1) {
                const produced = runtime.invoke(value.producer, [new Integer(BigInt(index + 1))], runtime.context, runtime.evaluate);
                if (produced === null) return;
                yield sequence(produced, `csv streamed row ${index + 1}`);
            }
        },
    };
}

function localePolicy(options, delimiter) {
    const locale = stringOption(option(options, "locale", "invariant"), "csv locale").toLowerCase();
    const known = LOCALES[locale];
    if (!known) throw new Error("csv locale must be invariant, en-US, de-DE, or fr-FR");
    const decimal = stringOption(option(options, "decimal", "canonical"), "csv decimal policy").toLowerCase();
    if (!["canonical", "locale"].includes(decimal)) throw new Error("csv decimal policy must be canonical or locale");
    const decimalMark = decimal === "canonical" ? "." : stringOption(option(options, "decimalMark", known.decimalMark), "csv decimal mark");
    const groupMark = decimal === "canonical" ? "" : stringOption(option(options, "groupMark", known.groupMark), "csv group mark");
    if ([...decimalMark].length !== 1 || /[\r\n\d+-]/.test(decimalMark)) throw new Error("csv decimal mark must be one nonnumeric character");
    if (groupMark && ([...groupMark].length !== 1 || /[\r\n\d+-]/.test(groupMark))) {
        throw new Error("csv group mark must be empty or one nonnumeric character");
    }
    if (groupMark && groupMark === decimalMark) throw new Error("csv decimal and group marks must differ");
    if (decimal === "locale" && delimiter === decimalMark) {
        throw new Error("csv delimiter must differ from the locale decimal mark; use semicolon or tab for decimal commas");
    }
    return Object.freeze({ locale, decimal, decimalMark, groupMark, grouping: booleanOption(option(options, "grouping", MISSING), false) });
}

function groupedInteger(source, groupMark) {
    if (!groupMark) return source;
    const sign = source.startsWith("-") || source.startsWith("+") ? source[0] : "";
    const digits = sign ? source.slice(1) : source;
    return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, groupMark);
}

function exactDecimal(numerator, denominator, policy, label) {
    let remaining = denominator;
    let twos = 0;
    let fives = 0;
    while (remaining % 2n === 0n) { remaining /= 2n; twos += 1; }
    while (remaining % 5n === 0n) { remaining /= 5n; fives += 1; }
    if (remaining !== 1n) {
        throw new Error(`${label} has a nonterminating decimal expansion; use decimal=:canonical to preserve it exactly`);
    }
    const places = Math.max(twos, fives);
    let scaled = numerator * (2n ** BigInt(places - twos)) * (5n ** BigInt(places - fives));
    const sign = scaled < 0n ? "-" : "";
    if (scaled < 0n) scaled = -scaled;
    let digits = scaled.toString();
    if (places === 0) return groupedInteger(sign + digits, policy.grouping ? policy.groupMark : "");
    digits = digits.padStart(places + 1, "0");
    const fraction = digits.slice(-places).replace(/0+$/, "");
    const integer = groupedInteger(sign + digits.slice(0, -places), policy.grouping ? policy.groupMark : "");
    return fraction ? `${integer}${policy.decimalMark}${fraction}` : integer;
}

function numericText(value, policy, label) {
    if (value instanceof Integer) {
        return policy.decimal === "canonical" ? value.value.toString() : groupedInteger(value.value.toString(), policy.grouping ? policy.groupMark : "");
    }
    if (value instanceof Rational) {
        return policy.decimal === "canonical" ? value.toString() : exactDecimal(value.numerator, value.denominator, policy, label);
    }
    if (typeof value === "bigint") {
        return policy.decimal === "canonical" ? value.toString() : groupedInteger(value.toString(), policy.grouping ? policy.groupMark : "");
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        const source = String(value);
        return policy.decimal === "locale" ? source.replace(".", policy.decimalMark) : source;
    }
    return null;
}

function nestedJson(value, path, seen = new WeakSet()) {
    if (value === null || value === undefined) return null;
    if (value?.type === "string") return value.value;
    if (typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error(`csv cannot flatten nonfinite number at ${path}`);
        return value;
    }
    if (typeof value === "bigint") return { $integer: value.toString() };
    if (value instanceof Integer) return { $integer: value.value.toString() };
    if (value instanceof Rational) return { $rational: value.toString() };
    if (value instanceof RationalInterval) return { $interval: `${value.low}:${value.high}` };
    if (typeof value !== "object") throw new Error(`csv cannot flatten ${typeof value} at ${path}`);
    if (seen.has(value)) throw new Error(`csv cannot flatten a circular value at ${path}`);
    seen.add(value);
    try {
        if (Array.isArray(value) || Array.isArray(value?.values)) {
            return sequence(value, path).map((entry, index) => nestedJson(entry, `${path}[${index + 1}]`, seen));
        }
        const entries = mapEntries(value);
        if (entries) {
            return Object.fromEntries([...entries]
                .map(([key, entry]) => [String(key), entry])
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([key, entry]) => [key, nestedJson(entry, `${path}.${key}`, seen)]));
        }
    } finally {
        seen.delete(value);
    }
    throw new Error(`csv cannot flatten ${value?.type || value?.constructor?.name || "object"} at ${path}`);
}

function scalarText(value, missing, policy, flatten, path, diagnostics) {
    if (value === null || value === undefined) return missing;
    if (value?.type === "string") return value.value;
    if (typeof value === "string") return value;
    const numeric = numericText(value, policy, path);
    if (numeric !== null) return numeric;
    if (value instanceof RationalInterval) {
        return `${numericText(value.low, policy, `${path} lower bound`)}:${numericText(value.high, policy, `${path} upper bound`)}`;
    }
    if (flatten === "json") {
        diagnostics.push({ level: "warning", code: "csv-flattened-cell", message: `Flattened a nested cell as deterministic tagged JSON at ${path}`, path });
        return JSON.stringify(nestedJson(value, path));
    }
    throw new Error(`csv nested cell at ${path} requires flatten=:json; received ${value?.type || typeof value}`);
}

function quote(text, delimiter) {
    const source = String(text);
    return source.includes(delimiter) || /["\r\n]/.test(source) ? `"${source.replaceAll('"', '""')}"` : source;
}

function sidecarLines(options, comment, policy) {
    const commentsValue = option(options, "comments", MISSING);
    const metadataValue = option(options, "metadata", MISSING);
    if (commentsValue === MISSING && metadataValue === MISSING) return { lines: [], commentCount: 0, metadataCount: 0 };
    if (!comment) throw new Error("csv comments/metadata require a nonempty comment prefix");
    const lines = [];
    let metadataCount = 0;
    if (metadataValue !== MISSING) {
        const entries = mapEntries(metadataValue);
        if (!entries) throw new Error("csv metadata must be a map");
        for (const [key, value] of [...entries].sort(([left], [right]) => String(left).localeCompare(String(right)))) {
            const rendered = scalarText(value, "", policy, "reject", `metadata.${key}`, []);
            if (/[\r\n]/.test(rendered)) throw new Error(`csv metadata '${key}' must fit on one line`);
            lines.push(`${comment} ${key}: ${rendered}`);
            metadataCount += 1;
        }
    }
    let commentCount = 0;
    if (commentsValue !== MISSING) {
        for (const [index, value] of sequence(commentsValue, "csv comments").entries()) {
            const rendered = stringOption(value, `csv comment ${index + 1}`);
            if (/[\r\n]/.test(rendered)) throw new Error(`csv comment ${index + 1} must fit on one line`);
            lines.push(`${comment} ${rendered}`);
            commentCount += 1;
        }
    }
    return { lines, commentCount, metadataCount };
}

export function renderCsv(value, { options = {}, requestedTarget = "csv", runtime = {} } = {}) {
    const source = value?.type === "output" && value.kind === "table"
        ? tableRows(value)
        : value?.type === "data_relation"
            ? relationRows(value)
            : value?.type === "data_row_source"
                ? rowSourceRows(value, runtime, options)
                : null;
    if (!source) throw new UnsupportedRenderError("csv accepts Table, data Relation, and data RowSource values", { target: "csv" });

    const delimiter = delimiterOption(option(options, "delimiter", MISSING), requestedTarget);
    const newline = newlineOption(option(options, "newline", MISSING));
    const includeHeader = booleanOption(option(options, "header", MISSING), true);
    const finalNewline = booleanOption(option(options, "finalNewline", MISSING), true);
    const missingValue = option(options, "missing", MISSING);
    const missing = missingValue === MISSING ? "" : stringOption(missingValue, "csv missing value");
    const flatten = stringOption(option(options, "flatten", "reject"), "csv flatten policy").toLowerCase();
    if (!["reject", "json"].includes(flatten)) throw new Error("csv flatten policy must be reject or json");
    const policy = localePolicy(options, delimiter);
    const commentValue = option(options, "comment", "#");
    const comment = commentValue === null ? "" : stringOption(commentValue, "csv comment prefix");
    if (comment && ([...comment].length !== 1 || /[\r\n\"]/.test(comment))) {
        throw new Error("csv comment prefix must be empty or one character other than quote, CR, or LF");
    }
    const sidecar = sidecarLines(options, comment, policy);
    const rows = [...sidecar.lines];
    const diagnostics = [];
    if (includeHeader) rows.push(source.columns.map(({ label }) => quote(label, delimiter)).join(delimiter));
    let rowCount = 0;
    const rowValues = source.streaming ? source.rows() : source.rows;
    for (const row of rowValues) {
        rowCount += 1;
        if (!Array.isArray(row) || row.length !== source.columns.length) {
            throw new Error(`csv row ${rowCount} has ${row?.length ?? 0} cells; expected ${source.columns.length}`);
        }
        rows.push(row.map((cell, columnIndex) => quote(scalarText(
            cell, missing, policy, flatten, `row[${rowCount}].${source.columns[columnIndex].id}`, diagnostics,
        ), delimiter)).join(delimiter));
    }
    const content = rows.join(newline) + (finalNewline && rows.length ? newline : "");
    return {
        content,
        diagnostics,
        metadata: {
            schema: "rix.csv.render@2",
            delimiter,
            newline: newline === "\r\n" ? "crlf" : "lf",
            header: includeHeader,
            rowCount,
            columnCount: source.columns.length,
            streaming: source.streaming,
            numeric: policy,
            sidecar: Object.freeze({ comments: sidecar.commentCount, metadata: sidecar.metadataCount }),
            flattening: Object.freeze({ policy: flatten, count: diagnostics.length }),
        },
    };
}
