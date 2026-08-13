/**
 * Live RiX binding (lens) values.
 *
 * A Binding captures a Cell, not a variable name. Rebinding that name later
 * therefore cannot silently retarget an existing widget.
 */

import { Integer, Rational, RationalInterval } from "@ratmath/core";
import { isShaped, shapedAssignBySelectors, shapedGetBySelectors } from "./shaped.js";

const cellIds = new WeakMap();
let nextCellId = 1;

function cellId(cell) {
    if (!cellIds.has(cell)) cellIds.set(cell, `binding-${nextCellId++}`);
    return cellIds.get(cell);
}

function integer(value, label = "Binding index") {
    if (value instanceof Integer) return Number(value.value);
    if (value instanceof Rational && value.denominator === 1n) return Number(value.numerator);
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "bigint") return Number(value);
    throw new Error(`${label} must be an integer`);
}

function interval(value) {
    if (value instanceof RationalInterval) return { start: value.start, end: value.end };
    if (value?.type === "interval") return { start: value.lo ?? value.start, end: value.hi ?? value.end };
    return null;
}

function selector(value) {
    const range = interval(value);
    return range
        ? { kind: "slice", start: range.start, end: range.end }
        : { kind: "index", value };
}

function selectorLabel(item) {
    if (item.kind === "full") return "_";
    if (item.kind === "slice") return `${item.start}:${item.end}`;
    return String(integer(item.value));
}

function indexInto(value, selectors) {
    if (selectors.length === 0) return value;
    if (isShaped(value)) return shapedGetBySelectors(value, selectors);

    let current = value;
    for (const item of selectors) {
        if (item.kind !== "index") {
            throw new Error("Slice bindings currently require shaped data");
        }
        const index = integer(item.value);
        if (current?.type === "matrix" && Array.isArray(current.rows)) {
            current = current.rows[index - 1];
        } else if (current && ["sequence", "tuple", "array"].includes(current.type)) {
            current = (current.values || current.elements)[index - 1];
        } else if (Array.isArray(current)) {
            current = current[index - 1];
        } else {
            throw new Error(`Cannot index a Binding through "${current?.type || typeof current}"`);
        }
    }
    return current;
}

function setInto(root, selectors, value) {
    if (selectors.length === 0) return value;
    if (isShaped(root)) {
        shapedAssignBySelectors(root, selectors, value);
        return root;
    }

    const parent = indexInto(root, selectors.slice(0, -1));
    const final = selectors.at(-1);
    if (final.kind !== "index") throw new Error("Slice assignment currently requires shaped data");
    const index = integer(final.value);
    if (parent?.type === "matrix" && Array.isArray(parent.rows)) {
        parent.rows[index - 1] = value;
    } else if (parent && ["sequence", "tuple", "array"].includes(parent.type)) {
        (parent.values || parent.elements)[index - 1] = value;
    } else if (Array.isArray(parent)) {
        parent[index - 1] = value;
    } else {
        throw new Error(`Cannot set a Binding index on "${parent?.type || typeof parent}"`);
    }
    return root;
}

function bindingMethods() {
    return new Map([
        ["GET", {
            type: "method_builtin",
            name: "Get",
            impl: ([target]) => target.get(),
        }],
        ["SET", {
            type: "method_builtin",
            name: "Set",
            impl: ([target, value]) => target.set(value),
        }],
        ["AT", {
            type: "method_builtin",
            name: "At",
            impl: ([target, ...indices]) => target.at(...indices),
        }],
        ["SLICE", {
            type: "method_builtin",
            name: "Slice",
            impl: ([target, ...ranges]) => target.slice(...ranges),
        }],
        ["immutable", new Integer(1n)],
    ]);
}

export function isBinding(value) {
    return Boolean(value && value.type === "binding" && value.cell && typeof value.get === "function");
}

/**
 * Create a live lens over a runtime Cell.
 *
 * Sub-bindings share the same notification channel and retain the root Cell.
 */
export function createBinding(cell, options = {}) {
    if (!cell || typeof cell !== "object" || !Object.prototype.hasOwnProperty.call(cell, "value")) {
        throw new Error("Binding requires a RiX Cell");
    }
    const path = Object.freeze([...(options.path || [])]);
    const channel = options.channel || new Set();
    const rootId = options.rootId || cellId(cell);
    const name = options.name || null;
    const id = path.length
        ? `${rootId}[${path.map(selectorLabel).join(",")}]`
        : rootId;

    const binding = {
        type: "binding",
        id,
        rootId,
        name,
        cell,
        path,
        get() {
            return indexInto(cell.value, path);
        },
        set(value, metadata = null) {
            const previous = binding.get();
            if (path.length === 0) cell.value = value;
            else setInto(cell.value, path, value);
            const event = Object.freeze({
                type: "binding:set",
                binding,
                path,
                previous,
                value,
                metadata,
            });
            for (const listener of [...channel]) listener(event);
            return value;
        },
        at(...indices) {
            if (indices.length === 0) throw new Error("Binding.At requires at least one index");
            return createBinding(cell, {
                channel,
                rootId,
                name,
                path: [...path, ...indices.map(selector)],
            });
        },
        slice(...ranges) {
            if (ranges.length === 0) throw new Error("Binding.Slice requires at least one selector");
            return createBinding(cell, {
                channel,
                rootId,
                name,
                path: [...path, ...ranges.map(selector)],
            });
        },
        subscribe(listener) {
            if (typeof listener !== "function") throw new Error("Binding subscriber must be a function");
            channel.add(listener);
            return () => channel.delete(listener);
        },
        _ext: bindingMethods(),
        toString() {
            const suffix = path.length ? `[${path.map(selectorLabel).join(",")}]` : "";
            return `[Binding ${name || rootId}${suffix}]`;
        },
    };
    return Object.freeze(binding);
}

