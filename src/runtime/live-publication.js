/** Bounded publication descriptions. These records contain no runtime handles or code. */
import { Integer, Rational } from "@ratmath/core";

export const LIVE_PUBLICATION_SCHEMA = "rix.live-publication@1";
export const LIVE_PUBLICATION_LIMITS = Object.freeze({ maxNodes: 10000, maxDepth: 64, maxFrames: 120, maxSourceBytes: 1000000 });
const fail = (message) => { throw new Error(`Live publication: ${message}`); };
const read = (object, key) => {
    const descriptor = object && Object.getOwnPropertyDescriptor(object, key);
    if (descriptor?.get || descriptor?.set) fail(`accessor ${key} is not inert`);
    return descriptor?.value;
};
const text = (value, fallback) => typeof value === "string" ? value.slice(0, 512) : fallback;
const mapText = (value, key) => text(value instanceof Map ? value.get(key) : read(value, key), null);

export function prepareLivePublication(value, options = {}) {
    const limits = { ...LIVE_PUBLICATION_LIMITS, ...options };
    for (const [key, maximum] of Object.entries(LIVE_PUBLICATION_LIMITS)) {
        if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > maximum) fail(`${key} must be 1–${maximum}`);
    }
    const interactions = [], diagnostics = [], ancestors = new WeakSet();
    let visited = 0;
    const visit = (node, path, depth) => {
        if (!node || typeof node !== "object") return node;
        const kind = read(node, "kind");
        if (read(node, "type") !== "output" || typeof kind !== "string") return node;
        if (++visited > limits.maxNodes || depth > limits.maxDepth) fail("output node/depth budget exceeded");
        if (ancestors.has(node)) fail(`cycle at ${path}`);
        ancestors.add(node);
        const id = text(read(node, "id"), null) || mapText(read(node, "style"), "hitId") || mapText(read(node, "style"), "id") || path;
        const protocol = kind === "graphic" ? "rix.viewport@1"
            : kind === "drag_point" || kind === "graphic_action" ? (kind === "drag_point" ? "graphic:position" : "graphic:action")
                : kind === "control_panel" || kind.startsWith("control_") ? "control:set"
                    : kind === "sheet" ? "sheet:set" : kind === "timeline" ? "rix.timeline-view@1"
                        : kind === "live_view" ? "live:commit" : null;
        if (protocol) interactions.push(Object.freeze({ id, kind, protocol, path,
            ...(kind === "graphic" ? { selectionProtocol: "rix.selection@1" } : {}),
            ...(typeof read(node, "targetId") === "string" ? { targetId: read(node, "targetId").slice(0, 512) } : {}) }));
        let result = node;
        const update = (key, next) => {
            if (next === read(node, key)) return;
            if (result === node) {
                result = Object.create(Object.getPrototypeOf(node));
                Object.defineProperties(result, Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(node)).map(([name, descriptor]) => [name, { ...descriptor, configurable: true }])));
            }
            Object.defineProperty(result, key, { value: next, enumerable: true, writable: true, configurable: true });
        };
        for (const key of ["children", "items", "slides", "controls"]) {
            const children = read(node, key);
            if (Array.isArray(children)) update(key, children.map((child, index) => visit(child, `${path}.${key}[${index}]`, depth + 1)));
        }
        const content = read(node, "content");
        if (content) update("content", visit(content, `${path}.content`, depth + 1));
        for (const key of ["frames", "snapshots"]) {
            const frames = read(node, key);
            if (!Array.isArray(frames)) continue;
            const kept = key === "frames" ? frames.slice(0, limits.maxFrames) : frames;
            if (kept.length < frames.length) diagnostics.push(Object.freeze({ code: "live-animation-truncated", path, severity: "warning",
                message: `Retained the first ${kept.length} of ${frames.length} frames; the initial static frame is unchanged.` }));
            update(key, kept.map((frame, index) => {
                const copy = {};
                for (const name of Object.keys(frame)) copy[name] = read(frame, name);
                copy.content = visit(read(frame, "content"), `${path}.${key}[${index}].content`, depth + 1);
                return copy;
            }));
            if (key === "frames" && kept.length < frames.length) {
                const exact = (value) => value instanceof Integer ? value.toRational() : value instanceof Rational ? value : null;
                const frameDurations = read(node, "frameDurations");
                if (Array.isArray(frameDurations)) {
                    const durations = frameDurations.slice(0, kept.length);
                    update("frameDurations", durations);
                    if (durations.every((entry) => exact(entry))) update("duration", durations.reduce((sum, entry) => sum.add(exact(entry)), new Rational(0)));
                } else if (exact(read(node, "duration"))) {
                    update("duration", exact(read(node, "duration")).multiply(new Rational(kept.length, frames.length)));
                }
                if (Array.isArray(read(node, "markers"))) update("markers", read(node, "markers").filter((marker) => read(marker, "frame") <= kept.length));
                if (Array.isArray(read(node, "tracks"))) update("tracks", read(node, "tracks").map((track) => {
                    const copy = {};
                    for (const name of Object.keys(track)) copy[name] = read(track, name);
                    if (Array.isArray(copy.keyframes)) copy.keyframes = copy.keyframes.filter((frame) => read(frame, "frame") <= kept.length);
                    return copy;
                }));
            }
        }
        ancestors.delete(node);
        return result;
    };
    const snapshot = visit(value, "output", 0);
    return { snapshot, descriptor: Object.freeze({ schema: LIVE_PUBLICATION_SCHEMA, initialResult: "static-snapshot", interactions: Object.freeze(interactions), limits: Object.freeze(limits) }), diagnostics };
}

export function createLivePublicationConfig({ source, sourcePath = "publication.rix", plugins = [], descriptor }) {
    if (typeof source !== "string" || new TextEncoder().encode(source).length > LIVE_PUBLICATION_LIMITS.maxSourceBytes) fail("source exceeds 1000000 bytes");
    if (!Array.isArray(plugins) || plugins.length > 128 || plugins.some((id) => typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(id))) fail("invalid plugin list");
    const sourceName = String(sourcePath).split(/[\\/]/).at(-1) || "publication.rix";
    return Object.freeze({ schema: LIVE_PUBLICATION_SCHEMA, source, sourcePath: sourceName, plugins: Object.freeze([...new Set(plugins)]), descriptor });
}

/** Relocate only known inert media references; controls and exact leaves keep their identity. */
export function relocateLivePublicationAssets(value, assetPaths = {}) {
    const entries = Object.entries(assetPaths);
    if (entries.length > 256 || entries.some(([ref, target]) => ref.length > 2048 || typeof target !== "string" || !/^assets\/[a-f0-9]{64}\.[a-z0-9]+$/.test(target))) fail("invalid bundled media paths");
    let count = 0;
    const walk = (node, depth = 0) => {
        if (!node || typeof node !== "object" || node.type !== "output") return node;
        if (++count > LIVE_PUBLICATION_LIMITS.maxNodes || depth > LIVE_PUBLICATION_LIMITS.maxDepth) fail("media relocation budget exceeded");
        if (node.kind === "asset" && Object.hasOwn(assetPaths, node.ref)) return { ...node, ref: assetPaths[node.ref] };
        const copy = Object.create(Object.getPrototypeOf(node));
        Object.defineProperties(copy, Object.fromEntries(Object.entries(Object.getOwnPropertyDescriptors(node)).map(([key, descriptor]) => [key, { ...descriptor, configurable: true, ...(Object.hasOwn(descriptor, "value") ? { writable: true } : {}) }])));
        for (const key of ["children", "items", "slides", "controls", "title", "caption", "transcript", "attribution", "content"]) {
            if (Array.isArray(node[key])) copy[key] = node[key].map(child => walk(child, depth + 1));
            else if (node[key]?.type === "output") copy[key] = walk(node[key], depth + 1);
        }
        if (node.asset) copy.asset = walk(node.asset, depth + 1);
        for (const key of ["frames", "snapshots"]) if (Array.isArray(node[key])) copy[key] = node[key].map(frame => ({ ...frame, content: walk(frame.content, depth + 1) }));
        return copy;
    };
    return walk(value);
}
