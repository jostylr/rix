/** Deterministic strict-ASCII rendering for portable terminal output. */

import { formatOutputText, isOutputValue } from "../../src/runtime/output.js";
import { diagnostic, field, numberValue, outputKind, rixString, textValue } from "../renderers/common.js";

export const TERMINAL_ASCII_SCHEMA = "rix.terminal-ascii@1";

const REPLACEMENTS = new Map([
    ["\u2013", "-"], ["\u2014", "--"], ["\u2212", "-"],
    ["\u2018", "'"], ["\u2019", "'"], ["\u201c", "\""], ["\u201d", "\""],
    ["\u2026", "..."], ["\u00d7", "x"], ["\u00f7", "/"],
    ["\u2192", "->"], ["\u2190", "<-"], ["\u2194", "<->"],
    ["\u2264", "<="], ["\u2265", ">="], ["\u2260", "!="],
]);

function addDiagnostic(state, code, message, path, level = "warning") {
    const key = `${code}:${path}`;
    if (state.diagnosticKeys.has(key)) return;
    state.diagnosticKeys.add(key);
    state.diagnostics.push(diagnostic(code, message, level, path));
}

function strictAscii(value, state, path) {
    let source = String(value ?? "");
    for (const [from, to] of REPLACEMENTS) source = source.replaceAll(from, to);
    const normalized = source.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    const result = normalized.replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "?");
    if (result !== String(value ?? "")) {
        addDiagnostic(state, "terminal-non-ascii-replaced", "Non-ASCII text was replaced for strict ASCII output", path, "info");
    }
    return result;
}

function integerOption(value, fallback, label, minimum, maximum) {
    if (value === null || value === undefined) return fallback;
    const result = numberValue(value, label);
    if (!Number.isInteger(result) || result < minimum || result > maximum) {
        throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
    }
    return result;
}

function truncate(value, width) {
    const text = String(value);
    if (text.length <= width) return text;
    if (width <= 1) return "~";
    return `${text.slice(0, width - 1)}~`;
}

function wrappingOption(value) {
    if (value === null || value === undefined) return "truncate";
    const name = rixString(value)?.toLowerCase();
    if (name === "word" || name === "wrap") return "word";
    if (name === "truncate" || name === "none") return "truncate";
    if (name !== null && name !== undefined) {
        throw new Error("terminalAscii wrap must be :word, :wrap, :truncate, :none, 1, or 0");
    }
    try {
        return numberValue(value, "terminalAscii wrap") === 0 ? "truncate" : "word";
    } catch {
        throw new Error("terminalAscii wrap must be :word, :wrap, :truncate, :none, 1, or 0");
    }
}

function wrapLine(value, width) {
    let remaining = String(value);
    const lines = [];
    if (!remaining.length) return [""];
    while (remaining.length > width) {
        let boundary = remaining.lastIndexOf(" ", width);
        if (boundary <= 0) boundary = width;
        lines.push(remaining.slice(0, boundary).trimEnd());
        remaining = remaining.slice(boundary);
        if (remaining.startsWith(" ")) remaining = remaining.trimStart();
    }
    lines.push(remaining);
    return lines;
}

function constrainLines(value, width, state, path) {
    const source = String(value).replaceAll("\r", "").split("\n");
    if (state.wrap === "word") {
        const wrapped = source.flatMap((line) => wrapLine(line, width));
        if (wrapped.length !== source.length || source.some((line) => line.length > width)) {
            addDiagnostic(state, "terminal-width-wrapped", `Text was wrapped to terminal width ${width}`, path, "info");
        }
        return wrapped;
    }
    if (source.some((line) => line.length > width)) {
        addDiagnostic(state, "terminal-width-truncated", `Text exceeds terminal width ${width} and was truncated`, path);
    }
    return source.map((line) => truncate(line, width));
}

function constrainText(value, state, path) {
    return constrainLines(value, state.width, state, path).join("\n");
}

function portableValueText(value, state, path) {
    if (Array.isArray(value) || Array.isArray(value?.values)) {
        const values = Array.isArray(value) ? value : value.values;
        return `[${values.map((item, index) => portableValueText(item, state, `${path}.${index + 1}`)).join(", ")}]`;
    }
    if (value?.type === "map" && value.entries instanceof Map) {
        return `{${[...value.entries].map(([key, item]) => `${key}=${portableValueText(item, state, `${path}.${key}`)}`).join(", ")}}`;
    }
    return value === null || value === undefined ? "" : textValue(value, state.format);
}

function cellText(value, state, path) {
    const formatted = portableValueText(value, state, path);
    const ascii = strictAscii(formatted, state, path).replaceAll("\r", "");
    return state.wrap === "word" ? ascii : ascii.replace(/\n+/g, " / ");
}

function shrinkWidths(widths, available, state, path) {
    const result = [...widths];
    if (available < result.length) throw new Error(`terminalAscii width ${state.width} is too small for ${result.length} columns`);
    let total = result.reduce((sum, width) => sum + width, 0);
    if (total <= available) return result;
    const code = state.wrap === "word" ? "terminal-width-wrapped" : "terminal-width-truncated";
    const verb = state.wrap === "word" ? "wrapped" : "truncated";
    addDiagnostic(state, code, `Columns exceed terminal width ${state.width} and were ${verb}`, path);
    while (total > available) {
        let index = -1;
        for (let candidate = 0; candidate < result.length; candidate += 1) {
            if (result[candidate] > 1 && (index < 0 || result[candidate] > result[index])) index = candidate;
        }
        if (index < 0) break;
        result[index] -= 1;
        total -= 1;
    }
    return result;
}

function align(value, width, mode = "left") {
    const text = truncate(value, width);
    if (mode === "right") return text.padStart(width);
    if (mode === "center") {
        const left = Math.floor((width - text.length) / 2);
        return `${" ".repeat(left)}${text}${" ".repeat(width - text.length - left)}`;
    }
    return text.padEnd(width);
}

function renderTable(value, state, path) {
    const headers = value.columns.map((column, index) => strictAscii(column.label, state, `${path}.column${index + 1}`));
    const rows = value.rows.map((row, rowIndex) => row.map((cell, columnIndex) =>
        cellText(cell, state, `${path}.row${rowIndex + 1}.column${columnIndex + 1}`)));
    const natural = headers.map((header, index) => Math.max(
        1,
        ...header.split("\n").map((line) => line.length),
        ...rows.flatMap((row) => row[index].split("\n").map((line) => line.length)),
    ));
    const overhead = value.columns.length * 3 + 1;
    const widths = shrinkWidths(natural, state.width - overhead, state, path);
    const border = `+${widths.map((width) => "-".repeat(width + 2)).join("+")}+`;
    const row = (cells, header = false, rowPath = path) => {
        const wrapped = cells.map((cell, index) => constrainLines(cell, widths[index], state, `${rowPath}.column${index + 1}`));
        const rowHeight = Math.max(...wrapped.map((lines) => lines.length));
        return Array.from({ length: rowHeight }, (_, line) => `|${wrapped.map((lines, index) => {
            const mode = header ? "left" : rixString(value.columns[index].align) || value.columns[index].align || "left";
            return ` ${align(lines[line] || "", widths[index], mode)} `;
        }).join("|")}|`);
    };
    const renderedRows = rows.flatMap((cells, index) => row(cells, false, `${path}.row${index + 1}`));
    const content = [border, ...row(headers, true, `${path}.header`), border, ...renderedRows, border].join("\n");
    const caption = value.caption ? constrainText(strictAscii(value.caption, state, `${path}.caption`), state, `${path}.caption`) : null;
    return [caption, content].filter(Boolean).join("\n");
}

function ruleNumber(rule, name) {
    const value = field(rule, name);
    if (value === null || value === undefined) return null;
    return numberValue(value, `Grid rule ${name}`);
}

function hasGridRule(value, kind, boundary) {
    return value.rules.some((rule) => field(rule, "kind") === kind
        && ruleNumber(rule, kind === "vertical" ? "afterColumn" : "aboveRow") === boundary);
}

function renderGrid(value, state, path) {
    const rows = value.rows.map((row, rowIndex) => row.map((cell, columnIndex) =>
        cellText(cell, state, `${path}.row${rowIndex + 1}.column${columnIndex + 1}`)));
    const natural = value.columns.map((_, index) => Math.max(
        1,
        ...rows.flatMap((row) => row[index].split("\n").map((line) => line.length)),
    ));
    const separators = natural.slice(1).map((_, index) => hasGridRule(value, "vertical", index + 2) ? " | " : "  ");
    const overhead = separators.reduce((sum, separator) => sum + separator.length, 0);
    const widths = shrinkWidths(natural, state.width - overhead, state, path);
    const styleAlign = rixString(field(value.style, "align")) || field(value.style, "align") || "right";
    const renderRow = (cells, rowPath) => {
        const wrapped = cells.map((cell, index) => constrainLines(cell, widths[index], state, `${rowPath}.column${index + 1}`));
        const rowHeight = Math.max(...wrapped.map((lines) => lines.length));
        return Array.from({ length: rowHeight }, (_, lineIndex) => {
            let line = align(wrapped[0][lineIndex] || "", widths[0], styleAlign);
            for (let column = 1; column < cells.length; column += 1) {
                line += separators[column - 1] + align(wrapped[column][lineIndex] || "", widths[column], styleAlign);
            }
            return line;
        });
    };
    const lines = [];
    for (let row = 0; row < rows.length; row += 1) {
        if (hasGridRule(value, "horizontal", row + 1)) {
            const firstVertical = separators.findIndex((separator) => separator === " | ");
            if (firstVertical < 0) lines.push("-".repeat(Math.min(state.width, widths.reduce((sum, width) => sum + width, overhead))));
            else {
                const prefix = widths.slice(0, firstVertical + 1).reduce((sum, width) => sum + width, 0)
                    + separators.slice(0, firstVertical).reduce((sum, separator) => sum + separator.length, 0) + 1;
                const total = widths.reduce((sum, width) => sum + width, overhead);
                lines.push(`${" ".repeat(prefix)}+${"-".repeat(Math.max(0, total - prefix - 1))}`);
            }
        }
        lines.push(...renderRow(rows[row], `${path}.row${row + 1}`));
    }
    return lines.join("\n");
}

function put(grid, row, column, character) {
    if (row < 0 || row >= grid.length || column < 0 || column >= grid[0].length) return;
    const previous = grid[row][column];
    grid[row][column] = previous === " " || previous === character ? character : "+";
}

function drawLine(grid, from, to, character) {
    let [x0, y0] = from;
    const [x1, y1] = to;
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let error = dx + dy;
    while (true) {
        put(grid, y0, x0, character);
        if (x0 === x1 && y0 === y1) break;
        const doubled = 2 * error;
        if (doubled >= dy) { error += dy; x0 += sx; }
        if (doubled <= dx) { error += dx; y0 += sy; }
    }
}

function renderGraphic(value, state, path) {
    const width = state.width;
    const height = state.height;
    const sourceWidth = numberValue(value.size[0], "Graphic width");
    const sourceHeight = numberValue(value.size[1], "Graphic height");
    if (!(sourceWidth > 0) || !(sourceHeight > 0)) throw new Error("Graphic size must be positive");
    const grid = Array.from({ length: height }, () => Array(width).fill(" "));
    const project = (point) => {
        const values = Array.isArray(point) ? point : point?.values;
        if (!Array.isArray(values) || values.length !== 2) throw new Error("Graphic point must contain x and y");
        return [
            Math.max(0, Math.min(width - 1, Math.round(numberValue(values[0], "Graphic x") / sourceWidth * (width - 1)))),
            Math.max(0, Math.min(height - 1, Math.round(numberValue(values[1], "Graphic y") / sourceHeight * (height - 1)))),
        ];
    };
    value.children.forEach((child, index) => {
        const childPath = `${path}.child${index + 1}`;
        if (outputKind(child) === "path" && Array.isArray(child.points)) {
            const points = child.points.map(project);
            const twoPoint = points.length === 2;
            const character = twoPoint && points[0][1] === points[1][1] ? "-"
                : twoPoint && points[0][0] === points[1][0] ? "|" : "*";
            for (let pointIndex = 1; pointIndex < points.length; pointIndex += 1) {
                drawLine(grid, points[pointIndex - 1], points[pointIndex], character);
            }
        } else if (outputKind(child) === "circle" || outputKind(child) === "drag_point") {
            put(grid, ...project(child.center).reverse(), "o");
        } else if (outputKind(child) === "rectangle") {
            const origin = project(child.origin);
            const size = Array.isArray(child.size) ? child.size : child.size?.values;
            const opposite = project([
                numberValue(child.origin[0], "Rectangle x") + numberValue(size[0], "Rectangle width"),
                numberValue(child.origin[1], "Rectangle y") + numberValue(size[1], "Rectangle height"),
            ]);
            drawLine(grid, origin, [opposite[0], origin[1]], "#");
            drawLine(grid, [opposite[0], origin[1]], opposite, "#");
            drawLine(grid, opposite, [origin[0], opposite[1]], "#");
            drawLine(grid, [origin[0], opposite[1]], origin, "#");
        } else if (outputKind(child) === "text_mark") {
            const [column, row] = project(child.position);
            const label = strictAscii(textValue(child.text, state.format), state, childPath);
            [...label].slice(0, width - column).forEach((character, offset) => put(grid, row, column + offset, character));
        } else {
            addDiagnostic(state, "terminal-graphic-node-unsupported", `Graphic node '${outputKind(child)}' is not supported by the Phase 1 ASCII rasterizer`, childPath);
            put(grid, Math.min(height - 1, index), 0, "?");
        }
    });
    return grid.map((row) => row.join("")).join("\n");
}

function renderNode(value, state, path = "value") {
    if (!isOutputValue(value)) return constrainText(strictAscii(portableValueText(value, state, path), state, path), state, path);
    if (value.kind === "table") return renderTable(value, state, path);
    if (value.kind === "grid") return renderGrid(value, state, path);
    if (value.kind === "graphic") return renderGraphic(value, state, path);
    if (value.kind === "figure") {
        const content = renderNode(value.content, state, `${path}.content`);
        const caption = value.caption ? constrainText(strictAscii(value.caption, state, `${path}.caption`), state, `${path}.caption`) : null;
        return [content, caption ? `Figure: ${caption}` : null].filter(Boolean).join("\n");
    }
    if (value.kind === "fragment") {
        return value.children.map((child, index) => renderNode(child, state, `${path}.child${index + 1}`)).join("\n\n");
    }
    if (value.kind === "slide") {
        const title = value.title ? `: ${strictAscii(value.title, state, `${path}.title`)}` : "";
        const heading = constrainText(`--- slide${title} ---`, state, `${path}.title`);
        return `${heading}\n${renderNode(value.content, state, `${path}.content`)}`;
    }
    if (value.kind === "slides") {
        const title = value.title ? constrainText(`Deck: ${strictAscii(value.title, state, `${path}.title`)}`, state, `${path}.title`) : null;
        const slides = value.slides.map((slide, index) => {
            const slideTitle = slide.title ? `: ${strictAscii(slide.title, state, `${path}.slide${index + 1}.title`)}` : "";
            const heading = constrainText(`--- slide ${index + 1}/${value.slides.length}${slideTitle} ---`, state, `${path}.slide${index + 1}.title`);
            return `${heading}\n${renderNode(slide.content, state, `${path}.slide${index + 1}.content`)}`;
        });
        return [title, ...slides].filter(Boolean).join("\n\n");
    }
    const fallback = strictAscii(formatOutputText(value, state.format), state, path);
    return constrainText(fallback, state, path);
}

function paginate(content, state) {
    if (state.pageHeight === null) return { content, pageCount: 1 };
    const lines = String(content).split("\n");
    const capacity = state.pageHeight - 1;
    const pageCount = Math.max(1, Math.ceil(lines.length / capacity));
    if (pageCount === 1) return { content, pageCount };
    addDiagnostic(state, "terminal-paginated", `Output was split into ${pageCount} pages`, "output", "info");
    const pages = Array.from({ length: pageCount }, (_, index) => {
        const page = lines.slice(index * capacity, (index + 1) * capacity);
        return [`--- page ${index + 1}/${pageCount} ---`, ...page].join("\n");
    });
    return { content: pages.join("\n"), pageCount };
}

export function renderTerminalAscii(value, { options = {}, format = String } = {}) {
    const state = {
        width: integerOption(options.width, 80, "terminalAscii width", 20, 240),
        height: integerOption(options.height, 16, "terminalAscii height", 4, 80),
        pageHeight: integerOption(field(options, "pageHeight"), null, "terminalAscii pageHeight", 4, 200),
        wrap: wrappingOption(field(options, "wrap")),
        format,
        diagnostics: [],
        diagnosticKeys: new Set(),
    };
    const rendered = renderNode(value, state);
    const paginated = paginate(rendered, state);
    return {
        content: `${strictAscii(paginated.content, state, "output")}\n`,
        diagnostics: state.diagnostics,
        metadata: {
            schema: TERMINAL_ASCII_SCHEMA,
            width: state.width,
            height: state.height,
            pageHeight: state.pageHeight,
            pageCount: paginated.pageCount,
            wrap: state.wrap,
            characterSet: "ASCII",
        },
    };
}
