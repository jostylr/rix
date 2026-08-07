import {
    boolValue,
    diagnostic,
    field,
    numberValue,
    point,
    rixString,
    stableNumber,
    styleValue,
    textValue,
} from "../renderers/common.js";

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

function visit(node, commands, diagnostics, format, path = "graphic", inheritedStyle = {}) {
    if (!node || node.type !== "output") throw new Error(`${path} contains a non-Graphics scene node`);
    if (node.kind === "path") commands.push(["path2d", pathData(node), mergedStyle(inheritedStyle, node.style)]);
    else if (node.kind === "rectangle") commands.push(["rectangle", ...point(node.origin, `${path} origin`), ...point(node.size, `${path} size`), mergedStyle(inheritedStyle, node.style)]);
    else if (node.kind === "circle" || node.kind === "drag_point") {
        commands.push(["circle", ...point(node.center, `${path} center`), numberValue(node.radius, `${path} radius`), mergedStyle(inheritedStyle, node.style, node.kind === "drag_point" ? "#7c3aed" : null)]);
        if (node.kind === "drag_point") diagnostics.push(diagnostic("canvas-static-drag-point", "Canvas plans render DragPoint as a static marker; host interaction must bind the target separately", "info", path));
    } else if (node.kind === "text_mark") {
        const [x, y] = point(node.position, `${path} position`);
        const size = styleValue(node.style, "size", styleValue(node.style, "fontSize", 16));
        commands.push(["text", x, y, textValue(node.text, format), {
            ...mergedStyle(inheritedStyle, node.style, "currentColor"),
            font: rixString(styleValue(node.style, "font")) || "sans-serif",
            size: numberValue(size, `${path} font size`),
            weight: rixString(styleValue(node.style, "weight")) || "normal",
            anchor: rixString(styleValue(node.style, "anchor")) || "start",
        }]);
    } else if (["group", "transform", "clip"].includes(node.kind)) {
        commands.push(["save"]);
        if (node.kind === "transform") commands.push(...transformCommands(node));
        if (node.kind === "clip") commands.push(["clipRect", ...node.bounds.map((entry, index) => numberValue(entry, `${path} clip bound ${index + 1}`))]);
        const childStyle = mergedStyle(inheritedStyle, node.style);
        node.children.forEach((child, index) => visit(child, commands, diagnostics, format, `${path}.${node.kind}[${index + 1}]`, childStyle));
        commands.push(["restore"]);
    } else throw new Error(`Canvas renderer does not support Graphics node '${node.kind}'`);
}

export function createCanvasPlan(graphic, format) {
    const commands = [];
    const diagnostics = [];
    graphic.children.forEach((child, index) => visit(child, commands, diagnostics, format, `graphic[${index + 1}]`));
    return {
        schema: "rix.canvas-plan@1",
        width: numberValue(graphic.size[0], "Graphic width"),
        height: numberValue(graphic.size[1], "Graphic height"),
        commands,
        diagnostics,
    };
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
