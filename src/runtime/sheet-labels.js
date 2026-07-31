/** Shared rank-N coordinate-label resolution for Sheet and FormulaSheet. */

import { Integer, Rational } from "@ratmath/core";

function text(value) {
    return value?.type === "string" ? value.value : typeof value === "string" ? value : null;
}

function exactInteger(value) {
    if (value instanceof Integer) return Number(value.value);
    if (value instanceof Rational && value.denominator === 1n) return Number(value.numerator);
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "bigint") return Number(value);
    return null;
}

function entries(value, label) {
    if (value?.type === "map" && value.entries instanceof Map) return [...value.entries];
    if (value instanceof Map) return [...value];
    if (value && typeof value === "object" && !Array.isArray(value)) return Object.entries(value);
    throw new Error(`${label} must be a map keyed by axis name`);
}

function axisIndexForKey(key, axes, label) {
    const requested = text(key) ?? (typeof key === "string" ? key : null);
    if (requested === null) throw new Error(`${label} axis keys must be strings`);
    const exact = axes
        .map((name, index) => name === requested ? index : -1)
        .filter((index) => index >= 0);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) throw new Error(`${label} axis name is ambiguous: ${requested}`);
    const folded = requested.toLocaleLowerCase();
    const insensitive = axes
        .map((name, index) => name.toLocaleLowerCase() === folded ? index : -1)
        .filter((index) => index >= 0);
    if (insensitive.length === 1) return insensitive[0];
    if (insensitive.length > 1) throw new Error(`${label} axis name is ambiguous: ${requested}`);
    throw new Error(`${label} has no axis named ${requested}`);
}

function coordinateForValue(value, axis, shape, axes, axisLabels, label) {
    const numeric = exactInteger(value);
    if (numeric !== null) {
        if (numeric < 1 || numeric > shape[axis]) {
            throw new Error(
                `${label} coordinate ${numeric} is out of range for ${axes[axis]} (1..${shape[axis]})`,
            );
        }
        return numeric;
    }
    const requested = text(value);
    if (requested === null) {
        throw new Error(`${label} coordinate for ${axes[axis]} must be an integer or label string`);
    }
    const labels = axisLabels[axis];
    if (!labels) throw new Error(`${label} axis ${axes[axis]} has no coordinate labels`);
    const exact = labels
        .map((name, index) => name !== null && name === requested ? index + 1 : -1)
        .filter((index) => index >= 1);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) {
        throw new Error(`${label} coordinate label is ambiguous on ${axes[axis]}: ${requested}`);
    }
    const folded = requested.toLocaleLowerCase();
    const insensitive = labels
        .map((name, index) =>
            typeof name === "string" && name.toLocaleLowerCase() === folded ? index + 1 : -1)
        .filter((index) => index >= 1);
    if (insensitive.length === 1) return insensitive[0];
    if (insensitive.length > 1) {
        throw new Error(`${label} coordinate label is ambiguous on ${axes[axis]}: ${requested}`);
    }
    throw new Error(`${label} axis ${axes[axis]} has no coordinate labeled ${requested}`);
}

export function labelSchema(shape, view = {}) {
    const field = (name) => {
        if (Object.hasOwn(view, name)) return view[name];
        const canonical = name.toLocaleLowerCase();
        const match = Object.entries(view).find(([key]) => key.toLocaleLowerCase() === canonical);
        return match?.[1];
    };
    const requestedAxes = field("axes");
    const requestedLabels = field("axisLabels");
    const axes = Array.isArray(requestedAxes) && requestedAxes.length === shape.length
        ? [...requestedAxes]
        : shape.map((_length, index) => `axis${index + 1}`);
    const axisLabels = Array.isArray(requestedLabels) && requestedLabels.length === shape.length
        ? requestedLabels.map((labels) => labels === null ? null : [...labels])
        : shape.map(() => null);
    return { axes, axisLabels };
}

/** Resolve a complete coordinate map such as {region: "South", scenario: "Forecast"}. */
export function resolveLabeledCoordinate(shape, view, selector, label = "Sheet lookup") {
    const { axes, axisLabels } = labelSchema(shape, view);
    const coordinate = Array(shape.length).fill(null);
    for (const [key, value] of entries(selector, label)) {
        const axis = axisIndexForKey(key, axes, label);
        if (coordinate[axis] !== null) {
            throw new Error(`${label} repeats axis ${axes[axis]}`);
        }
        coordinate[axis] = coordinateForValue(value, axis, shape, axes, axisLabels, label);
    }
    const missing = coordinate
        .map((value, axis) => value === null ? axes[axis] : null)
        .filter(Boolean);
    if (missing.length) throw new Error(`${label} is missing ${missing.join(", ")}`);
    return Object.freeze(coordinate);
}

export function coordinateTuple(index) {
    return {
        type: "tuple",
        values: index.map((item) => new Integer(BigInt(item))),
    };
}
