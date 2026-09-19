/** Inert, bounded persistence for portable output trees. No evaluator or host I/O. */
import { Integer, Rational, Fraction, FractionInterval, RationalInterval, RationalIntervalSet, CertifiedApproximation } from "@ratmath/core";
import * as output from "./output.js";
import { UNDECIDED, isUndecided, undecidedDiagnostic } from "./decision.js";
import { HOLE, isHole } from "./hole.js";
import { coordinateTuple, resolveLabeledCoordinate } from "./sheet-labels.js";
import { encodeMathematicalJSON, decodeMathematicalJSON } from "./math-json.js";
import { isMathExpression } from "./math-expression.js";
import { realConstantState } from "./math-real.js";
import { createShaped, isShaped, shapedScalarDomain, shapedGetBySelectors } from "./shaped.js";
import { createNumericPolicy } from "./numeric-presentation.js";
import { createPublicationPlan, validatePublicationTree } from "./publication-plan.js";

export const OUTPUT_DOCUMENT_SCHEMA = "rix.output.document@1";
const DEFAULTS = Object.freeze({ maxBytes: 4_000_000, maxNodes: 20_000, maxEdges: 100_000, maxDepth: 128, maxDigits: 4096 });
const MODES = new Set(["warn-and-skip", "strict-error", "preserve-opaque"]);
const OPAQUE = Symbol("inert output record");
const fail = (message, path = "$", code = "output-json-invalid") => {
    throw Object.assign(new Error(`Output JSON at ${path}: ${message}`), { code, path });
};
const record = value => value !== null && typeof value === "object" && !Array.isArray(value);
const wrapper = value => ({ type: "map", entries: value instanceof Map ? value : new Map(Object.entries(value)) });
const TEXT = value => ({ type: "string", value });
const CTORS = Object.assign(Object.create(null), {
    text: "createText", paragraph: "createParagraph", heading: "createHeading", fragment: "createFragment",
    emphasis: "createEmphasis", strong: "createStrong", code: "createCode", math: "createMath", link: "createLink",
    line_break: "createLineBreak", section: "createSection", list_item: "createListItem", list: "createList",
    quote: "createQuote", callout: "createCallout", code_block: "createCodeBlock", math_block: "createMathBlock",
    asset: "createAsset", image: "createImage", audio: "createAudio", video: "createVideo", table: "createTable",
    grid: "createGrid", graphic: "createGraphic", path: "createPath", group: "createGroup", transform: "createTransform",
    text_mark: "createTextMark", rectangle: "createRectangle", circle: "createCircle", clip: "createClip",
    figure: "createFigure", slide: "createSlide", slides: "createSlides",
});
const STATIC_KINDS = new Set(["sheet", "control_panel", "control_slider", "control_input", "control_choice", "control_toggle",
    "control_range", "control_reset", "control_action", "control_hold", "snapshots", "timeline", "timeline_manifest", "timeline_render",
    "scene3d_snapshot", "timeline_track", "drag_point", "graphic_action"]);
const REQUIRED = {
    text: ["value"], paragraph: ["children"], heading: ["level", "content"], fragment: ["children"],
    emphasis: ["children"], strong: ["children"], code: ["code"], math: ["source"], link: ["href", "children"],
    section: ["level", "title", "children"], list_item: ["children"], list: ["items", "ordered"], quote: ["children"],
    callout: ["variant", "children"], code_block: ["code"], math_block: ["source"], asset: ["ref", "mime"],
    image: ["asset", "alt"], audio: ["asset"], video: ["asset"], table: ["columns", "rows"], grid: ["columns", "rows", "rules"],
    graphic: ["size", "children"], path: [], group: ["children"], transform: ["children"],
    text_mark: ["position", "text"], rectangle: ["origin", "size"], circle: ["center", "radius"], clip: ["bounds", "children"],
    figure: ["content"], slide: ["content"], slides: ["slides"], sheet: ["shape", "cells", "planes", "viewAxes", "rank"],
    control_panel: ["controls"], snapshots: ["snapshots"], timeline: ["frames"], timeline_manifest: ["frames"],
    timeline_render: ["content", "timeline", "frame"], scene3d_snapshot: ["value"],
};
function settings(options = {}) {
    const result = { ...DEFAULTS, unknownTags: "warn-and-skip", ...options };
    for (const name of Object.keys(DEFAULTS)) {
        if (!Number.isSafeInteger(result[name]) || result[name] < 1 || result[name] > DEFAULTS[name] * 16) fail(`invalid ${name}`);
    }
    if (!MODES.has(result.unknownTags)) fail("unknownTags must be warn-and-skip, strict-error, or preserve-opaque");
    return result;
}
function digits(value, limits, path) {
    if (typeof value !== "string" || value.length > limits.maxDigits || !/^(0|-?[1-9][0-9]*)$/.test(value)) fail("invalid or oversized integer", path);
    return BigInt(value);
}
function entries(value, path) {
    if (!record(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail("unsupported host object", path);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
        if (descriptor.get || descriptor.set) fail(`accessor ${key} is not inert`, path);
        if (["__proto__", "prototype", "constructor"].includes(key)) fail(`unsafe key ${key}`, path);
    }
    return Object.entries(value);
}
function list(value, path) { if (!Array.isArray(value)) fail("expected an array", path); return value; }
function assertKeys(value, allowed, path) {
    if (!record(value) || Object.keys(value).some(key => !allowed.includes(key)) || allowed.some(key => !Object.hasOwn(value, key))) fail("unexpected or missing fields", path);
}

/** Encode one shared document graph. Live widgets must first be explicitly snapshotted. */
export function encodeOutputJSON(value, options = {}) {
    const limits = settings(options), nodes = [], seen = new Map(), active = new Set(), maths = [], sources = new Map();
    let edges = 0;
    const formalGraphs=new WeakMap();
    function unscopedRationalGraph(root,path) {
        if(formalGraphs.has(root))return formalGraphs.get(root);
        const stack=[[root,0]],visited=new Set();let work=0;
        while(stack.length) {
            const [node,depth]=stack.pop();
            if(++work>limits.maxEdges || depth>limits.maxDepth)fail("formal graph work/depth budget exceeded",path);
            entries(node,path);
            if(visited.has(node))continue;visited.add(node);
            if(!isMathExpression(node) || node.entries.has("symbolid") || node.entries.get("bound")) {formalGraphs.set(root,false);return false;}
            const kind=node.entries.get("kind")?.value;
            if(kind==="variable")continue;
            if(kind==="constant") {
                const value=node.entries.get("value");
                if(value instanceof Integer || value instanceof Rational)continue;
                formalGraphs.set(root,false);return false;
            }
            const children=node.entries.get(kind==="operator"?"operands":"arguments")?.values;
            if(!["operator","apply"].includes(kind)||!Array.isArray(children)) {formalGraphs.set(root,false);return false;}
            if(children.length>limits.maxEdges)fail("formal graph work/depth budget exceeded",path);
            for(const entry of children)stack.push([entry,depth+1]);
        }
        for(const node of visited)formalGraphs.set(node,true);
        return true;
    }
    function child(item, path, depth) {
        if (++edges > limits.maxEdges || depth > limits.maxDepth) fail("graph work/depth budget exceeded", path);
        if (item === null || typeof item === "string" || typeof item === "boolean") return item;
        if (typeof item === "number") { if (!Number.isFinite(item)) fail("nonfinite number", path); return item; }
        if (typeof item === "bigint") { digits(String(item), limits, path); return { $bigint: String(item) }; }
        if (typeof item !== "object" || item === undefined) fail("unsupported value or callable", path);
        if ([Object.prototype, null].includes(Object.getPrototypeOf(item))) entries(item, path);
        if (active.has(item)) fail("cyclic document graph", path);
        if (seen.has(item)) return { $ref: seen.get(item) };
        if (nodes.length >= limits.maxNodes) fail("node budget exceeded", path);
        const id = `n${nodes.length}`, node = { id, tag: "", data: null };
        nodes.push(node); seen.set(item, id); active.add(item);
        const descend = (entry, key) => child(entry, `${path}.${key}`, depth + 1);
        if (item[OPAQUE]) {
            node.tag = item[OPAQUE].tag;
            node.data = item[OPAQUE].pairs ? item[OPAQUE].data.map(([key, entry]) => [key, descend(entry, key)]) : descend(item[OPAQUE].data, "opaque");
        }
        else if (isHole(item)) { node.tag = "hole"; }
        else if (isUndecided(item)) { node.tag = "undecided"; node.data = descend({ reason: item.reason ?? null, details: item.details ?? null }, "decision"); }
        else if (item instanceof Integer) { node.tag = "integer"; node.data = String(item.value); digits(node.data, limits, path); }
        else if (item instanceof Fraction || item instanceof Rational) {
            node.tag = item instanceof Fraction ? "fraction" : "rational";
            node.data = [String(item.numerator), String(item.denominator)]; node.data.forEach(v => digits(v, limits, path));
        } else if (item instanceof FractionInterval) {
            node.tag = "fraction-interval"; node.data = [descend(item.low,"low"),descend(item.high,"high")];
        } else if (item instanceof RationalInterval) {
            node.tag = "interval"; node.data = [descend(item.start, "start"), descend(item.end, "end")];
        } else if (item instanceof RationalIntervalSet) {
            node.tag = "interval-set";
            node.data = item.components.map((component,index) => descend(component,index));
        } else if (item instanceof CertifiedApproximation) {
            node.tag = "certified";
            const source = key => { if (!sources.has(key)) sources.set(key, `s${sources.size}`); return sources.get(key); };
            node.data = descend({ candidate: item.candidate, enclosure: item.enclosure, representation: item.representation,
                source: source(item.sourceId), dependencies: item.dependencies.map(source) }, "approximation");
        } else if (isMathExpression(item) && unscopedRationalGraph(item,path)) {
            // Name-based formal graphs have no scoped identity to refresh.
            // Keeping inert records preserves their checked derivative selectors.
            node.tag = "record";
            node.data = entries(item,path).filter(([key])=>key!=="_ext").map(([key,entry])=>[key,descend(entry,key)]);
        } else if (isMathExpression(item) || realConstantState(item) || ["exact_generator", "exact_expression"].includes(item.type)) {
            node.tag = "math"; node.data = maths.length; maths.push(item);
        } else if (Array.isArray(item)) { node.tag = "array"; node.data = Array.from(item, (entry, index) => descend(Object.hasOwn(item, index) ? entry : HOLE, index)); }
        else if (item instanceof Map) {
            node.tag = "map"; node.data = [...item].map(([key, entry], index) => {
                if (typeof key !== "string") fail("map keys must be strings", path);
                return [key, descend(entry, index)];
            });
        } else if (isShaped(item)) {
            node.tag = "shaped";
            const data = [], shape = item.shape;
            const visit = (index = []) => {
                if (index.length === shape.length) { data.push(shapedGetBySelectors(item, index.map(n => new Integer(BigInt(n))))); return; }
                for (let i = 1; i <= shape[index.length]; i++) visit([...index, i]);
            };
            if (shape.reduce((a, b) => a * b, 1) > limits.maxEdges) fail("shaped cell budget exceeded", path);
            const semantic = item._ext?.get("__type")?.value ?? "Shaped";
            if (!["Shaped", "Matrix"].includes(semantic)) fail("coordinate tensors require a versioned identity adapter", path);
            visit(); node.data = descend({ shape, data, scalarDomain: shapedScalarDomain(item), semantic }, "shaped");
        } else {
            const fields = entries(item, path).filter(([key]) => key !== "_ext");
            if (item.type === "output") {
                node.tag = `output:${item.kind}`;
                if (!CTORS[item.kind] && !STATIC_KINDS.has(item.kind)) fail(`unknown output kind ${item.kind}`, path);
                for (const key of ["target", "binding", "formulaSheet", "action", "run", "validateCandidate"]) {
                    if (key === "target" && item.kind === "timeline_track") continue;
                    if (item[key] !== null && item[key] !== undefined) fail(`live ${key}; take an explicit snapshot first`, path);
                }
                if (item.interactive === true || item.editable === true || item.formulaBacked === true) fail("live output; take an explicit snapshot first", path);
            } else {
                if (item.type && !["string", "sequence", "tuple", "set", "array", "map"].includes(item.type)) fail(`unsupported runtime value ${item.type}`, path);
                node.tag = "record";
                if (item._ext instanceof Map && [...item._ext.values()].some(v => v?.type?.includes("function") || v?.type === "method_builtin")) {
                    fail("live extension methods are not portable", path);
                }
            }
            node.data = fields.map(([key, entry]) => [key, descend(entry, key)]);
        }
        active.delete(item);
        return { $ref: id };
    }
    const doc = { schema: OUTPUT_DOCUMENT_SCHEMA, root: child(value, "$", 0), nodes,
        mathematics: maths.length ? JSON.parse(encodeMathematicalJSON({ type: "sequence", values: maths })) : null };
    const result = JSON.stringify(doc);
    if (new TextEncoder().encode(result).length > limits.maxBytes) fail("text byte budget exceeded");
    // The writer and importer share structural/output validation.
    decodeOutputJSON(result, { ...limits, unknownTags: "preserve-opaque" });
    return result;
}

function restoreOutput(kind, fields, path) {
    if (fields.type !== "output" || fields.kind !== kind) fail("output discriminator mismatch", path);
    for (const key of REQUIRED[kind] || []) if (!Object.hasOwn(fields, key) || fields[key] === undefined || fields[key] === null) fail(`missing required ${key}`, path);
    for (const key of ["target", "binding", "formulaSheet", "action", "run", "validateCandidate"]) {
        if (key === "target" && kind === "timeline_track") continue;
        if (fields[key] !== null && fields[key] !== undefined) fail(`live ${key} is forbidden`, path);
    }
    if (fields.interactive === true || fields.editable === true || fields.formulaBacked === true) fail("live output is forbidden", path);
    let restored;
    if (CTORS[kind]) {
        const spec = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value instanceof Map ? wrapper(value) : value]));
        if (kind === "table") spec.columns = list(fields.columns, path).map(column => wrapper(column));
        if (kind === "transform") spec.transform = wrapper(Object.fromEntries(["translate", "scale", "rotate", "origin"].map(k => [k, fields[k] ?? null])));
        try { restored = output[CTORS[kind]](kind === "line_break" ? [] : [wrapper(spec)]); }
        catch (error) { fail(error.message, path); }
    } else if (kind === "sheet") {
        const shape = list(fields.shape, path);
        if (shape.length !== fields.rank || !shape.length || shape.some(n => !Number.isSafeInteger(n) || n < 0)) fail("invalid Sheet shape", path);
        for (const plane of list(fields.planes, path)) for (const row of list(plane.cells, path)) for (const cell of list(row, path)) {
            if (!Object.hasOwn(cell, "value") || !Array.isArray(cell.index) || cell.index.length !== shape.length || cell.index.some((n, i) => !Number.isSafeInteger(n) || n < 1 || n > shape[i])) fail("invalid Sheet cell", path);
        }
        list(fields.cells, path); list(fields.viewAxes, path);
        for (const key of ["axes", "axisLabels", "rowHeaders", "columnHeaders", "hiddenAxes"]) list(fields[key], path);
        if (!record(fields.rowAxis) || !record(fields.window)) fail("missing Sheet axis/window", path);
        const at = selectors => resolveLabeledCoordinate(shape,
            {axes:fields.axes,axisLabels:fields.axisLabels},selectors,"Sheet snapshot");
        restored = { _ext: new Map([
            ["INDEX", { type: "method_builtin", name: "Index", impl: ([, coords]) => coordinateTuple(at(coords)) }],
            ["AT", { type: "method_builtin", name: "At", impl: ([, coords]) => {
                const indices=at(coords);
                for (const plane of fields.planes) for (const row of plane.cells) for (const cell of row) if (cell.index.every((n,i)=>n===indices[i])) return cell.value;
                fail("Sheet coordinate unavailable in snapshot");
            } }],
        ]) };
    } else if (kind === "control_panel") {
        if (!list(fields.controls, path).every(c => c?.type === "output" && c.kind.startsWith("control_") && c.disabled === true && c.readOnly === true)) fail("invalid control snapshot", path);
    } else if (kind.startsWith("control_")) {
        if (typeof fields.id !== "string" || fields.disabled !== true || fields.readOnly !== true) fail("invalid inert control", path);
        if (!["control_action", "control_hold"].includes(kind) && !Object.hasOwn(fields, "value")) fail("missing control value", path);
    } else if (kind === "scene3d_snapshot") {
        if (fields.value?.kind !== "graphic") fail("Scene3D snapshot requires a Graphic", path);
    } else if (kind === "snapshots") {
        if (!list(fields.snapshots, path).length || fields.snapshots.some(frame => !output.isOutputValue(frame.content))) fail("invalid snapshot frames", path);
    } else if (kind === "timeline_track") {
        const spec = { ...fields, kind: fields.trackKind, keyframes: list(fields.keyframes, path).map(wrapper) };
        try { restored = output.createTimelineTrack([wrapper(spec)]); } catch (error) { fail(error.message, path); }
    } else if (kind === "timeline" || kind === "timeline_manifest") {
        if (!list(fields.frames, path).length) fail("empty timeline", path);
    } else if (kind === "timeline_render") {
        if (!Number.isSafeInteger(fields.frame) || fields.frame < 1 || fields.frame > fields.timeline?.frames?.length) fail("invalid timeline frame", path);
    } else if (kind === "drag_point" || kind === "graphic_action") {
        fail("interactive graphic nodes require a static Graphic snapshot", path);
    }
    const publicationPlan = fields.publicationPlan == null ? null : createPublicationPlan(fields.publicationPlan, fields);
    if (publicationPlan) validatePublicationTree(fields, publicationPlan);
    return Object.freeze({ ...fields, ...restored,
        ...(publicationPlan ? { publicationPlan } : {}),
        ...(fields.numericPolicy !== null && fields.numericPolicy !== undefined ? {numericPolicy:createNumericPolicy(fields.numericPolicy)} : {}),
        _ext: restored?._ext ?? new Map([["immutable", new Integer(1n)]]) });
}

/** Returns the value plus diagnostics; never resolves assets or executes recipes. */
export function decodeOutputJSON(source, options = {}) {
    const limits = settings(options), diagnostics = [];
    if (typeof source !== "string" || new TextEncoder().encode(source).length > limits.maxBytes) fail("text byte budget exceeded or non-string input");
    let doc; try { doc = JSON.parse(source); } catch { fail("invalid JSON"); }
    // The only legacy migration is the already shipped panel snapshot format.
    if (doc?.schema === "rix.control-panel" && doc.version === 1) return migratePanel(doc, limits);
    assertKeys(doc, ["schema", "root", "nodes", "mathematics"], "$");
    if (doc.schema !== OUTPUT_DOCUMENT_SCHEMA) fail("unsupported document version");
    const table = new Map(), cache = new Map(), active = new Set(), sources = new Map();
    let steps = 0;
    for (const node of list(doc.nodes, "$.nodes")) {
        assertKeys(node, ["id", "tag", "data"], "$.nodes");
        if (table.size >= limits.maxNodes || typeof node.id !== "string" || !/^n[0-9]+$/.test(node.id) || table.has(node.id) || typeof node.tag !== "string") fail("invalid, duplicate or excessive node ID");
        table.set(node.id, node);
    }
    let wireSteps = 0;
    const adjacency = new Map();
    function scan(item, refs, depth = 0) {
        if (++wireSteps > limits.maxEdges || depth > limits.maxDepth) fail("wire work/depth budget exceeded");
        if (!item || typeof item !== "object") return;
        if (Object.hasOwn(item, "$ref")) {
            assertKeys(item, ["$ref"], "$wire");
            if (!table.has(item.$ref)) fail("dangling reference", "$wire");
            refs.add(item.$ref); return;
        }
        for (const key of Object.keys(item)) {
            if (["__proto__", "prototype", "constructor"].includes(key)) fail("unsafe key", "$wire");
            scan(item[key], refs, depth + 1);
        }
    }
    scan(doc.root, new Set());
    for (const [id, node] of table) { const refs = new Set(); scan(node.data, refs); adjacency.set(id, refs); }
    const visiting = new Set(), visited = new Set();
    function visit(id, depth = 0) {
        if (depth > limits.maxDepth) fail("graph depth budget exceeded");
        if (visiting.has(id)) fail("cyclic document graph");
        if (visited.has(id)) return;
        visiting.add(id); for (const next of adjacency.get(id)) visit(next, depth + 1);
        visiting.delete(id); visited.add(id);
    }
    for (const id of table.keys()) visit(id);
    const math = doc.mathematics === null ? [] : decodeMathematicalJSON(JSON.stringify(doc.mathematics))?.values;
    if (!Array.isArray(math)) fail("mathematics must be a sequence graph");
    function decode(item, path = "$", depth = 0) {
        if (++steps > limits.maxEdges || depth > limits.maxDepth) fail("graph work/depth budget exceeded", path);
        if (item === null || typeof item === "string" || typeof item === "boolean") return item;
        if (typeof item === "number") { if (!Number.isFinite(item)) fail("nonfinite number", path); return item; }
        if (!record(item)) fail("invalid reference/value", path);
        if (Object.hasOwn(item, "$bigint")) { assertKeys(item, ["$bigint"], path); return digits(item.$bigint, limits, path); }
        assertKeys(item, ["$ref"], path);
        const node = table.get(item.$ref);
        if (!node) fail("dangling reference", path);
        if (active.has(node.id)) fail("cyclic document graph", path);
        if (cache.has(node.id)) return cache.get(node.id);
        active.add(node.id);
        const descend = (entry, key) => decode(entry, `${path}.${key}`, depth + 1);
        const pairs = data => {
            const keys = new Set();
            return list(data, path).map(pair => {
                if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== "string" || keys.has(pair[0])) fail("invalid or duplicate field", path);
                keys.add(pair[0]); return [pair[0], descend(pair[1], pair[0])];
            });
        };
        let value;
        if (node.tag === "integer") value = new Integer(digits(node.data, limits, path));
        else if (["rational", "fraction"].includes(node.tag)) {
            if (!Array.isArray(node.data) || node.data.length !== 2) fail("invalid fraction", path);
            const [n, d] = node.data.map(s => digits(s, limits, path));
            if (d === 0n && (node.tag!=="fraction" || n===0n)) fail("nonfinite or indeterminate fraction", path);
            value = node.tag === "fraction" ? new Fraction(n, d, {allowInfinite:d===0n}) : new Rational(n, d);
        } else if (node.tag === "fraction-interval") {
            if(!Array.isArray(node.data)||node.data.length!==2)fail("invalid fraction interval",path);
            const ends=node.data.map((entry,index)=>descend(entry,index));
            if(!ends.every(value=>value instanceof Fraction))fail("fraction interval endpoints must be Fractions",path);
            if(!ends[0].lessThanOrEqual(ends[1]))fail("fraction interval endpoints must retain low/high order",path);
            value=new FractionInterval(...ends);
        } else if (node.tag === "interval") {
            if (!Array.isArray(node.data) || node.data.length !== 2) fail("invalid interval", path);
            const ends = node.data.map((entry, index) => descend(entry, index));
            if (!ends.every(v => v instanceof Integer || v instanceof Rational)) fail("interval endpoints must be exact scalars", path);
            value = new RationalInterval(...ends);
        } else if (node.tag === "interval-set") {
            const components=list(node.data,path).map((entry,index)=>{
                const component=descend(entry,index);
                assertKeys(component,["low","high","lowClosed","highClosed"],path);
                if (!["low","high"].every(key=>Object.hasOwn(component,key) && (component[key]===null || component[key] instanceof Rational || component[key] instanceof Integer)) ||
                    typeof component.lowClosed!=="boolean" || typeof component.highClosed!=="boolean") fail("invalid interval-set component",path);
                return {...component,low:component.low instanceof Integer?new Rational(component.low.value):component.low,
                    high:component.high instanceof Integer?new Rational(component.high.value):component.high};
            });
            try { value=new RationalIntervalSet(components); } catch(error) { fail(error.message,path); }
            if (value.components.length!==components.length || value.components.some((component,index)=>{
                const original=components[index];
                return ["low","high"].some(key=>String(component[key])!==String(original[key])) ||
                    component.lowClosed!==original.lowClosed || component.highClosed!==original.highClosed;
            })) fail("interval-set components must be normalized",path);
        } else if (node.tag === "array") value = list(node.data, path).map((entry, index) => descend(entry, index));
        else if (node.tag === "map") value = new Map(pairs(node.data));
        else if (node.tag === "hole") { if (node.data !== null) fail("invalid hole", path); value = HOLE; }
        else if (node.tag === "undecided") {
            const data = descend(node.data, "decision"); value = data.reason === null ? UNDECIDED : undecidedDiagnostic(data.reason, data.details);
        } else if (node.tag === "math") {
            if (!Number.isSafeInteger(node.data) || node.data < 0 || node.data >= math.length) fail("invalid mathematical reference", path);
            value = math[node.data];
        } else if (node.tag === "certified") {
            const data = descend(node.data, "approximation");
            const identity = key => { if (typeof key !== "string") fail("invalid approximation source", path); if (!sources.has(key)) sources.set(key, Symbol(key)); return sources.get(key); };
            value = new CertifiedApproximation(data.candidate, data.enclosure, { representation: data.representation,
                sourceId: identity(data.source), dependencies: list(data.dependencies, path).map(identity) });
        } else if (node.tag === "shaped") {
            const data = descend(node.data, "shaped");
            if (!Array.isArray(data.shape) || data.shape.reduce((a, b) => a * b, 1) > limits.maxEdges) fail("shaped cell budget exceeded", path);
            if (!["Shaped", "Matrix"].includes(data.semantic) || data.semantic === "Matrix" && data.shape.length !== 2) fail("invalid Shaped semantic type", path);
            value = createShaped(data.shape, data.data, { scalarDomain: data.scalarDomain });
            if (data.semantic === "Matrix") value._ext.set("__type",TEXT("Matrix"));
        } else if (node.tag === "record" || node.tag.startsWith("output:") && (CTORS[node.tag.slice(7)] || STATIC_KINDS.has(node.tag.slice(7)))) {
            const data = Object.fromEntries(pairs(node.data)); entries(data, path);
            if (node.tag === "record") {
                if (data.type && !["string", "sequence", "tuple", "set", "array", "map"].includes(data.type)) fail("invalid runtime record", path);
                if (data.type === "string" && typeof data.value !== "string") fail("invalid text value", path);
                if (["sequence", "tuple", "set", "array"].includes(data.type)) list(data.values ?? data.elements, path);
                if (data.type === "map" && !(data.entries instanceof Map)) fail("invalid RiX map", path);
                value = data;
            } else value = restoreOutput(node.tag.slice(7), data, path);
        } else {
            if (limits.unknownTags === "strict-error") fail(`unknown tag ${node.tag}`, path, "output-json-unknown-tag");
            diagnostics.push({ code: "output-json-unknown-tag", path, tag: node.tag, severity: "warning", message: `Unsupported ${node.tag}` });
            value = output.createText([TEXT(`[Unsupported ${node.tag}]`)]);
            if (limits.unknownTags === "preserve-opaque") {
                // Unknown payload remains inert but references still undergo graph validation.
                const data = Array.isArray(node.data) ? pairs(node.data) : descend(node.data, "opaque");
                value = Object.freeze({ ...value, [OPAQUE]: { tag: node.tag, data, pairs: Array.isArray(node.data) } });
            }
        }
        active.delete(node.id); cache.set(node.id, value); return value;
    }
    const value = decode(doc.root);
    // Reject malicious detached known nodes too; unknown skipped payload is never executed.
    for (const id of table.keys()) if (!cache.has(id)) decode({ $ref: id }, `$.nodes.${id}`);
    return { value, diagnostics, schema: OUTPUT_DOCUMENT_SCHEMA };
}

function migratePanel(doc, limits) {
    assertKeys(doc, ["schema", "version", "panel"], "$");
    let count = 0;
    const revive = (value, depth = 0) => {
        if (++count > limits.maxEdges || depth > limits.maxDepth) fail("legacy panel budget exceeded");
        if (value === null || typeof value !== "object") return value;
        if (Array.isArray(value)) return value.map(v => revive(v, depth + 1));
        if (value.type === "integer") return new Integer(digits(value.value, limits, "$"));
        if (value.type === "bigint") return digits(value.value, limits, "$");
        if (value.type === "rational") return new Rational(digits(value.numerator, limits, "$"), digits(value.denominator, limits, "$"));
        if (value.type === "rational_interval") return new RationalInterval(revive(value.start, depth + 1), revive(value.end, depth + 1));
        if (value.type === "undecided") return UNDECIDED;
        if (value.type === "map" && Array.isArray(value.entries)) return new Map(value.entries.map(([k, v]) => [k, revive(v, depth + 1)]));
        if (value.type === "certified_approximation") return new CertifiedApproximation(revive(value.candidate, depth + 1), revive(value.enclosure, depth + 1));
        return Object.fromEntries(entries(value, "$legacy").map(([key, entry]) => [key, revive(entry, depth + 1)]));
    };
    const value = revive(doc.panel);
    const result = decodeOutputJSON(encodeOutputJSON(value, limits), limits);
    result.diagnostics.unshift({ code: "output-json-migrated", severity: "info", path: "$", message: "Migrated rix.control-panel version 1" });
    return result;
}

/** Explicitly detach evaluated widgets; no deferred source or action is invoked. */
export function snapshotOutputDocument(root) {
    const seen = new Map(), active = new Set();
    let steps = 0;
    function snapshot(value, depth = 0) {
        if (++steps > DEFAULTS.maxEdges || depth > DEFAULTS.maxDepth) fail("snapshot work/depth budget exceeded");
        if (!value || typeof value !== "object") return value;
        if ([Object.prototype, null].includes(Object.getPrototypeOf(value))) entries(value, "$snapshot");
        if (active.has(value)) fail("cyclic snapshot input");
        if (seen.has(value)) return seen.get(value);
        if (value instanceof Integer || value instanceof Rational || value instanceof Fraction || value instanceof FractionInterval || value instanceof RationalInterval || value instanceof RationalIntervalSet || value instanceof CertifiedApproximation || isShaped(value) || isMathExpression(value) || realConstantState(value) || ["exact_generator", "exact_expression"].includes(value.type) || isUndecided(value) || isHole(value)) return value;
        active.add(value);
        let source = value;
        if (value.type === "output") {
            if (value.kind === "control_panel") source = output.createControlPanelSnapshot(value);
            else if (value.kind === "sheet") source = output.createSheetSnapshot(value);
            else if (value.kind === "drag_point") source = output.createCircle([value.center, value.radius, value.style ? wrapper(value.style) : null]);
            else if (value.kind === "graphic_action") source = output.createGroup([value.children, value.style ? wrapper(value.style) : null]);
        }
        let result;
        if (Array.isArray(source)) result = source.map(entry => snapshot(entry, depth + 1));
        else if (source instanceof Map) result = new Map([...source].map(([key, entry]) => [key, snapshot(entry, depth + 1)]));
        else result = Object.fromEntries(entries(source, "$snapshot").map(([key, entry]) => [key, key === "_ext" ? entry : snapshot(entry, depth + 1)]));
        active.delete(value); seen.set(value, result); return result;
    }
    // Run the same strict portability checks as actual persistence.
    const snapshotValue = snapshot(root);
    encodeOutputJSON(snapshotValue);
    return snapshotValue;
}
