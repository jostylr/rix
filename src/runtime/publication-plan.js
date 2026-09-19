/** Bounded presentation metadata over the retained document tree. No I/O. */
import { Integer } from "@ratmath/core";

export const PUBLICATION_PLAN_SCHEMA = "rix.publication-plan@1";
export const PUBLICATION_PROJECT_SCHEMA = "rix.publication-project@1";
const DEFAULTS = Object.freeze({ schema: PUBLICATION_PLAN_SCHEMA, profile: "article", pageSize: "letterpaper",
    slideSize: "wide", theme: "plain", columns: 1, floats: "inline", longTableRows: 40,
    repeatTableHeaders: true, runningRegions: true, bibliography: "retained", index: [], requires: [] });
const fail = message => { throw new Error(`Publication: ${message}`); };
const unwrap = value => value instanceof Integer ? Number(value.value) : value?.type === "string" ? value.value : value;
const sequence = value => Array.isArray(value) ? value : value?.values;
function fields(value, label) {
    if (value instanceof Map) return value;
    if (value?.type === "map" && value.entries instanceof Map) return value.entries;
    if (value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype) return Object.entries(value);
    fail(`${label} must be a map`);
}
export function publicationField(value, key, fallback = null) {
    for (const [name, entry] of fields(value, "record")) if (String(name).toLowerCase() === key.toLowerCase()) return entry;
    return fallback;
}
function shortText(value, label, max = 4096) {
    const text = unwrap(value);
    if (typeof text !== "string" || text.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) fail(`invalid ${label}`);
    return text;
}
function label(value) {
    const text = shortText(value, "label", 128);
    if (!/^[A-Za-z][A-Za-z0-9:_-]*$/.test(text)) fail("invalid label");
    return text;
}
export function createPublicationPlan(options = {}, value = null) {
    const plan = { ...DEFAULTS, profile: ["slide", "slides"].includes(value?.kind) ? "slides" : "article" };
    const keys = new Map(Object.keys(DEFAULTS).map(key => [key.toLowerCase(), key]));
    for (const [name, entry] of fields(options ?? {}, "plan")) {
        const key = keys.get(String(name).toLowerCase());
        if (!key) fail(`unknown plan field ${name}`);
        plan[key] = unwrap(entry);
    }
    if (plan.schema !== PUBLICATION_PLAN_SCHEMA) fail("unsupported plan version");
    for (const [key, choices] of Object.entries({ profile: ["article", "slides"], pageSize: ["letterpaper", "a4paper", "a5paper"],
        slideSize: ["standard", "wide"], theme: ["plain", "compact"], floats: ["inline", "top", "bottom", "page"], bibliography: ["retained"] })) {
        if (!choices.includes(plan[key])) fail(`invalid ${key}`);
    }
    for (const [key, low, high] of [["columns", 1, 4], ["longTableRows", 1, 1000]]) {
        if (!Number.isSafeInteger(plan[key]) || plan[key] < low || plan[key] > high) fail(`${key} must be within ${low}…${high}`);
    }
    for (const key of ["repeatTableHeaders", "runningRegions"]) {
        if ([0, 1].includes(plan[key])) plan[key] = Boolean(plan[key]);
        if (typeof plan[key] !== "boolean") fail(`${key} must be boolean or 0/1`);
    }
    const entries = sequence(plan.index), requires = sequence(plan.requires);
    if (!entries || entries.length > 500 || !requires || requires.length > 16) fail("index/capability budget exceeded or invalid sequence");
    const seen = new Set();
    plan.index = Object.freeze(entries.map(entry => {
        const term = shortText(publicationField(entry, "term"), "index term", 256);
        const target = label(publicationField(entry, "label"));
        if (!term.trim() || seen.has(term + "\0" + target)) fail("empty or duplicate index entry");
        seen.add(term + "\0" + target); return Object.freeze({ term, label: target });
    }).sort((a, b) => a.term < b.term ? -1 : a.term > b.term ? 1 : a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
    plan.requires = Object.freeze([...new Set(requires.map(value => shortText(value, "capability", 64)))].sort());
    const allowed = new Set(["svg", "png", "tikz", "audio", "video", "pdf", "tagged-pdf", "pdf-a", "embedded-fonts", "color-managed"]);
    if (plan.requires.some(name => !allowed.has(name))) fail("unknown required capability");
    return Object.freeze(plan);
}

export function resolvePublicationPlan(value, options = {}) {
    return createPublicationPlan(publicationField(options ?? {}, "publicationPlan", value?.publicationPlan ?? {}), value);
}
export function withPublicationPlan(value, options = {}) {
    if (value?.type !== "output") fail("Publish expects retained output");
    const plan = createPublicationPlan(options, value);
    if (plan.profile === "slides" && !["slides", "slide"].includes(value.kind)) fail("slides profile requires explicit Slide/Slides content");
    validatePublicationTree(value, plan);
    return Object.freeze({ ...value, publicationPlan: plan });
}

/** Visit semantic children only, preserving exact values and shared object identity. */
export function visitPublicationTree(root, visit) {
    let count = 0;
    const active = new Set();
    function walk(value, path, depth) {
        if (!value || typeof value !== "object") return;
        if (++count > 20000 || depth > 64) fail("document work/depth budget exceeded");
        if (active.has(value)) fail("cyclic document");
        active.add(value); visit(value, path);
        for (const key of ["children", "items", "slides", "title", "caption", "transcript", "attribution"]) {
            if (Array.isArray(value[key])) value[key].forEach((child, index) => walk(child, `${path}.${key}[${index}]`, depth + 1));
        }
        if (value.content) Array.isArray(value.content) ? value.content.forEach((child,index) => walk(child,`${path}.content[${index}]`,depth+1)) : walk(value.content, `${path}.content`, depth + 1);
        for (const [index, frame] of (value.frames || value.snapshots || []).entries()) walk(frame.content, `${path}.frames[${index}]`, depth + 1);
        active.delete(value);
    }
    walk(root, "$", 0);
}
export function validatePublicationTree(value, plan) {
    const labels = new Map(), regions = { header: [], footer: [] };
    visitPublicationTree(value, (node, path) => {
        const id = node.label || node.id;
        if (id && node.type === "output" && !node.kind?.startsWith("control_")) {
            if (labels.has(id)) fail(`duplicate label ${id} at ${path}`);
            labels.set(id, path);
        }
        if (Object.hasOwn(regions, node.documentRegion)) regions[node.documentRegion].push(node);
    });
    for (const entry of plan.index) if (!labels.has(entry.label)) fail(`index label ${entry.label} does not exist`);
    return { labels, regions };
}

export function publicationDiagnostics(plan, target) {
    const diagnostics = [], add = (code,message) => diagnostics.push({level:"warning",code,message});
    const supported = new Set(target === "html" ? ["svg", "png", "audio", "video"] : target === "quarto" ? ["svg", "png"] : target === "latex" || target === "pdf" ? ["tikz", "png", ...(target === "pdf" ? ["pdf"] : [])] : []);
    for (const capability of plan.requires) if (!supported.has(capability)) add("publication-capability-unverified", `${target} cannot promise ${capability}; no conformance or provider guarantee is implied.`);
    if (target === "pdf") add("publication-pdf-conformance-unverified", "PDF output has no verified tagged-PDF/PDF-A, embedded-font or color-management conformance.");
    if (plan.columns > 1 && (target === "markdown" || plan.profile === "slides")) add("publication-columns-fallback", `${target} uses sequential content for this multi-column request.`);
    if (plan.floats !== "inline" && !["latex", "pdf"].includes(target)) add("publication-floats-fallback", `${target} retains figure/table order; float placement is a target hint.`);
    return diagnostics;
}

export function safePublicationPath(value) {
    const text = shortText(value, "relative publication path", 512);
    if (!text || !/^[A-Za-z0-9_.\/-]+$/.test(text) || text.startsWith("/") || text.split("/").some(part => !part || part === "." || part === "..")) fail("unsafe publication path");
    return text;
}

/** Shared Quarto project layout, also used by Notebook's existing exports. */
export function quartoProjectYaml(title, pages, { type = "website", outputDir = "_site" } = {}) {
    if (!["website", "book", "default"].includes(type)) fail("project type must be website, book, or default");
    if (!Array.isArray(pages) || pages.length > 256) fail("project page budget exceeded");
    const paths = pages.map(page => safePublicationPath(page.path));
    if (new Set(paths).size !== paths.length) fail("duplicate project path");
    const header = `project:\n  type: ${type}\n  output-dir: ${JSON.stringify(safePublicationPath(outputDir))}\n`;
    if (type === "default") return header;
    const labelText = shortText(title, "project title");
    if (type === "book") return `${header}book:\n  title: ${JSON.stringify(labelText)}\n  chapters:${paths.length ? "\n" + paths.map(path => `    - ${JSON.stringify(path)}`).join("\n") : " []"}\nformat:\n  html:\n    toc: true\n`;
    const nav = pages.map((page, index) => `      - href: ${JSON.stringify(paths[index])}\n        text: ${JSON.stringify(shortText(page.title ?? paths[index], "page title"))}`).join("\n");
    return `${header}website:\n  title: ${JSON.stringify(labelText)}\n  navbar:\n    left:${nav ? "\n" + nav : " []"}\nformat:\n  html:\n    toc: true\n`;
}

export function publicationRecord(value) {
    if (value === null) return null;
    if (typeof value === "string") return {type:"string",value};
    if (typeof value === "number" || typeof value === "boolean") return new Integer(BigInt(value));
    if (Array.isArray(value)) return {type:"sequence",values:value.map(publicationRecord)};
    if (value?.type === "output") return value;
    return {type:"map",entries:new Map(Object.entries(value).map(([key,entry])=>[key,publicationRecord(entry)]))};
}
