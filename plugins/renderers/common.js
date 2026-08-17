/** Shared helpers for first-party renderer plugins. Browser-safe. */

import { Integer, Rational } from "@ratmath/core";
import {
    UnsupportedRenderError,
    createRendererPluginCollection,
} from "../../src/runtime/renderer-registry.js";

export function outputKind(value) {
    const type = rixString(field(value, "type"));
    const kind = rixString(field(value, "kind"));
    return type === "output" ? kind : type || value?.type || typeof value;
}

export function unwrapFigure(value) {
    return outputKind(value) === "figure"
        ? { value: value.content, figure: value }
        : { value, figure: null };
}

export function unwrapGraphic(value) {
    const { value: unwrapped, figure } = unwrapFigure(value);
    if (outputKind(unwrapped) !== "scene3d_snapshot") {
        return { value: unwrapped, figure, snapshot: null };
    }
    const graphic = field(unwrapped, "value");
    requireOutput(graphic, ["graphic"], "Scene3D snapshot");
    return { value: graphic, figure, snapshot: unwrapped };
}

export function plainValue(value) {
    if (value === null || value === undefined) return null;
    if (value instanceof Integer || value instanceof Rational) return String(value);
    if (value?.type === "string") return value.value;
    if (Array.isArray(value)) return value.map(plainValue);
    if (Array.isArray(value?.values)) return value.values.map(plainValue);
    const entries = mapEntries(value);
    if (entries) return Object.fromEntries([...entries].map(([key, entry]) => [String(key), plainValue(entry)]));
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    return null;
}

export function requireOutput(value, kinds, target) {
    const kind = outputKind(value);
    if (!kinds.includes(kind)) {
        throw new UnsupportedRenderError(`${target} accepts ${kinds.join(", ")}; received ${kind}`, { target });
    }
    return value;
}

export function rixString(value) {
    if (value?.type === "string") return value.value;
    return typeof value === "string" ? value : null;
}

export function sequence(value, label) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.values)) return value.values;
    throw new Error(`${label} must be a sequence`);
}

export function mapEntries(value) {
    if (value instanceof Map) return value;
    if (value?.type === "map" && value.entries instanceof Map) return value.entries;
    return null;
}

export function field(value, name, fallback = null) {
    const entries = mapEntries(value);
    if (entries) {
        if (entries.has(name)) return entries.get(name);
        const key = [...entries.keys()].find((candidate) => String(candidate).toLowerCase() === String(name).toLowerCase());
        return key === undefined ? fallback : entries.get(key);
    }
    if (value && typeof value === "object") {
        if (Object.hasOwn(value, name)) return value[name];
        const key = Object.keys(value).find((candidate) => candidate.toLowerCase() === String(name).toLowerCase());
        return key === undefined ? fallback : value[key];
    }
    return fallback;
}

export function option(options, name, fallback = null) {
    return field(options, name, fallback);
}

export function numberValue(value, label) {
    let result;
    if (value instanceof Integer) result = Number(value.value);
    else if (value instanceof Rational) {
        const numerator = value.numerator;
        if (numerator === 0n) result = 0;
        else {
            const sign = numerator < 0n ? -1 : 1;
            const absolute = numerator < 0n ? -numerator : numerator;
            const numeratorBits = absolute.toString(2).length;
            const denominatorBits = value.denominator.toString(2).length;
            const numeratorShift = Math.max(0, numeratorBits - 53);
            const denominatorShift = Math.max(0, denominatorBits - 53);
            result = sign
                * (Number(absolute >> BigInt(numeratorShift)) / Number(value.denominator >> BigInt(denominatorShift)))
                * (2 ** (numeratorShift - denominatorShift));
        }
    }
    else if (typeof value === "number") result = value;
    else if (typeof value === "bigint") result = Number(value);
    else throw new Error(`${label} must be numeric`);
    if (!Number.isFinite(result)) throw new Error(`${label} must be finite`);
    return result;
}

export function stableNumber(value, label = "coordinate") {
    return Number(numberValue(value, label).toFixed(6)).toString();
}

export function point(value, label) {
    const values = sequence(value, label);
    if (values.length !== 2) throw new Error(`${label} must contain two coordinates`);
    return values.map((entry, index) => numberValue(entry, `${label} ${index === 0 ? "x" : "y"}`));
}

export function styleValue(style, name, fallback = null) {
    return field(style, name, fallback);
}

export function boolValue(value) {
    if (value instanceof Integer) return value.value !== 0n;
    if (value instanceof Rational) return value.numerator !== 0n;
    return Boolean(value);
}

export function textValue(value, format) {
    return rixString(value) ?? format(value);
}

export function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
}

export function installRendererPlugin({
    systemContext,
    rendererRegistry,
    definition,
    mount = definition.target,
    metadata = null,
}) {
    if (!rendererRegistry) throw new Error(`Renderer '${definition.target}' requires a host renderer registry`);
    if (metadata?.targets?.length) {
        const declared = new Set(metadata.targets.map((target) => String(target).toLowerCase().replace(/^\./, "")));
        if (!declared.has(definition.target) && !declared.has(String(definition.mime).toLowerCase())) {
            throw new Error(`Renderer '${definition.target}' does not match its declared manifest targets`);
        }
    }
    const registered = rendererRegistry.register(definition);
    try {
        const collection = createRendererPluginCollection(rendererRegistry, registered.target);
        systemContext.registerHostValue(mount, collection, {
            doc: definition.description || `${registered.target} renderer`,
            groups: ["Renderers"],
        });
        return collection;
    } catch (error) {
        rendererRegistry.unregister(registered.target);
        throw error;
    }
}

export function diagnostic(code, message, level = "warning", path = null) {
    return { level, code, message, ...(path ? { path } : {}) };
}
