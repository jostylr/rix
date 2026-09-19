/** Retained Graphics normalization shared by static scene and animation exporters. */
import { CertifiedApproximation, Integer, Rational, RationalInterval } from "@ratmath/core";
import { UnsupportedRenderError } from "../../src/runtime/renderer-registry.js";
import { field, mapEntries, numberValue, outputKind, rixString, sequence } from "./common.js";

export const STATIC_EXPORT_LIMITS = Object.freeze({ defaultMaxFrames: 1000, maxFrames: 10000, maxDepth: 64, maxNodes: 100000, maxTextCharacters: 4000000 });

/** One serializer budget covers the entire exported sequence, not each frame. */
export function createFrameSerializer() {
    const ancestors = new Set();
    let nodes = 0, characters = 0;
    const text = (value) => {
        const result = String(value);
        characters += result.length;
        if (characters > STATIC_EXPORT_LIMITS.maxTextCharacters) throw new Error(`Frame evidence exceeds ${STATIC_EXPORT_LIMITS.maxTextCharacters} text characters`);
        return result;
    };
    const capacity = (count) => {
        if (count > STATIC_EXPORT_LIMITS.maxNodes - nodes) throw new Error(`Frame evidence exceeds ${STATIC_EXPORT_LIMITS.maxNodes} nodes`);
    };
    function serialize(value, depth = 0) {
        if (depth > STATIC_EXPORT_LIMITS.maxDepth) throw new Error(`Frame evidence exceeds depth ${STATIC_EXPORT_LIMITS.maxDepth}`);
        capacity(1); nodes += 1;
        if (value === null || value === undefined) return null;
        if (value instanceof Integer || value instanceof Rational || value instanceof RationalInterval || typeof value === "bigint") return text(value);
        if (typeof value === "string") return text(value);
        if (typeof value === "boolean") return value;
        if (typeof value === "number") {
            if (!Number.isFinite(value)) throw new Error("Frame evidence requires finite numbers");
            return value;
        }
        if (value?.type === "string") return text(value.value);
        if (typeof value !== "object") throw new Error("Frame evidence must be portable data");
        if (ancestors.has(value)) throw new Error("Frame evidence cannot contain cycles");
        ancestors.add(value);
        try {
            if (value instanceof CertifiedApproximation) return {
                type: "certified-approximation", text: text(value), candidate: text(value.candidate),
                enclosure: text(value.enclosure), representation: serialize(value.representation, depth + 1),
            };
            const values = Array.isArray(value) ? value : Array.isArray(value.values) ? value.values : null;
            if (values) {
                capacity(values.length);
                return values.map((entry) => serialize(entry, depth + 1));
            }
            const entries = mapEntries(value);
            const keys = [];
            const skip = (key) => key === "_ext" || (value.type === "output"
                && ["drag_point", "graphic_action"].includes(value.kind)
                && ["target", "action", "run"].includes(key));
            if (entries) {
                capacity(entries.size - (entries.has("_ext") ? 1 : 0));
                for (const key of entries.keys()) if (!skip(key)) keys.push(key);
            } else {
                for (const key in value) if (!skip(key) && Object.hasOwn(value, key)) {
                    capacity(keys.length + 1);
                    keys.push(key);
                }
            }
            return Object.fromEntries(keys.sort((a, b) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)
                .map((key) => [text(key), serialize(entries ? entries.get(key) : value[key], depth + 1)]));
        } finally { ancestors.delete(value); }
    }
    return (value) => serialize(value);
}

/** JSON evidence uses exact numeric strings, sorted keys, and no executable extensions. */
export function portableFrameValue(value) { return createFrameSerializer()(value); }

export function normalizeGraphicFrame(value, label = "Static frame", serialize = createFrameSerializer()) {
    let current = value;
    const metadata = { caption: null, description: null, title: null, state: field(value, "state"), origin: field(value, "origin"), snapshot: null };
    const seen = new Set();
    while (current && !seen.has(current)) {
        if (seen.size >= STATIC_EXPORT_LIMITS.maxDepth) throw new Error(`Static frame wrappers exceed depth ${STATIC_EXPORT_LIMITS.maxDepth}`);
        seen.add(current);
        const kind = outputKind(current);
        metadata.caption ??= field(current, "caption");
        metadata.description ??= field(current, "alt", field(current, "description"));
        metadata.title ??= field(current, "title");
        if (kind === "scene3d_snapshot") {
            const schema = rixString(field(current, "schema"));
            if (schema && schema !== "rix.scene3d.snapshot@1") throw new UnsupportedRenderError(`${label}: unsupported Scene3D snapshot schema '${schema}'`, { code: "static-snapshot-schema" });
            metadata.snapshot = Object.fromEntries(["schema", "source", "resolved", "uncertainty", "work", "diagnostics", "picking", "projected"]
                .map((key) => [key, field(current, key)]));
            current = field(current, "value");
        } else if (["slide", "timeline_render", "snapshot", "figure"].includes(kind) || (kind === "object" && field(current, "content"))) {
            if (kind === "timeline_render") {
                metadata.state = field(field(current, "snapshot"), "state");
                metadata.origin = field(field(current, "snapshot"), "origin");
            }
            current = field(current, "content");
        } else if (kind === "fragment" && field(current, "children", []).length === 1) current = field(current, "children")[0];
        else break;
    }
    if (outputKind(current) !== "graphic") throw new UnsupportedRenderError(`${label} must resolve to one Graphic or graphic Figure; received ${outputKind(current)}`, { code: "static-frame-layout-unsupported" });
    // Validate before recursive label extraction or any SVG/TikZ/raster lowering.
    serialize(current);
    metadata.graphicSource = field(current, "metadata");
    serialize(metadata);
    const labels = (node) => outputKind(node) === "text_mark" ? [rixString(field(node, "text"))].filter(Boolean)
        : (field(node, "children", []) || []).flatMap(labels);
    metadata.description ??= labels(current).join("; ") || null;
    return { graphic: current, metadata };
}

export function expandGraphicFrames(value, { maxFrames = STATIC_EXPORT_LIMITS.defaultMaxFrames } = {}) {
    const limit = numberValue(maxFrames, "Static export maxFrames");
    if (!Number.isInteger(limit) || limit < 1 || limit > STATIC_EXPORT_LIMITS.maxFrames) throw new Error(`Static export maxFrames must be an integer within 1…${STATIC_EXPORT_LIMITS.maxFrames}`);
    const serialize = createFrameSerializer();
    const kind = outputKind(value);
    let entries;
    if (kind === "slides") entries = field(value, "slides");
    else if (kind === "timeline") entries = field(value, "frames");
    else if (kind === "snapshots") entries = field(value, "snapshots");
    else return [{ ...normalizeGraphicFrame(value, "Static frame", serialize), duration: null, tracks: [], marker: null }];
    const frames = sequence(entries, "Animation frames");
    if (!frames.length) throw new Error("Static animation export requires at least one frame");
    if (frames.length > limit) throw new Error(`Static animation export has ${frames.length} frames; maxFrames is ${limit}`);
    const sourceTracks = field(value, "tracks", []) || [];
    const sourceMarkers = field(value, "markers", []) || [];
    serialize({ title: field(value, "title"), caption: field(value, "caption"), markers: sourceMarkers });
    serialize(sourceTracks);
    return frames.map((entry, index) => {
        const tracks = sourceTracks.map((track) => {
            const keyframe = track.keyframes.filter((candidate) => candidate.frame <= index + 1).at(-1);
            return { id: track.id, kind: track.trackKind, interpolation: track.interpolation, sourceFrame: keyframe?.frame ?? null, value: keyframe?.value ?? null, label: keyframe?.label ?? null };
        });
        serialize(tracks);
        const durations = field(value, "frameDurations");
        const total = field(value, "duration");
        const duration = kind === "slides" ? field(field(entry, "metadata"), "duration")
            : durations ? durations[index]
                : kind === "timeline" && total !== null ? total instanceof Integer || total instanceof Rational
                    ? new Rational(total instanceof Integer ? total.value : total.numerator, (total instanceof Integer ? 1n : total.denominator) * BigInt(frames.length))
                    : numberValue(total, "Timeline duration") / frames.length
                    : null;
        return { ...normalizeGraphicFrame(entry, `Frame ${index + 1}`, serialize), duration, tracks, marker: sourceMarkers.find((marker) => marker.frame === index + 1)?.label ?? null };
    });
}

export function selectGraphicFrame(value, selected = 1, options = {}) {
    const frames = expandGraphicFrames(value, options);
    const index = numberValue(selected, "Static frame index");
    if (!Number.isInteger(index) || index < 1 || index > frames.length) throw new Error(`Static frame index must be within 1…${frames.length}`);
    return { ...frames[index - 1], frame: index, frameCount: frames.length };
}
