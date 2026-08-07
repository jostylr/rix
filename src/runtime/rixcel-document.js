import {
    createFormulaSheet,
    FORMULA_SHEET_ASSIGNMENT_MODES,
    isFormulaSheet,
} from "./formula-sheet.js";
import { createTensor } from "./tensor.js";

export const RIXCEL_FORMAT = "rixcel";
export const RIXCEL_VERSION = 2;
export const RIXCEL_ASSIGNMENT_MODES = FORMULA_SHEET_ASSIGNMENT_MODES;

const ASSIGNMENT_MODES = new Set(RIXCEL_ASSIGNMENT_MODES);
const EVENT_TYPES = new Set(["slot:set", "view:axis-label"]);
const DOCUMENT_VIEW_KEYS = Object.freeze([
    "title",
    "axes",
    "axisLabels",
    "viewAxes",
    "slice",
    "columnLabels",
    "address",
]);

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
    if (typeof value !== "object") fail(path, `contains unsupported ${typeof value} value`);
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
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [
            key,
            jsonClone(item, `${path}.${key}`, seen),
        ]));
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
    if (!Array.isArray(value) || value.length === 0) fail("$.shape", "must be a non-empty array");
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

function eventId(id, sequence) {
    return `${id}:event:${sequence}`;
}

function linearOffset(index, shape) {
    let offset = 0;
    for (let axis = 0; axis < shape.length; axis += 1) {
        offset = offset * shape[axis] + index[axis] - 1;
    }
    return offset;
}

function indexFromOffset(offset, shape) {
    const index = Array(shape.length);
    for (let axis = shape.length - 1; axis >= 0; axis -= 1) {
        index[axis] = (offset % shape[axis]) + 1;
        offset = Math.floor(offset / shape[axis]);
    }
    return index;
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

function normalizeDocumentView(value, path, shape) {
    const view = normalizeView(value, path);
    const entries = Object.entries(view);
    for (const canonical of DOCUMENT_VIEW_KEYS) {
        const matches = entries.filter(([key]) => key.toLowerCase() === canonical.toLowerCase());
        if (matches.length > 1) fail(path, `contains duplicate case variants for ${canonical}`);
        if (matches.length === 1 && matches[0][0] !== canonical) {
            delete view[matches[0][0]];
            view[canonical] = matches[0][1];
        }
    }
    if (view.title !== undefined && typeof view.title !== "string") {
        fail(`${path}.title`, "must be a string");
    }
    if (view.address !== undefined && (typeof view.address !== "string" || view.address.length === 0)) {
        fail(`${path}.address`, "must be a non-empty string");
    }
    if (view.axes !== undefined) {
        if (!Array.isArray(view.axes) || view.axes.length !== shape.length) {
            fail(`${path}.axes`, `must contain exactly ${shape.length} names`);
        }
        view.axes.forEach((name, axis) => {
            if (typeof name !== "string" || name.length === 0) {
                fail(`${path}.axes[${axis}]`, "must be a non-empty string");
            }
        });
    }
    if (view.axisLabels !== undefined) {
        if (!Array.isArray(view.axisLabels) || view.axisLabels.length !== shape.length) {
            fail(`${path}.axisLabels`, `must contain exactly ${shape.length} axis entries`);
        }
        view.axisLabels.forEach((labels, axis) => {
            if (labels === null) return;
            if (!Array.isArray(labels) || labels.length !== shape[axis]) {
                fail(`${path}.axisLabels[${axis}]`, `must be null or contain exactly ${shape[axis]} labels`);
            }
            labels.forEach((label, index) => {
                if (label !== null && (typeof label !== "string" || label.length === 0)) {
                    fail(`${path}.axisLabels[${axis}][${index}]`, "must be null or a non-empty string");
                }
            });
        });
    }
    const defaultViewAxes = shape.length === 1 ? [1] : [1, 2];
    const viewAxes = view.viewAxes === undefined ? defaultViewAxes : view.viewAxes;
    const visibleCount = shape.length === 1 ? 1 : 2;
    if (
        !Array.isArray(viewAxes)
        || viewAxes.length !== visibleCount
        || viewAxes.some((axis) => !Number.isSafeInteger(axis) || axis < 1 || axis > shape.length)
        || new Set(viewAxes).size !== viewAxes.length
    ) {
        fail(`${path}.viewAxes`, `must contain ${visibleCount} distinct valid axis indices`);
    }
    if (view.slice !== undefined) {
        if (!Array.isArray(view.slice) || view.slice.length !== shape.length) {
            fail(`${path}.slice`, `must contain exactly ${shape.length} entries`);
        }
        const visible = new Set(viewAxes);
        view.slice.forEach((coordinate, axisIndex) => {
            const axis = axisIndex + 1;
            if (visible.has(axis)) {
                if (coordinate !== null) fail(`${path}.slice[${axisIndex}]`, "must be null for a visible axis");
            } else if (
                !Number.isSafeInteger(coordinate)
                || coordinate < 1
                || coordinate > shape[axisIndex]
            ) {
                fail(`${path}.slice[${axisIndex}]`, `must be an integer from 1 through ${shape[axisIndex]}`);
            }
        });
    }
    if (view.columnLabels !== undefined && !["dual", "letters", "numbers"].includes(view.columnLabels)) {
        fail(`${path}.columnLabels`, "must be dual, letters, or numbers");
    }
    return view;
}

function normalizeSlotDefinition(value, path, { defaultView = {} } = {}) {
    const slot = value === undefined ? {} : plainObject(value, path);
    const source = slot.source ?? "null";
    const assignmentMode = slot.assignmentMode ?? ":=";
    if (typeof source !== "string" || source.trim().length === 0) {
        fail(`${path}.source`, "must be a non-empty string");
    }
    if (!ASSIGNMENT_MODES.has(assignmentMode)) {
        fail(`${path}.assignmentMode`, `is not supported: ${assignmentMode}`);
    }
    return {
        source,
        assignmentMode,
        view: normalizeView(slot.view ?? defaultView, `${path}.view`),
    };
}

export function rixCelEventCommand(event, binding = "document") {
    if (event.type === "slot:set") {
        return `${binding}.SetSource(${event.index.join(", ")}, ${JSON.stringify(event.source)}, ${JSON.stringify(event.assignmentMode)})`;
    }
    if (event.type === "view:axis-label") {
        return `${binding}.SetAxisLabel(${event.axis}, ${event.coordinate}, ${JSON.stringify(event.label)})`;
    }
    throw new Error(`Unsupported RiXCel history event type: ${event.type}`);
}

function normalizeEvent(rawEvent, offset, id, shape) {
    const path = `$.events[${offset}]`;
    const event = plainObject(rawEvent, path);
    const sequence = offset + 1;
    const type = event.type;
    if (!EVENT_TYPES.has(type)) fail(`${path}.type`, `is not supported: ${type}`);
    const normalized = type === "slot:set"
        ? {
            id: eventId(id, sequence),
            sequence,
            type,
            index: normalizeIndex(event.index, shape, `${path}.index`),
            ...normalizeSlotDefinition(event, path),
          }
        : (() => {
            const axis = event.axis;
            const coordinate = event.coordinate;
            if (!Number.isSafeInteger(axis) || axis < 1 || axis > shape.length) {
                fail(`${path}.axis`, `must be an integer from 1 through ${shape.length}`);
            }
            if (!Number.isSafeInteger(coordinate) || coordinate < 1 || coordinate > shape[axis - 1]) {
                fail(`${path}.coordinate`, `must be an integer from 1 through ${shape[axis - 1]}`);
            }
            if (event.label !== null && (typeof event.label !== "string" || event.label.trim().length === 0)) {
                fail(`${path}.label`, "must be null or a non-empty string");
            }
            return { id: eventId(id, sequence), sequence, type, axis, coordinate, label: event.label };
          })();
    if (event.id !== undefined && event.id !== normalized.id) fail(`${path}.id`, `must equal "${normalized.id}"`);
    if (event.sequence !== undefined && event.sequence !== sequence) fail(`${path}.sequence`, `must equal ${sequence}`);
    const command = rixCelEventCommand(normalized);
    if (event.command !== undefined && event.command !== command) {
        fail(`${path}.command`, "must match the canonical RiX command");
    }
    return { ...normalized, command };
}

function normalizeDraft(rawDraft, offset, shape) {
    const path = `$.drafts[${offset}]`;
    const draft = plainObject(rawDraft, path);
    const index = normalizeIndex(draft.index, shape, `${path}.index`);
    const source = draft.source;
    const assignmentMode = draft.assignmentMode ?? ":=";
    if (typeof source !== "string" || source.trim().length === 0) fail(`${path}.source`, "must be a non-empty string");
    if (!ASSIGNMENT_MODES.has(assignmentMode)) fail(`${path}.assignmentMode`, `is not supported: ${assignmentMode}`);
    if (draft.kind !== undefined && !["parse", "cycle", "runtime"].includes(draft.kind)) {
        fail(`${path}.kind`, "must be parse, cycle, or runtime");
    }
    if (draft.message !== undefined && typeof draft.message !== "string") fail(`${path}.message`, "must be a string");
    const normalized = {
        index,
        source,
        assignmentMode,
        kind: draft.kind ?? "runtime",
        message: draft.message ?? "Formula edit has not committed",
    };
    return { ...normalized, command: rixCelEventCommand({ type: "slot:set", ...normalized }) };
}

function denseVersionOne(input) {
    const id = documentId(input.id);
    const { shape, size } = documentShape(input.shape);
    if (!Array.isArray(input.slots)) fail("$.slots", "must be an array");
    if (input.slots.length !== size) fail("$.slots", `must contain exactly ${size} dense slots`);
    const occupied = new Set();
    const slots = input.slots.map((rawSlot, offset) => {
        const path = `$.slots[${offset}]`;
        const slot = plainObject(rawSlot, path);
        const index = normalizeIndex(slot.index, shape, `${path}.index`);
        const key = indexKey(index);
        if (occupied.has(key)) fail(`${path}.index`, `duplicates coordinate [${index.join(",")}]`);
        occupied.add(key);
        const expectedId = slotId(id, index);
        if (slot.id !== expectedId) fail(`${path}.id`, `must equal "${expectedId}"`);
        return { id: expectedId, index, ...normalizeSlotDefinition(slot, path) };
    });
    slots.sort((left, right) => linearOffset(left.index, shape) - linearOffset(right.index, shape));
    return { id, shape, view: normalizeDocumentView(input.view, "$.view", shape), slots };
}

function draftToVersionOne(document) {
    const input = plainObject(document, "$");
    const format = input.format ?? input.kind;
    if (format !== RIXCEL_FORMAT) fail("$.format", `must equal "${RIXCEL_FORMAT}"`);
    if (!Array.isArray(input.slots)) fail("$.slots", "must be an array");
    const id = documentId(input.id);
    return {
        format: RIXCEL_FORMAT,
        version: 1,
        id,
        shape: input.shape,
        view: input.view ?? {},
        slots: input.slots.map((rawSlot, offset) => {
            const slot = plainObject(rawSlot, `$.slots[${offset}]`);
            return {
                id: slot.id ?? (Array.isArray(slot.index) ? slotId(id, slot.index) : undefined),
                index: slot.index,
                source: slot.source ?? slot.code,
                assignmentMode: slot.assignmentMode ?? slot.op ?? ":=",
                view: slot.view ?? slot.style ?? {},
            };
        }),
    };
}

function versionOneToVersionTwo(input) {
    const dense = denseVersionOne(input);
    const defaultSlot = normalizeSlotDefinition(undefined, "$.defaultSlot");
    const events = dense.slots
        .filter((slot) => JSON.stringify({ source: slot.source, assignmentMode: slot.assignmentMode, view: slot.view })
            !== JSON.stringify(defaultSlot))
        .map((slot, offset) => normalizeEvent({
            type: "slot:set",
            index: slot.index,
            source: slot.source,
            assignmentMode: slot.assignmentMode,
            view: slot.view,
        }, offset, dense.id, dense.shape));
    return {
        format: RIXCEL_FORMAT,
        version: RIXCEL_VERSION,
        id: dense.id,
        shape: dense.shape,
        view: dense.view,
        defaultSlot,
        events,
        cursor: events.length,
        drafts: [],
    };
}

/** Parse, migrate, validate, and canonicalize a sparse, replayable RiXCel document. */
export function parseRixCelDocument(value) {
    let input = plainObject(documentInput(value), "$");
    if (input.version === undefined || input.version === 0) input = draftToVersionOne(input);
    if (input.format !== RIXCEL_FORMAT) fail("$.format", `must equal "${RIXCEL_FORMAT}"`);
    if (!Number.isSafeInteger(input.version)) fail("$.version", "must be an integer");
    if (input.version > RIXCEL_VERSION) {
        throw new Error(`Unsupported RiXCel document version ${input.version}; this runtime supports through version ${RIXCEL_VERSION}`);
    }
    if (input.version === 1) return versionOneToVersionTwo(input);
    if (input.version !== RIXCEL_VERSION) fail("$.version", `must equal ${RIXCEL_VERSION}`);

    const id = documentId(input.id);
    const { shape } = documentShape(input.shape);
    const view = normalizeDocumentView(input.view, "$.view", shape);
    const defaultSlot = normalizeSlotDefinition(input.defaultSlot, "$.defaultSlot");
    if (!Array.isArray(input.events)) fail("$.events", "must be an array");
    const events = input.events.map((event, offset) => normalizeEvent(event, offset, id, shape));
    const cursor = input.cursor ?? events.length;
    if (!Number.isSafeInteger(cursor) || cursor < 0 || cursor > events.length) {
        fail("$.cursor", `must be an integer from 0 through ${events.length}`);
    }
    const draftsInput = input.drafts ?? [];
    if (!Array.isArray(draftsInput)) fail("$.drafts", "must be an array");
    const drafts = draftsInput.map((draft, offset) => normalizeDraft(draft, offset, shape));
    const draftCoordinates = new Set();
    for (const [offset, draft] of drafts.entries()) {
        const key = indexKey(draft.index);
        if (draftCoordinates.has(key)) fail(`$.drafts[${offset}].index`, "duplicates a draft coordinate");
        draftCoordinates.add(key);
    }
    return { format: RIXCEL_FORMAT, version: RIXCEL_VERSION, id, shape, view, defaultSlot, events, cursor, drafts };
}

export function createRixCelDocument(options = {}) {
    const shape = options.shape ?? [20, 8];
    return parseRixCelDocument({
        format: RIXCEL_FORMAT,
        version: RIXCEL_VERSION,
        id: options.id ?? "untitled",
        shape,
        view: options.view ?? {},
        defaultSlot: options.defaultSlot ?? { source: "null", assignmentMode: ":=", view: { blank: true } },
        events: [],
        cursor: 0,
        drafts: [],
    });
}

export function appendRixCelEvent(value, event) {
    const document = parseRixCelDocument(value);
    const events = [...document.events.slice(0, document.cursor), event];
    return parseRixCelDocument({ ...document, events, cursor: events.length, drafts: document.drafts });
}

export function setRixCelCursor(value, cursor) {
    const document = parseRixCelDocument(value);
    return parseRixCelDocument({ ...document, cursor });
}

export function setRixCelDraft(value, draft = null) {
    const document = parseRixCelDocument(value);
    if (draft === null) return parseRixCelDocument({ ...document, drafts: [] });
    const normalized = normalizeDraft(draft, 0, document.shape);
    const key = indexKey(normalized.index);
    const drafts = document.drafts.filter((item) => indexKey(item.index) !== key);
    drafts.push(normalized);
    return parseRixCelDocument({ ...document, drafts });
}

export function clearRixCelDraft(value, index) {
    const document = parseRixCelDocument(value);
    const normalized = normalizeIndex(index, document.shape, "$.draft.index");
    const key = indexKey(normalized);
    return parseRixCelDocument({
        ...document,
        drafts: document.drafts.filter((item) => indexKey(item.index) !== key),
    });
}

/** Materialize the active event prefix for compatibility with the dense FormulaSheet runtime. */
export function materializeRixCelDocument(value) {
    const document = parseRixCelDocument(value);
    const { size } = documentShape(document.shape);
    const slots = Array.from({ length: size }, (_unused, offset) => {
        const index = indexFromOffset(offset, document.shape);
        return {
            id: slotId(document.id, index),
            index,
            source: document.defaultSlot.source,
            assignmentMode: document.defaultSlot.assignmentMode,
            view: jsonClone(document.defaultSlot.view, "$.defaultSlot.view"),
        };
    });
    const byIndex = new Map(slots.map((slot) => [indexKey(slot.index), slot]));
    let view = jsonClone(document.view, "$.view");
    for (const event of document.events.slice(0, document.cursor)) {
        if (event.type === "slot:set") {
            const slot = byIndex.get(indexKey(event.index));
            slot.source = event.source;
            slot.assignmentMode = event.assignmentMode;
            slot.view = jsonClone(event.view, `$.events[${event.sequence - 1}].view`);
        } else if (event.type === "view:axis-label") {
            const labels = Array.from({ length: document.shape.length }, (_unused, axis) => {
                const existing = view.axisLabels?.[axis];
                return existing === null || existing === undefined
                    ? Array(document.shape[axis]).fill(null)
                    : [...existing];
            });
            labels[event.axis - 1][event.coordinate - 1] = event.label;
            view = { ...view, axisLabels: labels.map((axisLabels) => axisLabels.every((label) => label === null) ? null : axisLabels) };
        }
    }
    return { ...document, view: normalizeDocumentView(view, "$.view", document.shape), slots };
}

/** Export current sheet state as a sparse event log. Runtime caches are never persisted. */
export function exportRixCelDocument(sheet) {
    if (!isFormulaSheet(sheet)) throw new Error("RiXCel export requires a FormulaSheet");
    let document = createRixCelDocument({
        id: sheet.id,
        shape: [...sheet.shape],
        view: jsonClone(sheet.documentView ?? {}, "$.view"),
        defaultSlot: { source: "null", assignmentMode: ":=", view: {} },
    });
    const visit = (axis, index) => {
        if (axis === sheet.shape.length) {
            const slot = sheet.slot(index);
            if (typeof slot.source !== "string") throw new Error(`RiXCel export requires source for grid[${index.join(",")}]`);
            const current = { source: slot.source, assignmentMode: slot.assignmentMode, view: slot.view ?? {} };
            if (JSON.stringify(current) !== JSON.stringify(document.defaultSlot)) {
                document = appendRixCelEvent(document, { type: "slot:set", index: [...index], ...current });
            }
            return;
        }
        for (let coordinate = 1; coordinate <= sheet.shape[axis]; coordinate += 1) {
            visit(axis + 1, [...index, coordinate]);
        }
    };
    visit(0, []);
    return document;
}

export function stringifyRixCelDocument(value, options = {}) {
    const document = isFormulaSheet(value) ? exportRixCelDocument(value) : parseRixCelDocument(value);
    const space = options.space ?? 2;
    if (!Number.isInteger(space) || space < 0 || space > 10) {
        throw new Error("RiXCel JSON indentation must be an integer from 0 through 10");
    }
    return JSON.stringify(document, null, space);
}

/** Rebuild a dense FormulaSheet compatibility view from the sparse event log. */
export function importRixCelDocument(value, options = {}) {
    const document = materializeRixCelDocument(value);
    if (typeof options.compileFormula !== "function") throw new Error("RiXCel import requires a formula compiler");
    if (typeof options.runFormula !== "function") throw new Error("RiXCel import requires a deferred formula evaluator");
    const formulas = document.slots.map((slot) => {
        try {
            return options.compileFormula(slot.source);
        } catch (error) {
            throw new Error(`RiXCel source for grid[${slot.index.join(",")}] did not compile: ${error.message}`);
        }
    });
    const slotMetadata = new Map(document.slots.map((slot) => [indexKey(slot.index), {
        id: slot.id,
        source: slot.source,
        assignmentMode: slot.assignmentMode,
        view: slot.view,
    }]));
    return createFormulaSheet(createTensor(document.shape, formulas), {
        ...options,
        id: document.id,
        documentView: document.view,
        slotMetadata,
    });
}
