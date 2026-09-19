import { numericFormatter } from "../../src/runtime/numeric-presentation.js";
import { Integer, Rational } from "@ratmath/core";
import {
    UnsupportedRenderError,
} from "../../src/runtime/renderer-registry.js";
import {
    boolValue,
    diagnostic,
    field,
    numberValue,
    rixString,
    sequence,
    stableNumber as roundedNumber,
    styleValue,
    textValue,
} from "../renderers/common.js";

// PGF evaluates braced rational expressions. Never round retained exact inputs
// before producing editable source; reduce derived coordinates in the same domain.
function stableNumber(value, label = "coordinate") {
    if (value instanceof Rational && value.denominator === 0n) throw new Error(`${label} must be finite`);
    numberValue(value, label);
    if (value instanceof Integer) return String(value.value);
    if (value instanceof Rational) {
        if (value.denominator === 1n) return String(value.numerator);
        let denominator = value.denominator, twos = 0, fives = 0;
        // Only short terminating decimals are emitted; bound factor work too.
        while (twos < 19 && denominator % 2n === 0n) { denominator /= 2n; twos += 1; }
        while (fives < 19 && denominator % 5n === 0n) { denominator /= 5n; fives += 1; }
        const places = Math.max(twos, fives);
        if (denominator === 1n && places <= 18) {
            const negative = value.numerator < 0n;
            const numerator = negative ? -value.numerator : value.numerator;
            const digits = (numerator * 10n ** BigInt(places) / value.denominator).toString().padStart(places + 1, "0");
            return `${negative ? "-" : ""}${digits.slice(0, -places)}.${digits.slice(-places).replace(/0+$/, "")}`;
        }
        const expression = `${value.numerator}/${value.denominator}`;
        return value.denominator > 16383n || value.numerator > 16383n || value.numerator < -16383n
            ? `{\\fpeval{${expression}}}` : `{${expression}}`;
    }
    return roundedNumber(value, label);
}

function point(value, label) {
    const entries = sequence(value, label);
    if (entries.length !== 2) throw new Error(`${label} must contain two coordinates`);
    entries.forEach((entry) => numberValue(entry, label));
    return entries;
}

const exact = (value) => value instanceof Rational ? value : value instanceof Integer ? new Rational(value.value, 1n) : null;
function add(left, right) {
    const a = exact(left), b = exact(right);
    return a && b ? a.add(b) : numberValue(left, "coordinate") + numberValue(right, "coordinate");
}
function interpolate(from, to) {
    const a = exact(from), b = exact(to);
    return a && b ? a.add(b.subtract(a).multiply(new Rational(2n, 3n)))
        : numberValue(from, "coordinate") + (numberValue(to, "coordinate") - numberValue(from, "coordinate")) * 2 / 3;
}

function texText(value) {
    return String(value).replace(/[\\{}%$&#_^~≈]/g, (character) => ({
        "\\": "\\textbackslash{}", "{": "\\{", "}": "\\}", "%": "\\%", "$": "\\$",
        "&": "\\&", "#": "\\#", "_": "\\_", "^": "\\textasciicircum{}", "~": "\\textasciitilde{}", "≈": "\\ensuremath{\\approx}",
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

function styleObject(style) {
    if (style instanceof Map) return Object.fromEntries(style);
    if (style?.type === "map" && style.entries instanceof Map) return Object.fromEntries(style.entries);
    return style && typeof style === "object" ? style : {};
}

function mergedStyle(parent, own) {
    return { ...parent, ...styleObject(own) };
}

const MARKERS = Object.freeze({
    circle: "*", dot: "*", openCircle: "o", opencircle: "o",
    square: "square*", openSquare: "square", opensquare: "square",
    triangle: "triangle*", openTriangle: "triangle", opentriangle: "triangle",
    diamond: "diamond*", openDiamond: "diamond", opendiamond: "diamond",
    cross: "x", x: "x", plus: "+", none: "none",
});

function gradientOptions(style) {
    const gradient = styleValue(style, "gradient");
    const from = tikzColor(field(gradient, "from", styleValue(style, "gradientFrom")));
    const to = tikzColor(field(gradient, "to", styleValue(style, "gradientTo")));
    if (!from && !to) return [];
    const first = from || to;
    const second = to || from;
    const angle = field(gradient, "angle", styleValue(style, "gradientAngle"));
    return [
        "shade",
        `left color=${first}`,
        `right color=${second}`,
        angle === null || angle === undefined ? null : `shading angle=${stableNumber(angle, "gradient angle")}`,
    ].filter(Boolean);
}

function tikzStyle(style, state, defaultFill = null) {
    const values = [];
    const stroke = tikzColor(styleValue(style, "stroke"));
    const fillSource = rixString(styleValue(style, "fill"));
    const fill = fillSource === "none" ? null : tikzColor(styleValue(style, "fill")) || defaultFill;
    const width = styleValue(style, "width", styleValue(style, "strokeWidth"));
    const opacity = styleValue(style, "opacity");
    const dash = rixString(styleValue(style, "dash"));
    const markerName = rixString(styleValue(style, "marker"));
    if (stroke) values.push(`draw=${stroke}`);
    else values.push("draw=none");
    if (fill) values.push(`fill=${fill}`);
    if (width !== null && width !== undefined) values.push(`line width=${stableNumber(width, "stroke width")}pt`);
    if (opacity !== null && opacity !== undefined) values.push(`opacity=${stableNumber(opacity, "opacity")}`);
    if (dash) {
        const lengths = dash.trim().split(/[ ,]+/).filter(Boolean).map((part) => numberValue(Number(part), "dash length"));
        if (lengths.length) values.push(`dash pattern=${lengths.map((length, index) => `${index % 2 ? "off" : "on"} ${stableNumber(length)}pt`).join(" ")}`);
    }
    values.push(...gradientOptions(style));
    if (markerName) {
        const marker = MARKERS[markerName] ?? MARKERS[markerName.toLowerCase()];
        if (!marker) throw new Error(`TikZ marker '${markerName}' is not supported`);
        state.libraries.add("plotmarks");
        values.push(`mark=${marker}`);
        const markerSize = styleValue(style, "markerSize");
        if (markerSize !== null && markerSize !== undefined) values.push(`mark size=${stableNumber(markerSize, "marker size")}pt`);
    }
    return values.join(",");
}

function reusableStyle(style, state, defaultFill = null) {
    const source = tikzStyle(style, state, defaultFill);
    if (!state.styles.has(source)) state.styles.set(source, `rixStyle${state.styles.size + 1}`);
    return state.styles.get(source);
}

function styleDeclarations(state) {
    return [...state.styles].map(([source, name]) => `\\tikzset{${name}/.style={${source}}}`);
}

function destination(command, index) {
    return point(field(command, "to"), `Path command ${index + 1} destination`);
}

function coordinateSource(points, label) {
    return sequence(points, label).map((entry, index) => {
        const [x, y] = point(entry, `${label} ${index + 1}`);
        return `(${stableNumber(x)},${stableNumber(y)})`;
    }).join(" ");
}

function pathSource(node, path, marked = false) {
    if (!node.commands) {
        const coordinates = coordinateSource(node.points, `${path} point`);
        const suffix = boolValue(styleValue(node.style, "closed", false)) ? " -- cycle" : "";
        return marked ? `plot coordinates {${coordinates}}${suffix}` : coordinates.replaceAll(") (", ") -- (") + suffix;
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
            const control1 = [interpolate(current[0], cx), interpolate(current[1], cy)];
            const control2 = [interpolate(x, cx), interpolate(y, cy)];
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
            : [node.scale, node.scale];
        values.push(`xscale=${stableNumber(scale[0])}`, `yscale=${stableNumber(scale[1])}`);
    }
    return values.join(",");
}

function renderNode(node, state, format, path, inheritedStyle = {}) {
    format = numericFormatter(format, node?.numericPolicy);
    if (!node || node.type !== "output") throw new Error(`${path} contains a non-Graphics scene node`);
    const resolvedStyle = mergedStyle(inheritedStyle, node.style);
    if (node.kind === "path") {
        const marked = Boolean(rixString(styleValue(resolvedStyle, "marker"))) && !node.commands;
        return `\\path[${reusableStyle(resolvedStyle, state)}] ${pathSource(node, path, marked)};`;
    }
    if (node.kind === "rectangle") {
        const [x, y] = point(node.origin, `${path} origin`);
        const [width, height] = point(node.size, `${path} size`);
        return `\\path[${reusableStyle(resolvedStyle, state)}] (${stableNumber(x)},${stableNumber(y)}) rectangle (${stableNumber(add(x, width))},${stableNumber(add(y, height))});`;
    }
    if (node.kind === "circle" || node.kind === "drag_point") {
        const [x, y] = point(node.center, `${path} center`);
        if (node.kind === "drag_point") state.diagnostics.push(diagnostic("tikz-static-drag-point", "TikZ renders DragPoint as a static circle", "info", path));
        return `\\path[${reusableStyle(resolvedStyle, state, node.kind === "drag_point" ? tikzColor("#7c3aed") : null)}] (${stableNumber(x)},${stableNumber(y)}) circle[radius=${stableNumber(node.radius, `${path} radius`)}pt];`;
    }
    if (node.kind === "text_mark") {
        const [x, y] = point(node.position, `${path} position`);
        const anchor = rixString(styleValue(resolvedStyle, "anchor"));
        const fill = tikzColor(styleValue(resolvedStyle, "fill"));
        const size = styleValue(resolvedStyle, "size", styleValue(resolvedStyle, "fontSize"));
        const weight = rixString(styleValue(resolvedStyle, "weight"));
        const options = [
            anchor === "middle" ? "anchor=center" : anchor === "end" ? "anchor=east" : "anchor=west",
            fill ? `text=${fill}` : null,
            size ? `font=\\fontsize{${roundedNumber(size, `${path} font size`)}}{${roundedNumber(numberValue(size, `${path} font size`) * 1.2)}}\\selectfont${weight === "bold" ? "\\bfseries" : ""}` : null,
        ].filter(Boolean).join(",");
        return `\\node[${options}] at (${stableNumber(x)},${stableNumber(y)}) {${texText(textValue(node.text, format))}};`;
    }
    if (["group", "transform", "clip"].includes(node.kind)) {
        const options = node.kind === "transform" ? scopeOptions(node) : "";
        const lines = [`\\begin{scope}${options ? `[${options}]` : ""}`];
        if (node.kind === "clip") {
            const bounds = node.bounds;
            lines.push(`\\clip (${stableNumber(bounds[0])},${stableNumber(bounds[1])}) rectangle (${stableNumber(add(bounds[0], bounds[2]))},${stableNumber(add(bounds[1], bounds[3]))});`);
        }
        node.children.forEach((child, index) => lines.push(renderNode(child, state, format, `${path}.${node.kind}[${index + 1}]`, resolvedStyle)));
        lines.push("\\end{scope}");
        return lines.join("\n");
    }
    throw new UnsupportedRenderError(`${path}: TikZ does not support Graphics node '${node.kind}'`, { target: "tikz" });
}

function optionalText(value, format) {
    return value === null || value === undefined ? null : texText(textValue(value, format));
}

function plotSeriesOptions(series, state) {
    const kind = (rixString(field(series, "kind")) || "line").toLowerCase();
    const style = styleObject(field(series, "style"));
    const options = [reusableStyle(style, state)];
    if (kind === "scatter" || kind === "mark") {
        options.push("only marks");
        if (!rixString(styleValue(style, "marker"))) {
            state.libraries.add("plotmarks");
            options.push("mark=*");
        }
    } else if (kind === "bar") options.push("ybar");
    else if (kind === "step") options.push("const plot");
    else if (!rixString(styleValue(style, "marker"))) options.push("no marks");
    return options.join(",");
}

function renderPlot(graphic, plot, state, format) {
    state.packages.add("pgfplots");
    const view = field(plot, "view", field(plot, "bounds"));
    if (!view) throw new Error("TikZ plot metadata requires view bounds");
    const xmin = field(view, "xmin"), xmax = field(view, "xmax");
    const ymin = field(view, "ymin"), ymax = field(view, "ymax");
    const [width, height] = point(graphic.size, "Graphic size");
    const options = [
        `width=${stableNumber(width)}pt`, `height=${stableNumber(height)}pt`, "scale only axis", "clip=true",
        `xmin=${stableNumber(xmin)}`, `xmax=${stableNumber(xmax)}`,
        `ymin=${stableNumber(ymin)}`, `ymax=${stableNumber(ymax)}`,
        numberValue(ymin, "plot ymin") <= 0 && numberValue(ymax, "plot ymax") >= 0 ? "axis x line=middle" : "axis x line=bottom",
        numberValue(xmin, "plot xmin") <= 0 && numberValue(xmax, "plot xmax") >= 0 ? "axis y line=middle" : "axis y line=left",
    ];
    const title = optionalText(field(plot, "title"), format);
    const xlabel = optionalText(field(plot, "xLabel"), format);
    const ylabel = optionalText(field(plot, "yLabel"), format);
    if (title) options.push(`title={${title}}`);
    if (xlabel) options.push(`xlabel={${xlabel}}`);
    if (ylabel) options.push(`ylabel={${ylabel}}`);
    const ticks = field(plot, "ticks");
    if (ticks) {
        const entries = sequence(ticks, "plot ticks");
        options.push(`xtick={${entries.map((tick) => stableNumber(field(tick, "x"), "tick x")).join(",")}}`);
        options.push(`xticklabels={${entries.map((tick) => optionalText(field(tick, "label"), format) ?? stableNumber(field(tick, "x"), "tick x")).join(",")}}`);
    } else {
        const tickCountValue = field(plot, "tickCount");
        if (tickCountValue !== null && tickCountValue !== undefined) {
            const tickCount = numberValue(tickCountValue, "plot tick count");
            const distance = exact(xmin) && exact(xmax) && Number.isInteger(tickCount) && tickCount > 1
                ? exact(xmax).subtract(exact(xmin)).divide(new Rational(BigInt(tickCount - 1), 1n))
                : (numberValue(xmax, "plot xmax") - numberValue(xmin, "plot xmin")) / (tickCount - 1);
            options.push(`xtick distance=${stableNumber(distance)}`);
        }
    }
    const lines = ["\\begin{tikzpicture}", `\\begin{axis}[${options.join(",\n  ")}]`];
    const seriesEntries = sequence(field(plot, "series"), "plot series");
    for (const [index, series] of seriesEntries.entries()) {
        const coordinates = coordinateSource(field(series, "data", field(series, "points")), `plot series ${index + 1}`);
        lines.push(`\\addplot[${plotSeriesOptions(series, state)}] coordinates {${coordinates}};`);
        const label = optionalText(field(series, "label"), format);
        if (label) lines.push(`\\addlegendentry{${label}}`);
    }
    const marks = field(plot, "marks");
    if (marks) {
        for (const [index, mark] of sequence(marks, "plot marks").entries()) {
            const style = { ...styleObject(field(mark, "style")), marker: "circle", markerSize: field(mark, "radius") };
            const coordinate = coordinateSource([field(mark, "point")], `plot mark ${index + 1}`);
            lines.push(`\\addplot[${reusableStyle(style, state)},only marks] coordinates {${coordinate}};`);
            const label = optionalText(field(mark, "label"), format);
            if (label) {
                const [x, y] = point(field(mark, "point"), `plot mark ${index + 1}`);
                lines.push(`\\node[anchor=south west] at (axis cs:${stableNumber(x)},${stableNumber(y)}) {${label}};`);
            }
        }
    }
    lines.push("\\end{axis}", "\\end{tikzpicture}");
    state.diagnostics.push(diagnostic("tikz-pgfplots-lowering", "Plot metadata was lowered to editable PGFPlots axes and data series", "info"));
    return lines.join("\n");
}

function packageDeclarations(state, includeTikz = true) {
    const declarations = [];
    if (includeTikz) declarations.push("\\usepackage{tikz}");
    for (const name of [...state.packages].filter((name) => name !== "tikz").sort()) declarations.push(`\\usepackage{${name}}`);
    if (state.packages.has("pgfplots")) declarations.push("\\pgfplotsset{compat=1.18}");
    if (state.libraries.size) declarations.push(`\\usetikzlibrary{${[...state.libraries].sort().join(",")}}`);
    return declarations.join("\n");
}

export function renderGraphicTikz(graphic, format, { standalone = false, preamble = false } = {}) {
    format = numericFormatter(format, graphic?.numericPolicy);
    const state = {
        diagnostics: [],
        packages: new Set(["tikz", "xcolor"]),
        libraries: new Set(),
        styles: new Map(),
    };
    const schema = rixString(field(graphic.metadata, "schema"));
    const plot = field(graphic.metadata, "plot");
    const plotRendering = rixString(field(plot, "rendering"));
    const nativePlot = schema === "rix.plot@1" && plot && plotRendering !== "graphics";
    let body;
    if (nativePlot) body = renderPlot(graphic, plot, state, format);
    else {
        if (schema === "rix.plot@1" && plotRendering === "graphics") {
            state.diagnostics.push(diagnostic("tikz-plot-graphics-lowering", "Field plot was exported through its portable Graphics scene", "info"));
        } else if (schema === "rix.plot@1") {
            state.diagnostics.push(diagnostic("tikz-plot-graphics-fallback", "Plot has no semantic series metadata; exported its portable Graphics paths", "warning"));
        }
        const nodes = graphic.children.map((child, index) => renderNode(child, state, format, `graphic[${index + 1}]`));
        body = ["\\begin{tikzpicture}[x=1pt,y=-1pt]", ...nodes, "\\end{tikzpicture}"].join("\n");
    }
    const styles = styleDeclarations(state).join("\n");
    body = styles ? `${styles}\n${body}` : body;
    if (body.includes("\\fpeval{")) state.packages.add("xfp");
    const declarations = packageDeclarations(state, true);
    let content = `${body}\n`;
    if (preamble) content = `${declarations}\n${content}`;
    if (standalone) {
        const documentDeclarations = packageDeclarations(state, false);
        content = `\\documentclass[tikz,border=2pt]{standalone}\n${documentDeclarations}\n\\begin{document}\n${body}\n\\end{document}\n`;
    } else if (!preamble) {
        state.diagnostics.push(diagnostic(
            "tikz-package-requirements",
            `TikZ fragment requires packages: ${[...state.packages].sort().join(", ")}${state.libraries.size ? `; libraries: ${[...state.libraries].sort().join(", ")}` : ""}`,
            "info",
        ));
    }
    return {
        content,
        diagnostics: state.diagnostics,
        metadata: {
            schema: "rix.tikz.dependencies@1",
            packages: [...state.packages].sort(),
            tikzLibraries: [...state.libraries].sort(),
            pgfplotsCompat: state.packages.has("pgfplots") ? "1.18" : null,
            reusableStyles: state.styles.size,
            lowering: nativePlot ? "pgfplots" : "graphics",
            coordinateSource: "preserved-exact-rationals",
        },
    };
}
