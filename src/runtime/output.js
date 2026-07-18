/** Portable structured-output values and host-neutral render helpers. */

import { Integer, Rational } from "@ratmath/core";

const int = (value) => new Integer(BigInt(value));
const isSequence = (value) => value && ["sequence", "tuple", "set", "array"].includes(value.type);
const asString = (value) => value?.type === "string" ? value.value : typeof value === "string" ? value : null;

function sequence(value, label) {
    if (Array.isArray(value)) return value;
    if (isSequence(value)) return value.values || value.elements || [];
    throw new Error(`${label} must be an array, tuple, or sequence`);
}

function map(value, label) {
    if (value?.type !== "map" || !(value.entries instanceof Map)) throw new Error(`${label} must be a map`);
    return value.entries;
}

function get(entries, name, fallback = null) {
    if (entries.has(name)) return entries.get(name);
    const canonical = String(name).toLowerCase();
    return entries.has(canonical) ? entries.get(canonical) : fallback;
}

function optionalMap(value, label) {
    return value === null || value === undefined ? null : map(value, label);
}

function spec(args, positional, name) {
    if (args.length === 1 && args[0]?.type === "map") return map(args[0], `${name} specification`);
    if (args.length > positional.length) throw new Error(`${name} received too many arguments`);
    return new Map(positional.slice(0, args.length).map((key, index) => [key, args[index]]));
}

function output(kind, fields) {
    return Object.freeze({
        type: "output",
        kind,
        ...fields,
        _ext: new Map([
            ["_type", { type: "string", value: "output" }],
            ["kind", { type: "string", value: kind }],
            ["immutable", int(1)],
        ]),
    });
}

function exactInteger(value, label) {
    if (value instanceof Integer) return Number(value.value);
    if (value instanceof Rational && value.denominator === 1n) return Number(value.numerator);
    if (typeof value === "number" && Number.isInteger(value)) return value;
    throw new Error(`${label} must be an integer`);
}

function exactNumber(value, label) {
    if (value instanceof Integer || value instanceof Rational) return value;
    throw new Error(`${label} must be an exact integer or rational`);
}

function numericValue(value, label) {
    if (value instanceof Integer) return Number(value.value);
    if (value instanceof Rational) return Number(value.numerator) / Number(value.denominator);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    throw new Error(`${label} must be a finite number`);
}

function normalizeColumns(value) {
    return sequence(value, "Table columns").map((column, index) => {
        const label = asString(column);
        if (label !== null) return { id: `column${index + 1}`, label, align: null, format: null };
        const entry = map(column, `Table column ${index + 1}`);
        const id = asString(get(entry, "id")) || `column${index + 1}`;
        return { id, label: asString(get(entry, "label")) || id, align: asString(get(entry, "align")), format: get(entry, "format") };
    });
}

export function isOutputValue(value) {
    return Boolean(value && value.type === "output" && typeof value.kind === "string");
}

export function createText(args) {
    const entry = spec(args, ["value", "style"], "Text");
    const value = get(entry, "value");
    if (value === null) throw new Error("Text requires a value");
    return output("text", { value, style: optionalMap(get(entry, "style"), "Text style") });
}

export function createParagraph(args) {
    const entry = spec(args, ["children", "style"], "Paragraph");
    const childrenValue = get(entry, "children");
    const children = isSequence(childrenValue) || Array.isArray(childrenValue)
        ? sequence(childrenValue, "Paragraph children")
        : [childrenValue];
    return output("paragraph", { children, style: optionalMap(get(entry, "style"), "Paragraph style") });
}

export function createHeading(args) {
    const entry = spec(args, ["level", "content", "id", "style"], "Heading");
    const level = exactInteger(get(entry, "level"), "Heading level");
    if (level < 1 || level > 6) throw new Error("Heading level must be between 1 and 6");
    const content = get(entry, "content");
    if (content === null) throw new Error("Heading requires content");
    return output("heading", { level, content, id: asString(get(entry, "id")), style: optionalMap(get(entry, "style"), "Heading style") });
}

export function createFragment(args) {
    const entry = spec(args, ["children", "metadata"], "Fragment");
    return output("fragment", { children: sequence(get(entry, "children"), "Fragment children"), metadata: optionalMap(get(entry, "metadata"), "Fragment metadata") });
}

export function createTable(args) {
    const entry = spec(args, ["columns", "rows", "options"], "Table");
    const columns = normalizeColumns(get(entry, "columns"));
    const rows = sequence(get(entry, "rows"), "Table rows").map((row, index) => {
        const cells = sequence(row, `Table row ${index + 1}`);
        if (cells.length !== columns.length) throw new Error(`Table row ${index + 1} has ${cells.length} cells; expected ${columns.length}`);
        return [...cells];
    });
    return output("table", { columns, rows, caption: asString(get(entry, "caption")), options: optionalMap(get(entry, "options"), "Table options") });
}

export function createGrid(args) {
    const entry = spec(args, ["columns", "rows", "rules", "style"], "Grid");
    const columns = sequence(get(entry, "columns"), "Grid columns");
    const rows = sequence(get(entry, "rows"), "Grid rows").map((row, index) => {
        const cells = sequence(row, `Grid row ${index + 1}`);
        if (cells.length !== columns.length) throw new Error(`Grid row ${index + 1} has ${cells.length} cells; expected ${columns.length}`);
        return [...cells];
    });
    return output("grid", {
        columns,
        rows,
        rules: sequence(get(entry, "rules", { type: "sequence", values: [] }), "Grid rules"),
        style: optionalMap(get(entry, "style"), "Grid style"),
    });
}

export function createPath(args) {
    const entry = spec(args, ["points", "style"], "Path");
    return output("path", { points: sequence(get(entry, "points"), "Path points"), style: optionalMap(get(entry, "style"), "Path style") });
}

export function createGroup(args) {
    const entry = spec(args, ["children", "style", "metadata"], "Group");
    return output("group", {
        children: sequence(get(entry, "children"), "Group children"),
        style: optionalMap(get(entry, "style"), "Group style"),
        metadata: optionalMap(get(entry, "metadata"), "Group metadata"),
    });
}

export function createTransform(args) {
    const entry = spec(args, ["children", "transform", "style"], "Transform");
    const transform = optionalMap(get(entry, "transform"), "Transform specification") || entry;
    return output("transform", {
        children: sequence(get(entry, "children"), "Transform children"),
        translate: get(transform, "translate"),
        scale: get(transform, "scale"),
        rotate: get(transform, "rotate"),
        origin: get(transform, "origin"),
        style: optionalMap(get(entry, "style"), "Transform style"),
    });
}

export function createTextMark(args) {
    const entry = spec(args, ["position", "text", "style"], "TextMark");
    const position = sequence(get(entry, "position"), "TextMark position");
    if (position.length !== 2) throw new Error("TextMark position must contain x and y coordinates");
    const text = get(entry, "text");
    if (text === null || text === undefined) throw new Error("TextMark requires text");
    return output("text_mark", { position, text, style: optionalMap(get(entry, "style"), "TextMark style") });
}

export function createRectangle(args) {
    const entry = spec(args, ["origin", "size", "style"], "Rectangle");
    const origin = sequence(get(entry, "origin"), "Rectangle origin");
    const size = sequence(get(entry, "size"), "Rectangle size");
    if (origin.length !== 2 || size.length !== 2) throw new Error("Rectangle origin and size must each contain x and y coordinates");
    return output("rectangle", { origin, size, style: optionalMap(get(entry, "style"), "Rectangle style") });
}

export function createCircle(args) {
    const entry = spec(args, ["center", "radius", "style"], "Circle");
    const center = sequence(get(entry, "center"), "Circle center");
    if (center.length !== 2) throw new Error("Circle center must contain x and y coordinates");
    const radius = get(entry, "radius");
    if (radius === null || radius === undefined) throw new Error("Circle requires a radius");
    return output("circle", { center, radius, style: optionalMap(get(entry, "style"), "Circle style") });
}

export function createClip(args) {
    const entry = spec(args, ["children", "bounds", "style"], "Clip");
    const bounds = sequence(get(entry, "bounds"), "Clip bounds");
    if (bounds.length !== 4) throw new Error("Clip bounds must contain x, y, width, and height");
    return output("clip", { children: sequence(get(entry, "children"), "Clip children"), bounds, style: optionalMap(get(entry, "style"), "Clip style") });
}

export function createGraphic(args) {
    const entry = spec(args, ["size", "children", "metadata"], "Graphic");
    const size = sequence(get(entry, "size"), "Graphic size");
    if (size.length !== 2) throw new Error("Graphic size must contain width and height");
    return output("graphic", { size, children: sequence(get(entry, "children"), "Graphic children"), metadata: optionalMap(get(entry, "metadata"), "Graphic metadata") });
}

export function createFigure(args) {
    const entry = spec(args, ["content", "caption", "label", "alt"], "Figure");
    const content = get(entry, "content");
    if (content === null) throw new Error("Figure requires content");
    return output("figure", { content, caption: asString(get(entry, "caption")), label: asString(get(entry, "label")), alt: asString(get(entry, "alt")) });
}

export function createSlide(args) {
    const entry = spec(args, ["content", "title", "id", "notes", "metadata"], "Slide");
    const content = get(entry, "content");
    if (content === null) throw new Error("Slide requires content");
    return output("slide", { content, title: asString(get(entry, "title")), id: asString(get(entry, "id")), notes: asString(get(entry, "notes")), metadata: optionalMap(get(entry, "metadata"), "Slide metadata") });
}

export function createSlides(args) {
    const entry = spec(args, ["slides", "title", "theme", "metadata"], "Slides");
    const slides = sequence(get(entry, "slides"), "Slides entries");
    if (!slides.every((slide) => isOutputValue(slide) && slide.kind === "slide")) throw new Error("Slides requires an array of Slide values");
    return output("slides", { slides, title: asString(get(entry, "title")), theme: asString(get(entry, "theme")), metadata: optionalMap(get(entry, "metadata"), "Slides metadata") });
}

export function createSyntheticDivision(root, coefficients) {
    root = exactNumber(root, "SyntheticDivision root");
    const values = sequence(coefficients, "SyntheticDivision coefficients").map((value, index) => exactNumber(value, `SyntheticDivision coefficient ${index + 1}`));
    if (values.length < 2) throw new Error("SyntheticDivision requires at least two coefficients");
    const products = Array(values.length).fill(null);
    const bottom = Array(values.length).fill(null);
    bottom[0] = values[0];
    for (let index = 1; index < values.length; index += 1) {
        products[index] = root.multiply(bottom[index - 1]);
        bottom[index] = values[index].add(products[index]);
    }
    return output("grid", {
        columns: Array.from({ length: values.length + 1 }, () => null),
        rows: [[root, ...values], [null, null, ...products.slice(1)], [null, ...bottom]],
        rules: [{ kind: "vertical", afterColumn: 1 }, { kind: "horizontal", aboveRow: 3 }],
        style: new Map([["align", { type: "string", value: "right" }]]),
        semantic: { type: "synthetic_division", root, coefficients: values, products, bottom },
    });
}

/**
 * A deliberately small, portable plotting helper.  It produces an ordinary
 * Graphic made of Paths, so every host can render or serialize the result
 * without depending on a browser plotting library.
 */
export function createPolynomialPlot(coefficients, domain, options = null) {
    const values = sequence(coefficients, "Polynomial coefficients").map((value, index) => exactNumber(value, `Polynomial coefficient ${index + 1}`));
    if (values.length < 2) throw new Error("Plot.Polynomial requires at least two coefficients");
    const bounds = sequence(domain, "Polynomial plot domain");
    if (bounds.length !== 2) throw new Error("Polynomial plot domain must have a lower and upper bound");
    const xMin = numericValue(bounds[0], "Polynomial plot lower bound");
    const xMax = numericValue(bounds[1], "Polynomial plot upper bound");
    if (!(xMin < xMax)) throw new Error("Polynomial plot domain must increase");

    const optionEntries = options === null || options === undefined ? new Map() : map(options, "Polynomial plot options");
    const requestedSize = get(optionEntries, "size", null);
    const size = requestedSize === null ? [640, 360] : sequence(requestedSize, "Polynomial plot size").map((value, index) => numericValue(value, `Polynomial plot size ${index + 1}`));
    if (size.length !== 2 || size.some((value) => value <= 0)) throw new Error("Polynomial plot size must contain positive width and height");
    const samplesValue = get(optionEntries, "samples", null);
    const samples = samplesValue === null ? 161 : exactInteger(samplesValue, "Polynomial plot samples");
    if (samples < 2 || samples > 10000) throw new Error("Polynomial plot samples must be between 2 and 10000");
    const marginValue = get(optionEntries, "margin", null);
    const margin = marginValue === null ? 36 : numericValue(marginValue, "Polynomial plot margin");
    if (margin < 0 || margin * 2 >= Math.min(...size)) throw new Error("Polynomial plot margin is too large for its size");

    const coefficientNumbers = values.map((value) => numericValue(value, "Polynomial coefficient"));
    const evaluatePolynomial = (x) => coefficientNumbers.reduce((total, coefficient) => total * x + coefficient, 0);
    const samplesData = Array.from({ length: samples }, (_, index) => {
        const x = xMin + (xMax - xMin) * index / (samples - 1);
        return [x, evaluatePolynomial(x)];
    });
    let yMin = Math.min(0, ...samplesData.map(([, y]) => y));
    let yMax = Math.max(0, ...samplesData.map(([, y]) => y));
    if (yMin === yMax) {
        yMin -= 1;
        yMax += 1;
    }
    const yPadding = (yMax - yMin) * 0.08;
    yMin -= yPadding;
    yMax += yPadding;

    const [width, height] = size;
    const toPoint = ([x, y]) => [
        margin + (x - xMin) / (xMax - xMin) * (width - margin * 2),
        height - margin - (y - yMin) / (yMax - yMin) * (height - margin * 2),
    ];
    const curveStyle = new Map([
        ["stroke", get(optionEntries, "stroke", { type: "string", value: "#2563eb" })],
        ["width", get(optionEntries, "width", int(2))],
        ["fill", { type: "string", value: "none" }],
    ]);
    const axisStyle = new Map([
        ["stroke", { type: "string", value: "#64748b" }],
        ["width", int(1)],
        ["dash", { type: "string", value: "3 3" }],
        ["fill", { type: "string", value: "none" }],
    ]);
    const children = [];
    if (yMin <= 0 && yMax >= 0) children.push(output("path", { points: [toPoint([xMin, 0]), toPoint([xMax, 0])], style: axisStyle }));
    if (xMin <= 0 && xMax >= 0) children.push(output("path", { points: [toPoint([0, yMin]), toPoint([0, yMax])], style: axisStyle }));
    children.push(output("path", { points: samplesData.map(toPoint), style: curveStyle }));
    return output("graphic", {
        size: [int(Math.round(width)), int(Math.round(height))],
        children,
        metadata: new Map([["kind", { type: "string", value: "polynomial_plot" }]]),
    });
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function cellText(value, format) {
    return value === null || value === undefined ? "" : format(value);
}

function ruleField(rule, name) {
    if (rule?.type === "map" && rule.entries instanceof Map) return get(rule.entries, name);
    return rule?.[name] ?? null;
}

function hasRule(grid, kind, value) {
    const field = kind === "vertical" ? "afterColumn" : "aboveRow";
    return grid.rules.some((rule) => {
        const ruleKind = asString(ruleField(rule, "kind")) ?? ruleField(rule, "kind");
        const ruleValue = ruleField(rule, field);
        return ruleKind === kind && (ruleValue === value || numericValue(ruleValue, `Grid ${field}`) === value);
    });
}

function styleEntry(style, name) {
    if (!(style instanceof Map)) return null;
    if (style.has(name)) return style.get(name);
    return style.get(String(name).toLowerCase()) ?? null;
}

function svgNumber(value, label) {
    const number = numericValue(value, label);
    if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
    return Number(number.toFixed(6)).toString();
}

function svgPoint(value, index) {
    const point = sequence(value, `Path point ${index + 1}`);
    if (point.length !== 2) throw new Error(`Path point ${index + 1} must contain x and y coordinates`);
    return [svgNumber(point[0], `Path point ${index + 1} x`), svgNumber(point[1], `Path point ${index + 1} y`)];
}

function svgPair(value, label) {
    const pair = sequence(value, label);
    if (pair.length !== 2) throw new Error(`${label} must contain two coordinates`);
    return [svgNumber(pair[0], `${label} x`), svgNumber(pair[1], `${label} y`)];
}

function svgStyle(style, defaultFill = null) {
    const attrs = [];
    const stroke = asString(styleEntry(style, "stroke"));
    const fill = asString(styleEntry(style, "fill"));
    const dash = asString(styleEntry(style, "dash"));
    const opacity = styleEntry(style, "opacity");
    const width = styleEntry(style, "width") ?? styleEntry(style, "strokeWidth");
    if (fill || defaultFill !== null) attrs.push(`fill="${escapeHtml(fill || defaultFill)}"`);
    if (stroke) attrs.push(`stroke="${escapeHtml(stroke)}"`);
    if (width !== null && width !== undefined) attrs.push(`stroke-width="${svgNumber(width, "Path stroke width")}"`);
    if (dash) attrs.push(`stroke-dasharray="${escapeHtml(dash)}"`);
    if (opacity !== null && opacity !== undefined) attrs.push(`opacity="${svgNumber(opacity, "Path opacity")}"`);
    return attrs.join(" ");
}

function svgTransform(node) {
    const transforms = [];
    if (node.translate !== null && node.translate !== undefined) {
        const [x, y] = svgPair(node.translate, "Transform translate");
        transforms.push(`translate(${x} ${y})`);
    }
    if (node.rotate !== null && node.rotate !== undefined) {
        const angle = svgNumber(node.rotate, "Transform rotate");
        const origin = node.origin === null || node.origin === undefined ? null : svgPair(node.origin, "Transform origin");
        transforms.push(origin ? `rotate(${angle} ${origin[0]} ${origin[1]})` : `rotate(${angle})`);
    }
    if (node.scale !== null && node.scale !== undefined) {
        const scale = isSequence(node.scale) || Array.isArray(node.scale)
            ? svgPair(node.scale, "Transform scale")
            : [svgNumber(node.scale, "Transform scale"), svgNumber(node.scale, "Transform scale")];
        transforms.push(`scale(${scale[0]} ${scale[1]})`);
    }
    return transforms.join(" ");
}

function renderSvgText(node, format) {
    const [x, y] = svgPair(node.position, "TextMark position");
    const anchor = asString(styleEntry(node.style, "anchor"));
    const size = styleEntry(node.style, "size") ?? styleEntry(node.style, "fontSize");
    const font = asString(styleEntry(node.style, "font"));
    const weight = asString(styleEntry(node.style, "weight"));
    const attrs = [svgStyle(node.style, "currentColor")];
    if (anchor) attrs.push(`text-anchor="${escapeHtml(anchor)}"`);
    if (size !== null && size !== undefined) attrs.push(`font-size="${svgNumber(size, "TextMark size")}"`);
    if (font) attrs.push(`font-family="${escapeHtml(font)}"`);
    if (weight) attrs.push(`font-weight="${escapeHtml(weight)}"`);
    return `<text x="${x}" y="${y}" ${attrs.filter(Boolean).join(" ")}>${escapeHtml(cellText(node.text, format))}</text>`;
}

function renderSvgNode(node, format, defs) {
    if (!isOutputValue(node)) return "";
    if (node.kind === "path") {
        if (node.points.length === 0) return "";
        const points = node.points.map(svgPoint);
        const closed = styleEntry(node.style, "closed")?.value === 1n || styleEntry(node.style, "closed") === true;
        const d = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ") + (closed ? " Z" : "");
        return `<path d="${d}" ${svgStyle(node.style, "none")}/>`;
    }
    if (node.kind === "rectangle") {
        const [x, y] = svgPair(node.origin, "Rectangle origin");
        const [width, height] = svgPair(node.size, "Rectangle size");
        return `<rect x="${x}" y="${y}" width="${width}" height="${height}" ${svgStyle(node.style, "none")}/>`;
    }
    if (node.kind === "circle") {
        const [cx, cy] = svgPair(node.center, "Circle center");
        return `<circle cx="${cx}" cy="${cy}" r="${svgNumber(node.radius, "Circle radius")}" ${svgStyle(node.style, "none")}/>`;
    }
    if (node.kind === "text_mark") return renderSvgText(node, format);
    if (node.kind === "group") return `<g ${svgStyle(node.style)}>${node.children.map((child) => renderSvgNode(child, format, defs)).join("")}</g>`;
    if (node.kind === "transform") {
        const transform = svgTransform(node);
        return `<g${transform ? ` transform="${transform}"` : ""}${svgStyle(node.style) ? ` ${svgStyle(node.style)}` : ""}>${node.children.map((child) => renderSvgNode(child, format, defs)).join("")}</g>`;
    }
    if (node.kind === "clip") {
        const [x, y, width, height] = node.bounds.map((value, index) => svgNumber(value, `Clip bounds ${index + 1}`));
        const id = `rix-clip-${defs.length + 1}`;
        defs.push(`<clipPath id="${id}"><rect x="${x}" y="${y}" width="${width}" height="${height}"/></clipPath>`);
        return `<g clip-path="url(#${id})"${svgStyle(node.style) ? ` ${svgStyle(node.style)}` : ""}>${node.children.map((child) => renderSvgNode(child, format, defs)).join("")}</g>`;
    }
    return "";
}

export function renderGraphicSvg(graphic, format = (item) => String(item ?? "")) {
    if (!isOutputValue(graphic) || graphic.kind !== "graphic") throw new Error("Expected a Graphic output value");
    const size = graphic.size.map((value, index) => svgNumber(value, `Graphic size ${index + 1}`));
    const defs = [];
    const children = graphic.children.map((child) => renderSvgNode(child, format, defs)).join("");
    return `<svg class="rix-output-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size[0]} ${size[1]}" width="${size[0]}" height="${size[1]}" role="img">${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${children}</svg>`;
}

export function formatOutputText(value, format) {
    if (!isOutputValue(value)) return format(value);
    if (value.kind === "text") return cellText(value.value, format);
    if (value.kind === "paragraph") return value.children.map((child) => cellText(child, format)).join("");
    if (value.kind === "heading") return `${"#".repeat(value.level)} ${cellText(value.content, format)}`;
    if (value.kind === "fragment") return value.children.map((child) => formatOutputText(child, format)).join("\n\n");
    if (value.kind === "table") {
        const strings = value.rows.map((row) => row.map((cell) => cellText(cell, format)));
        const widths = value.columns.map((column, index) => Math.max(column.label.length, ...strings.map((row) => row[index].length)));
        const line = (row) => row.map((cell, index) => String(cell).padStart(widths[index])).join("  ");
        return [value.caption, line(value.columns.map((column) => column.label)), widths.map((width) => "-".repeat(width)).join("  "), ...strings.map(line)].filter(Boolean).join("\n");
    }
    if (value.kind === "grid") {
        const strings = value.rows.map((row) => row.map((cell) => cellText(cell, format)));
        const widths = value.columns.map((_, index) => Math.max(1, ...strings.map((row) => row[index].length)));
        const lines = [];
        for (let index = 0; index < strings.length; index += 1) {
            if (hasRule(value, "horizontal", index + 1)) lines.push(`  ${widths.slice(1).map((width) => "-".repeat(width + 2)).join("")}`);
            const parts = strings[index].map((cell, column) => cell.padStart(widths[column]));
            lines.push(hasRule(value, "vertical", 1) ? `${parts[0]} │ ${parts.slice(1).join("  ")}` : parts.join("  "));
        }
        return lines.join("\n");
    }
    if (value.kind === "figure") return [formatOutputText(value.content, format), value.caption].filter(Boolean).join("\n");
    if (value.kind === "graphic") return `[Graphic: ${cellText(value.size[0], format)} × ${cellText(value.size[1], format)}, ${value.children.length} scene nodes]`;
    if (value.kind === "path") return `[Path: ${value.points.length} points]`;
    if (value.kind === "slide") return [value.title, formatOutputText(value.content, format)].filter(Boolean).join("\n");
    if (value.kind === "slides") return value.slides.map((slide, index) => `Slide ${index + 1}:\n${formatOutputText(slide, format)}`).join("\n\n");
    return `[Output: ${value.kind}]`;
}

export function renderOutputHtml(value, format = (item) => String(item ?? "")) {
    const text = (item) => escapeHtml(isOutputValue(item) ? formatOutputText(item, format) : cellText(item, format));
    if (!isOutputValue(value)) return `<pre>${text(value)}</pre>`;
    if (value.kind === "text") return `<span class="rix-output-text">${text(value.value)}</span>`;
    if (value.kind === "paragraph") return `<p class="rix-output-paragraph">${value.children.map(text).join("")}</p>`;
    if (value.kind === "heading") return `<h${value.level} class="rix-output-heading">${text(value.content)}</h${value.level}>`;
    if (value.kind === "fragment") return `<section class="rix-output-fragment">${value.children.map((child) => renderOutputHtml(child, format)).join("")}</section>`;
    if (value.kind === "table") return `<table class="rix-output-table">${value.caption ? `<caption>${escapeHtml(value.caption)}</caption>` : ""}<thead><tr>${value.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${value.rows.map((row) => `<tr>${row.map((cell) => `<td>${text(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    if (value.kind === "grid") return `<table class="rix-output-grid"><tbody>${value.rows.map((row, rowIndex) => `<tr${hasRule(value, "horizontal", rowIndex + 1) ? " class=\"rix-grid-rule-top\"" : ""}>${row.map((cell, column) => `<td${hasRule(value, "vertical", column + 1) ? " class=\"rix-grid-rule-left\"" : ""}>${text(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    if (value.kind === "figure") return `<figure class="rix-output-figure"${value.label ? ` id="${escapeHtml(value.label)}"` : ""}>${renderOutputHtml(value.content, format)}${value.caption ? `<figcaption>${escapeHtml(value.caption)}</figcaption>` : ""}</figure>`;
    if (value.kind === "graphic") return `<div class="rix-output-graphic">${renderGraphicSvg(value, format)}</div>`;
    if (value.kind === "slide") return `<section class="rix-output-slide">${value.title ? `<h2>${escapeHtml(value.title)}</h2>` : ""}${renderOutputHtml(value.content, format)}</section>`;
    if (value.kind === "slides") return `<section class="rix-output-slides">${value.slides.map((slide) => renderOutputHtml(slide, format)).join("")}</section>`;
    return `<pre>${escapeHtml(formatOutputText(value, format))}</pre>`;
}

export function createAlgebraOutputCollection() {
    const syntheticDivision = (root, coefficients) => createSyntheticDivision(root, coefficients);
    return {
        type: "map",
        entries: new Map([["SyntheticDivision", syntheticDivision], ["SYNTHETICDIVISION", syntheticDivision]]),
        _ext: new Map([
            ["SYNTHETICDIVISION", {
                type: "method_builtin",
                name: "SyntheticDivision",
                impl: (args) => syntheticDivision(...args.slice(1)),
            }],
            ["immutable", int(1)],
        ]),
    };
}

/**
 * The 2D leaf vocabulary intentionally lives below Draw rather than claiming
 * broad global names such as Group, Path, or Circle.  That leaves those names
 * available to future algebraic and geometric capability groups.
 */
export function createDrawOutputCollection() {
    const methods = new Map([
        ["Path", createPath],
        ["Group", createGroup],
        ["Transform", createTransform],
        ["Text", createTextMark],
        ["Rectangle", createRectangle],
        ["Circle", createCircle],
        ["Clip", createClip],
    ]);
    const entries = new Map();
    const extension = new Map([["immutable", int(1)]]);
    for (const [name, constructor] of methods) {
        entries.set(name, constructor);
        entries.set(name.toUpperCase(), constructor);
        extension.set(name.toUpperCase(), {
            type: "method_builtin",
            name,
            impl: (args) => constructor(args.slice(1)),
        });
    }
    return { type: "map", entries, _ext: extension };
}

export function createPlotOutputCollection() {
    const polynomial = (coefficients, domain, options = null) => createPolynomialPlot(coefficients, domain, options);
    return {
        type: "map",
        entries: new Map([["Polynomial", polynomial], ["POLYNOMIAL", polynomial]]),
        _ext: new Map([
            ["POLYNOMIAL", {
                type: "method_builtin",
                name: "Polynomial",
                impl: (args) => polynomial(...args.slice(1)),
            }],
            ["immutable", int(1)],
        ]),
    };
}
