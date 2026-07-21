/**
 * Bundled first-party draw plugin.
 *
 * `.draw` is deliberately only an ergonomic authoring layer. Every helper below
 * returns an intrinsic Graphics node, so SVG, terminal, PDF, and future
 * renderers never need to understand this plugin's own value types.
 */

import { createCircle, createPath, createRectangle, createTextMark } from "../runtime/output.js";
import { Integer } from "@ratmath/core";

function entriesFor(args, positional, name) {
    if (args.length === 1 && args[0]?.type === "map" && args[0].entries instanceof Map) return args[0].entries;
    if (args.length > positional.length) throw new Error(`${name} received too many arguments`);
    return new Map(positional.slice(0, args.length).map((key, index) => [key, args[index]]));
}

function get(entries, name, fallback = null) {
    return entries.has(name) ? entries.get(name) : entries.get(name.toLowerCase()) ?? fallback;
}

function mergedStyle(style, additions) {
    const entries = style?.type === "map" && style.entries instanceof Map ? style.entries : new Map();
    return { type: "map", entries: new Map([...entries, ...additions]) };
}

function line(args) {
    const entries = entriesFor(args, ["from", "to", "style"], "draw.Line");
    return createPath([[get(entries, "from"), get(entries, "to")], get(entries, "style")]);
}

function polygon(args) {
    const entries = entriesFor(args, ["points", "style"], "draw.Polygon");
    return createPath([get(entries, "points"), mergedStyle(get(entries, "style"), [["closed", true]])]);
}

function label(args) {
    const entries = entriesFor(args, ["position", "text", "style"], "draw.Label");
    return createTextMark([get(entries, "position"), get(entries, "text"), get(entries, "style")]);
}

function box(args) {
    const entries = entriesFor(args, ["origin", "size", "style"], "draw.Box");
    return createRectangle([get(entries, "origin"), get(entries, "size"), get(entries, "style")]);
}

function circle(args) {
    const entries = entriesFor(args, ["center", "radius", "style"], "draw.Circle");
    return createCircle([get(entries, "center"), get(entries, "radius"), get(entries, "style")]);
}

export function createDrawPluginCollection() {
    const methods = new Map([["Line", line], ["Polygon", polygon], ["Label", label], ["Box", box], ["Circle", circle]]);
    const entries = new Map();
    const extension = new Map([["immutable", new Integer(1n)]]);
    for (const [name, helper] of methods) {
        entries.set(name, helper);
        entries.set(name.toUpperCase(), helper);
        extension.set(name.toUpperCase(), {
            type: "method_builtin",
            name,
            impl: (args) => helper(args.slice(1)),
        });
    }
    return { type: "map", entries, _ext: extension };
}

export function installDrawPlugin(systemContext) {
    const draw = createDrawPluginCollection();
    systemContext.registerHostValue("draw", draw, { doc: "Convenient authoring helpers that produce intrinsic Graphics nodes" });
    return draw;
}
