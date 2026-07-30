import {
    createFormulaSheet,
    FORMULA_SHEET_ASSIGNMENT_MODES,
    isFormulaSheet,
} from "./formula-sheet.js";
import { createTensor } from "./tensor.js";

export const RIXCEL_FORMAT = "rixcel";
export const RIXCEL_VERSION = 1;
export const RIXCEL_ASSIGNMENT_MODES = FORMULA_SHEET_ASSIGNMENT_MODES;

const ASSIGNMENT_MODES = new Set(RIXCEL_ASSIGNMENT_MODES);

function fail(path, message) {
    throw new Error(`Invalid RiXCel document at ${path}: ${message}`);
}

function plainObject(value, path) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        fail(path, "must be an object");
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
        fail(path, "must be a plain object");
    }
    return value;
}

function jsonClone(value, path, seen = new Set()) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) fail(path, "must not contain non-finite numbers");
        return value;
    }
    if (typeof value !== "object") {
        fail(path, `contains unsupported ${typeof value} value`);
    }
    if (seen.has(value)) fail(path, "must not contain cycles");
    seen.add(value);
    try {
        if (Array.isArray(value)) {
            return Array.from({ length: value.length }, (_unused, index) => {
                if (!Object.hasOwn(value, index)) fail(`${path}[${index}]`, "must not be sparse");
                return jsonClone(value[index], `${path}[${index}]`, seen);
            });
        }
        plainObject(value, path);
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
                key,
                jsonClone(item, `${path}.${key}`, seen),
            ]),
        );
    } finally {
        seen.delete(value);
    }
}

function documentInput(value) {
    const input = value?.type === "string" ? value.value : value;
    if (typeof input !== "string") return input;
    try {
        return JSON.parse(input);
    } catch (error) {
        throw new Error(`Invalid RiXCel JSON: ${error.message}`);
    }
}

function documentId(value) {
    if (typeof value !== "string" || value.trim().length === 0) {
        fail("$.id", "must be a non-empty string");
    }
    return value;
}

function documentShape(value) {
    if (!Array.isArray(value) || value.length === 0) {
        fail("$.shape", "must be a non-empty array");
    }
    let size = 1;
    const shape = value.map((length, axis) => {
        if (!Number.isSafeInteger(length) || length < 1) {
            fail(`$.shape[${axis}]`, "must be a positive safe integer");
        }
        size *= length;
        if (!Number.isSafeInteger(size)) fail("$.shape", "has too many logical slots");
        return length;
    });
    return { shape, size };
}

function indexKey(index) {
    return index.join(",");
}

function slotId(id, index) {
    return `${id}:slot:${index.join(":")}`;
}

function linearOffset(index, shape) {
    let offset = 0;
    for (let axis = 0; axis < shape.length; axis += 1) {
        offset = offset * shape[axis] + index[axis] - 1;
    }
    return offset;
}

function normalizeIndex(value, shape, path) {
    if (!Array.isArray(value) || value.length !== shape.length) {
        fail(path, `must contain exactly ${shape.length} indices`);
    }
    return value.map((item, axis) => {
        if (!Number.isSafeInteger(item) || item < 1 || item > shape[axis]) {
            fail(`${path}[${axis}]`, `must be an integer from 1 through ${shape[axis]}`);
        }
        return item;
    });
}

function normalizeView(value, path) {
    if (value === undefined) return {};
    plainObject(value, path);
    return jsonClone(value, path);
}

function migrateDraft(document) {
    const input = plainObject(document, "$");
    const declaredVersion = input.version;
    const isDraft = declaredVersion === 0 || declaredVersion === undefined;
    if (!isDraft) return input;
    const format = input.format ?? input.kind;
    if (format !== RIXCEL_FORMAT) {
        fail("$.format", `must equal "${RIXCEL_FORMAT}"`);
    }
    if (!Array.isArray(input.slots)) fail("$.slots", "must be an array");
    const id = documentId(input.id);
    return {
        format: RIXCEL_FORMAT,
        version: RIXCEL_VERSION,
        id,
        shape: input.shape,
        view: input.view ?? {},
        slots: input.slots.map((slot, offset) => {
            plainObject(slot, `$.slots[${offset}]`);
            const index = slot.index;
            return {
                id: slot.id ?? (Array.isArray(index) ? slotId(id, index) : undefined),
                index,
                source: slot.source ?? slot.code,
                assignmentMode: slot.assignmentMode ?? slot.op ?? ":=",
                view: slot.view ?? slot.style ?? {},
            };
        }),
    };
}

/**
 * Parse, migrate, validate, and canonicalize a RiXCel JSON document.
 *
 * Version 1 is dense and rank-N. Every coordinate must appear exactly once.
 * Runtime values, compiled IR, dependencies, and caches are intentionally
 * ignored by the authoritative schema.
 */
export function parseRixCelDocument(value) {
    const migrated = migrateDraft(documentInput(value));
    const input = plainObject(migrated, "$");
    if (input.format !== RIXCEL_FORMAT) {
        fail("$.format", `must equal "${RIXCEL_FORMAT}"`);
    }
    if (!Number.isSafeInteger(input.version)) fail("$.version", "must be an integer");
    if (input.version > RIXCEL_VERSION) {
        throw new Error(
            `Unsupported RiXCel document version ${input.version}; this runtime supports through version ${RIXCEL_VERSION}`,
        );
    }
    if (input.version !== RIXCEL_VERSION) fail("$.version", `must equal ${RIXCEL_VERSION}`);

    const id = documentId(input.id);
    const { shape, size } = documentShape(input.shape);
    if (!Array.isArray(input.slots)) fail("$.slots", "must be an array");
    if (input.slots.length !== size) {
        fail("$.slots", `must contain exactly ${size} dense slots`);
    }

    const occupied = new Set();
    const ids = new Set();
    const slots = input.slots.map((rawSlot, offset) => {
        const path = `$.slots[${offset}]`;
        const slot = plainObject(rawSlot, path);
        const index = normalizeIndex(slot.index, shape, `${path}.index`);
        const key = indexKey(index);
        if (occupied.has(key)) fail(`${path}.index`, `duplicates coordinate [${index.join(",")}]`);
        occupied.add(key);

        const expectedId = slotId(id, index);
        if (slot.id !== expectedId) {
            fail(`${path}.id`, `must equal "${expectedId}"`);
        }
        if (ids.has(slot.id)) fail(`${path}.id`, "must be unique");
        ids.add(slot.id);
        if (typeof slot.source !== "string") fail(`${path}.source`, "must be a string");
        if (!ASSIGNMENT_MODES.has(slot.assignmentMode)) {
            fail(`${path}.assignmentMode`, `is not supported: ${slot.assignmentMode}`);
        }
        return {
            id: slot.id,
            index,
            source: slot.source,
            assignmentMode: slot.assignmentMode,
            view: normalizeView(slot.view, `${path}.view`),
        };
    });
    slots.sort((left, right) => linearOffset(left.index, shape) - linearOffset(right.index, shape));

    return {
        format: RIXCEL_FORMAT,
        version: RIXCEL_VERSION,
        id,
        shape,
        view: normalizeView(input.view, "$.view"),
        slots,
    };
}

/**
 * Export a FormulaSheet as the canonical, source-authoritative v1 document.
 */
export function exportRixCelDocument(sheet) {
    if (!isFormulaSheet(sheet)) throw new Error("RiXCel export requires a FormulaSheet");
    const slots = [];
    const visit = (axis, index) => {
        if (axis === sheet.shape.length) {
            const slot = sheet.slot(index);
            if (typeof slot.source !== "string") {
                throw new Error(`RiXCel export requires source for grid[${index.join(",")}]`);
            }
            slots.push({
                id: slot.id,
                index: [...index],
                source: slot.source,
                assignmentMode: slot.assignmentMode,
                view: jsonClone(slot.view ?? {}, `grid[${index.join(",")}].view`),
            });
            return;
        }
        for (let value = 1; value <= sheet.shape[axis]; value += 1) {
            visit(axis + 1, [...index, value]);
        }
    };
    visit(0, []);
    return parseRixCelDocument({
        format: RIXCEL_FORMAT,
        version: RIXCEL_VERSION,
        id: sheet.id,
        shape: [...sheet.shape],
        view: jsonClone(sheet.documentView ?? {}, "$.view"),
        slots,
    });
}

export function stringifyRixCelDocument(value, options = {}) {
    const document = isFormulaSheet(value)
        ? exportRixCelDocument(value)
        : parseRixCelDocument(value);
    const space = options.space ?? 2;
    if (!Number.isInteger(space) || space < 0 || space > 10) {
        throw new Error("RiXCel JSON indentation must be an integer from 0 through 10");
    }
    return JSON.stringify(document, null, space);
}

/**
 * Rebuild a FormulaSheet from authoritative source.
 *
 * The caller supplies the RiX compiler and isolated formula evaluator. This
 * keeps the document layer independent of any particular evaluator host.
 */
export function importRixCelDocument(value, options = {}) {
    const document = parseRixCelDocument(value);
    if (typeof options.compileFormula !== "function") {
        throw new Error("RiXCel import requires a formula compiler");
    }
    if (typeof options.runFormula !== "function") {
        throw new Error("RiXCel import requires a deferred formula evaluator");
    }
    const formulas = document.slots.map((slot) => {
        try {
            return options.compileFormula(slot.source);
        } catch (error) {
            throw new Error(
                `RiXCel source for grid[${slot.index.join(",")}] did not compile: ${error.message}`,
            );
        }
    });
    const slotMetadata = new Map(document.slots.map((slot) => [
        indexKey(slot.index),
        {
            id: slot.id,
            source: slot.source,
            assignmentMode: slot.assignmentMode,
            view: slot.view,
        },
    ]));
    return createFormulaSheet(createTensor(document.shape, formulas), {
        ...options,
        id: document.id,
        documentView: document.view,
        slotMetadata,
    });
}
