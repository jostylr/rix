import {
    UnsupportedRenderError,
} from "../../src/runtime/renderer-registry.js";
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

function texText(value) {
    return String(value).replace(/[\\{}%$&#_^~]/g, (character) => ({
        "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "%": "\\%", "$": "\\$",
        "&": "\\&", "#": "\\#", "_": "\\_", "^": "\\textasciicircum{}", "~": "\\textasciitilde{}",
    })[character]);
}

function tikzColor(value) {
    const color = rixString(value);
    if (!color) return null;
    const hex = color.match(/^#([0-9a-f]{6})$/i);
    if (hex) {
        const number = Number.parseInt(hex[1], 16);
        return `{rgb,255:red,${number >> 16};green,${(number >> 8) & 255};blue,${number & 255}}`;
    }
    return /^[A-Za-z][A-Za-z0-9]*$/.test(color) ? color : "black";
}

function tikzStyle(style, defaultFill = null) {
    const values = [];
    const stroke = tikzColor(styleValue(style, "stroke"));
    const fillSource = rixString(styleValue(style, "fill"));
    const fill = fillSource === "none" ? null : tikzColor(styleValue(style, "fill")) || defaultFill;
    const width = styleValue(style, "width", styleValue(style, "strokeWidth"));
    const opacity = styleValue(style, "opacity");
    const dash = rixString(styleValue(style, "dash"));
    if (stroke) values.push(`draw=${stroke}`);
    else values.push("draw=none");
    if (fill) values.push(`fill=${fill}`);
    if (width !== null && width !== undefined) values.push(`line width=${stableNumber(width, "stroke width")}pt`);
    if (opacity !== null && opacity !== undefined) values.push(`opacity=${stableNumber(opacity, "opacity")}`);
    if (dash) {
        const lengths = dash.trim().split(/[ ,]+/).filter(Boolean).map((part) => numberValue(Number(part), "dash length"));
        if (lengths.length) values.push(`dash pattern=${lengths.map((length, index) => `${index % 2 ? "off" : "on"} ${stableNumber(length)}pt`).join(" ")}`);
    }
    return values.join(",");
}

function styleObject(style) {
    if (style instanceof Map) return Object.fromEntries(style);
    if (style?.type === "map" && style.entries instanceof Map) return Object.fromEntries(style.entries);
    return style && typeof style === "object" ? style : {};
}

function mergedStyle(parent, own) {
    return { ...parent, ...styleObject(own) };
}

function destination(command, index) {
    return point(field(command, "to"), `Path command ${index + 1} destination`);
}

function pathSource(node, path) {
    if (!node.commands) {
        const coordinates = node.points.map((entry, index) => point(entry, `Path point ${index + 1}`));
        const suffix = boolValue(styleValue(node.style, "closed", false)) ? " -- cycle" : "";
        return coordinates.map(([x, y], index) => `${index ? " -- " : ""}(${stableNumber(x)},${stableNumber(y)})`).join("") + suffix;
    }
    const parts = [];
    let current = null;
    let subpathStart = null;
    node.commands.forEach((command, index) => {
        const op = (rixString(field(command, "op")) || field(command, "op", "")).toLowerCase();
        if (["move", "m"].includes(op)) {
            const [x, y] = destination(command, index);
            current = [x, y];
            subpathStart = [x, y];
            parts.push(`(${stableNumber(x)},${stableNumber(y)})`);
            return;
        }
        if (["line", "l"].includes(op)) {
            const [x, y] = destination(command, index);
            current = [x, y];
            parts.push(` -- (${stableNumber(x)},${stableNumber(y)})`);
            return;
        }
        if (["quadratic", "quad", "q"].includes(op)) {
            if (!current) throw new UnsupportedRenderError(`${path}: quadratic command has no current point`, { target: "tikz" });
            const [cx, cy] = point(field(command, "control"), `Path command ${index + 1} control`);
            const [x, y] = destination(command, index);
            const control1 = [current[0] + (cx - current[0]) * 2 / 3, current[1] + (cy - current[1]) * 2 / 3];
            const control2 = [x + (cx - x) * 2 / 3, y + (cy - y) * 2 / 3];
            parts.push(` .. controls (${stableNumber(control1[0])},${stableNumber(control1[1])}) and (${stableNumber(control2[0])},${stableNumber(control2[1])}) .. (${stableNumber(x)},${stableNumber(y)})`);
            current = [x, y];
            return;
        }
        if (["cubic", "curve", "c"].includes(op)) {
            const [c1x, c1y] = point(field(command, "control1"), `Path command ${index + 1} control1`);
            const [c2x, c2y] = point(field(command, "control2"), `Path command ${index + 1} control2`);
            const [x, y] = destination(command, index);
            parts.push(` .. controls (${stableNumber(c1x)},${stableNumber(c1y)}) and (${stableNumber(c2x)},${stableNumber(c2y)}) .. (${stableNumber(x)},${stableNumber(y)})`);
            current = [x, y];
            return;
        }
        if (["close", "z"].includes(op)) {
            parts.push(" -- cycle");
            current = subpathStart;
            return;
        }
        if (["arc", "a"].includes(op)) {
            throw new UnsupportedRenderError(`${path}: endpoint SVG arc commands require geometric conversion before TikZ export`, {
                code: "tikz-svg-arc",
                target: "tikz",
            });
        }
        throw new UnsupportedRenderError(`${path}: unsupported Path command '${op || "(missing op)"}'`, { target: "tikz" });
    });
    return parts.join("");
}

function scopeOptions(node) {
    const values = [];
    if (node.translate !== null && node.translate !== undefined) {
        const [x, y] = point(node.translate, "Transform translate");
        values.push(`shift={(${stableNumber(x)}pt,${stableNumber(y)}pt)}`);
    }
    if (node.rotate !== null && node.rotate !== undefined) {
        const angle = stableNumber(node.rotate, "Transform rotate");
        if (node.origin !== null && node.origin !== undefined) {
            const [x, y] = point(node.origin, "Transform origin");
            values.push(`rotate around={${angle}:(${stableNumber(x)},${stableNumber(y)})}`);
        } else values.push(`rotate=${angle}`);
    }
    if (node.scale !== null && node.scale !== undefined) {
        const scale = Array.isArray(node.scale) || node.scale?.values
            ? point(node.scale, "Transform scale")
            : [numberValue(node.scale, "Transform scale"), numberValue(node.scale, "Transform scale")];
        values.push(`xscale=${stableNumber(scale[0])}`, `yscale=${stableNumber(scale[1])}`);
    }
    return values.join(",");
}

function renderNode(node, state, format, path, inheritedStyle = {}) {
    if (!node || node.type !== "output") throw new Error(`${path} contains a non-Graphics scene node`);
    const resolvedStyle = mergedStyle(inheritedStyle, node.style);
    if (node.kind === "path") return `\\path[${tikzStyle(resolvedStyle)}] ${pathSource(node, path)};`;
    if (node.kind === "rectangle") {
        const [x, y] = point(node.origin, `${path} origin`);
        const [width, height] = point(node.size, `${path} size`);
        return `\\path[${tikzStyle(resolvedStyle)}] (${stableNumber(x)},${stableNumber(y)}) rectangle (${stableNumber(x + width)},${stableNumber(y + height)});`;
    }
    if (node.kind === "circle" || node.kind === "drag_point") {
        const [x, y] = point(node.center, `${path} center`);
        if (node.kind === "drag_point") state.diagnostics.push(diagnostic("tikz-static-drag-point", "TikZ renders DragPoint as a static circle", "info", path));
        return `\\path[${tikzStyle(resolvedStyle, node.kind === "drag_point" ? tikzColor("#7c3aed") : null)}] (${stableNumber(x)},${stableNumber(y)}) circle[radius=${stableNumber(node.radius, `${path} radius`)}pt];`;
    }
    if (node.kind === "text_mark") {
        const [x, y] = point(node.position, `${path} position`);
        const anchor = rixString(styleValue(resolvedStyle, "anchor"));
        const fill = tikzColor(styleValue(resolvedStyle, "fill"));
        const size = styleValue(resolvedStyle, "size", styleValue(resolvedStyle, "fontSize"));
        const options = [
            anchor === "middle" ? "anchor=center" : anchor === "end" ? "anchor=east" : "anchor=west",
            fill ? `text=${fill}` : null,
            size ? `font=\\fontsize{${stableNumber(size, `${path} font size`)}}{${stableNumber(numberValue(size, `${path} font size`) * 1.2)}}\\selectfont` : null,
        ].filter(Boolean).join(",");
        return `\\node[${options}] at (${stableNumber(x)},${stableNumber(y)}) {${texText(textValue(node.text, format))}};`;
    }
    if (["group", "transform", "clip"].includes(node.kind)) {
        const options = node.kind === "transform" ? scopeOptions(node) : "";
        const lines = [`\\begin{scope}${options ? `[${options}]` : ""}`];
        if (node.kind === "clip") {
            const bounds = node.bounds.map((entry, index) => numberValue(entry, `${path} clip bound ${index + 1}`));
            lines.push(`\\clip (${stableNumber(bounds[0])},${stableNumber(bounds[1])}) rectangle (${stableNumber(bounds[0] + bounds[2])},${stableNumber(bounds[1] + bounds[3])});`);
        }
        node.children.forEach((child, index) => lines.push(renderNode(child, state, format, `${path}.${node.kind}[${index + 1}]`, resolvedStyle)));
        lines.push("\\end{scope}");
        return lines.join("\n");
    }
    throw new UnsupportedRenderError(`${path}: TikZ does not support Graphics node '${node.kind}'`, { target: "tikz" });
}

export function renderGraphicTikz(graphic, format, { standalone = false } = {}) {
    const state = { diagnostics: [] };
    const body = [
        "\\begin{tikzpicture}[x=1pt,y=-1pt]",
        ...graphic.children.map((child, index) => renderNode(child, state, format, `graphic[${index + 1}]`)),
        "\\end{tikzpicture}",
    ].join("\n");
    return {
        content: standalone
            ? `\\documentclass[tikz,border=2pt]{standalone}\n\\usepackage{xcolor}\n\\begin{document}\n${body}\n\\end{document}\n`
            : `${body}\n`,
        diagnostics: state.diagnostics,
    };
}
