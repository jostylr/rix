import { Integer } from "@ratmath/core";
import {
    createFragment,
    createHeading,
    createLink,
    createParagraph,
    createText,
    isOutputValue,
} from "../../src/runtime/output.js";

const stringValue = (value) => ({ type: "string", value: String(value) });
const sequenceValue = (values) => ({ type: "sequence", values });

function mapValue(values) {
    return {
        type: "map",
        entries: new Map(values),
        _ext: new Map([["immutable", new Integer(1n)]]),
    };
}

function entries(value, label) {
    if (value?.type === "map" && value.entries instanceof Map) return value.entries;
    if (value instanceof Map) return value;
    throw new Error(`${label} must be a map`);
}

function field(source, name, fallback = null) {
    const values = source instanceof Map ? source : source?.entries;
    if (!(values instanceof Map)) return fallback;
    if (values.has(name)) return values.get(name);
    const wanted = String(name).toLowerCase();
    for (const [key, value] of values) {
        if (String(key).toLowerCase() === wanted) return value;
    }
    return fallback;
}

function text(value, label) {
    if (value?.type === "string") return value.value;
    if (typeof value === "string") return value;
    throw new Error(`${label} must be a string or colon-string`);
}

function sequence(value, label) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.values)) return value.values;
    throw new Error(`${label} must be a sequence`);
}

function validLabel(value, label) {
    const result = text(value, label);
    if (!/^[A-Za-z][A-Za-z0-9:_-]*$/.test(result)) {
        throw new Error(`${label} must start with a letter and contain only letters, digits, colon, underscore, or hyphen`);
    }
    return result;
}

function clone(value, fields) {
    return Object.freeze({ ...value, ...fields });
}

function textNode(value, fields = {}) {
    return clone(createText([stringValue(value)]), fields);
}

function inlineValues(value) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.values)) return value.values;
    return [value];
}

const THEMES = Object.freeze({
    plain: Object.freeze({ accent: "#275dad", density: "comfortable" }),
    compact: Object.freeze({ accent: "#174c3b", density: "compact" }),
});

export function createDocumentTheme(args) {
    if (args.length > 2) throw new Error("document.Theme expects an optional name and options map");
    const name = args[0] === null || args[0] === undefined ? "plain" : text(args[0], "document.Theme name").toLowerCase();
    const defaults = THEMES[name];
    if (!defaults) throw new Error("document.Theme name must be :plain or :compact");
    const options = args[1] === null || args[1] === undefined ? new Map() : entries(args[1], "document.Theme options");
    const accentValue = field(options, "accent", stringValue(defaults.accent));
    const densityValue = field(options, "density", stringValue(defaults.density));
    const accent = text(accentValue, "document.Theme accent");
    const density = text(densityValue, "document.Theme density").toLowerCase();
    if (!/^#[0-9a-f]{6}$/i.test(accent)) throw new Error("document.Theme accent must be a six-digit hex color");
    if (!["comfortable", "compact"].includes(density)) {
        throw new Error("document.Theme density must be :comfortable or :compact");
    }
    return mapValue([
        ["valueKind", stringValue("documentTheme")],
        ["schema", stringValue("rix.document.theme@1")],
        ["name", stringValue(name)],
        ["accent", stringValue(accent.toLowerCase())],
        ["density", stringValue(density)],
    ]);
}

function normalizeTheme(value) {
    if (value === null || value === undefined) return createDocumentTheme([]);
    if (value?.type === "string" || typeof value === "string") return createDocumentTheme([value]);
    const values = entries(value, "document.Report theme");
    if (field(values, "schema")?.value === "rix.document.theme@1") return value;
    return createDocumentTheme([field(values, "name", stringValue("plain")), value]);
}

export function labelDocumentValue(args) {
    if (args.length !== 2) throw new Error("document.Label expects an id and output value");
    const id = validLabel(args[0], "document.Label id");
    const value = args[1];
    if (!isOutputValue(value) || !["heading", "section", "figure", "table"].includes(value.kind)) {
        throw new Error("document.Label accepts Heading, Section, Figure, or Table output values");
    }
    if (value.kind === "heading" || value.kind === "section") return clone(value, { id });
    if (value.kind === "figure") return clone(value, { label: id });
    return clone(value, { label: id });
}

export function createDocumentReference(args) {
    if (args.length < 1 || args.length > 2) throw new Error("document.Ref expects an id and optional display text");
    const id = validLabel(args[0], "document.Ref id");
    const display = args[1] === null || args[1] === undefined ? null : text(args[1], "document.Ref text");
    return textNode("", { documentReference: id, documentReferenceText: display });
}

function childOutputs(value) {
    if (!isOutputValue(value)) return [];
    if (["fragment", "section", "list_item", "quote", "callout"].includes(value.kind)) return value.children || [];
    if (value.kind === "list") return value.items || [];
    if (value.kind === "paragraph" || value.kind === "emphasis" || value.kind === "strong" || value.kind === "link") return value.children || [];
    return [];
}

function referenceKind(kind) {
    return kind === "heading" || kind === "section" ? "Section" : kind === "figure" ? "Figure" : "Table";
}

function collectReferences(children) {
    const counts = { section: 0, figure: 0, table: 0 };
    const numbers = new WeakMap();
    const labels = new Map();
    const ordered = [];

    const register = (id, value, kind, number) => {
        if (!id) return;
        validLabel(id, `${referenceKind(kind)} label`);
        if (labels.has(id)) throw new Error(`document.Report contains duplicate label '${id}'`);
        const entry = Object.freeze({ id, kind, number, text: `${referenceKind(kind)} ${number}` });
        labels.set(id, entry);
        ordered.push(entry);
        numbers.set(value, number);
    };

    const visit = (value) => {
        if (!isOutputValue(value)) return;
        if (value.kind === "heading" || value.kind === "section") {
            const number = ++counts.section;
            numbers.set(value, number);
            register(value.id, value, value.kind, number);
        } else if (value.kind === "figure") {
            const number = ++counts.figure;
            numbers.set(value, number);
            register(value.label, value, value.kind, number);
        } else if (value.kind === "table") {
            const number = ++counts.table;
            numbers.set(value, number);
            register(value.label, value, value.kind, number);
        }
        childOutputs(value).forEach(visit);
    };
    children.forEach(visit);
    return { labels, numbers, ordered };
}

function numberedCaption(kind, number, caption) {
    const prefix = `${referenceKind(kind)} ${number}.`;
    return caption ? `${prefix} ${caption}` : prefix;
}

function resolveOutput(value, index) {
    if (!isOutputValue(value)) return value;
    if (value.documentReference) {
        const target = index.labels.get(value.documentReference);
        if (!target) throw new Error(`document.Report cannot resolve reference '${value.documentReference}'`);
        const content = value.documentReferenceText || target.text;
        return createLink([stringValue(`#${target.id}`), [textNode(content)]]);
    }

    if (value.kind === "heading") {
        const number = index.numbers.get(value);
        return clone(value, { content: [textNode(`${number}. `), ...inlineValues(value.content).map((child) => resolveOutput(child, index))] });
    }
    if (value.kind === "section") {
        const number = index.numbers.get(value);
        return clone(value, {
            title: [textNode(`${number}. `), ...inlineValues(value.title).map((child) => resolveOutput(child, index))],
            children: Object.freeze(value.children.map((child) => resolveOutput(child, index))),
        });
    }
    if (value.kind === "figure" || value.kind === "table") {
        const number = index.numbers.get(value);
        return clone(value, { caption: numberedCaption(value.kind, number, value.caption) });
    }
    if (["fragment", "list_item", "quote", "callout"].includes(value.kind)) {
        return clone(value, { children: Object.freeze(value.children.map((child) => resolveOutput(child, index))) });
    }
    if (value.kind === "list") {
        return clone(value, { items: Object.freeze(value.items.map((child) => resolveOutput(child, index))) });
    }
    if (["paragraph", "emphasis", "strong", "link"].includes(value.kind)) {
        return clone(value, { children: Object.freeze(value.children.map((child) => resolveOutput(child, index))) });
    }
    return value;
}

function reportChildren(value) {
    if (isOutputValue(value) && value.kind === "fragment") return value.children;
    return sequence(value, "document.Report children");
}

function metadata(theme, title) {
    return mapValue([
        ["schema", stringValue("rix.document.report@1")],
        ["title", stringValue(title)],
        ["theme", theme],
    ]);
}

export function createDocumentReport(args) {
    if (args.length < 2 || args.length > 3) throw new Error("document.Report expects a title, children, and optional options");
    const title = text(args[0], "document.Report title");
    if (!title.trim()) throw new Error("document.Report title must not be empty");
    const options = args[2] === null || args[2] === undefined ? new Map() : entries(args[2], "document.Report options");
    const theme = normalizeTheme(field(options, "theme"));
    const authorValue = field(options, "author");
    const author = authorValue === null ? null : text(authorValue, "document.Report author");
    const sourceChildren = reportChildren(args[1]);
    if (!sourceChildren.every(isOutputValue)) throw new Error("document.Report children must be portable output values");
    const index = collectReferences(sourceChildren);
    const resolved = sourceChildren.map((child) => resolveOutput(child, index));
    const titleStyle = mapValue([["color", field(theme, "accent")], ["density", field(theme, "density")]]);
    const heading = createHeading([new Integer(1n), stringValue(title), null, titleStyle]);
    const byline = author === null ? [] : [createParagraph([[textNode(`By ${author}`)]])];
    const fragment = createFragment([[heading, ...byline, ...resolved], metadata(theme, title)]);
    return clone(fragment, {
        documentSchema: "rix.document.report@1",
        documentTheme: theme,
        documentReferences: Object.freeze(index.ordered),
    });
}

export function documentReferences(args) {
    if (args.length !== 1) throw new Error("document.References expects a Report");
    const report = args[0];
    if (report?.documentSchema !== "rix.document.report@1" || !Array.isArray(report.documentReferences)) {
        throw new Error("document.References requires a document Report");
    }
    return sequenceValue(report.documentReferences.map((reference) => mapValue([
        ["id", stringValue(reference.id)],
        ["kind", stringValue(referenceKind(reference.kind))],
        ["number", new Integer(BigInt(reference.number))],
        ["text", stringValue(reference.text)],
    ])));
}

