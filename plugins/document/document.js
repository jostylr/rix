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

function exactPositiveInteger(value, label, fallback = 1) {
    if (value === null || value === undefined) return fallback;
    const integer = value instanceof Integer ? value.value : typeof value === "bigint" ? value : null;
    if (integer === null || integer < 1n || integer > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error(`${label} must be a positive Integer`);
    }
    return Number(integer);
}

function booleanValue(value, fallback = false) {
    if (value === null || value === undefined) return fallback;
    if (value instanceof Integer) return value.value !== 0n;
    return Boolean(value);
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

const NUMBER_STYLES = new Set(["decimal", "roman", "alpha"]);

export function createDocumentNumbering(args) {
    if (args.length > 1) throw new Error("document.Numbering expects an optional options map");
    const options = args[0] === null || args[0] === undefined ? new Map() : entries(args[0], "document.Numbering options");
    const style = text(field(options, "style", stringValue("decimal")), "document.Numbering style").toLowerCase();
    if (!NUMBER_STYLES.has(style)) throw new Error("document.Numbering style must be :decimal, :roman, or :alpha");
    const citationStyle = text(field(options, "citationStyle", stringValue("numeric")), "document.Numbering citationStyle").toLowerCase();
    if (!["numeric", "author-year"].includes(citationStyle)) {
        throw new Error("document.Numbering citationStyle must be :numeric or :author-year");
    }
    return mapValue([
        ["valueKind", stringValue("documentNumbering")],
        ["schema", stringValue("rix.document.numbering@1")],
        ["style", stringValue(style)],
        ["sectionStart", new Integer(BigInt(exactPositiveInteger(field(options, "sectionStart"), "document.Numbering sectionStart")))],
        ["figureStart", new Integer(BigInt(exactPositiveInteger(field(options, "figureStart"), "document.Numbering figureStart")))],
        ["tableStart", new Integer(BigInt(exactPositiveInteger(field(options, "tableStart"), "document.Numbering tableStart")))],
        ["citationStyle", stringValue(citationStyle)],
        ["numberSections", new Integer(booleanValue(field(options, "numberSections"), true) ? 1n : 0n)],
    ]);
}

function normalizeNumbering(value) {
    if (value === null || value === undefined) return createDocumentNumbering([]);
    const values = entries(value, "document.Report numbering");
    if (field(values, "schema")?.value === "rix.document.numbering@1") return value;
    return createDocumentNumbering([value]);
}

function bibliographyEntry(value, index) {
    const source = entries(value, `document.Bibliography entry ${index}`);
    const key = validLabel(field(source, "key"), `document.Bibliography entry ${index} key`);
    const title = text(field(source, "title"), `document.Bibliography entry ${index} title`);
    const authorValue = field(source, "author", stringValue("Unknown author"));
    const author = text(authorValue, `document.Bibliography entry ${index} author`);
    const yearValue = field(source, "year", stringValue("n.d."));
    const year = yearValue instanceof Integer ? String(yearValue.value) : text(yearValue, `document.Bibliography entry ${index} year`);
    const urlValue = field(source, "url");
    const url = urlValue === null ? null : text(urlValue, `document.Bibliography entry ${index} url`);
    return Object.freeze({ key, title, author, year, url, number: index });
}

export function createDocumentBibliography(args) {
    if (args.length < 1 || args.length > 2) throw new Error("document.Bibliography expects entries and optional options");
    const source = sequence(args[0], "document.Bibliography entries");
    const records = source.map((value, index) => bibliographyEntry(value, index + 1));
    const seen = new Set();
    for (const record of records) {
        if (seen.has(record.key)) throw new Error(`document.Bibliography contains duplicate key '${record.key}'`);
        seen.add(record.key);
    }
    const options = args[1] === null || args[1] === undefined ? new Map() : entries(args[1], "document.Bibliography options");
    const title = text(field(options, "title", stringValue("References")), "document.Bibliography title");
    return mapValue([
        ["valueKind", stringValue("documentBibliography")],
        ["schema", stringValue("rix.document.bibliography@1")],
        ["title", stringValue(title)],
        ["entries", sequenceValue(records.map((record) => mapValue([
            ["key", stringValue(record.key)], ["title", stringValue(record.title)],
            ["author", stringValue(record.author)], ["year", stringValue(record.year)],
            ["url", record.url === null ? null : stringValue(record.url)], ["number", new Integer(BigInt(record.number))],
        ])))],
    ]);
}

function normalizeBibliography(value) {
    if (value === null || value === undefined) return null;
    const values = entries(value, "document.Report bibliography");
    if (field(values, "schema")?.value !== "rix.document.bibliography@1") {
        throw new Error("document.Report bibliography must come from document.Bibliography");
    }
    return value;
}

export function createDocumentCitation(args) {
    if (args.length < 1 || args.length > 2) throw new Error("document.Citation expects a key/sequence and optional options");
    const rawKeys = (args[0]?.values || Array.isArray(args[0]))
        ? sequence(args[0], "document.Citation keys")
        : [args[0]];
    const keys = rawKeys.map((key, index) => validLabel(key, `document.Citation key ${index + 1}`));
    const options = args[1] === null || args[1] === undefined ? new Map() : entries(args[1], "document.Citation options");
    const prefixValue = field(options, "prefix");
    const suffixValue = field(options, "suffix");
    return textNode("", {
        documentCitation: Object.freeze({
            schema: "rix.document.citation@1",
            keys: Object.freeze(keys),
            prefix: prefixValue === null ? "" : text(prefixValue, "document.Citation prefix"),
            suffix: suffixValue === null ? "" : text(suffixValue, "document.Citation suffix"),
        }),
    });
}

export function createDocumentAssetManifest(args) {
    if (args.length !== 1) throw new Error("document.AssetManifest expects an entry sequence");
    const source = sequence(args[0], "document.AssetManifest entries");
    const seen = new Set();
    const assets = source.map((value, index) => {
        const record = entries(value, `document.AssetManifest entry ${index + 1}`);
        const id = validLabel(field(record, "id"), `document.AssetManifest entry ${index + 1} id`);
        if (seen.has(id)) throw new Error(`document.AssetManifest contains duplicate id '${id}'`);
        seen.add(id);
        const path = text(field(record, "path"), `document.AssetManifest entry ${index + 1} path`);
        if (path.startsWith("/") || path.includes("..")) throw new Error("document.AssetManifest paths must be safe relative paths");
        const mimeValue = field(record, "mime", stringValue("application/octet-stream"));
        const altValue = field(record, "alt", stringValue(""));
        return mapValue([
            ["id", stringValue(id)], ["path", stringValue(path)],
            ["mime", stringValue(text(mimeValue, "document.AssetManifest mime"))],
            ["alt", stringValue(text(altValue, "document.AssetManifest alt"))],
            ["checksum", field(record, "checksum")],
        ]);
    });
    return mapValue([
        ["valueKind", stringValue("documentAssetManifest")],
        ["schema", stringValue("rix.document.assets@1")],
        ["assets", sequenceValue(assets)],
    ]);
}

export function documentAsset(args) {
    if (args.length !== 2) throw new Error("document.Asset expects a manifest and id");
    const manifest = entries(args[0], "document.Asset manifest");
    if (field(manifest, "schema")?.value !== "rix.document.assets@1") throw new Error("document.Asset requires an AssetManifest");
    const id = validLabel(args[1], "document.Asset id");
    const match = sequence(field(manifest, "assets"), "document.Asset manifest assets")
        .find((asset) => field(asset, "id")?.value === id);
    if (!match) throw new Error(`document.AssetManifest has no asset '${id}'`);
    return match;
}

function documentRegion(args, kind) {
    if (args.length !== 1) throw new Error(`document.${kind} expects one portable output value`);
    const value = args[0];
    if (!isOutputValue(value)) throw new Error(`document.${kind} expects a portable output value`);
    const fragment = value.kind === "fragment" ? value : createFragment([[value], null]);
    return clone(fragment, { documentRegion: kind.toLowerCase() });
}

export const createDocumentHeader = (args) => documentRegion(args, "Header");
export const createDocumentFooter = (args) => documentRegion(args, "Footer");

export function createDocumentTargetMarkup(args) {
    if (args.length < 2 || args.length > 3) throw new Error("document.TargetMarkup expects target, content, and optional fallback");
    const target = text(args[0], "document.TargetMarkup target").toLowerCase();
    if (!/^[a-z][a-z0-9+.-]*$/.test(target)) throw new Error("document.TargetMarkup target must be a renderer target name");
    const content = text(args[1], "document.TargetMarkup content");
    const fallback = args[2] === null || args[2] === undefined ? "" : text(args[2], "document.TargetMarkup fallback");
    return textNode(fallback, {
        documentTargetMarkup: Object.freeze({ schema: "rix.document.target-markup@1", target, content }),
    });
}

export function createDocumentTemplate(args) {
    if (args.length < 1 || args.length > 2) throw new Error("document.Template expects a name and optional defaults map");
    const name = validLabel(args[0], "document.Template name");
    const defaults = args[1] === null || args[1] === undefined ? mapValue([]) : args[1];
    entries(defaults, "document.Template defaults");
    return mapValue([
        ["valueKind", stringValue("documentTemplate")],
        ["schema", stringValue("rix.document.template@1")],
        ["name", stringValue(name)],
        ["defaults", defaults],
        ["required", sequenceValue([stringValue("title"), stringValue("children")])],
    ]);
}

export function applyDocumentTemplate(args) {
    if (args.length !== 2) throw new Error("document.ApplyTemplate expects a Template and data map");
    const template = entries(args[0], "document.ApplyTemplate template");
    if (field(template, "schema")?.value !== "rix.document.template@1") throw new Error("document.ApplyTemplate requires a document.Template");
    const defaults = entries(field(template, "defaults"), "document.Template defaults");
    const data = entries(args[1], "document.ApplyTemplate data");
    const merged = new Map(defaults);
    for (const [key, value] of data) merged.set(key, value);
    const title = field(merged, "title");
    const children = field(merged, "children");
    if (title === null || children === null) throw new Error("document.ApplyTemplate needs title and children slots");
    const options = new Map(merged);
    options.delete("title"); options.delete("children");
    options.set("template", field(template, "name"));
    return createDocumentReport([title, children, mapValue([...options])]);
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

function romanNumber(value) {
    const pairs = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
    let remaining = value;
    let result = "";
    for (const [amount, symbol] of pairs) while (remaining >= amount) { result += symbol; remaining -= amount; }
    return result;
}

function alphaNumber(value) {
    let remaining = value;
    let result = "";
    while (remaining > 0) {
        remaining -= 1;
        result = String.fromCharCode(65 + (remaining % 26)) + result;
        remaining = Math.floor(remaining / 26);
    }
    return result;
}

function displayNumber(number, numbering) {
    const style = field(numbering, "style")?.value || "decimal";
    return style === "roman" ? romanNumber(number) : style === "alpha" ? alphaNumber(number) : String(number);
}

function collectReferences(children, numbering) {
    const counts = {
        section: exactPositiveInteger(field(numbering, "sectionStart"), "section start") - 1,
        figure: exactPositiveInteger(field(numbering, "figureStart"), "figure start") - 1,
        table: exactPositiveInteger(field(numbering, "tableStart"), "table start") - 1,
    };
    const numbers = new WeakMap();
    const labels = new Map();
    const ordered = [];

    const register = (id, value, kind, number) => {
        if (!id) return;
        validLabel(id, `${referenceKind(kind)} label`);
        if (labels.has(id)) throw new Error(`document.Report contains duplicate label '${id}'`);
        const display = displayNumber(number, numbering);
        const entry = Object.freeze({ id, kind, number, display, text: `${referenceKind(kind)} ${display}` });
        labels.set(id, entry);
        ordered.push(entry);
    };

    const visit = (value) => {
        if (!isOutputValue(value)) return;
        if (value.kind === "heading" || value.kind === "section") {
            const number = ++counts.section;
            numbers.set(value, Object.freeze({ number, display: displayNumber(number, numbering) }));
            register(value.id, value, value.kind, number);
        } else if (value.kind === "figure") {
            const number = ++counts.figure;
            numbers.set(value, Object.freeze({ number, display: displayNumber(number, numbering) }));
            register(value.label, value, value.kind, number);
        } else if (value.kind === "table") {
            const number = ++counts.table;
            numbers.set(value, Object.freeze({ number, display: displayNumber(number, numbering) }));
            register(value.label, value, value.kind, number);
        }
        childOutputs(value).forEach(visit);
    };
    children.forEach(visit);
    return { labels, numbers, ordered, numbering };
}

function numberedCaption(kind, number, caption) {
    const prefix = `${referenceKind(kind)} ${number.display}.`;
    return caption ? `${prefix} ${caption}` : prefix;
}

function resolveCitation(value, citations) {
    const citation = value.documentCitation;
    const selected = citation.keys.map((key) => {
        const record = citations.records.get(key);
        if (!record) throw new Error(`document.Report cannot resolve citation '${key}'`);
        citations.used.add(key);
        return record;
    });
    const body = citations.style === "author-year"
        ? selected.map((record) => `${record.author}, ${record.year}`).join("; ")
        : `[${selected.map((record) => record.number).join(", ")}]`;
    return textNode(`${citation.prefix}${body}${citation.suffix}`, {
        documentCitationResolved: Object.freeze({ ...citation, records: Object.freeze(selected) }),
    });
}

function resolveOutput(value, index, citations) {
    if (!isOutputValue(value)) return value;
    if (value.documentCitation) return resolveCitation(value, citations);
    if (value.documentReference) {
        const target = index.labels.get(value.documentReference);
        if (!target) throw new Error(`document.Report cannot resolve reference '${value.documentReference}'`);
        const content = value.documentReferenceText || target.text;
        return createLink([stringValue(`#${target.id}`), [textNode(content)]]);
    }

    if (value.kind === "heading") {
        const number = index.numbers.get(value);
        const prefix = field(index.numbering, "numberSections")?.value === 0n ? [] : [textNode(`${number.display}. `)];
        return clone(value, { content: [...prefix, ...inlineValues(value.content).map((child) => resolveOutput(child, index, citations))] });
    }
    if (value.kind === "section") {
        const number = index.numbers.get(value);
        const prefix = field(index.numbering, "numberSections")?.value === 0n ? [] : [textNode(`${number.display}. `)];
        return clone(value, {
            title: [...prefix, ...inlineValues(value.title).map((child) => resolveOutput(child, index, citations))],
            children: Object.freeze(value.children.map((child) => resolveOutput(child, index, citations))),
        });
    }
    if (value.kind === "figure" || value.kind === "table") {
        const number = index.numbers.get(value);
        return clone(value, { caption: numberedCaption(value.kind, number, value.caption) });
    }
    if (["fragment", "list_item", "quote", "callout"].includes(value.kind)) {
        return clone(value, { children: Object.freeze(value.children.map((child) => resolveOutput(child, index, citations))) });
    }
    if (value.kind === "list") {
        return clone(value, { items: Object.freeze(value.items.map((child) => resolveOutput(child, index, citations))) });
    }
    if (["paragraph", "emphasis", "strong", "link"].includes(value.kind)) {
        return clone(value, { children: Object.freeze(value.children.map((child) => resolveOutput(child, index, citations))) });
    }
    return value;
}

function reportChildren(value) {
    if (isOutputValue(value) && value.kind === "fragment") return value.children;
    return sequence(value, "document.Report children");
}

function normalizeAssets(value) {
    if (value === null || value === undefined) return null;
    const values = entries(value, "document.Report assets");
    if (field(values, "schema")?.value !== "rix.document.assets@1") throw new Error("document.Report assets must come from document.AssetManifest");
    return value;
}

function citationIndex(bibliography, numbering) {
    const records = new Map();
    if (bibliography !== null) {
        for (const value of sequence(field(bibliography, "entries"), "document.Bibliography entries")) {
            const record = {
                key: field(value, "key").value,
                title: field(value, "title").value,
                author: field(value, "author").value,
                year: field(value, "year").value,
                url: field(value, "url")?.value || null,
                number: Number(field(value, "number").value),
            };
            records.set(record.key, Object.freeze(record));
        }
    }
    return { records, used: new Set(), style: field(numbering, "citationStyle")?.value || "numeric" };
}

function bibliographyOutputs(bibliography) {
    if (bibliography === null) return [];
    const title = field(bibliography, "title")?.value || "References";
    const heading = clone(createHeading([new Integer(1n), stringValue(title), stringValue("references"), null]), {
        id: "references", documentBibliographyHeading: true,
    });
    const paragraphs = sequence(field(bibliography, "entries"), "document.Bibliography entries").map((value) => {
        const number = field(value, "number").value;
        const author = field(value, "author").value;
        const year = field(value, "year").value;
        const titleValue = field(value, "title").value;
        const url = field(value, "url")?.value;
        const rendered = `[${number}] ${author} (${year}). ${titleValue}.${url ? ` ${url}` : ""}`;
        return clone(createParagraph([[textNode(rendered)]]), {
            id: `ref-${field(value, "key").value}`,
            documentBibliographyKey: field(value, "key").value,
        });
    });
    return [heading, ...paragraphs];
}

function metadata(theme, title, numbering, assets, bibliography, template) {
    return mapValue([
        ["schema", stringValue("rix.document.report@1")],
        ["title", stringValue(title)],
        ["theme", theme],
        ["numbering", numbering],
        ["assets", assets],
        ["bibliography", bibliography],
        ["template", template],
    ]);
}

export function createDocumentReport(args) {
    if (args.length < 2 || args.length > 3) throw new Error("document.Report expects a title, children, and optional options");
    const title = text(args[0], "document.Report title");
    if (!title.trim()) throw new Error("document.Report title must not be empty");
    const options = args[2] === null || args[2] === undefined ? new Map() : entries(args[2], "document.Report options");
    const theme = normalizeTheme(field(options, "theme"));
    const numbering = normalizeNumbering(field(options, "numbering"));
    const bibliography = normalizeBibliography(field(options, "bibliography"));
    const assets = normalizeAssets(field(options, "assets"));
    const header = field(options, "header");
    const footer = field(options, "footer");
    if (header !== null && (!isOutputValue(header) || header.documentRegion !== "header")) throw new Error("document.Report header must come from document.Header");
    if (footer !== null && (!isOutputValue(footer) || footer.documentRegion !== "footer")) throw new Error("document.Report footer must come from document.Footer");
    const templateValue = field(options, "template");
    const template = templateValue === null ? null : text(templateValue, "document.Report template");
    const authorValue = field(options, "author");
    const author = authorValue === null ? null : text(authorValue, "document.Report author");
    const sourceChildren = reportChildren(args[1]);
    if (!sourceChildren.every(isOutputValue)) throw new Error("document.Report children must be portable output values");
    const index = collectReferences(sourceChildren, numbering);
    const citations = citationIndex(bibliography, numbering);
    const resolved = sourceChildren.map((child) => resolveOutput(child, index, citations));
    const titleStyle = mapValue([["color", field(theme, "accent")], ["density", field(theme, "density")]]);
    const heading = createHeading([new Integer(1n), stringValue(title), null, titleStyle]);
    const byline = author === null ? [] : [createParagraph([[textNode(`By ${author}`)]])];
    const bibliographyChildren = bibliographyOutputs(bibliography);
    const fragment = createFragment([[
        ...(header === null ? [] : [header]), heading, ...byline, ...resolved,
        ...bibliographyChildren, ...(footer === null ? [] : [footer]),
    ], metadata(theme, title, numbering, assets, bibliography, template)]);
    return clone(fragment, {
        documentSchema: "rix.document.report@1",
        documentVersion: 2,
        documentTheme: theme,
        documentNumbering: numbering,
        documentBibliography: bibliography,
        documentAssets: assets,
        documentTemplate: template,
        documentCitations: Object.freeze([...citations.used]),
        documentHeader: header,
        documentFooter: footer,
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
        ["displayNumber", stringValue(reference.display)],
        ["text", stringValue(reference.text)],
    ])));
}
