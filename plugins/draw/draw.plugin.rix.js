/**
id: draw
description: Convenient 2D drawing helpers that produce core Graphics nodes.
kind: host
mount: draw
exports: [Line, Polyline, Polygon, Arrow, Arc, Ellipse, Dimension, Grid, Label, Box, Circle, Style, Viewport, ViewportPoint, Bounds, Anchor]
groups: [Draw]
permissions: []
defaultEnabled: false
**/

/**
 * Bundled first-party draw plugin.
 *
 * `.draw` is deliberately only an ergonomic authoring layer. Every helper below
 * returns an intrinsic Graphics node, so SVG, terminal, PDF, and future
 * renderers never need to understand this plugin's own value types.
 */

import {
    createCircle, createGroup, createPath, createRectangle, createTextMark,
} from "../../src/runtime/output.js";
import { Integer, Rational } from "@ratmath/core";

const int = (value) => new Integer(BigInt(value));
const string = (value) => ({ type: "string", value: String(value) });
const mapValue = (entries) => ({ type: "map", entries: new Map(entries) });
const arrayValue = (values) => ({ type: "sequence", values });

function sequence(value, label) {
    if (Array.isArray(value)) return value;
    if (value && ["array", "tuple", "sequence"].includes(value.type)) return value.values ?? value.elements;
    throw new Error(`${label} must be an array or tuple`);
}

function number(value, label) {
    if (value instanceof Integer || value instanceof Rational) return value.toNumber();
    if (typeof value === "number" && Number.isFinite(value)) return value;
    throw new Error(`${label} must be a finite number`);
}

function exact(value) {
    if (value instanceof Integer || value instanceof Rational) return value;
    if (!Number.isFinite(value)) throw new Error("Drawing coordinate must be finite");
    if (Number.isInteger(value)) return int(value);
    return new Rational(Number(value.toPrecision(14)).toString());
}

function point(value, label) {
    const coordinates = sequence(value, label);
    if (coordinates.length !== 2) throw new Error(`${label} must contain x and y coordinates`);
    return coordinates;
}

function pointNumbers(value, label) {
    return point(value, label).map((coordinate, index) => number(coordinate, `${label} ${index ? "y" : "x"}`));
}

function pointsValue(points) {
    return points.map(([x, y]) => [exact(x), exact(y)]);
}

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

function polyline(args) {
    const entries = entriesFor(args, ["points", "style"], "draw.Polyline");
    return createPath([get(entries, "points"), get(entries, "style")]);
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


function arrow(args) {
    const entries = entriesFor(args, ["from", "to", "style", "options"], "draw.Arrow");
    const from = pointNumbers(get(entries, "from"), "draw.Arrow from");
    const to = pointNumbers(get(entries, "to"), "draw.Arrow to");
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy);
    if (length === 0) throw new Error("draw.Arrow requires distinct endpoints");
    const options = get(entries, "options")?.type === "map" ? get(entries, "options").entries : new Map();
    const headLength = number(get(options, "headLength", int(10)), "draw.Arrow headLength");
    const headWidth = number(get(options, "headWidth", exact(headLength * 0.7)), "draw.Arrow headWidth");
    if (headLength <= 0 || headWidth <= 0) throw new Error("draw.Arrow head dimensions must be positive");
    const ux = dx / length;
    const uy = dy / length;
    const base = [to[0] - ux * headLength, to[1] - uy * headLength];
    const left = [base[0] - uy * headWidth / 2, base[1] + ux * headWidth / 2];
    const right = [base[0] + uy * headWidth / 2, base[1] - ux * headWidth / 2];
    const style = get(entries, "style");
    const headStyle = mergedStyle(style, [
        ["closed", true],
        ["fill", get(style?.entries ?? new Map(), "stroke", string("#111827"))],
    ]);
    return createGroup([[
        createPath([pointsValue([from, to]), style]),
        createPath([pointsValue([to, left, right]), headStyle]),
    ]]);
}

function sampledCurve(centerValue, rxValue, ryValue, startValue, endValue, samplesValue, style, name) {
    const [cx, cy] = pointNumbers(centerValue, `${name} center`);
    const rx = number(rxValue, `${name} x radius`);
    const ry = number(ryValue, `${name} y radius`);
    const start = number(startValue, `${name} start angle`);
    const end = number(endValue, `${name} end angle`);
    const samples = Number(number(samplesValue, `${name} samples`));
    if (rx <= 0 || ry <= 0) throw new Error(`${name} radii must be positive`);
    if (!Number.isInteger(samples) || samples < 2 || samples > 4096) throw new Error(`${name} samples must be an integer between 2 and 4096`);
    const radians = Math.PI / 180;
    const points = Array.from({ length: samples + 1 }, (_item, index) => {
        const angle = (start + (end - start) * index / samples) * radians;
        return [cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)];
    });
    return createPath([pointsValue(points), style]);
}

function arc(args) {
    const entries = entriesFor(args, ["center", "radius", "start", "end", "style", "samples"], "draw.Arc");
    const radius = get(entries, "radius");
    return sampledCurve(
        get(entries, "center"), radius, radius,
        get(entries, "start"), get(entries, "end"), get(entries, "samples", int(48)),
        get(entries, "style"), "draw.Arc",
    );
}

function ellipse(args) {
    const entries = entriesFor(args, ["center", "radii", "style", "samples"], "draw.Ellipse");
    const radii = point(get(entries, "radii"), "draw.Ellipse radii");
    return sampledCurve(
        get(entries, "center"), radii[0], radii[1], int(0), int(360),
        get(entries, "samples", int(72)), mergedStyle(get(entries, "style"), [["closed", true]]),
        "draw.Ellipse",
    );
}

function dimension(args) {
    const entries = entriesFor(args, ["from", "to", "text", "style", "options"], "draw.Dimension");
    const from = pointNumbers(get(entries, "from"), "draw.Dimension from");
    const to = pointNumbers(get(entries, "to"), "draw.Dimension to");
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const length = Math.hypot(dx, dy);
    if (length === 0) throw new Error("draw.Dimension requires distinct endpoints");
    const options = get(entries, "options")?.type === "map" ? get(entries, "options").entries : new Map();
    const offset = number(get(options, "offset", int(14)), "draw.Dimension offset");
    const nx = -dy / length;
    const ny = dx / length;
    const first = [from[0] + nx * offset, from[1] + ny * offset];
    const second = [to[0] + nx * offset, to[1] + ny * offset];
    const style = get(entries, "style");
    const textValue = get(entries, "text", string(Number(length.toPrecision(6))));
    const arrowOptions = mapValue([["headLength", int(7)], ["headWidth", int(5)]]);
    return createGroup([[
        createPath([pointsValue([from, first]), style]),
        createPath([pointsValue([to, second]), style]),
        arrow([pointsValue([first])[0], pointsValue([second])[0], style, arrowOptions]),
        arrow([pointsValue([second])[0], pointsValue([first])[0], style, arrowOptions]),
        createTextMark([pointsValue([[(first[0] + second[0]) / 2 + nx * 6, (first[1] + second[1]) / 2 + ny * 6]])[0], textValue,
            mapValue([["anchor", string("middle")], ["size", int(13)]])]),
    ]]);
}

function grid(args) {
    const entries = entriesFor(args, ["origin", "size", "step", "style"], "draw.Grid");
    const [x, y] = pointNumbers(get(entries, "origin"), "draw.Grid origin");
    const [width, height] = pointNumbers(get(entries, "size"), "draw.Grid size");
    const stepValue = get(entries, "step", int(10));
    const [sx, sy] = (stepValue && ["array", "tuple", "sequence"].includes(stepValue.type)) || Array.isArray(stepValue)
        ? pointNumbers(stepValue, "draw.Grid step")
        : [number(stepValue, "draw.Grid step"), number(stepValue, "draw.Grid step")];
    if (width <= 0 || height <= 0 || sx <= 0 || sy <= 0) throw new Error("draw.Grid size and step must be positive");
    if (Math.ceil(width / sx) + Math.ceil(height / sy) > 10000) throw new Error("draw.Grid contains too many lines");
    const style = get(entries, "style");
    const children = [];
    for (let offset = 0; offset <= width + 1e-12; offset += sx) children.push(createPath([pointsValue([[x + offset, y], [x + offset, y + height]]), style]));
    for (let offset = 0; offset <= height + 1e-12; offset += sy) children.push(createPath([pointsValue([[x, y + offset], [x + width, y + offset]]), style]));
    return createGroup([children]);
}

function style(args) {
    const entries = entriesFor(args, ["base", "overrides"], "draw.Style");
    const base = get(entries, "base", mapValue([]));
    const overrides = get(entries, "overrides", mapValue([]));
    if (base?.type !== "map" || overrides?.type !== "map") throw new Error("draw.Style arguments must be maps");
    return mapValue([...base.entries, ...overrides.entries]);
}

function viewportPoint(pointValue, viewport) {
    const entries = viewport?.type === "map" ? viewport.entries : viewport;
    const domain = sequence(get(entries, "domain"), "draw.Viewport domain").map((value, index) => number(value, `draw.Viewport domain ${index + 1}`));
    const size = pointNumbers(get(entries, "size"), "draw.Viewport size");
    const margin = number(get(entries, "margin", int(0)), "draw.Viewport margin");
    if (domain.length !== 4 || !(domain[2] > domain[0]) || !(domain[3] > domain[1])) throw new Error("draw.Viewport domain must be [xmin,ymin,xmax,ymax]");
    if (size.some((value) => value <= margin * 2)) throw new Error("draw.Viewport size must exceed twice its margin");
    const [x, y] = pointNumbers(pointValue, "draw.Viewport point");
    const px = margin + (x - domain[0]) / (domain[2] - domain[0]) * (size[0] - margin * 2);
    const normalizedY = (y - domain[1]) / (domain[3] - domain[1]);
    const py = get(entries, "flipY", int(1)) === null
        ? margin + normalizedY * (size[1] - margin * 2)
        : size[1] - margin - normalizedY * (size[1] - margin * 2);
    return arrayValue(pointsValue([[px, py]])[0]);
}

function viewport(args) {
    const entries = entriesFor(args, ["domain", "size", "options"], "draw.Viewport");
    const options = get(entries, "options")?.type === "map" ? get(entries, "options").entries : new Map();
    const value = mapValue([
        ["type", string("draw_viewport")],
        ["domain", get(entries, "domain")],
        ["size", get(entries, "size")],
        ["margin", get(options, "margin", int(0))],
        ["flipY", get(options, "flipY", int(1))],
    ]);
    value._ext = new Map([
        ["POINT", { type: "method_builtin", name: "Point", impl: (methodArgs) => viewportPoint(methodArgs[1], value) }],
        ["APPLY", { type: "method_builtin", name: "Apply", impl: (methodArgs) => viewportPoint(methodArgs[1], value) }],
    ]);
    // Validate eagerly so malformed viewport values never escape.
    viewportPoint([int(0), int(0)], value);
    return value;
}

function viewportPointCommand(args) {
    const entries = entriesFor(args, ["point", "viewport", "size", "options"], "draw.ViewportPoint");
    let transform = get(entries, "viewport");
    if (transform?.type !== "map" || get(transform.entries, "type")?.value !== "draw_viewport") {
        transform = viewport([transform, get(entries, "size"), get(entries, "options")]);
    }
    return viewportPoint(get(entries, "point"), transform);
}

function boundsFor(node) {
    if (!node || typeof node !== "object") throw new Error("draw.Bounds requires a Graphics node or point collection");
    if (node.type === "array" || node.type === "tuple" || Array.isArray(node)) {
        const points = sequence(node, "draw.Bounds points").map((entry, index) => pointNumbers(entry, `draw.Bounds point ${index + 1}`));
        if (!points.length) throw new Error("draw.Bounds requires at least one point");
        return [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1])), Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))];
    }
    if (node.kind === "path") {
        if (!node.points) throw new Error("draw.Bounds does not yet inspect command-based paths");
        return boundsFor(node.points);
    }
    if (node.kind === "circle" || node.kind === "drag_point") {
        const [x, y] = pointNumbers(node.center, "draw.Bounds circle center");
        const radius = number(node.radius, "draw.Bounds circle radius");
        return [x - radius, y - radius, x + radius, y + radius];
    }
    if (node.kind === "rectangle") {
        const [x, y] = pointNumbers(node.origin, "draw.Bounds rectangle origin");
        const [width, height] = pointNumbers(node.size, "draw.Bounds rectangle size");
        return [Math.min(x, x + width), Math.min(y, y + height), Math.max(x, x + width), Math.max(y, y + height)];
    }
    if (node.kind === "text_mark") {
        const [x, y] = pointNumbers(node.position, "draw.Bounds label position");
        const size = number(node.style?.get("size") ?? int(14), "draw.Bounds label size");
        const content = node.text?.value ?? String(node.text ?? "");
        const width = content.length * size * 0.6;
        return [x, y - size, x + width, y + size * 0.2];
    }
    if (node.kind === "group" || node.kind === "graphic") {
        const children = node.children ?? [];
        if (!children.length) throw new Error("draw.Bounds cannot bound an empty group");
        const bounds = children.map(boundsFor);
        return [Math.min(...bounds.map((b) => b[0])), Math.min(...bounds.map((b) => b[1])), Math.max(...bounds.map((b) => b[2])), Math.max(...bounds.map((b) => b[3]))];
    }
    throw new Error(`draw.Bounds does not support Graphics kind '${node.kind ?? "unknown"}'`);
}

function bounds(args) {
    const entries = entriesFor(args, ["value"], "draw.Bounds");
    const [xmin, ymin, xmax, ymax] = boundsFor(get(entries, "value"));
    return mapValue([
        ["xmin", exact(xmin)], ["ymin", exact(ymin)], ["xmax", exact(xmax)], ["ymax", exact(ymax)],
        ["width", exact(xmax - xmin)], ["height", exact(ymax - ymin)],
    ]);
}

function anchor(args) {
    const entries = entriesFor(args, ["value", "name", "offset"], "draw.Anchor");
    const value = get(entries, "value");
    const box = value?.type === "map" && value.entries.has("xmin") ? value.entries : bounds([value]).entries;
    const xmin = number(get(box, "xmin"), "draw.Anchor xmin");
    const ymin = number(get(box, "ymin"), "draw.Anchor ymin");
    const xmax = number(get(box, "xmax"), "draw.Anchor xmax");
    const ymax = number(get(box, "ymax"), "draw.Anchor ymax");
    const name = get(entries, "name", string("center"))?.value ?? String(get(entries, "name"));
    const positions = {
        center: [(xmin + xmax) / 2, (ymin + ymax) / 2], north: [(xmin + xmax) / 2, ymin],
        south: [(xmin + xmax) / 2, ymax], east: [xmax, (ymin + ymax) / 2], west: [xmin, (ymin + ymax) / 2],
        northeast: [xmax, ymin], northwest: [xmin, ymin], southeast: [xmax, ymax], southwest: [xmin, ymax],
    };
    if (!positions[name.toLowerCase()]) throw new Error(`draw.Anchor unknown anchor '${name}'`);
    const offsetValue = get(entries, "offset");
    const offset = offsetValue === null ? [0, 0] : pointNumbers(offsetValue, "draw.Anchor offset");
    return arrayValue(pointsValue([[positions[name.toLowerCase()][0] + offset[0], positions[name.toLowerCase()][1] + offset[1]]])[0]);
}

export function createDrawPluginCollection() {
    const methods = new Map([
        ["Line", line], ["Polyline", polyline], ["Polygon", polygon], ["Arrow", arrow], ["Arc", arc],
        ["Ellipse", ellipse], ["Dimension", dimension], ["Grid", grid], ["Label", label], ["Box", box],
        ["Circle", circle], ["Style", style], ["Viewport", viewport], ["ViewportPoint", viewportPointCommand],
        ["Bounds", bounds], ["Anchor", anchor],
    ]);
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

export function install({ systemContext }) {
    const draw = createDrawPluginCollection();
    systemContext.registerHostValue("draw", draw, { doc: "Convenient authoring helpers that produce intrinsic Graphics nodes" });
    return draw;
}

export const installDrawPlugin = (systemContext) => install({ systemContext });
