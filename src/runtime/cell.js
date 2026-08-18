/**
 * Cell helpers for RiX assignment semantics.
 *
 * A variable names a cell. A cell is a mutable box (Cell object) containing
 * a value. Meta is stored on the value object via `_ext` (a Map).
 *
 * Cells enable true aliasing: `b = a` makes b and a share the same Cell
 * object. `a ~= newValue` mutates the Cell in-place (both see the change).
 * `a = expr` creates a new Cell for a without affecting b's Cell.
 *
 * Meta keys are classified by prefix:
 *   - ordinary:  no leading underscore  (e.g. "key", "lock", "frozen", "immutable")
 *   - ephemeral: single underscore      (e.g. "_mutable", "_spec", "_deriv")
 *   - sticky:    double underscore       (e.g. "__units")
 *
 * Cell-level protection (ordinary meta — survives ~=, governs replacement):
 *   .lock       blocks ~=/~~= value replacement; allows meta edits and index mutation
 *   .frozen     blocks ~=/~~= replacement and ordinary meta edits
 *   .immutable  like frozen but permanent
 *
 * Value-level mutability (ephemeral meta — replaced wholesale under ~=):
 *   ._mutable   if truthy, composite value (array/map) may be mutated in place;
 *               arrays/maps created by literals default to ._mutable=1
 *
 * Assignment operators differ in how they handle value and meta:
 *   =    alias/rebind — share the same Cell (variable rhs) or fresh Cell (expr rhs)
 *   :=   fresh copy   — shallow-copy value + all meta into new Cell
 *   ~=   in-place     — replace value inside Cell, preserve ordinary meta,
 *                        replace ephemeral wholesale, preserve sticky unless rhs overrides
 *   ::=  deep copy    — like := but deep
 *   ~~=  deep update  — like ~= but deep copies
 */

// ─── Cell ─────────────────────────────────────────────────────────────

/**
 * A mutable value box. All scope bindings store Cell objects so that
 * aliasing (`b = a`) shares a single Cell and `~=` can mutate in-place.
 */
export class Cell {
    constructor(value) {
        this.value = value;
    }
}

import { CertifiedApproximation, Integer, Rational, RationalInterval, RationalIntervalSet } from "@ratmath/core";
import { UndecidedDiagnostic, isUndecided } from "./decision.js";
import { isShaped, computeDefaultStrides } from "./shaped.js";
import { cloneLazySequence, isLazySequence } from "./lazy-sequence.js";

// ─── Meta key classification ─────────────────────────────────────────

/**
 * Classify a meta key by its prefix.
 * @param {string} name
 * @returns {"ordinary"|"ephemeral"|"sticky"}
 */
export function classifyMetaKey(name) {
    if (name.startsWith("__")) return "sticky";
    if (name.startsWith("_")) return "ephemeral";
    return "ordinary";
}

// ─── Shallow / deep value copy ───────────────────────────────────────

/**
 * Shallow-copy a RiX value. Returns a NEW object so that _ext can be
 * set independently from the source (critical for ~= meta transfer).
 * Numeric ratmath types (Integer, Rational, RationalInterval) get fresh
 * instances because they are used as plain objects but may carry _ext.
 * Collections get a new top-level container with the same element references.
 */
export function shallowCopyValue(value) {
    if (value == null) return value;
    if (typeof value !== "object") return value;
    if (value instanceof UndecidedDiagnostic) return value.copy();
    if (isUndecided(value)) return value;
    if (value instanceof CertifiedApproximation) return value.copy();

    // Ratmath numeric types — create fresh instances so _ext is independent
    if (value instanceof Integer) return new Integer(value.value);
    if (value instanceof Rational) return new Rational(value.numerator, value.denominator);
    if (value instanceof RationalInterval) {
        return new RationalInterval(
            new Rational(value.low.numerator, value.low.denominator),
            new Rational(value.high.numerator, value.high.denominator),
        );
    }
    if (value instanceof RationalIntervalSet) return new RationalIntervalSet(value);

    // String object — always creates a new plain object
    if (value.type === "string") return { type: "string", value: value.value };
    if (isLazySequence(value)) return cloneLazySequence(value);
    if (value.type === "iterator") {
        return {
            type: "iterator",
            source: value.source,
            cursor: value.cursor,
            _ext: value._ext ? new Map(value._ext) : undefined,
        };
    }

    // Sequence
    if (value.type === "sequence") {
        return {
            type: "sequence",
            values: [...value.values],
            _ext: value._ext ? new Map(value._ext) : undefined,
        };
    }

    // Tuple
    if (value.type === "tuple") {
        return {
            type: "tuple",
            values: [...value.values],
            _ext: value._ext ? new Map(value._ext) : undefined,
        };
    }

    // Map
    if (value.type === "map" && value.entries instanceof Map) {
        return {
            type: "map",
            entries: new Map(value.entries),
            _ext: value._ext ? new Map(value._ext) : undefined,
        };
    }

    if (value.type === "export_bundle" && value.entries instanceof Map) {
        return {
            type: "export_bundle",
            entries: new Map(value.entries),
            _ext: value._ext ? new Map(value._ext) : undefined,
        };
    }

    // Set
    if (value.type === "set") {
        return {
            type: "set",
            values: [...value.values],
            _ext: value._ext ? new Map(value._ext) : undefined,
        };
    }

    // Shaped
    if (isShaped(value)) {
        return {
            type: "shaped",
            data: [...value.data],
            shape: [...value.shape],
            strides: [...value.strides],
            offset: value.offset,
            _ext: value._ext ? new Map(value._ext) : undefined,
        };
    }

    if (value.type === "quantity") {
        return { ...value, _ext: value._ext ? new Map(value._ext) : undefined };
    }

    if (value.type === "unit_expr") {
        return { ...value, factors: new Map(value.factors), _ext: value._ext ? new Map(value._ext) : undefined };
    }

    if (value.type === "exact_expression") {
        return { ...value, terms: new Map(value.terms), _ext: value._ext ? new Map(value._ext) : undefined };
    }

    if (value.type === "cayley") {
        return { ...value, _ext: value._ext ? new Map(value._ext) : undefined };
    }

    // Function / lambda / other object — return same reference (immutable def)
    return value;
}

/**
 * Deep-copy a RiX value. Recursively copies nested collections while
 * preserving shared references and cycles within the copied value graph.
 *
 * @param {*} value
 * @param {WeakMap<object, *>} [memo]
 */
export function deepCopyValue(value, memo = new WeakMap()) {
    if (!(memo instanceof WeakMap)) memo = new WeakMap();
    if (value == null) return value;
    if (typeof value !== "object") return value;
    if (memo.has(value)) return memo.get(value);
    if (value instanceof UndecidedDiagnostic) {
        const copy = value.copy();
        memo.set(value, copy);
        return copy;
    }
    if (isUndecided(value)) return value;
    if (value instanceof CertifiedApproximation) {
        const copy = value.copy();
        memo.set(value, copy);
        return copy;
    }
    if (value instanceof Integer) {
        const copy = new Integer(value.value);
        memo.set(value, copy);
        return copy;
    }
    if (value instanceof Rational) {
        const copy = new Rational(value.numerator, value.denominator);
        memo.set(value, copy);
        return copy;
    }
    if (value instanceof RationalInterval) {
        const copy = new RationalInterval(
            new Rational(value.low.numerator, value.low.denominator),
            new Rational(value.high.numerator, value.high.denominator),
        );
        memo.set(value, copy);
        return copy;
    }
    if (value instanceof RationalIntervalSet) {
        const copy = new RationalIntervalSet(value);
        memo.set(value, copy);
        return copy;
    }

    if (value.type === "string") {
        const copy = { type: "string", value: value.value };
        memo.set(value, copy);
        return copy;
    }
    if (isLazySequence(value)) {
        const copy = cloneLazySequence(value, {
            restart: true,
            cloneValue: (child) => deepCopyValue(child, memo),
        });
        memo.set(value, copy);
        return copy;
    }
    if (value.type === "iterator") {
        const copy = {
            type: "iterator",
            source: undefined,
            cursor: value.cursor,
            _ext: undefined,
        };
        memo.set(value, copy);
        copy.source = deepCopyValue(value.source, memo);
        copy._ext = value._ext ? deepCopyMeta(value._ext, memo) : undefined;
        return copy;
    }

    if (value.type === "sequence") {
        const copy = {
            type: "sequence",
            values: [],
            _ext: undefined,
        };
        memo.set(value, copy);
        copy.values = value.values.map((child) => deepCopyValue(child, memo));
        copy._ext = value._ext ? deepCopyMeta(value._ext, memo) : undefined;
        return copy;
    }

    if (value.type === "tuple") {
        const copy = {
            type: "tuple",
            values: [],
            _ext: undefined,
        };
        memo.set(value, copy);
        copy.values = value.values.map((child) => deepCopyValue(child, memo));
        copy._ext = value._ext ? deepCopyMeta(value._ext, memo) : undefined;
        return copy;
    }

    if (value.type === "map" && value.entries instanceof Map) {
        const copy = {
            type: "map",
            entries: new Map(),
            _ext: undefined,
        };
        memo.set(value, copy);
        for (const [k, v] of value.entries) {
            copy.entries.set(k, deepCopyValue(v, memo));
        }
        copy._ext = value._ext ? deepCopyMeta(value._ext, memo) : undefined;
        return copy;
    }

    if (value.type === "export_bundle" && value.entries instanceof Map) {
        const copy = {
            type: "export_bundle",
            entries: new Map(),
            _ext: undefined,
        };
        memo.set(value, copy);
        for (const [k, v] of value.entries) {
            copy.entries.set(k, deepCopyCell(v, memo));
        }
        copy._ext = value._ext ? deepCopyMeta(value._ext, memo) : undefined;
        return copy;
    }

    if (value.type === "set") {
        const copy = {
            type: "set",
            values: [],
            _ext: undefined,
        };
        memo.set(value, copy);
        copy.values = value.values.map((child) => deepCopyValue(child, memo));
        copy._ext = value._ext ? deepCopyMeta(value._ext, memo) : undefined;
        return copy;
    }

    if (isShaped(value)) {
        const copy = {
            type: "shaped",
            data: [],
            shape: [...value.shape],
            strides: [...value.strides],
            offset: value.offset,
            _ext: undefined,
        };
        memo.set(value, copy);
        copy.data = value.data.map((child) => deepCopyValue(child, memo));
        copy._ext = value._ext ? deepCopyMeta(value._ext, memo) : undefined;
        return copy;
    }

    if (value.type === "quantity") {
        const copy = {
            ...value,
            baseMagnitude: undefined,
            displayUnit: undefined,
            _ext: undefined,
        };
        memo.set(value, copy);
        copy.baseMagnitude = deepCopyValue(value.baseMagnitude, memo);
        copy.displayUnit = deepCopyValue(value.displayUnit, memo);
        copy._ext = value._ext ? deepCopyMeta(value._ext, memo) : undefined;
        return copy;
    }

    if (value.type === "unit_expr") {
        const copy = {
            ...value,
            factors: new Map(value.factors),
            _ext: undefined,
        };
        memo.set(value, copy);
        copy._ext = value._ext ? deepCopyMeta(value._ext, memo) : undefined;
        return copy;
    }

    if (value.type === "exact_expression") {
        const copy = { ...value, terms: new Map(), _ext: undefined };
        memo.set(value, copy);
        for (const [key, term] of value.terms) {
            copy.terms.set(key, {
                powers: new Map(term.powers),
                coefficient: deepCopyValue(term.coefficient, memo),
            });
        }
        copy._ext = value._ext ? deepCopyMeta(value._ext, memo) : undefined;
        return copy;
    }

    if (value.type === "cayley") {
        const copy = {
            ...value,
            magnitude: undefined,
            direction: undefined,
            _ext: undefined,
        };
        memo.set(value, copy);
        copy.magnitude = deepCopyValue(value.magnitude, memo);
        copy.direction = deepCopyValue(value.direction, memo);
        copy._ext = value._ext ? deepCopyMeta(value._ext, memo) : undefined;
        return copy;
    }

    memo.set(value, value);
    return value;
}

// ─── Meta copy helpers ───────────────────────────────────────────────

/**
 * Deep-copy a meta Map, recursively deep-copying each meta value.
 */
function deepCopyMeta(meta, memo) {
    if (memo.has(meta)) return memo.get(meta);
    const result = new Map();
    memo.set(meta, result);
    for (const [key, val] of meta) {
        result.set(key, deepCopyValue(val, memo));
    }
    return result;
}

function deepCopyCell(cell, memo) {
    if (memo.has(cell)) return memo.get(cell);
    const result = new Cell(undefined);
    memo.set(cell, result);
    result.value = deepCopyValue(cell.value, memo);
    return result;
}

/**
 * Ensure a value object has a _ext Map. Returns the _ext Map.
 * Throws if value is not an object (cannot attach meta to primitives).
 * For primitives that need meta, caller should wrap them first.
 */
function ensureExt(obj) {
    if (!obj || typeof obj !== "object") {
        throw new Error(`Cannot attach meta properties to ${typeof obj}`);
    }
    if (!obj._ext) {
        obj._ext = new Map();
    }
    return obj._ext;
}

/**
 * Copy ALL meta from source value to target value.
 * Used by := (ASSIGN_COPY).
 * @param {*} source - source value with _ext
 * @param {*} target - target value to receive meta
 * @param {"shallow"|"deep"} depth
 */
export function copyAllMeta(source, target, depth) {
    const srcMeta = source?._ext;
    if (!srcMeta || srcMeta.size === 0) return;
    if (!target || typeof target !== "object") return;

    const tgtMeta = ensureExt(target);
    for (const [key, val] of srcMeta) {
        tgtMeta.set(key, depth === "deep" ? deepCopyValue(val) : val);
    }
}

/**
 * Transfer meta during in-place value replacement (~= / ~~=).
 *
 * Rules:
 *   ordinary meta → preserved from oldValue (NOT copied from rhs)
 *   ephemeral (_)  → replaced wholesale from rhsValue
 *   sticky (__)    → preserved from oldValue UNLESS rhsValue supplies the same key
 *
 * Special: lock/frozen/immutable are ordinary meta preserved from old.
 * Note: ._mutable is ephemeral — replaced wholesale from rhs under ~=.
 * If lhs is a new cell (oldValue is null), no old meta to preserve.
 *
 * @param {*} oldValue  - the value being replaced (may be null if new cell)
 * @param {*} newValue  - the new value to install (will receive meta)
 * @param {*} rhsValue  - the rhs value (source for ephemeral + sticky overrides)
 * @param {"shallow"|"deep"} depth
 */
export function transferMetaForUpdate(oldValue, newValue, rhsValue, depth) {
    if (!newValue || typeof newValue !== "object") return;

    // Capture meta refs BEFORE touching newValue._ext (guards against
    // newValue === rhsValue, which can happen for immutable ratmath types
    // that shallowCopyValue might still share in edge cases).
    const oldMeta = oldValue?._ext;
    const rhsMeta = rhsValue?._ext;

    if (!oldMeta && !rhsMeta) return;

    // Always create a FRESH meta map — never merge into newValue's existing _ext,
    // which might be shared with rhsValue.
    const tgtMeta = new Map();
    newValue._ext = tgtMeta;
    const copyVal = depth === "deep" ? deepCopyValue : (v) => v;

    // 1. Ordinary meta — preserve from old value
    if (oldMeta) {
        for (const [key, val] of oldMeta) {
            if (classifyMetaKey(key) === "ordinary") {
                tgtMeta.set(key, copyVal(val));
            }
        }
    }

    // 2. Sticky meta — preserve from old, overwrite if rhs supplies
    if (oldMeta) {
        for (const [key, val] of oldMeta) {
            if (classifyMetaKey(key) === "sticky") {
                tgtMeta.set(key, copyVal(val));
            }
        }
    }
    if (rhsMeta) {
        for (const [key, val] of rhsMeta) {
            if (classifyMetaKey(key) === "sticky") {
                tgtMeta.set(key, copyVal(val));
            }
        }
    }

    // 3. Ephemeral meta — replaced wholesale from rhs only
    if (rhsMeta) {
        for (const [key, val] of rhsMeta) {
            if (classifyMetaKey(key) === "ephemeral") {
                tgtMeta.set(key, copyVal(val));
            }
        }
    }
    // Old ephemeral is NOT copied — that's what "replaced wholesale" means
}
