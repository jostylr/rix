import { numericFormatter } from "../../src/runtime/numeric-presentation.js";
import {
    boolValue,
    diagnostic,
    field,
    numberValue as rendererNumberValue,
    rixString,
    sequence,
    stableNumber,
    styleValue,
    textValue,
} from "../renderers/common.js";
import { createSelection, createViewport, invertViewportPoint } from "../renderers/interaction.js";
import { lowerGraphicSvg } from "../../src/runtime/output.js";
import { createGraphicCoordinateDisclosure, createGraphicsTextPlan } from "../../src/tools/graphic-accessibility.js";
import { Rational, RationalInterval, CertifiedApproximation } from "@ratmath/core";

function numberValue(value, label) {
    if (value instanceof RationalInterval) value = value.low.add(value.high).divide(new Rational(2));
    if (value instanceof CertifiedApproximation) value = value.candidate;
    return rendererNumberValue(value, label);
}

function point(value, label) {
    const values = sequence(value, label);
    if (values.length !== 2) throw new Error(`${label} must contain two coordinates`);
    return values.map((entry, index) => numberValue(entry, `${label} ${index ? "y" : "x"}`));
}

function semanticId(node, path) {
    return rixString(styleValue(node.style, "hitId"))
        || rixString(styleValue(node.style, "id"))
        || rixString(field(node.metadata, "id"))
        || node.id || node.targetId
        || path.replace(/[^A-Za-z0-9:_.-]+/g, "-");
}

function boundsOfPoints(points) {
    if (!points.length) return null;
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function pathBounds(node) {
    if (node.points) return boundsOfPoints(node.points.map((entry, index) => point(entry, `Path point ${index + 1}`)));
    const points = [];
    for (const command of node.commands || []) {
        for (const name of ["to", "control", "control1", "control2"]) {
            const value = field(command, name);
            if (value !== null) points.push(point(value, `Path ${name}`));
        }
    }
    return boundsOfPoints(points);
}

function recordHit(interaction, node, path, bounds, role, label = null) {
    if (!bounds) return;
    const id = semanticId(node, path);
    const region = Object.freeze({ id, semanticId: id, role, label: label || id, bounds: Object.freeze(bounds) });
    interaction.hitRegions.push(region);
    interaction.accessibility.push(Object.freeze({ id, role, label: region.label, bounds: region.bounds }));
}

function pathData(node) {
    if (!node.commands) {
        const points = node.points.map((entry, index) => point(entry, `Path point ${index + 1}`));
        const closed = boolValue(styleValue(node.style, "closed", false));
        return points.map(([x, y], index) => `${index ? "L" : "M"}${stableNumber(x)} ${stableNumber(y)}`).join(" ") + (closed ? " Z" : "");
    }
    return node.commands.map((command, index) => {
        const op = (rixString(field(command, "op")) || field(command, "op", "")).toLowerCase();
        const destination = () => point(field(command, "to"), `Path command ${index + 1} destination`);
        if (["move", "m", "line", "l"].includes(op)) {
            const [x, y] = destination();
            return `${op === "move" || op === "m" ? "M" : "L"}${stableNumber(x)} ${stableNumber(y)}`;
        }
        if (["quadratic", "quad", "q"].includes(op)) {
            const [cx, cy] = point(field(command, "control"), `Path command ${index + 1} control`);
            const [x, y] = destination();
            return `Q${stableNumber(cx)} ${stableNumber(cy)} ${stableNumber(x)} ${stableNumber(y)}`;
        }
        if (["cubic", "curve", "c"].includes(op)) {
            const [c1x, c1y] = point(field(command, "control1"), `Path command ${index + 1} control1`);
            const [c2x, c2y] = point(field(command, "control2"), `Path command ${index + 1} control2`);
            const [x, y] = destination();
            return `C${stableNumber(c1x)} ${stableNumber(c1y)} ${stableNumber(c2x)} ${stableNumber(c2y)} ${stableNumber(x)} ${stableNumber(y)}`;
        }
        if (["arc", "a"].includes(op)) {
            const [rx, ry] = point(field(command, "radius"), `Path command ${index + 1} radius`);
            const rotation = numberValue(field(command, "rotation", 0), `Path command ${index + 1} rotation`);
            const large = boolValue(field(command, "large", false)) ? 1 : 0;
            const sweep = boolValue(field(command, "sweep", false)) ? 1 : 0;
            const [x, y] = destination();
            return `A${stableNumber(rx)} ${stableNumber(ry)} ${stableNumber(rotation)} ${large} ${sweep} ${stableNumber(x)} ${stableNumber(y)}`;
        }
        if (["close", "z"].includes(op)) return "Z";
        throw new Error(`Unsupported Path command '${op || "(missing op)"}'`);
    }).join(" ");
}

function canvasStyle(style, defaultFill = null) {
    const result = {};
    const stroke = rixString(styleValue(style, "stroke"));
    const fillSource = rixString(styleValue(style, "fill"));
    const fill = fillSource || defaultFill;
    const width = styleValue(style, "width", styleValue(style, "strokeWidth"));
    const opacity = styleValue(style, "opacity");
    const dash = rixString(styleValue(style, "dash"));
    if (stroke) result.stroke = stroke === "none" ? null : stroke;
    if (fill) result.fill = fill === "none" ? null : fill;
    if (width !== null && width !== undefined) result.width = numberValue(width, "stroke width");
    if (opacity !== null && opacity !== undefined) result.opacity = numberValue(opacity, "opacity");
    if (dash) result.dash = dash.trim().split(/[ ,]+/).filter(Boolean).map(Number);
    return result;
}

function mergedStyle(parent, own, defaultFill = null) {
    return { ...parent, ...canvasStyle(own, defaultFill) };
}

function transformCommands(node) {
    const commands = [];
    if (node.translate !== null && node.translate !== undefined) commands.push(["translate", ...point(node.translate, "Transform translate")]);
    if (node.rotate !== null && node.rotate !== undefined) {
        const angle = numberValue(node.rotate, "Transform rotate") * Math.PI / 180;
        if (node.origin !== null && node.origin !== undefined) {
            const [x, y] = point(node.origin, "Transform origin");
            commands.push(["translate", x, y], ["rotate", angle], ["translate", -x, -y]);
        } else commands.push(["rotate", angle]);
    }
    if (node.scale !== null && node.scale !== undefined) {
        const scale = Array.isArray(node.scale) || node.scale?.values
            ? point(node.scale, "Transform scale")
            : [numberValue(node.scale, "Transform scale"), numberValue(node.scale, "Transform scale")];
        commands.push(["scale", ...scale]);
    }
    return commands;
}

function visit(node, commands, diagnostics, format, interaction, path = "graphic", inheritedStyle = {}) {
    format = numericFormatter(format, node?.numericPolicy);
    if (!node || node.type !== "output") throw new Error(`${path} contains a non-Graphics scene node`);
    if (node.kind === "path") {
        const style = { ...mergedStyle(inheritedStyle, node.style), hitId: semanticId(node, path) };
        commands.push(["path2d", pathData(node), style]);
        recordHit(interaction, node, path, pathBounds(node), "graphics-symbol");
    }
    else if (node.kind === "rectangle") {
        const origin = point(node.origin, `${path} origin`);
        const size = point(node.size, `${path} size`);
        commands.push(["rectangle", ...origin, ...size, { ...mergedStyle(inheritedStyle, node.style), hitId: semanticId(node, path) }]);
        recordHit(interaction, node, path, { x: origin[0], y: origin[1], width: size[0], height: size[1] }, "graphics-symbol");
    }
    else if (node.kind === "circle" || node.kind === "drag_point") {
        const center = point(node.center, `${path} center`);
        const radius = numberValue(node.radius, `${path} radius`);
        commands.push(["circle", ...center, radius, { ...mergedStyle(inheritedStyle, node.style, node.kind === "drag_point" ? "#7c3aed" : null), hitId: semanticId(node, path) }]);
        recordHit(interaction, node, path, { x: center[0] - radius, y: center[1] - radius, width: radius * 2, height: radius * 2 }, node.kind === "drag_point" ? "slider" : "graphics-symbol", node.label);
        if (node.kind === "drag_point") diagnostics.push(diagnostic("canvas-static-drag-point", "Canvas plans render DragPoint as a static marker; host interaction must bind the target separately", "info", path));
    } else if (node.kind === "text_mark") {
        const [x, y] = point(node.position, `${path} position`);
        const size = styleValue(node.style, "size", styleValue(node.style, "fontSize", 16));
        const content = textValue(node.text, format);
        commands.push(["text", x, y, content, {
            ...mergedStyle(inheritedStyle, node.style, "currentColor"),
            font: rixString(styleValue(node.style, "font")) || "sans-serif",
            size: numberValue(size, `${path} font size`),
            weight: rixString(styleValue(node.style, "weight")) || "normal",
            anchor: rixString(styleValue(node.style, "anchor")) || "start",
            hitId: semanticId(node, path),
        }]);
        recordHit(interaction, node, path, { x, y: y - numberValue(size, `${path} font size`), width: Math.max(1, content.length * numberValue(size, `${path} font size`) * 0.6), height: numberValue(size, `${path} font size`) }, "text", content);
    } else if (["group", "transform", "clip", "graphic_action"].includes(node.kind)) {
        commands.push(["save"]);
        if (node.kind === "transform") commands.push(...transformCommands(node));
        if (node.kind === "clip") commands.push(["clipRect", ...node.bounds.map((entry, index) => numberValue(entry, `${path} clip bound ${index + 1}`))]);
        const childStyle = mergedStyle(inheritedStyle, node.style);
        node.children.forEach((child, index) => visit(child, commands, diagnostics, format, interaction, `${path}.${node.kind}[${index + 1}]`, childStyle));
        commands.push(["restore"]);
        if (node.kind === "graphic_action") {
            interaction.accessibility.push(Object.freeze({ id: semanticId(node, path), role: "button", label: node.label || "Graphic action", bounds: null }));
        }
    } else throw new Error(`Canvas renderer does not support Graphics node '${node.kind}'`);
}

function canvasAssets(options) {
    const source = field(options, "assets");
    if (source === null || source === undefined) return [];
    return sequence(source, "Canvas assets").map((value, index) => {
        const id = rixString(field(value, "id"));
        const ref = rixString(field(value, "ref")) || rixString(field(value, "path"));
        if (!id || !ref) throw new Error(`Canvas asset ${index + 1} requires string id and ref/path`);
        if (ref.startsWith("/") || ref.includes("..")) throw new Error("Canvas asset references must be safe relative paths or explicit URLs");
        return Object.freeze({ id, ref, mime: rixString(field(value, "mime")) || "application/octet-stream", crossOrigin: rixString(field(value, "crossOrigin")) || null });
    });
}

export function createCanvasPlan(graphic, format, options = {}) {
    format = numericFormatter(format, graphic?.numericPolicy);
    const commands = [];
    const diagnostics = [];
    const logicalWidth = numberValue(graphic.size[0], "Graphic width");
    const logicalHeight = numberValue(graphic.size[1], "Graphic height");
    const pixelRatio = numberValue(field(options, "pixelRatio", 1), "Canvas pixel ratio");
    if (!(pixelRatio > 0)) throw new Error("Canvas pixel ratio must be positive");
    const viewport = createViewport(options, logicalWidth, logicalHeight);
    const selection = createSelection(options);
    const interaction = { hitRegions: [], accessibility: [] };
    graphic.children.forEach((child, index) => visit(child, commands, diagnostics, format, interaction, `graphic[${index + 1}]`));
    const selected = new Set(selection.ids);
    const dirtyRegions = interaction.hitRegions.filter((region) => selected.size === 0 || selected.has(region.semanticId)).map((region) => region.bounds);
    const assets = canvasAssets(options);
    if (assets.length) diagnostics.push(diagnostic("canvas-assets-deferred", `${assets.length} image asset${assets.length === 1 ? " is" : "s are"} declared for host loading`, "info"));
    const reference = lowerGraphicSvg(graphic, format, options);
    const coordinateDisclosure = createGraphicCoordinateDisclosure(graphic, reference, format);
    const textPlan = createGraphicsTextPlan(graphic, format);
    const numericPolicy = "Canvas uses approximate binary floating-point coordinates. SVG reference bounds describe the retained sources; Canvas pixels are not a certified outward enclosure.";
    diagnostics.push(diagnostic("canvas-coordinate-approximation", numericPolicy, "info"));
    return {
        schema: "rix.canvas-plan@1",
        phase: 2,
        width: logicalWidth,
        height: logicalHeight,
        backingWidth: Math.ceil(logicalWidth * pixelRatio),
        backingHeight: Math.ceil(logicalHeight * pixelRatio),
        pixelRatio,
        viewport,
        selection,
        commands,
        hitRegions: interaction.hitRegions,
        dirtyRegions,
        assets,
        accessibility: {
            schema: "rix.canvas-accessibility@1",
            objects: interaction.accessibility,
            coordinateDisclosure,
            numericPolicy,
            textPlan,
            text: [textPlan.summary, numericPolicy, coordinateDisclosure.text,
                ...interaction.accessibility.map(({ label, role }) => `${role}: ${label}`)].join("\n"),
        },
        diagnostics,
    };
}

/** Convert a browser pointer position into logical Graphic coordinates. */
export function invertCanvasPoint(plan, pointValue, bounds = null) {
    const [clientX, clientY] = Array.isArray(pointValue) ? pointValue : [pointValue.x, pointValue.y];
    const rect = bounds || { left: 0, top: 0, width: plan.width, height: plan.height };
    const canvasX = (clientX - rect.left) * (plan.width / rect.width);
    const canvasY = (clientY - rect.top) * (plan.height / rect.height);
    return invertViewportPoint(plan.viewport, canvasX, canvasY);
}

export function hitTestCanvasPlan(plan, pointValue) {
    const [x, y] = Array.isArray(pointValue) ? pointValue : [pointValue.x, pointValue.y];
    return [...plan.hitRegions].reverse().find(({ bounds }) => x >= bounds.x && y >= bounds.y && x <= bounds.x + bounds.width && y <= bounds.y + bounds.height) || null;
}

/** Resolve declared image assets without granting the evaluator I/O access. */
export async function loadCanvasAssets(plan, loadImage) {
    if (typeof loadImage !== "function") throw new Error("Canvas asset loading requires an explicit host loadImage callback");
    const loaded = new Map();
    for (const asset of plan.assets || []) loaded.set(asset.id, await loadImage(asset));
    return loaded;
}

function applyStyle(context, style = {}) {
    if (style.stroke) context.strokeStyle = style.stroke;
    if (style.fill) context.fillStyle = style.fill;
    if (style.width !== undefined) context.lineWidth = style.width;
    if (style.opacity !== undefined) context.globalAlpha *= style.opacity;
    if (style.dash) context.setLineDash(style.dash);
}

function paintShape(context, path, style) {
    context.save();
    applyStyle(context, style);
    if (style.fill) context.fill(path);
    if (style.stroke) context.stroke(path);
    context.restore();
}

/** Execute a serialized RiX Canvas plan against CanvasRenderingContext2D. */
export function paintCanvasPlan(context, plan) {
    if (!context || typeof context.save !== "function") throw new Error("Canvas plan requires CanvasRenderingContext2D");
    if (context.canvas) {
        context.canvas.width = plan.backingWidth || plan.width;
        context.canvas.height = plan.backingHeight || plan.height;
    }
    const ratio = plan.pixelRatio || 1;
    const transform = plan.viewport?.transform || [1, 0, 0, 1, 0, 0];
    if (typeof context.setTransform === "function") context.setTransform(
        transform[0] * ratio, transform[1] * ratio, transform[2] * ratio,
        transform[3] * ratio, transform[4] * ratio, transform[5] * ratio,
    );
    for (const [name, ...args] of plan.commands) {
        if (name === "save" || name === "restore") context[name]();
        else if (["translate", "rotate", "scale"].includes(name)) context[name](...args);
        else if (name === "style") applyStyle(context, args[0]);
        else if (name === "clipRect") {
            context.beginPath(); context.rect(...args); context.clip();
        } else if (name === "path2d") {
            if (typeof Path2D !== "function") throw new Error("This Canvas host does not provide Path2D for Graphics paths");
            paintShape(context, new Path2D(args[0]), args[1]);
        } else if (name === "rectangle") {
            const [x, y, width, height, style] = args;
            const path = new Path2D(); path.rect(x, y, width, height); paintShape(context, path, style);
        } else if (name === "circle") {
            const [x, y, radius, style] = args;
            const path = new Path2D(); path.arc(x, y, radius, 0, Math.PI * 2); paintShape(context, path, style);
        } else if (name === "text") {
            const [x, y, text, style] = args;
            context.save(); applyStyle(context, style);
            context.font = `${style.weight} ${style.size}px ${style.font}`;
            context.textAlign = style.anchor === "middle" ? "center" : style.anchor === "end" ? "right" : "left";
            if (style.fill) context.fillText(text, x, y);
            if (style.stroke) context.strokeText(text, x, y);
            context.restore();
        } else throw new Error(`Unknown Canvas plan command '${name}'`);
    }
    return context;
}
