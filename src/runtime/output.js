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
    return entries.has(name) ? entries.get(name) : fallback;
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

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function cellText(value, format) {
    return value === null || value === undefined ? "" : format(value);
}

function hasRule(grid, kind, value) {
    return grid.rules.some((rule) => rule?.kind === kind && (kind === "vertical" ? rule.afterColumn === value : rule.aboveRow === value));
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
    if (value.kind === "figure") return `<figure class="rix-output-figure">${renderOutputHtml(value.content, format)}${value.caption ? `<figcaption>${escapeHtml(value.caption)}</figcaption>` : ""}</figure>`;
    if (value.kind === "graphic") return `<div class="rix-output-graphic">${escapeHtml(formatOutputText(value, format))}</div>`;
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
