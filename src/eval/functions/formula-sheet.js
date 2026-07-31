import { createFormulaSheet } from "../../runtime/formula-sheet.js";
import {
    importRixCelDocument,
    stringifyRixCelDocument,
} from "../../runtime/rixcel-document.js";
import { tokenize } from "../../parser/tokenizer.js";
import { parse } from "../../parser/parser.js";
import { lower } from "../lower.js";
import { isReactiveNode, REACTIVE_READ_ENV } from "../../runtime/reactive-graph.js";
import { createSystemLookup } from "../../runtime/system-manifest.js";
import { Integer, Rational } from "@ratmath/core";
import { createTensor } from "../../runtime/tensor.js";
import { formatValue } from "../format.js";

export function containsOuterRead(node) {
    if (!node || typeof node !== "object") return false;
    if (node.fn === "OUTER_RETRIEVE") return true;
    if (Array.isArray(node)) return node.some(containsOuterRead);
    return Array.isArray(node.args) && node.args.some(containsOuterRead);
}

export function deferredSource(formula) {
    const source = formula?.__source;
    const start = formula?.pos?.[1] ?? formula?.pos?.[0];
    if (typeof source !== "string" || !Number.isInteger(start)) return null;
    const tokens = tokenize(source);
    const atIndex = tokens.findIndex((token) => token.value === "@" && token.pos?.[1] === start);
    if (atIndex === -1) return null;
    const open = tokens[atIndex + 1];
    if (!open || !String(open.value).startsWith("{")) return null;
    let depth = 0;
    for (let index = atIndex + 1; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (String(token.value).startsWith("{")) depth += 1;
        else if (token.value === "}") depth -= 1;
        if (depth === 0) {
            return source.slice(open.pos[2], token.pos[1]).trim();
        }
    }
    return null;
}

export function createFormulaSheetRuntimeOptions(context, evaluate, systemContext) {
    return {
        formulaSource: deferredSource,
        compileFormula(source) {
            const wrapped = `@{ ${source}\n}`;
            const nodes = lower(parse(wrapped, createSystemLookup(systemContext)));
            if (nodes.length !== 1 || nodes[0]?.fn !== "DEFER") {
                throw new Error("FormulaSheet source must compile to one deferred formula");
            }
            const attachSource = (node, seen = new Set()) => {
                if (!node || typeof node !== "object" || seen.has(node)) return;
                seen.add(node);
                if (Array.isArray(node)) {
                    for (const item of node) attachSource(item, seen);
                    return;
                }
                if (node.fn) {
                    Object.defineProperty(node, "__source", {
                        value: wrapped,
                        enumerable: false,
                        configurable: true,
                    });
                }
                for (const arg of node.args || []) attachSource(arg, seen);
            };
            attachSource(nodes[0]);
            return nodes[0];
        },
        runFormula(formula, bindings, runOptions = {}) {
            if (containsOuterRead(formula.args[0])) {
                throw new Error("FormulaSheet formulas cannot access caller bindings with @; use explicit sheet imports");
            }
            const reactiveGraph = runOptions.reactiveGraph || null;
            const previousRead = context.getEnv(REACTIVE_READ_ENV, undefined);
            context.push(new Map(Object.entries(bindings)), {
                isolated: true,
                callableBoundary: true,
            });
            context.setEnv(REACTIVE_READ_ENV, (value) => {
                if (reactiveGraph && isReactiveNode(value) && value.graph === reactiveGraph) return value.get();
                return typeof previousRead === "function" ? previousRead(value) : value;
            });
            try {
                return context.withSharedBody(formula.args[0], () => evaluate(formula.args[0]));
            } finally {
                context.setEnv(REACTIVE_READ_ENV, previousRead);
                context.pop();
            }
        },
    };
}

function documentJsonValue(value, path, seen = new Set()) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (value?.type === "string") return value.value;
    if (value instanceof Integer) {
        const number = Number(value.value);
        if (!Number.isSafeInteger(number)) throw new Error(`${path} integer is outside the JSON safe range`);
        return number;
    }
    if (value instanceof Rational) {
        if (value.denominator !== 1n) throw new Error(`${path} must not contain non-integer rationals`);
        const number = Number(value.numerator);
        if (!Number.isSafeInteger(number)) throw new Error(`${path} integer is outside the JSON safe range`);
        return number;
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error(`${path} must not contain non-finite numbers`);
        return value;
    }
    if (!value || typeof value !== "object") {
        throw new Error(`${path} contains a value that cannot be stored as JSON`);
    }
    if (seen.has(value)) throw new Error(`${path} must not contain cycles`);
    seen.add(value);
    try {
        if (Array.isArray(value) || ["sequence", "tuple", "array"].includes(value.type)) {
            const values = Array.isArray(value) ? value : value.values || value.elements || [];
            return values.map((item, index) => documentJsonValue(item, `${path}[${index}]`, seen));
        }
        if (value.type === "map" && value.entries instanceof Map) {
            return Object.fromEntries([...value.entries].map(([key, item]) => [
                String(key),
                documentJsonValue(item, `${path}.${String(key)}`, seen),
            ]));
        }
        throw new Error(`${path} must contain only maps, sequences, strings, integers, and null`);
    } finally {
        seen.delete(value);
    }
}

function formulaSheetCapability(args, context, evaluate, systemContext) {
    if (args.length < 1 || args.length > 2) {
        throw new Error(".FormulaSheet expects deferred formulas and an optional options map");
    }
    const optionEntries = args[1]?.type === "map" && args[1].entries instanceof Map
        ? args[1].entries
        : args[1] === undefined
            ? new Map()
            : null;
    if (!optionEntries) throw new Error(".FormulaSheet options must be a map");
    const option = (name, fallback = null) =>
        optionEntries.get(name) ?? optionEntries.get(name.toLowerCase()) ?? fallback;
    const stringOption = (name, fallback = null) => {
        const value = option(name);
        if (value === null) return fallback;
        const text = value?.type === "string" ? value.value : typeof value === "string" ? value : null;
        if (text === null) throw new Error(`FormulaSheet ${name} must be a string`);
        return text;
    };
    const viewOption = option("view");
    if (viewOption !== null && (viewOption?.type !== "map" || !(viewOption.entries instanceof Map))) {
        throw new Error("FormulaSheet view must be a map");
    }
    return createFormulaSheet(args[0], {
        ...createFormulaSheetRuntimeOptions(context, evaluate, systemContext),
        id: stringOption("id"),
        assignmentMode: stringOption("assignmentMode", ":="),
        documentView: viewOption === null
            ? {}
            : documentJsonValue(viewOption, "FormulaSheet view"),
    });
}

function rixCelExportCapability(args) {
    if (args.length !== 1) throw new Error(".RiXCelExport expects one FormulaSheet");
    return {
        type: "string",
        value: stringifyRixCelDocument(args[0]),
    };
}

function rixCelImportCapability(args, context, evaluate, systemContext) {
    if (args.length !== 1) throw new Error(".RiXCelImport expects one JSON string");
    return importRixCelDocument(
        args[0],
        createFormulaSheetRuntimeOptions(context, evaluate, systemContext),
    );
}

function delimitedText(value, label) {
    const text = value?.type === "string" ? value.value : typeof value === "string" ? value : null;
    if (text === null) throw new Error(`${label} expects a text string`);
    return text;
}

export function parseDelimitedRows(source, delimiter) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (quoted) {
            if (char === '"' && source[index + 1] === '"') {
                field += '"';
                index += 1;
            } else if (char === '"') {
                quoted = false;
            } else {
                field += char;
            }
            continue;
        }
        if (char === '"' && field.length === 0) quoted = true;
        else if (char === delimiter) {
            row.push(field);
            field = "";
        } else if (char === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
        } else if (char === "\r" && source[index + 1] === "\n") {
            continue;
        } else {
            field += char;
        }
    }
    if (quoted) throw new Error("Delimited import has an unterminated quoted field");
    if (field.length > 0 || row.length > 0 || source.length === 0) {
        row.push(field);
        rows.push(row);
    }
    if (rows.length > 1 && rows.at(-1).length === 1 && rows.at(-1)[0] === "") rows.pop();
    const width = rows[0]?.length ?? 0;
    if (width === 0 || rows.length === 0) throw new Error("Delimited import requires at least one cell");
    if (!rows.every((candidate) => candidate.length === width)) {
        throw new Error("Delimited import rows must have equal lengths");
    }
    return rows;
}

function delimitedOptions(value, label) {
    if (value === undefined) return { header: false, id: null };
    if (value?.type !== "map" || !(value.entries instanceof Map)) {
        throw new Error(`${label} options must be a map`);
    }
    const option = (name) => value.entries.get(name) ?? value.entries.get(name.toLowerCase());
    const headerValue = option("header");
    const header = headerValue instanceof Integer
        ? headerValue.value !== 0n
        : headerValue === null || headerValue === undefined
            ? false
            : Boolean(headerValue);
    const idValue = option("id");
    const id = idValue === undefined
        ? null
        : delimitedText(idValue, `${label} id`);
    return { header, id };
}

function importedFieldSource(value) {
    if (value === "") return "_";
    if (/^[+-]?(?:\d+|\d+\.\d+)$/u.test(value.trim())) return value.trim();
    return JSON.stringify(value);
}

function importDelimitedCapability(args, context, evaluate, systemContext, delimiter, label) {
    if (args.length < 1 || args.length > 2) {
        throw new Error(`${label} expects text and an optional options map`);
    }
    const rows = parseDelimitedRows(delimitedText(args[0], label), delimiter);
    const imported = delimitedOptions(args[1], label);
    const headers = imported.header ? rows.shift() : null;
    if (rows.length === 0) throw new Error(`${label} header must be followed by at least one data row`);
    const runtime = createFormulaSheetRuntimeOptions(context, evaluate, systemContext);
    const shape = [rows.length, rows[0].length];
    const formulas = [];
    const slotMetadata = new Map();
    for (const [rowIndex, row] of rows.entries()) {
        for (const [columnIndex, field] of row.entries()) {
            const source = importedFieldSource(field);
            formulas.push(runtime.compileFormula(source));
            slotMetadata.set(`${rowIndex + 1},${columnIndex + 1}`, {
                source,
                assignmentMode: ":=",
                view: field === ""
                    ? { blank: true }
                    : field.startsWith("=")
                    ? { foreignFormula: field, executable: false, format: delimiter === "," ? "csv" : "tsv" }
                    : {},
            });
        }
    }
    return createFormulaSheet(createTensor(shape, formulas), {
        ...runtime,
        id: imported.id,
        slotMetadata,
        documentView: {
            axes: ["row", "column"],
            ...(headers ? {
                axisLabels: [null, headers.map((header) => header === "" ? null : header)],
            } : {}),
        },
    });
}

function csvField(value) {
    const source = value === null
        ? ""
        : value?.type === "string"
            ? value.value
            : formatValue(value);
    return /[",\r\n\t]/u.test(source) ? `"${source.replaceAll('"', '""')}"` : source;
}

function exportDelimitedCapability(args, delimiter, label) {
    if (args.length !== 1 || !args[0] || args[0].type !== "formula_sheet") {
        throw new Error(`${label} expects one FormulaSheet`);
    }
    const sheet = args[0];
    if (sheet.rank !== 2) throw new Error(`${label} requires a rank-2 FormulaSheet`);
    const lines = [];
    const labels = sheet.documentView.axisLabels ?? sheet.documentView.axislabels;
    if (Array.isArray(labels?.[1])) lines.push(labels[1].map(csvField).join(delimiter));
    for (let row = 1; row <= sheet.shape[0]; row += 1) {
        const fields = [];
        for (let column = 1; column <= sheet.shape[1]; column += 1) {
            fields.push(csvField(sheet.get([row, column])));
        }
        lines.push(fields.join(delimiter));
    }
    return { type: "string", value: lines.join("\n") };
}

export const formulaSheetFunctions = {
    FORMULASHEET: {
        pure: false,
        impl: formulaSheetCapability,
        doc: "Create a formula-backed sheet from a tensor or rectangular array of deferred RiX formulas",
    },
    RIXCELEXPORT: {
        pure: false,
        impl: rixCelExportCapability,
        doc: "Serialize a FormulaSheet to canonical versioned RiXCel JSON",
    },
    RIXCELIMPORT: {
        pure: false,
        impl: rixCelImportCapability,
        doc: "Rebuild a FormulaSheet by compiling authoritative source from RiXCel JSON",
    },
    RIXCELIMPORTCSV: {
        pure: false,
        impl: (args, context, evaluate, systemContext) =>
            importDelimitedCapability(args, context, evaluate, systemContext, ",", ".RiXCelImportCsv"),
        doc: "Import CSV values into a rank-2 FormulaSheet; optional header=1 uses the first row as labels",
    },
    RIXCELIMPORTTSV: {
        pure: false,
        impl: (args, context, evaluate, systemContext) =>
            importDelimitedCapability(args, context, evaluate, systemContext, "\t", ".RiXCelImportTsv"),
        doc: "Import TSV values into a rank-2 FormulaSheet; optional header=1 uses the first row as labels",
    },
    RIXCELEXPORTCSV: {
        pure: false,
        impl: (args) => exportDelimitedCapability(args, ",", ".RiXCelExportCsv"),
        doc: "Export the computed values of a rank-2 FormulaSheet as CSV",
    },
    RIXCELEXPORTTSV: {
        pure: false,
        impl: (args) => exportDelimitedCapability(args, "\t", ".RiXCelExportTsv"),
        doc: "Export the computed values of a rank-2 FormulaSheet as TSV",
    },
};
