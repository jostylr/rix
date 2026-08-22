import { field, numberValue, rixString, sequence } from "./common.js";

function pair(value, label, fallback) {
    if (value === null || value === undefined) return fallback;
    const values = sequence(value, label);
    if (values.length !== 2) throw new Error(`${label} must contain two coordinates`);
    return values.map((entry, index) => numberValue(entry, `${label} coordinate ${index + 1}`));
}

/** Normalize the renderer-neutral logical viewport contract. */
export function createViewport(options, width, height) {
    const source = field(options, "viewport", options) || {};
    const origin = pair(field(source, "origin"), "viewport origin", [0, 0]);
    const pan = pair(field(source, "pan"), "viewport pan", [0, 0]);
    const zoom = numberValue(field(source, "zoom", 1), "viewport zoom");
    if (!(zoom > 0)) throw new Error("viewport zoom must be positive");
    const viewportWidth = numberValue(field(source, "width", width), "viewport width");
    const viewportHeight = numberValue(field(source, "height", height), "viewport height");
    if (!(viewportWidth > 0 && viewportHeight > 0)) throw new Error("viewport dimensions must be positive");
    return Object.freeze({
        schema: "rix.viewport@1",
        origin: Object.freeze(origin),
        pan: Object.freeze(pan),
        zoom,
        width: viewportWidth,
        height: viewportHeight,
        transform: Object.freeze([zoom, 0, 0, zoom, pan[0] - origin[0] * zoom, pan[1] - origin[1] * zoom]),
    });
}

/** Normalize stable mathematical object selection independent of a renderer. */
export function createSelection(options) {
    const source = field(options, "selection");
    if (source === null || source === undefined) return Object.freeze({ schema: "rix.selection@1", ids: Object.freeze([]), focus: null });
    const idsValue = field(source, "ids", []);
    const ids = sequence(idsValue, "selection ids").map((value, index) => {
        const id = rixString(value) || (typeof value === "string" ? value : null);
        if (!id) throw new Error(`selection id ${index + 1} must be a string`);
        return id;
    });
    const focusValue = field(source, "focus");
    const focus = focusValue === null ? null : rixString(focusValue) || String(focusValue);
    return Object.freeze({ schema: "rix.selection@1", ids: Object.freeze([...new Set(ids)]), focus });
}

export function invertViewportPoint(viewport, x, y) {
    return Object.freeze([
        (x - viewport.pan[0]) / viewport.zoom + viewport.origin[0],
        (y - viewport.pan[1]) / viewport.zoom + viewport.origin[1],
    ]);
}

