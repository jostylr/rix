/** Portable structured-output values and host-neutral render helpers. */

import { CertifiedApproximation, Integer, Rational, RationalInterval } from "@ratmath/core";
import { isUndecided } from "./decision.js";
import { isShaped, shapedGetBySelectors } from "./shaped.js";
import { isBinding } from "./binding.js";
import { FORMULA_SHEET_ASSIGNMENT_MODES, isFormulaSheet } from "./formula-sheet.js";
import { coordinateTuple, resolveLabeledCoordinate } from "./sheet-labels.js";
import { isReactiveNode } from "./reactive-graph.js";
import { UnsupportedRenderError } from "./renderer-registry.js";

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

function has(entries, name) {
    const canonical = String(name).toLowerCase();
    return [...entries.keys()].some((key) => String(key).toLowerCase() === canonical);
}

function optionalMap(value, label) {
    return value === null || value === undefined ? null : map(value, label);
}

function spec(args, positional, name) {
    if (args.length === 1 && args[0]?.type === "map") return map(args[0], `${name} specification`);
    if (args.length > positional.length) throw new Error(`${name} received too many arguments`);
    return new Map(positional.slice(0, args.length).map((key, index) => [key, args[index]]));
}

function output(kind, fields, methods = []) {
    return Object.freeze({
        type: "output",
        kind,
        ...fields,
        _ext: new Map([
            ["_type", { type: "string", value: "output" }],
            ["kind", { type: "string", value: kind }],
            ["immutable", int(1)],
            ...methods,
        ]),
    });
}

function method(name, impl) {
    return { type: "method_builtin", name, impl };
}

function sheetMethods() {
    const index = (target, selector, label) => resolveLabeledCoordinate(
        target.shape,
        { axes: target.axes, axisLabels: target.axisLabels },
        selector,
        label,
    );
    const cellAt = (target, coordinate) => {
        for (const plane of target.planes) {
            for (const row of plane.cells) {
                const cell = row.find((candidate) => candidate.index.every(
                    (item, axis) => item === coordinate[axis],
                ));
                if (cell) return cell;
            }
        }
        throw new Error(`Sheet coordinate is unavailable: [${coordinate.join(",")}]`);
    };
    return [
        ["INDEX", method("Index", ([target, selector]) =>
            coordinateTuple(index(target, selector, "Sheet.Index")))],
        ["AT", method("At", ([target, selector]) =>
            cellAt(target, index(target, selector, "Sheet.At")).value)],
    ];
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

function exactRational(value, label) {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value);
    throw new Error(`${label} must be an exact integer or rational`);
}

function positiveCount(value, label) {
    if (!(value instanceof Integer) || value.value <= 0n) {
        throw new Error(`${label} must be a positive integer`);
    }
    const count = Number(value.value);
    if (!Number.isSafeInteger(count) || count > 10000) {
        throw new Error(`${label} must be at most 10000`);
    }
    return count;
}

function reactiveTarget(entry, name) {
    const target = get(entry, "target");
    if (!isReactiveNode(target)) {
        throw new Error(`${name} target must be a reactive $$name identity`);
    }
    return target;
}

function exactScale(interval, stepValue, stepsValue, name) {
    if (!(interval instanceof RationalInterval)) {
        throw new Error(`${name} interval must be a RiX interval such as 0:10`);
    }
    const low = interval.low;
    const high = interval.high;
    const span = high.subtract(low);
    if (span.numerator === 0n) throw new Error(`${name} interval endpoints must differ`);
    if (stepValue !== null && stepsValue !== null) {
        throw new Error(`${name} accepts either step or steps, not both`);
    }
    let steps;
    let step;
    if (stepsValue !== null) {
        steps = positiveCount(stepsValue, `${name} steps`);
        step = span.divide(new Integer(BigInt(steps)));
    } else {
        step = stepValue === null ? span.divide(new Integer(20n)) : exactRational(stepValue, `${name} step`);
        if (step.numerator <= 0n) throw new Error(`${name} step must be positive`);
        const ratio = span.divide(step);
        const count = ratio.numerator / ratio.denominator;
        if (count < 1n || count > 10000n) {
            throw new Error(`${name} step must produce between 1 and 10000 positions`);
        }
        steps = Number(count);
    }
    return { low, high, step, steps };
}

function scaleIndex(value, scale, label) {
    const exact = exactRational(value, label);
    const indexValue = exact.subtract(scale.low).divide(scale.step);
    if (indexValue.denominator !== 1n) {
        const stepKind = label.includes("Slider") ? "slider" : "control";
        throw new Error(`${label} must lie on an exact ${stepKind} step`);
    }
    const index = Number(indexValue.numerator);
    if (!Number.isSafeInteger(index) || index < 0 || index > scale.steps) {
        throw new Error(`${label} must lie within its interval`);
    }
    return index;
}

function controlValuesEqual(left, right) {
    if (left === right) return true;
    if ((left instanceof Integer || left instanceof Rational)
        && (right instanceof Integer || right instanceof Rational)) {
        const a = exactRational(left, "Control value");
        const b = exactRational(right, "Control value");
        return a.numerator === b.numerator && a.denominator === b.denominator;
    }
    if (left instanceof RationalInterval && right instanceof RationalInterval) {
        return controlValuesEqual(left.start, right.start) && controlValuesEqual(left.end, right.end);
    }
    const leftString = asString(left);
    const rightString = asString(right);
    if (leftString !== null || rightString !== null) return leftString === rightString;
    return false;
}

function invokeControlCallable(callable, args, runtime, label) {
    if (runtime?.invoke) return runtime.invoke(callable, args, runtime.context, runtime.evaluate);
    if (typeof callable === "function") return callable(...args);
    throw new Error(`${label} must be a RiX callable`);
}

function shortcutKey(value, label) {
    if (value === null || value === undefined) return null;
    const key = asString(value);
    if (key === null || !/^(?:Arrow(?:Up|Left|Right|Down)|Enter|Escape|Home|End|PageUp|PageDown|[A-Za-z0-9])$/.test(key)) {
        throw new Error(`${label} must be a supported KeyboardEvent key`);
    }
    return key.length === 1 ? key.toLowerCase() : key;
}

function controlDisplay(entry, fields, name, runtime, allowed = Object.keys(fields)) {
    const formatValue = get(entry, "format");
    if (formatValue === null) return Object.freeze({ ...fields });
    const formatters = map(formatValue, `${name} format`);
    const display = { ...fields };
    for (const [rawKey, formatter] of formatters) {
        const key = String(rawKey).toLowerCase();
        if (!allowed.includes(key)) {
            throw new Error(`${name} format key '${rawKey}' is not one of ${allowed.join(", ")}`);
        }
        if (!Object.hasOwn(fields, key)) continue;
        if (formatter !== null) {
            display[key] = invokeControlCallable(formatter, [fields[key]], runtime, `${name} formatter '${rawKey}'`);
        }
    }
    return Object.freeze(display);
}

function controlBehavior(entry, fields, name, runtime, allowed = Object.keys(fields)) {
    const formatValue = get(entry, "format");
    const formatKeys = formatValue === null
        ? []
        : [...map(formatValue, `${name} format`).keys()].map((key) => String(key).toLowerCase());
    const validate = get(entry, "validate");
    const validateCandidate = validate === null ? null : (candidate) => {
        const result = invokeControlCallable(validate, [candidate], runtime, `${name} validator`);
        if (result === null || result === undefined) return null;
        const message = asString(result);
        if (message === null) throw new Error(`${name} validator must return _ or an error string`);
        return message;
    };
    return {
        display: controlDisplay(entry, fields, name, runtime, allowed),
        formatKeys: Object.freeze(formatKeys),
        style: optionalMap(get(entry, "style"), `${name} style`),
        metadata: optionalMap(get(entry, "metadata"), `${name} metadata`),
        disabled: has(entry, "disabled") && get(entry, "disabled") !== null,
        readOnly: has(entry, "readOnly") && get(entry, "readOnly") !== null,
        validation: validateCandidate?.(fields.value) ?? null,
        validateCandidate,
    };
}

function numericValue(value, label) {
    if (value instanceof Integer) return Number(value.value);
    if (value instanceof Rational) {
        if (value.numerator === 0n) return 0;
        const sign = value.numerator < 0n ? -1 : 1;
        const numerator = value.numerator < 0n ? -value.numerator : value.numerator;
        const numeratorShift = Math.max(0, numerator.toString(2).length - 53);
        const denominatorShift = Math.max(0, value.denominator.toString(2).length - 53);
        return sign
            * (Number(numerator >> BigInt(numeratorShift)) / Number(value.denominator >> BigInt(denominatorShift)))
            * (2 ** (numeratorShift - denominatorShift));
    }
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

const INLINE_OUTPUT_KINDS = new Set([
    "text", "emphasis", "strong", "code", "math", "link", "line_break",
]);

export function isInlineOutput(value) {
    return isOutputValue(value) && (INLINE_OUTPUT_KINDS.has(value.kind) || (value.kind === "image" && !value.caption));
}

export function isBlockOutput(value) {
    return isOutputValue(value) && (!INLINE_OUTPUT_KINDS.has(value.kind) || value.kind === "image");
}

function contentItems(value, label) {
    return isSequence(value) || Array.isArray(value) ? sequence(value, label) : [value];
}

function inlineChildren(value, label) {
    return Object.freeze(contentItems(value, label).map((child) => {
        if (isOutputValue(child) && !isInlineOutput(child)) {
            throw new Error(`${label} cannot contain block output ${child.kind}; use Fragment or a block constructor`);
        }
        return child;
    }));
}

function blockChildren(value, label) {
    return Object.freeze(contentItems(value, label).map((child) => {
        if (!isBlockOutput(child)) {
            const actual = isOutputValue(child) ? child.kind : typeof child;
            throw new Error(`${label} requires block output values; received ${actual}`);
        }
        return child;
    }));
}

function requiredString(value, label) {
    const result = asString(value);
    if (result === null || result.trim() === "") throw new Error(`${label} requires a nonempty string`);
    return result;
}

function optionalDimension(value, label) {
    if (value === null || value === undefined) return null;
    const dimension = exactInteger(value, label);
    if (!Number.isSafeInteger(dimension) || dimension <= 0) throw new Error(`${label} must be a positive safe integer`);
    return dimension;
}

function enabled(value) {
    if (value instanceof Integer) return value.value !== 0n;
    if (value instanceof Rational) return value.numerator !== 0n;
    return Boolean(value);
}

function exactPositiveIndex(value, label) {
    const index = exactInteger(value, label);
    if (!Number.isSafeInteger(index) || index < 1) throw new Error(`${label} must be a positive safe integer`);
    return index;
}

function sceneEntries(value, runtime, name) {
    let ordinal = 0;
    return sequence(value, `${name} entries`).flatMap((entry, group) => {
        let scene;
        let states;
        let label = null;
        if (entry?.type === "map") {
            const fields = map(entry, `${name} entry ${group + 1}`);
            if (!has(fields, "scene") || !has(fields, "states")) {
                throw new Error(`${name} entry ${group + 1} requires scene and states`);
            }
            scene = get(fields, "scene");
            states = get(fields, "states");
            label = asString(get(fields, "label"));
        } else {
            const pair = sequence(entry, `${name} entry ${group + 1}`);
            if (pair.length !== 2) throw new Error(`${name} entry ${group + 1} must be a [scene, states] tuple`);
            [scene, states] = pair;
        }
        return sequence(states, `${name} entry ${group + 1} states`).map((state, index) => {
            const originEntries = new Map([
                ["entry", int(group + 1)],
                ["state", int(index + 1)],
                ["ordinal", int(ordinal + 1)],
            ]);
            if (label !== null) originEntries.set("label", { type: "string", value: label });
            const origin = Object.freeze({
                type: "map",
                entries: originEntries,
                _ext: new Map([["immutable", int(1)]]),
            });
            const content = invokeControlCallable(scene, [state, origin], runtime, `${name} entry ${group + 1} scene`);
            if (!isBlockOutput(content)) {
                const actual = isOutputValue(content) ? content.kind : typeof content;
                throw new Error(`${name} scene ${group + 1}.${index + 1} must return block output; received ${actual}`);
            }
            ordinal += 1;
            return Object.freeze({
                state,
                origin,
                content,
            });
        });
    });
}

/**
 * Materialize one or more state-driven scenes into a portable ordered list.
 * Every snapshot carries a one-based origin record and every scene receives
 * that origin as its optional second argument.
 */
export function createSnapshots(args, runtime = null) {
    const entry = spec(args, ["entries"], "Snapshots");
    if (has(entry, "columns")) {
        throw new Error("Snapshots no longer accepts columns; pass its ordered list to a grid renderer instead");
    }
    const snapshots = Object.freeze(sceneEntries(get(entry, "entries"), runtime, "Snapshots"));
    if (snapshots.length === 0) throw new Error("Snapshots requires at least one rendered scene");
    return output("snapshots", {
        snapshots,
        title: asString(get(entry, "title")),
        caption: asString(get(entry, "caption")),
        style: optionalMap(get(entry, "style"), "Snapshots style"),
    });
}

/**
 * A Timeline owns a deterministic ordered sequence of already-materialized
 * scene frames. Playback is intentionally a renderer concern; the exact
 * states and their visible outputs remain portable.
 */
export function createTimelineSequence(args, runtime = null) {
    const entry = spec(args, ["entries", "duration"], "Timeline.Sequence");
    const frames = Object.freeze(sceneEntries(get(entry, "entries"), runtime, "Timeline.Sequence"));
    if (frames.length === 0) throw new Error("Timeline.Sequence requires at least one rendered frame");
    const duration = get(entry, "duration");
    return output("timeline", {
        frames,
        duration: duration === null || duration === undefined ? null : exactNumber(duration, "Timeline.Sequence duration"),
        easing: asString(get(entry, "easing")) || "linear",
        title: asString(get(entry, "title")),
    });
}

/** Select one exact Timeline frame for a portable/static renderer. */
export function createTimelineRender(args) {
    const entry = spec(args, ["timeline", "frame"], "Timeline.Render");
    const timeline = get(entry, "timeline");
    if (!isOutputValue(timeline) || timeline.kind !== "timeline") {
        throw new Error("Timeline.Render requires a Timeline.Sequence value");
    }
    const frame = get(entry, "frame");
    const index = frame === null || frame === undefined ? 1 : exactPositiveIndex(frame, "Timeline.Render frame");
    if (index > timeline.frames.length) {
        throw new Error(`Timeline.Render frame ${index} is outside 1…${timeline.frames.length}`);
    }
    return output("timeline_render", {
        timeline,
        frame: index,
        snapshot: timeline.frames[index - 1],
        content: timeline.frames[index - 1].content,
        title: asString(get(entry, "title")) || timeline.title,
    });
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
    const children = inlineChildren(childrenValue, "Paragraph children");
    return output("paragraph", { children, style: optionalMap(get(entry, "style"), "Paragraph style") });
}

export function createHeading(args) {
    const entry = spec(args, ["level", "content", "id", "style"], "Heading");
    const level = exactInteger(get(entry, "level"), "Heading level");
    if (level < 1 || level > 6) throw new Error("Heading level must be between 1 and 6");
    const content = get(entry, "content");
    if (content === null) throw new Error("Heading requires content");
    inlineChildren(content, "Heading content");
    return output("heading", { level, content, id: asString(get(entry, "id")), style: optionalMap(get(entry, "style"), "Heading style") });
}

export function createFragment(args) {
    const entry = spec(args, ["children", "metadata", "style"], "Fragment");
    return output("fragment", {
        children: sequence(get(entry, "children"), "Fragment children"),
        metadata: optionalMap(get(entry, "metadata"), "Fragment metadata"),
        style: optionalMap(get(entry, "style"), "Fragment style"),
    });
}

export function createEmphasis(args) {
    const entry = spec(args, ["children"], "Emphasis");
    return output("emphasis", { children: inlineChildren(get(entry, "children"), "Emphasis children") });
}

export function createStrong(args) {
    const entry = spec(args, ["children"], "Strong");
    return output("strong", { children: inlineChildren(get(entry, "children"), "Strong children") });
}

export function createCode(args) {
    const entry = spec(args, ["code"], "Code");
    return output("code", { code: requiredString(get(entry, "code"), "Code") });
}

function mathFields(args, name) {
    const entry = spec(args, ["source", "notation", "alt"], name);
    const notation = (asString(get(entry, "notation")) || "tex").toLowerCase();
    if (notation !== "tex") throw new Error(`${name} currently supports only :tex notation`);
    return {
        source: requiredString(get(entry, "source"), name),
        notation,
        alt: asString(get(entry, "alt")),
    };
}

export function createMath(args) {
    return output("math", mathFields(args, "Math"));
}

export function createLink(args) {
    const entry = spec(args, ["href", "children", "title"], "Link");
    return output("link", {
        href: requiredString(get(entry, "href"), "Link href"),
        children: inlineChildren(get(entry, "children"), "Link children"),
        title: asString(get(entry, "title")),
    });
}

export function createLineBreak(args) {
    if (args.length !== 0 && !(args.length === 1 && args[0]?.type === "map")) {
        throw new Error("LineBreak does not accept arguments");
    }
    return output("line_break", {});
}

export function createSection(args) {
    const entry = spec(args, ["level", "title", "children", "id"], "Section");
    const level = exactInteger(get(entry, "level"), "Section level");
    if (level < 1 || level > 6) throw new Error("Section level must be between 1 and 6");
    const title = get(entry, "title");
    if (title === null) throw new Error("Section requires title");
    return output("section", {
        level,
        title: inlineChildren(title, "Section title"),
        children: blockChildren(get(entry, "children"), "Section children"),
        id: asString(get(entry, "id")),
        metadata: optionalMap(get(entry, "metadata"), "Section metadata"),
        style: optionalMap(get(entry, "style"), "Section style"),
    });
}

export function createListItem(args) {
    const entry = spec(args, ["children", "marker"], "ListItem");
    const childrenValue = get(entry, "children");
    const children = isSequence(childrenValue) || Array.isArray(childrenValue)
        ? blockChildren(childrenValue, "ListItem children")
        : blockChildren([childrenValue], "ListItem children");
    return output("list_item", { children, marker: asString(get(entry, "marker")) });
}

export function createList(args) {
    const entry = spec(args, ["items", "ordered", "start"], "List");
    const ordered = enabled(get(entry, "ordered"));
    const items = sequence(get(entry, "items"), "List items").map((item, index) => {
        if (!isOutputValue(item) || item.kind !== "list_item") {
            throw new Error(`List item ${index + 1} must be a ListItem output value`);
        }
        return item;
    });
    if (items.length === 0) throw new Error("List requires at least one ListItem");
    const start = get(entry, "start");
    if (!ordered && start !== null && start !== undefined) throw new Error("List start is valid only for ordered lists");
    return output("list", {
        ordered,
        items: Object.freeze(items),
        start: ordered && start !== null && start !== undefined ? exactInteger(start, "List start") : null,
        tight: enabled(get(entry, "tight")),
        style: optionalMap(get(entry, "style"), "List style"),
    });
}

export function createQuote(args) {
    const entry = spec(args, ["children", "attribution", "cite"], "Quote");
    return output("quote", {
        children: blockChildren(get(entry, "children"), "Quote children"),
        attribution: get(entry, "attribution") === null ? null : inlineChildren(get(entry, "attribution"), "Quote attribution"),
        cite: asString(get(entry, "cite")),
        id: asString(get(entry, "id")),
    });
}

const CALLOUT_KINDS = new Set(["note", "tip", "warning", "caution", "important"]);

export function createCallout(args) {
    const entry = spec(args, ["variant", "children", "title"], "Callout");
    const variant = (asString(get(entry, "variant", get(entry, "kind"))) || "note").toLowerCase();
    if (!CALLOUT_KINDS.has(variant)) throw new Error(`Callout variant must be one of ${[...CALLOUT_KINDS].join(", ")}`);
    const title = get(entry, "title");
    return output("callout", {
        variant,
        title: title === null ? null : inlineChildren(title, "Callout title"),
        children: blockChildren(get(entry, "children"), "Callout children"),
        id: asString(get(entry, "id")),
    });
}

export function createCodeBlock(args) {
    const entry = spec(args, ["code", "language", "caption"], "CodeBlock");
    return output("code_block", {
        code: requiredString(get(entry, "code"), "CodeBlock"),
        language: asString(get(entry, "language")) || "text",
        caption: get(entry, "caption") === null ? null : inlineChildren(get(entry, "caption"), "CodeBlock caption"),
        id: asString(get(entry, "id")),
        lineNumbers: enabled(get(entry, "lineNumbers")),
    });
}

export function createMathBlock(args) {
    const entry = spec(args, ["source", "notation", "alt"], "MathBlock");
    const fields = mathFields(args, "MathBlock");
    return output("math_block", {
        ...fields,
        label: asString(get(entry, "label")),
        id: asString(get(entry, "id")),
    });
}

function assetValue(value, name, expectedMime = null) {
    if (!isOutputValue(value) || value.kind !== "asset") throw new Error(`${name} requires an Asset output value`);
    if (expectedMime && !value.mime.startsWith(`${expectedMime}/`)) {
        throw new Error(`${name} requires an ${expectedMime} asset; received ${value.mime}`);
    }
    return value;
}

export function createAsset(args) {
    const entry = spec(args, ["ref", "mime"], "Asset");
    const mime = requiredString(get(entry, "mime"), "Asset mime").toLowerCase();
    if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(mime)) {
        throw new Error("Asset mime must be a media type such as image/png");
    }
    return output("asset", {
        ref: requiredString(get(entry, "ref"), "Asset ref"),
        mime,
        integrity: asString(get(entry, "integrity")),
        bytes: get(entry, "bytes") === null ? null : optionalDimension(get(entry, "bytes"), "Asset bytes"),
        filename: asString(get(entry, "filename")),
        width: optionalDimension(get(entry, "width"), "Asset width"),
        height: optionalDimension(get(entry, "height"), "Asset height"),
        duration: get(entry, "duration"),
        metadata: optionalMap(get(entry, "metadata"), "Asset metadata"),
    });
}

function mediaFields(entry, name, expectedMime) {
    return {
        asset: assetValue(get(entry, "asset"), name, expectedMime),
        width: optionalDimension(get(entry, "width"), `${name} width`),
        height: optionalDimension(get(entry, "height"), `${name} height`),
        title: asString(get(entry, "title")),
        caption: get(entry, "caption") === null ? null : inlineChildren(get(entry, "caption"), `${name} caption`),
        id: asString(get(entry, "id")),
    };
}

export function createImage(args) {
    const entry = spec(args, ["asset", "alt", "width", "height"], "Image");
    return output("image", {
        ...mediaFields(entry, "Image", "image"),
        alt: requiredString(get(entry, "alt"), "Image alt"),
    });
}

export function createAudio(args) {
    const entry = spec(args, ["asset", "transcript"], "Audio");
    return output("audio", {
        ...mediaFields(entry, "Audio", "audio"),
        transcript: get(entry, "transcript") === null ? null : inlineChildren(get(entry, "transcript"), "Audio transcript"),
    });
}

export function createVideo(args) {
    const entry = spec(args, ["asset", "poster", "transcript"], "Video");
    const poster = get(entry, "poster");
    return output("video", {
        ...mediaFields(entry, "Video", "video"),
        poster: poster === null ? null : assetValue(poster, "Video poster", "image"),
        transcript: get(entry, "transcript") === null ? null : inlineChildren(get(entry, "transcript"), "Video transcript"),
    });
}

export function createTable(args) {
    const entry = spec(args, ["columns", "rows", "options"], "Table");
    const columns = normalizeColumns(get(entry, "columns"));
    const rows = sequence(get(entry, "rows"), "Table rows").map((row, index) => {
        const cells = sequence(row, `Table row ${index + 1}`);
        if (cells.length !== columns.length) throw new Error(`Table row ${index + 1} has ${cells.length} cells; expected ${columns.length}`);
        return [...cells];
    });
    const options = optionalMap(get(entry, "options"), "Table options");
    return output("table", {
        columns,
        rows,
        caption: asString(get(entry, "caption")) || (options ? asString(get(options, "caption")) : null),
        options,
    });
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

export function createSliderControl(args, runtime = null) {
    const entry = spec(args, ["target", "interval", "step", "label"], "Controls.Slider");
    const target = reactiveTarget(entry, "Controls.Slider");
    const interval = get(entry, "interval");
    const scale = exactScale(interval, get(entry, "step"), get(entry, "steps"), "Controls.Slider");

    const value = exactRational(target.get(), "Controls.Slider target value");
    const index = scaleIndex(value, scale, "Controls.Slider target value");

    return output("control_slider", {
        id: asString(get(entry, "id")) || `${target.id}:slider`,
        label: asString(get(entry, "label")) || target.name,
        help: asString(get(entry, "help")),
        target,
        targetId: target.id,
        value,
        ...scale,
        index,
        ...controlBehavior(entry, { value, low: scale.low, high: scale.high, step: scale.step }, "Controls.Slider", runtime),
        replacesDependencies: Object.freeze([...target.dependencies]),
    });
}

export function createInputControl(args, runtime = null) {
    const entry = spec(args, ["target", "label", "help", "placeholder"], "Controls.Input");
    const target = reactiveTarget(entry, "Controls.Input");
    const value = target.get();
    const inputMode = (asString(get(entry, "inputMode")) || "expression").toLowerCase();
    if (!["expression", "text"].includes(inputMode)) {
        throw new Error("Controls.Input inputMode must be :expression or :text");
    }
    return output("control_input", {
        id: asString(get(entry, "id")) || `${target.id}:input`,
        label: asString(get(entry, "label")) || target.name,
        help: asString(get(entry, "help")),
        placeholder: asString(get(entry, "placeholder")) || "RiX expression",
        target,
        targetId: target.id,
        value,
        inputMode,
        ...controlBehavior(entry, { value }, "Controls.Input", runtime),
        replacesDependencies: Object.freeze([...target.dependencies]),
    });
}

function normalizeChoiceOptions(value) {
    return sequence(value, "Controls.Choice options").map((option, index) => {
        if (option?.type !== "map") return Object.freeze({ value: option, label: asString(option) });
        const entries = map(option, `Controls.Choice option ${index + 1}`);
        const optionValue = get(entries, "value");
        if (!has(entries, "value")) throw new Error(`Controls.Choice option ${index + 1} requires value`);
        return Object.freeze({ value: optionValue, label: asString(get(entries, "label")) });
    });
}

export function createChoiceControl(args, runtime = null) {
    const entry = spec(args, ["target", "options", "label"], "Controls.Choice");
    const target = reactiveTarget(entry, "Controls.Choice");
    const options = normalizeChoiceOptions(get(entry, "options"));
    if (options.length === 0) throw new Error("Controls.Choice requires at least one option");
    const value = target.get();
    const index = options.findIndex((option) => controlValuesEqual(option.value, value));
    if (index === -1) throw new Error("Controls.Choice target value must match one of its options");
    const displayOptions = options.map((option) => option.label === null
        ? controlDisplay(entry, { option: option.value }, "Controls.Choice", runtime, ["value", "option"]).option
        : option.label);
    return output("control_choice", {
        id: asString(get(entry, "id")) || `${target.id}:choice`,
        label: asString(get(entry, "label")) || target.name,
        help: asString(get(entry, "help")),
        target,
        targetId: target.id,
        value,
        options: Object.freeze(options),
        displayOptions: Object.freeze(displayOptions),
        index,
        ...controlBehavior(entry, { value }, "Controls.Choice", runtime, ["value", "option"]),
        replacesDependencies: Object.freeze([...target.dependencies]),
    });
}

export function createToggleControl(args, runtime = null) {
    const entry = spec(args, ["target", "off", "on", "label"], "Controls.Toggle");
    const target = reactiveTarget(entry, "Controls.Toggle");
    const off = get(entry, "off");
    const on = get(entry, "on");
    if (!has(entry, "off") || !has(entry, "on")) throw new Error("Controls.Toggle requires explicit off and on values");
    const value = target.get();
    const index = controlValuesEqual(value, off) ? 0 : controlValuesEqual(value, on) ? 1 : -1;
    if (index === -1) throw new Error("Controls.Toggle target value must match its off or on value");
    return output("control_toggle", {
        id: asString(get(entry, "id")) || `${target.id}:toggle`,
        label: asString(get(entry, "label")) || target.name,
        help: asString(get(entry, "help")),
        target,
        targetId: target.id,
        value,
        values: Object.freeze([off, on]),
        index,
        ...controlBehavior(entry, { value, off, on }, "Controls.Toggle", runtime),
        replacesDependencies: Object.freeze([...target.dependencies]),
    });
}

export function createRangeControl(args, runtime = null) {
    const entry = spec(args, ["target", "interval", "step", "label"], "Controls.Range");
    const target = reactiveTarget(entry, "Controls.Range");
    const scale = exactScale(get(entry, "interval"), get(entry, "step"), get(entry, "steps"), "Controls.Range");
    const value = target.get();
    if (!(value instanceof RationalInterval)) throw new Error("Controls.Range target value must be an exact RiX interval");
    const indices = Object.freeze([
        scaleIndex(value.low, scale, "Controls.Range lower endpoint"),
        scaleIndex(value.high, scale, "Controls.Range upper endpoint"),
    ]);
    return output("control_range", {
        id: asString(get(entry, "id")) || `${target.id}:range`,
        label: asString(get(entry, "label")) || target.name,
        help: asString(get(entry, "help")),
        target,
        targetId: target.id,
        value,
        ...scale,
        indices,
        ...controlBehavior(entry, {
            value,
            start: value.start,
            end: value.end,
            low: scale.low,
            high: scale.high,
            step: scale.step,
        }, "Controls.Range", runtime),
        replacesDependencies: Object.freeze([...target.dependencies]),
    });
}

export function createResetControl(args, runtime = null) {
    const entry = spec(args, ["target", "initial", "label"], "Controls.Reset");
    const target = reactiveTarget(entry, "Controls.Reset");
    const initial = get(entry, "initial");
    if (!has(entry, "initial")) throw new Error("Controls.Reset requires an explicit initial value snapshot");
    const value = target.get();
    return output("control_reset", {
        id: asString(get(entry, "id")) || `${target.id}:reset`,
        label: asString(get(entry, "label")) || `Reset ${target.name}`,
        help: asString(get(entry, "help")),
        target,
        targetId: target.id,
        value,
        initial,
        ...controlBehavior(entry, { value, initial }, "Controls.Reset", runtime),
        replacesDependencies: Object.freeze([...target.dependencies]),
    });
}

/**
 * A host-dispatched button whose RiX callback returns the next exact value for
 * its target. This is deliberately target-based so action history remains in
 * the reactive graph and is portable to other hosts.
 */
export function createActionControl(args, runtime = null) {
    const entry = spec(args, ["target", "action", "label"], "Controls.Action");
    const target = reactiveTarget(entry, "Controls.Action");
    const action = get(entry, "action");
    if (action === null || action === undefined) throw new Error("Controls.Action requires an action callable");
    const value = target.get();
    return output("control_action", {
        id: asString(get(entry, "id")) || `${target.id}:action`,
        label: asString(get(entry, "label")) || "Run action",
        help: asString(get(entry, "help")),
        target,
        targetId: target.id,
        value,
        action,
        shortcut: shortcutKey(get(entry, "shortcut"), "Controls.Action shortcut"),
        run: () => invokeControlCallable(action, [target.get()], runtime, "Controls.Action action"),
        ...controlBehavior(entry, { value }, "Controls.Action", runtime),
        replacesDependencies: Object.freeze([...target.dependencies]),
    });
}

/**
 * A temporary keyboard state backed by a reactive identity. The host commits
 * `pressed` on keydown and `released` on keyup, making momentary display modes
 * portable without embedding document listeners in RiX programs.
 */
export function createHoldControl(args, runtime = null) {
    const entry = spec(args, ["target", "key", "pressed", "released", "label"], "Controls.Hold");
    const target = reactiveTarget(entry, "Controls.Hold");
    if (!has(entry, "pressed") || !has(entry, "released")) {
        throw new Error("Controls.Hold requires explicit pressed and released values");
    }
    const pressed = get(entry, "pressed");
    const released = get(entry, "released");
    if (controlValuesEqual(pressed, released)) {
        throw new Error("Controls.Hold pressed and released values must differ");
    }
    const key = shortcutKey(get(entry, "key"), "Controls.Hold key");
    if (key === null) throw new Error("Controls.Hold requires a key");
    const value = target.get();
    const index = controlValuesEqual(value, released) ? 0 : controlValuesEqual(value, pressed) ? 1 : -1;
    if (index === -1) throw new Error("Controls.Hold target value must match its pressed or released value");
    return output("control_hold", {
        id: asString(get(entry, "id")) || `${target.id}:hold`,
        label: asString(get(entry, "label")) || `Hold ${asString(get(entry, "key")) || "key"}`,
        help: asString(get(entry, "help")),
        target,
        targetId: target.id,
        value,
        values: Object.freeze([released, pressed]),
        key,
        index,
        ...controlBehavior(entry, { value, released, pressed }, "Controls.Hold", runtime),
        replacesDependencies: Object.freeze([...target.dependencies]),
    });
}

export function createControlPanel(args) {
    const entry = spec(args, ["controls", "title", "description"], "ControlPanel");
    const controls = sequence(get(entry, "controls"), "ControlPanel controls");
    if (!controls.every((control) => isOutputValue(control) && control.kind.startsWith("control_"))) {
        throw new Error("ControlPanel entries must be values created by .Controls");
    }
    const mode = (asString(get(entry, "mode")) || "immediate").toLowerCase();
    if (!["immediate", "staged"].includes(mode)) {
        throw new Error("ControlPanel mode must be :immediate or :staged");
    }
    if (mode === "staged") {
        const graphs = new Set(controls.map(({ target }) => target?.graph).filter(Boolean));
        if (graphs.size > 1) throw new Error("A staged ControlPanel cannot span ReactiveGraphs");
    }
    return output("control_panel", {
        controls: Object.freeze([...controls]),
        title: asString(get(entry, "title")),
        description: asString(get(entry, "description")),
        mode,
        submitLabel: asString(get(entry, "submitLabel")) || "Apply changes",
        discardLabel: asString(get(entry, "discardLabel")) || "Discard",
        interactive: true,
        style: optionalMap(get(entry, "style"), "ControlPanel style"),
        metadata: optionalMap(get(entry, "metadata"), "ControlPanel metadata"),
    }, [["SNAPSHOT", method("Snapshot", ([target]) => createControlPanelSnapshot(target))]]);
}

function controlSnapshot(control) {
    const {
        target: _target,
        validateCandidate: _validateCandidate,
        action: _action,
        run: _run,
        _ext: _extensions,
        ...fields
    } = control;
    return output(control.kind, {
        ...fields,
        target: null,
        disabled: true,
        readOnly: true,
    });
}

function styleMap(value) {
    return value instanceof Map ? value : value?.type === "map" && value.entries instanceof Map ? value.entries : null;
}

function styleValue(style, key) {
    const entries = styleMap(style);
    return entries ? get(entries, key) : null;
}

function mergeStyleMaps(...styles) {
    const result = new Map();
    for (const style of styles) {
        const entries = styleMap(style);
        if (!entries) continue;
        for (const [key, value] of entries) result.set(key, value);
    }
    return result.size > 0 ? result : null;
}

/**
 * A ControlPanel style applies defaults first, then a control-kind rule, then
 * an id rule. A control's own style wins over all panel rules.
 */
function resolvedControlStyle(panelStyle, control) {
    if (!styleMap(panelStyle)) return control.style;
    const kinds = styleValue(panelStyle, "kinds");
    const ids = styleValue(panelStyle, "ids");
    const kind = control.kind.replace(/^control_/, "");
    return mergeStyleMaps(
        styleValue(panelStyle, "all"),
        styleValue(kinds, kind),
        styleValue(ids, control.id),
        control.style,
    );
}

function controlStyleAttributes(control) {
    const style = control.style;
    const variant = asString(styleValue(style, "variant"));
    const density = asString(styleValue(style, "density"));
    const width = asString(styleValue(style, "width"));
    const attributes = [];
    if (variant && ["primary", "danger", "quiet"].includes(variant)) {
        attributes.push(` data-rix-control-variant="${escapeHtml(variant)}"`);
    }
    if (density && ["compact", "comfortable"].includes(density)) {
        attributes.push(` data-rix-control-density="${escapeHtml(density)}"`);
    }
    if (width && ["auto", "compact", "full"].includes(width)) {
        attributes.push(` data-rix-control-width="${escapeHtml(width)}"`);
    }
    for (const name of ["row", "column"]) {
        const raw = styleValue(style, name);
        if (raw === null || raw === undefined) continue;
        const value = exactInteger(raw, `Control style ${name}`);
        if (value < 1 || value > 4) throw new Error(`Control style ${name} must be between 1 and 4`);
        attributes.push(` data-rix-control-${name}="${value}"`);
    }
    return attributes.join("");
}

const PORTABLE_BLOCK_STYLE_VALUES = Object.freeze({
    layout: new Set(["stack", "cluster", "grid", "split"]),
    gap: new Set(["compact", "normal", "spacious"]),
    variant: new Set(["plain", "card", "hero", "muted"]),
    width: new Set(["narrow", "content", "full"]),
    align: new Set(["start", "center", "stretch"]),
    density: new Set(["compact", "comfortable"]),
});

/** Render only the small, renderer-neutral block style vocabulary. */
function portableBlockStyleAttributes(style) {
    const attributes = [];
    for (const [name, allowed] of Object.entries(PORTABLE_BLOCK_STYLE_VALUES)) {
        const value = asString(styleValue(style, name));
        if (value && allowed.has(value)) attributes.push(` data-rix-${name}="${escapeHtml(value)}"`);
    }
    const rawColumns = styleValue(style, "columns");
    if (rawColumns !== null && rawColumns !== undefined) {
        const columns = exactInteger(rawColumns, "Portable block style columns");
        if (columns < 1 || columns > 4) throw new Error("Portable block style columns must be between 1 and 4");
        attributes.push(` data-rix-columns="${columns}"`);
    }
    return attributes.join("");
}

/** Detach a ControlPanel from reactive identities for persistence or static export. */
export function createControlPanelSnapshot(panel) {
    if (!isOutputValue(panel) || panel.kind !== "control_panel") {
        throw new Error("Expected a ControlPanel output value");
    }
    return output("control_panel", {
        controls: Object.freeze(panel.controls.map(controlSnapshot)),
        title: panel.title,
        description: panel.description,
        mode: "immediate",
        submitLabel: panel.submitLabel,
        discardLabel: panel.discardLabel,
        interactive: false,
        style: panel.style,
        metadata: panel.metadata,
    });
}

function portableSnapshotValue(value) {
    if (isUndecided(value)) return { type: "undecided" };
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error("ControlPanel snapshots cannot serialize non-finite numbers");
        return value;
    }
    if (typeof value === "bigint") return { type: "bigint", value: String(value) };
    if (value instanceof Integer) return { type: "integer", value: String(value.value) };
    if (value instanceof Rational) {
        return {
            type: "rational",
            numerator: String(value.numerator),
            denominator: String(value.denominator),
        };
    }
    if (value instanceof RationalInterval) {
        return {
            type: "rational_interval",
            start: portableSnapshotValue(value.start),
            end: portableSnapshotValue(value.end),
        };
    }
    if (value instanceof CertifiedApproximation) {
        return {
            type: "certified_approximation",
            spelling: value.toString(),
            candidate: portableSnapshotValue(value.candidate),
            enclosure: portableSnapshotValue(value.enclosure),
        };
    }
    if (Array.isArray(value)) return value.map(portableSnapshotValue);
    if (value instanceof Map) {
        return {
            type: "map",
            entries: [...value.entries()].map(([key, item]) => [String(key), portableSnapshotValue(item)]),
        };
    }
    if (typeof value === "object") {
        const result = {};
        for (const [key, item] of Object.entries(value)) {
            if (key === "_ext" || key === "target" || key === "validateCandidate") continue;
            if (typeof item === "function" || item === undefined) continue;
            result[key] = portableSnapshotValue(item);
        }
        return result;
    }
    throw new Error(`ControlPanel snapshots cannot serialize ${typeof value} values`);
}

/** Serialize a detached panel using an explicit, BigInt-safe JSON schema. */
export function serializeControlPanel(panel) {
    const snapshot = createControlPanelSnapshot(panel);
    return JSON.stringify({
        schema: "rix.control-panel",
        version: 1,
        panel: portableSnapshotValue(snapshot),
    });
}

/** A no-JavaScript HTML rendering with inert native controls and value snapshots. */
export function renderControlPanelStaticHtml(panel, format = (item) => String(item ?? "")) {
    return renderOutputHtml(createControlPanelSnapshot(panel), format);
}

/** Markdown source suitable for Markdown, Quarto HTML, and Quarto PDF output. */
export function renderControlPanelMarkdown(panel, format = (item) => String(item ?? "")) {
    const snapshot = createControlPanelSnapshot(panel);
    const heading = snapshot.title ? `### ${snapshot.title}\n\n` : "";
    const description = snapshot.description ? `${snapshot.description}\n\n` : "";
    const controls = snapshot.controls
        .map((control) => `- ${formatOutputText(control, format)}`)
        .join("\n");
    return `${heading}${description}${controls}`;
}

function sheetData(value) {
    const binding = isBinding(value) ? value : null;
    if (binding) value = binding.get();

    if (isFormulaSheet(value)) {
        return {
            kind: "formula_sheet",
            binding: null,
            formulaSheet: value,
            shape: [...value.shape],
            // Failed formulas keep their last committed value available for
            // diagnostic rendering even though direct `get` correctly throws.
            at: (index) => value.slot(index).value,
            formulaSourceAt: (index) => value.slot(index).source,
            formulaMetadataAt: (index) => {
                const slot = value.slot(index);
                return {
                    slotId: slot.id,
                    assignmentMode: slot.assignmentMode,
                    blank: slot.view?.blank === true,
                    state: slot.state,
                    dependencies: slot.dependencies,
                    diagnostics: slot.diagnostics,
                    diagnosticKind: slot.diagnosticKind,
                    diagnosticSource: slot.diagnosticSource,
                };
            },
        };
    }

    if (isShaped(value)) {
        if (value.shape.length === 0) throw new Error("Sheet data must have rank 1 or greater");
        return {
            kind: "shaped",
            binding,
            shape: [...value.shape],
            at: (index) => shapedGetBySelectors(
                value,
                index.map((item) => ({ kind: "index", value: item })),
            ),
        };
    }

    if (value?.type === "matrix" && Array.isArray(value.rows)) {
        const rows = value.rows.map((row, index) => sequence(row, `Sheet matrix row ${index + 1}`));
        const columns = rows[0]?.length ?? 0;
        if (!rows.every((row) => row.length === columns)) throw new Error("Sheet matrix rows must have equal lengths");
        return {
            kind: "matrix",
            binding,
            shape: [rows.length, columns],
            at: ([row, column]) => rows[row - 1][column - 1],
        };
    }

    if (Array.isArray(value) || isSequence(value)) {
        const values = sequence(value, "Sheet data");
        const nested = values.length > 0 && values.every((item) => Array.isArray(item) || isSequence(item));
        if (nested) {
            const rows = values.map((row, index) => sequence(row, `Sheet row ${index + 1}`));
            const columns = rows[0]?.length ?? 0;
            if (!rows.every((row) => row.length === columns)) throw new Error("Sheet rows must have equal lengths");
            return {
                kind: "sequence",
                binding,
                shape: [rows.length, columns],
                at: ([row, column]) => rows[row - 1][column - 1],
            };
        }
        return {
            kind: "sequence",
            binding,
            shape: [values.length],
            at: ([row]) => values[row - 1],
        };
    }

    throw new Error("Sheet data must be a shaped, matrix, array, tuple, or sequence");
}

function normalizedSheetIndex(value, length, label) {
    const index = exactInteger(value, label);
    const normalized = index < 0 ? length + index + 1 : index;
    if (normalized < 1 || normalized > length) {
        throw new Error(`${label} ${index} is out of range for length ${length}`);
    }
    return normalized;
}

function spreadsheetColumnLabel(index) {
    let label = "";
    let current = index;
    while (current > 0) {
        current -= 1;
        label = String.fromCharCode(65 + (current % 26)) + label;
        current = Math.floor(current / 26);
    }
    return label;
}

function sheetColumnLabel(index, mode) {
    if (mode === "letters") return spreadsheetColumnLabel(index);
    if (mode === "numbers") return String(index);
    return `${spreadsheetColumnLabel(index)} · ${index}`;
}

function sheetDisplayAddress(row, column, mode) {
    return mode === "numbers" ? `R${row}C${column}` : `${spreadsheetColumnLabel(column)}${row}`;
}

function sheetPlaneKey(slice, hiddenAxes) {
    return hiddenAxes.map(({ axis }) => `${axis}:${slice[axis - 1]}`).join(",");
}

function sheetPlaneSlices(shape, initialSlice, hiddenAxes) {
    let slices = [initialSlice.map((item) => item)];
    for (const { axis } of hiddenAxes) {
        slices = slices.flatMap((slice) => Array.from({ length: shape[axis - 1] }, (_item, index) => {
            const next = slice.map((item) => item);
            next[axis - 1] = index + 1;
            return next;
        }));
    }
    return slices;
}

function sheetField(entry, options, name, fallback = null) {
    const optionValue = options ? get(options, name) : null;
    return optionValue ?? get(entry, name, fallback);
}

function documentViewField(view, name, fallback = null) {
    if (!view || typeof view !== "object" || Array.isArray(view)) return fallback;
    if (Object.hasOwn(view, name)) return view[name];
    const canonical = String(name).toLowerCase();
    const key = Object.keys(view).find((candidate) => candidate.toLowerCase() === canonical);
    return key === undefined ? fallback : view[key];
}

function sheetOption(entry, options, documentView, name, fallback = null) {
    const explicit = sheetField(entry, options, name);
    return explicit ?? documentViewField(documentView, name, fallback);
}

/**
 * Create a portable sheet snapshot from rank-1+ indexable data.
 *
 * Passing an ordinary value produces an immutable snapshot. Passing a Binding
 * also retains the live binding so a host-owned WidgetSession can route
 * semantic edits back to the source Cell.
 */
export function createSheet(args) {
    const entry = spec(args, ["data", "options"], "Sheet");
    const data = sheetData(get(entry, "data"));
    const optionsValue = get(entry, "options");
    const options = optionsValue === null || optionsValue === undefined
        ? null
        : map(optionsValue, "Sheet options");
    const refreshOptions = options
        ? new Map(options)
        : new Map([...entry].filter(([name]) => !["data", "options"].includes(String(name).toLowerCase())));
    const rank = data.shape.length;
    const documentView = data.formulaSheet?.documentView ?? null;

    const viewAxesValue = sheetOption(entry, options, documentView, "viewAxes");
    const defaultViewAxes = rank === 1 ? [1] : [1, 2];
    const viewAxes = viewAxesValue === null
        ? defaultViewAxes
        : sequence(viewAxesValue, "Sheet viewAxes").map((axis, index) =>
            normalizedSheetIndex(axis, rank, `Sheet view axis ${index + 1}`));
    const expectedViewAxisCount = rank === 1 ? 1 : 2;
    if (viewAxes.length !== expectedViewAxisCount) {
        throw new Error(`Sheet viewAxes must contain ${expectedViewAxisCount} ${expectedViewAxisCount === 1 ? "axis" : "axes"}`);
    }
    if (new Set(viewAxes).size !== viewAxes.length) throw new Error("Sheet viewAxes must be distinct");

    const visibleAxes = new Set(viewAxes);
    const sliceValue = sheetOption(entry, options, documentView, "slice");
    const requestedSlice = sliceValue === null ? null : sequence(sliceValue, "Sheet slice");
    if (requestedSlice !== null && requestedSlice.length !== rank) {
        throw new Error(`Sheet slice must contain ${rank} entries`);
    }
    const slice = requestedSlice === null
        ? data.shape.map((_length, index) => visibleAxes.has(index + 1) ? null : 1)
        : requestedSlice.map((item, index) => {
            const axis = index + 1;
            if (visibleAxes.has(axis)) {
                if (item !== null) throw new Error(`Sheet slice axis ${axis} must be _ because it is visible`);
                return null;
            }
            if (data.shape[index] === 0) throw new Error(`Sheet cannot select empty hidden axis ${axis}`);
            return normalizedSheetIndex(item, data.shape[index], `Sheet slice axis ${axis}`);
        });

    const axesValue = sheetOption(entry, options, documentView, "axes");
    const axes = axesValue === null
        ? data.shape.map((_length, index) => `axis${index + 1}`)
        : sequence(axesValue, "Sheet axes").map((axis, index) => {
            const name = asString(axis);
            if (name === null || name.length === 0) throw new Error(`Sheet axis ${index + 1} must have a nonempty string name`);
            return name;
        });
    if (axes.length !== rank) throw new Error(`Sheet axes must contain ${rank} names`);

    const axisLabelsValue = sheetOption(entry, options, documentView, "axisLabels");
    const axisLabels = axisLabelsValue === null
        ? data.shape.map(() => null)
        : sequence(axisLabelsValue, "Sheet axisLabels").map((labels, axisIndex) => {
            if (labels === null) return null;
            const values = sequence(labels, `Sheet axisLabels axis ${axisIndex + 1}`);
            if (values.length !== data.shape[axisIndex]) {
                throw new Error(
                    `Sheet axisLabels axis ${axisIndex + 1} must contain ${data.shape[axisIndex]} labels`,
                );
            }
            return Object.freeze(values.map((label, labelIndex) => {
                if (label === null) return null;
                const name = asString(label);
                if (name === null || name.length === 0) {
                    throw new Error(
                        `Sheet axisLabels axis ${axisIndex + 1} label ${labelIndex + 1} must be a nonempty string`,
                    );
                }
                return name;
            }));
        });
    if (axisLabels.length !== rank) {
        throw new Error(`Sheet axisLabels must contain ${rank} axis entries`);
    }

    const defaultAddress = data.binding?.name || "grid";
    const addressBase = asString(sheetOption(
        entry,
        options,
        documentView,
        "address",
        { type: "string", value: defaultAddress },
    ));
    if (addressBase === null || addressBase.length === 0) throw new Error("Sheet address must be a nonempty string");
    const columnLabelMode = asString(sheetOption(
        entry,
        options,
        documentView,
        "columnLabels",
        { type: "string", value: "dual" },
    ));
    if (!["dual", "letters", "numbers"].includes(columnLabelMode)) {
        throw new Error("Sheet columnLabels must be :dual, :letters, or :numbers");
    }
    const titleValue = sheetOption(entry, options, documentView, "title");
    const title = titleValue === null ? null : asString(titleValue);
    if (titleValue !== null && title === null) throw new Error("Sheet title must be a string");

    const rowAxis = viewAxes[0];
    const columnAxis = viewAxes[1] ?? null;
    const totalRowCount = data.shape[rowAxis - 1];
    const totalColumnCount = columnAxis === null ? 1 : data.shape[columnAxis - 1];
    const rowStartValue = sheetOption(entry, options, null, "rowStart");
    const columnStartValue = sheetOption(entry, options, null, "columnStart");
    const rowCountValue = sheetOption(entry, options, null, "rowCount");
    const columnCountValue = sheetOption(entry, options, null, "columnCount");
    const rowStart = rowStartValue === null
        ? 1
        : normalizedSheetIndex(rowStartValue, totalRowCount, "Sheet rowStart");
    const columnStart = columnStartValue === null
        ? 1
        : normalizedSheetIndex(columnStartValue, totalColumnCount, "Sheet columnStart");
    const requestedRowCount = rowCountValue === null
        ? totalRowCount
        : exactInteger(rowCountValue, "Sheet rowCount");
    const requestedColumnCount = columnCountValue === null
        ? totalColumnCount
        : exactInteger(columnCountValue, "Sheet columnCount");
    if (requestedRowCount < 1) throw new Error("Sheet rowCount must be positive");
    if (requestedColumnCount < 1) throw new Error("Sheet columnCount must be positive");
    const rowCount = Math.min(requestedRowCount, totalRowCount - rowStart + 1);
    const columnCount = Math.min(requestedColumnCount, totalColumnCount - columnStart + 1);
    const rowHeaders = Array.from({ length: rowCount }, (_item, index) => {
        const coordinate = rowStart + index;
        const label = axisLabels[rowAxis - 1]?.[coordinate - 1] ?? null;
        return label === null ? String(coordinate) : `${label} · ${coordinate}`;
    });
    const columnHeaders = Array.from({ length: columnCount }, (_item, index) => {
        const coordinate = columnStart + index;
        const label = columnAxis === null ? null : axisLabels[columnAxis - 1]?.[coordinate - 1] ?? null;
        const fallback = sheetColumnLabel(coordinate, columnLabelMode);
        return label === null ? fallback : `${label} · ${coordinate}`;
    });
    const hiddenAxes = data.shape.map((length, index) => ({
        axis: index + 1,
        name: axes[index],
        length,
        selected: slice[index],
        ...(axisLabels[index]
            ? {
                labels: axisLabels[index].map((label, coordinate) =>
                    label === null ? String(coordinate + 1) : `${label} · ${coordinate + 1}`),
                selectedLabel: axisLabels[index][slice[index] - 1],
            }
            : {}),
    })).filter(({ axis }) => !visibleAxes.has(axis));
    const cellsForSlice = (planeSlice) => Array.from({ length: rowCount }, (_row, rowIndex) =>
        Array.from({ length: columnCount }, (_column, columnIndex) => {
            const index = planeSlice.map((item) => item);
            const rowCoordinate = rowStart + rowIndex;
            const columnCoordinate = columnStart + columnIndex;
            index[rowAxis - 1] = rowCoordinate;
            if (columnAxis !== null) index[columnAxis - 1] = columnCoordinate;
            const formulaMetadata = data.formulaMetadataAt?.(index) ?? null;
            const coordinateLabels = index.map((coordinate, axisIndex) =>
                axisLabels[axisIndex]?.[coordinate - 1] ?? null);
            return Object.freeze({
                value: data.at(index),
                formulaSource: data.formulaSourceAt?.(index) ?? null,
                slotId: formulaMetadata?.slotId ?? null,
                assignmentMode: formulaMetadata?.assignmentMode ?? null,
                blank: formulaMetadata?.blank === true,
                state: formulaMetadata?.state ?? "clean",
                dependencies: Object.freeze([...(formulaMetadata?.dependencies ?? [])]),
                diagnostics: Object.freeze([...(formulaMetadata?.diagnostics ?? [])]),
                diagnosticKind: formulaMetadata?.diagnosticKind ?? null,
                diagnosticSource: formulaMetadata?.diagnosticSource ?? null,
                index: Object.freeze(index),
                coordinateLabels: Object.freeze(coordinateLabels),
                coordinateLabel: coordinateLabels.filter((label) => label !== null).join(" / ") || null,
                address: `${addressBase}[${index.join(",")}]`,
                displayAddress: sheetDisplayAddress(rowCoordinate, columnCoordinate, columnLabelMode),
            });
        }));
    const planes = sheetPlaneSlices(data.shape, slice, hiddenAxes).map((planeSlice) => Object.freeze({
        key: sheetPlaneKey(planeSlice, hiddenAxes),
        slice: Object.freeze(planeSlice),
        cells: Object.freeze(cellsForSlice(planeSlice).map((row) => Object.freeze(row))),
    }));
    const selectedPlaneKey = sheetPlaneKey(slice, hiddenAxes);
    const cells = planes.find((plane) => plane.key === selectedPlaneKey)?.cells ?? planes[0].cells;

    return output("sheet", {
        sourceKind: data.kind,
        formulaSheet: data.formulaSheet ?? null,
        formulaBacked: Boolean(data.formulaSheet),
        binding: data.binding,
        bindingId: data.binding?.id ?? null,
        editable: Boolean(data.binding || data.formulaSheet),
        editMode: data.formulaSheet ? "formula" : data.binding ? "value" : null,
        rank,
        shape: Object.freeze([...data.shape]),
        window: Object.freeze({
            rowStart,
            rowCount,
            totalRowCount,
            columnStart,
            columnCount,
            totalColumnCount,
        }),
        axes: Object.freeze(axes),
        axisLabels: Object.freeze(axisLabels),
        viewAxes: Object.freeze(viewAxes),
        slice: Object.freeze(slice),
        addressBase,
        title,
        columnLabelMode,
        showAxisSummary: axesValue !== null || axisLabelsValue !== null,
        rowAxis: Object.freeze({ axis: rowAxis, name: axes[rowAxis - 1] }),
        columnAxis: columnAxis === null
            ? null
            : Object.freeze({ axis: columnAxis, name: axes[columnAxis - 1] }),
        rowHeaders: Object.freeze(rowHeaders),
        columnHeaders: Object.freeze(columnHeaders),
        hiddenAxes: Object.freeze(hiddenAxes.map((axis) => Object.freeze(axis))),
        selectedPlaneKey,
        planes: Object.freeze(planes),
        cells,
        options: refreshOptions.size > 0 ? refreshOptions : null,
    }, sheetMethods());
}

/**
 * Detach a live Sheet from its Binding for persistence or static export.
 *
 * Cell values and plane records are already immutable snapshots, so detaching
 * only removes the runtime handle and live-edit marker.
 */
export function createSheetSnapshot(sheet) {
    if (!isOutputValue(sheet) || sheet.kind !== "sheet") throw new Error("Expected a Sheet output value");
    if (!sheet.editable && !sheet.formulaBacked) return sheet;
    return output("sheet", {
        ...sheet,
        binding: null,
        bindingId: null,
        editable: false,
        editMode: null,
        formulaSheet: null,
        formulaBacked: false,
    });
}

export function createPath(args) {
    const entry = spec(args, ["points", "style"], "Path");
    const commands = get(entry, "commands");
    const points = get(entry, "points");
    if (commands !== null && commands !== undefined) {
        return output("path", {
            commands: sequence(commands, "Path commands"),
            points: null,
            style: optionalMap(get(entry, "style"), "Path style"),
        });
    }
    return output("path", {
        commands: null,
        points: sequence(points, "Path points"),
        style: optionalMap(get(entry, "style"), "Path style"),
    });
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

export function createDragPoint(args) {
    const entry = spec(args, ["target", "radius", "style", "label"], "DragPoint");
    const target = get(entry, "target");
    if (!isReactiveNode(target)) {
        throw new Error("DragPoint target must be a ReactiveGraph node");
    }
    const center = sequence(target.get(), "DragPoint target value");
    if (center.length !== 2) {
        throw new Error("DragPoint target value must contain x and y coordinates");
    }
    return output("drag_point", {
        center: Object.freeze([...center]),
        radius: get(entry, "radius", int(7)),
        style: optionalMap(get(entry, "style"), "DragPoint style"),
        label: asString(get(entry, "label")) || "Draggable point",
        target,
        targetId: target.id,
        replacesDependencies: Object.freeze([...target.dependencies]),
    });
}

/** A focusable scene subtree whose RiX callback replaces a reactive target. */
export function createGraphicAction(args, runtime = null) {
    const entry = spec(args, ["target", "action", "children", "label"], "Graphics.Action");
    const target = reactiveTarget(entry, "Graphics.Action");
    const action = get(entry, "action");
    if (action === null || action === undefined) throw new Error("Graphics.Action requires an action callable");
    return output("graphic_action", {
        id: asString(get(entry, "id")) || `${target.id}:graphic-action`,
        label: asString(get(entry, "label")) || "Graphic action",
        children: sequence(get(entry, "children"), "Graphics.Action children"),
        style: optionalMap(get(entry, "style"), "Graphics.Action style"),
        target,
        targetId: target.id,
        action,
        run: () => invokeControlCallable(action, [target.get()], runtime, "Graphics.Action action"),
        replacesDependencies: Object.freeze([...target.dependencies]),
    });
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
    return output("figure", {
        content,
        caption: asString(get(entry, "caption")),
        label: asString(get(entry, "label")),
        alt: asString(get(entry, "alt")),
        style: optionalMap(get(entry, "style"), "Figure style"),
    });
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
        // Grid rules are one-based cell boundaries: the second cell is the
        // first coefficient, so its left edge divides the root from it.
        rules: [{ kind: "vertical", afterColumn: 2 }, { kind: "horizontal", aboveRow: 3 }],
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

    const plotStyle = (entries, fallbackStroke, fallbackWidth) => {
        const supplied = optionalMap(get(entries, "style", null), "Polynomial plot style") || new Map();
        return new Map([
            ...supplied,
            ["stroke", get(entries, "stroke", get(supplied, "stroke", fallbackStroke))],
            ["width", get(entries, "width", get(supplied, "width", fallbackWidth))],
            ["fill", get(supplied, "fill", { type: "string", value: "none" })],
        ]);
    };
    const readSeries = (entry, index, primary = false) => {
        const entries = primary ? optionEntries : map(entry, `Polynomial plot series ${index + 1}`);
        const coefficients = primary ? values : sequence(get(entries, "coefficients"), `Polynomial plot series ${index + 1} coefficients`)
            .map((value, coefficientIndex) => exactNumber(value, `Polynomial plot series ${index + 1} coefficient ${coefficientIndex + 1}`));
        if (coefficients.length < 2) throw new Error(`Polynomial plot series ${index + 1} requires at least two coefficients`);
        const numbers = coefficients.map((value, coefficientIndex) => numericValue(value, `Polynomial plot series ${index + 1} coefficient ${coefficientIndex + 1}`));
        const data = Array.from({ length: samples }, (_, sampleIndex) => {
            const x = xMin + (xMax - xMin) * sampleIndex / (samples - 1);
            return [x, numbers.reduce((total, coefficient) => total * x + coefficient, 0)];
        });
        return {
            data,
            style: plotStyle(entries, primary ? { type: "string", value: "#2563eb" } : { type: "string", value: "#b45309" }, primary ? int(3) : int(2)),
            label: get(entries, "label", null),
        };
    };
    const extraSeries = get(optionEntries, "series", null);
    const series = [readSeries(null, 0, true), ...(extraSeries === null ? [] : sequence(extraSeries, "Polynomial plot series").map((entry, index) => readSeries(entry, index + 1)))];
    const readMark = (entry, index) => {
        const entries = map(entry, `Polynomial plot mark ${index + 1}`);
        const point = sequence(get(entries, "point"), `Polynomial plot mark ${index + 1} point`);
        if (point.length !== 2) throw new Error(`Polynomial plot mark ${index + 1} point must contain x and y coordinates`);
        return {
            point: point.map((value, coordinate) => numericValue(value, `Polynomial plot mark ${index + 1} ${coordinate === 0 ? "x" : "y"}`)),
            label: get(entries, "label", null),
            style: optionalMap(get(entries, "style", null), `Polynomial plot mark ${index + 1} style`) || new Map([
                ["fill", { type: "string", value: "#be123c" }], ["stroke", { type: "string", value: "#fff" }], ["width", int(2)],
            ]),
            labelStyle: optionalMap(get(entries, "labelStyle", null), `Polynomial plot mark ${index + 1} label style`) || new Map([["size", int(13)]]),
            radius: get(entries, "radius", int(5)),
        };
    };
    const marksValue = get(optionEntries, "marks", null);
    const marks = marksValue === null ? [] : sequence(marksValue, "Polynomial plot marks").map(readMark);
    const readTick = (entry, index) => {
        const entries = map(entry, `Polynomial plot tick ${index + 1}`);
        return {
            x: numericValue(get(entries, "x"), `Polynomial plot tick ${index + 1} x`),
            label: get(entries, "label", null),
            style: optionalMap(get(entries, "style", null), `Polynomial plot tick ${index + 1} style`) || new Map([["stroke", { type: "string", value: "#334155" }], ["width", int(2)]]),
            labelStyle: optionalMap(get(entries, "labelStyle", null), `Polynomial plot tick ${index + 1} label style`) || new Map([["size", int(13)], ["anchor", { type: "string", value: "middle" }]]),
        };
    };
    const ticksValue = get(optionEntries, "ticks", null);
    const ticks = ticksValue === null ? [] : sequence(ticksValue, "Polynomial plot ticks").map(readTick);
    const yDomainValue = get(optionEntries, "yDomain", null);
    let yMin;
    let yMax;
    if (yDomainValue !== null) {
        const yBounds = sequence(yDomainValue, "Polynomial plot yDomain");
        if (yBounds.length !== 2) throw new Error("Polynomial plot yDomain must have a lower and upper bound");
        yMin = numericValue(yBounds[0], "Polynomial plot yDomain lower bound");
        yMax = numericValue(yBounds[1], "Polynomial plot yDomain upper bound");
        if (!(yMin < yMax)) throw new Error("Polynomial plot yDomain must increase");
    } else {
        yMin = Math.min(0, ...series.flatMap(({ data }) => data.map(([, y]) => y)), ...marks.map(({ point }) => point[1]));
        yMax = Math.max(0, ...series.flatMap(({ data }) => data.map(([, y]) => y)), ...marks.map(({ point }) => point[1]));
        if (yMin === yMax) {
            yMin -= 1;
            yMax += 1;
        }
        const yPadding = (yMax - yMin) * 0.08;
        yMin -= yPadding;
        yMax += yPadding;
    }

    const [width, height] = size;
    const toPoint = ([x, y]) => [
        margin + (x - xMin) / (xMax - xMin) * (width - margin * 2),
        height - margin - (y - yMin) / (yMax - yMin) * (height - margin * 2),
    ];
    const axisStyle = new Map([
        ["stroke", { type: "string", value: "#64748b" }],
        ["width", int(1)],
        ["dash", { type: "string", value: "3 3" }],
        ["fill", { type: "string", value: "none" }],
    ]);
    const children = [];
    if (yMin <= 0 && yMax >= 0) children.push(output("path", { points: [toPoint([xMin, 0]), toPoint([xMax, 0])], style: axisStyle }));
    if (xMin <= 0 && xMax >= 0) children.push(output("path", { points: [toPoint([0, yMin]), toPoint([0, yMax])], style: axisStyle }));
    for (const seriesEntry of series) children.push(output("path", { points: seriesEntry.data.map(toPoint), style: seriesEntry.style }));
    for (const tick of ticks) {
        const [tickX, tickY] = toPoint([tick.x, 0]);
        children.push(output("path", { points: [[tickX, tickY - 5], [tickX, tickY + 5]], style: tick.style }));
        if (tick.label !== null && tick.label !== undefined) {
            children.push(output("text_mark", { position: [tickX, tickY + 20], text: tick.label, style: tick.labelStyle }));
        }
    }
    for (const mark of marks) {
        const [markX, markY] = toPoint(mark.point);
        children.push(output("circle", { center: [markX, markY], radius: mark.radius, style: mark.style }));
        if (mark.label !== null && mark.label !== undefined) {
            children.push(output("text_mark", { position: [markX + 9, markY - 9], text: mark.label, style: mark.labelStyle }));
        }
    }
    const labeledSeries = series.filter(({ label }) => label !== null && label !== undefined);
    for (const [index, seriesEntry] of labeledSeries.entries()) {
        const y = margin + 16 + index * 18;
        children.push(output("path", { points: [[margin + 2, y - 5], [margin + 18, y - 5]], style: seriesEntry.style }));
        children.push(output("text_mark", { position: [margin + 24, y], text: seriesEntry.label, style: new Map([["size", int(13)]]) }));
    }
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

function controlField(control, name) {
    return control.display && Object.hasOwn(control.display, name)
        ? control.display[name]
        : control[name];
}

function controlStateAttributes(control) {
    return `${control.disabled ? ' data-rix-control-disabled="true"' : ""}${control.readOnly ? ' data-rix-control-read-only="true"' : ""}`;
}

function controlInputAttributes(control, { text = false } = {}) {
    if (control.disabled) return " disabled";
    if (control.readOnly) return text ? " readonly aria-readonly=\"true\"" : " aria-readonly=\"true\"";
    return "";
}

function controlMessages(control) {
    return `${control.validation ? `<small class="rix-output-control-validation" role="alert">${escapeHtml(control.validation)}</small>` : ""}${control.help ? `<small>${escapeHtml(control.help)}</small>` : ""}`;
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

function svgPolicy(options = {}) {
    const precision = options.precision ?? 6;
    const rounding = options.rounding ?? "nearest";
    if (!Number.isSafeInteger(precision) || precision < 0 || precision > 30) {
        throw new Error("SVG coordinate precision must be an integer between 0 and 30");
    }
    if (!["nearest", "floor", "ceil", "truncate"].includes(rounding)) {
        throw new Error("SVG coordinate rounding must be nearest, floor, ceil, or truncate");
    }
    return { precision, rounding, entries: [], collisions: new Map(), gain: 1 };
}

const SVG_SHAPE_STYLE_KEYS = new Set(["stroke", "fill", "width", "strokewidth", "dash", "opacity"]);
const SVG_PATH_STYLE_KEYS = new Set([...SVG_SHAPE_STYLE_KEYS, "closed"]);
const SVG_TEXT_STYLE_KEYS = new Set([...SVG_SHAPE_STYLE_KEYS, "anchor", "size", "fontsize", "font", "weight"]);

function unsupportedSvg(message, path, code = "svg-unsupported-scene-feature") {
    throw new UnsupportedRenderError(`${path}: ${message}`, { code, target: "svg", path });
}

function validateSvgStyle(style, allowed, path) {
    if (style === null || style === undefined) return;
    if (!(style instanceof Map)) unsupportedSvg("style must be a Graphics style map", `${path}.style`, "svg-invalid-style");
    for (const key of style.keys()) {
        const canonical = String(key).toLowerCase();
        if (!allowed.has(canonical)) {
            unsupportedSvg(`SVG does not support Graphics style property '${key}'`, `${path}.style.${key}`, "svg-unsupported-style");
        }
    }
}

function finiteSvgDecimal(text, label) {
    if (!Number.isFinite(Number(text))) {
        throw new Error(`${label} is outside the finite SVG coordinate range`);
    }
    return text;
}

function certifiedMagnitude(numerator, denominator, label) {
    if (numerator === 0n) return 0;
    const magnitude = numericValue(new Rational(numerator, denominator), label);
    if (!Number.isFinite(magnitude)) {
        throw new Error(`${label} is outside the finite SVG coordinate range`);
    }
    if (magnitude === 0) return Number.MIN_VALUE;
    return magnitude * (1 + Number.EPSILON * 8) + Number.MIN_VALUE;
}

function decimalText(scaled, precision) {
    const negative = scaled < 0n;
    let digits = (negative ? -scaled : scaled).toString();
    if (precision === 0) return `${negative && scaled !== 0n ? "-" : ""}${digits}`;
    digits = digits.padStart(precision + 1, "0");
    const integer = digits.slice(0, -precision);
    const fraction = digits.slice(-precision).replace(/0+$/, "");
    return `${negative && scaled !== 0n ? "-" : ""}${integer}${fraction ? `.${fraction}` : ""}`;
}

function roundedRational(value, policy) {
    const negative = value.numerator < 0n;
    const numerator = negative ? -value.numerator : value.numerator;
    const scale = 10n ** BigInt(policy.precision);
    const quotient = (numerator * scale) / value.denominator;
    const remainder = (numerator * scale) % value.denominator;
    const floor = negative ? -(quotient + (remainder === 0n ? 0n : 1n)) : quotient;
    const ceil = negative ? -quotient : quotient + (remainder === 0n ? 0n : 1n);
    let signed = negative ? -quotient : quotient;
    if (policy.rounding === "floor") signed = floor;
    else if (policy.rounding === "ceil") signed = ceil;
    else if (policy.rounding === "nearest" && remainder * 2n >= value.denominator) signed += negative ? -1n : 1n;
    const errorNumerator = (signed * value.denominator - value.numerator * scale);
    const absoluteError = errorNumerator < 0n ? -errorNumerator : errorNumerator;
    return {
        text: decimalText(signed, policy.precision),
        approximated: remainder !== 0n,
        lower: decimalText(floor, policy.precision),
        upper: decimalText(ceil, policy.precision),
        error: certifiedMagnitude(absoluteError, value.denominator * scale, "SVG exact rounding error"),
        scaled: signed,
        scale,
    };
}

function intervalMidpoint(interval) {
    return new Rational(
        interval.low.numerator * interval.high.denominator + interval.high.numerator * interval.low.denominator,
        2n * interval.low.denominator * interval.high.denominator,
    );
}

function scaledDistance(scaled, scale, value) {
    const difference = scaled * value.denominator - value.numerator * scale;
    const absolute = difference < 0n ? -difference : difference;
    return certifiedMagnitude(absolute, scale * value.denominator, "SVG certified enclosure radius");
}

function svgNumber(value, label, policy, role = "scalar") {
    let lowered;
    let exact;
    let approximated = false;
    if (value instanceof RationalInterval || value instanceof CertifiedApproximation) {
        const interval = value instanceof CertifiedApproximation ? value.enclosure : value;
        const candidateValue = value instanceof CertifiedApproximation ? value.candidate : intervalMidpoint(interval);
        const candidate = candidateValue instanceof Integer ? new Rational(candidateValue.value, 1n) : candidateValue;
        const result = roundedRational(candidate, policy);
        const lower = roundedRational(interval.low, { ...policy, rounding: "floor" });
        const upper = roundedRational(interval.high, { ...policy, rounding: "ceil" });
        exact = String(value);
        lowered = result.text;
        approximated = true;
        const error = Math.max(
            scaledDistance(result.scaled, result.scale, interval.low),
            scaledDistance(result.scaled, result.scale, interval.high),
        );
        policy.entries.push({
            path: label, role, exact, lowered, lower: lower.text, upper: upper.text,
            approximated, certified: true, error, gain: policy.gain,
            source: value instanceof CertifiedApproximation ? "certified-approximation" : "rational-interval",
            presentation: value instanceof RationalInterval && !value.isAscending ? "reversed" : "ascending",
        });
    } else if (value instanceof Integer) {
        exact = value.toString();
        lowered = exact;
        policy.entries.push({ path: label, role, exact, lowered, lower: lowered, upper: lowered, approximated: false, certified: true, error: 0, gain: policy.gain });
    } else if (value instanceof Rational) {
        exact = value.toString();
        const result = roundedRational(value, policy);
        lowered = result.text;
        approximated = result.approximated;
        policy.entries.push({ path: label, role, exact, lowered, lower: result.lower, upper: result.upper, approximated, certified: true, error: result.error, gain: policy.gain });
    } else {
        const number = numericValue(value, label);
        if (!Number.isFinite(number)) throw new Error(`${label} must be finite`);
        exact = String(number);
        lowered = Number(number.toFixed(policy.precision)).toString();
        approximated = Number(lowered) !== number;
        policy.entries.push({ path: label, role, exact, lowered, lower: null, upper: null, approximated, certified: false, error: null, gain: policy.gain });
    }
    finiteSvgDecimal(lowered, label);
    const recorded = policy.entries.at(-1);
    if (recorded?.certified) {
        finiteSvgDecimal(recorded.lower, `${label} lower enclosure`);
        finiteSvgDecimal(recorded.upper, `${label} upper enclosure`);
    }
    const collisionKey = `${role}:${lowered}`;
    const exactValues = policy.collisions.get(collisionKey) || new Set();
    exactValues.add(exact);
    policy.collisions.set(collisionKey, exactValues);
    return lowered;
}

function svgPoint(value, index, policy) {
    const point = sequence(value, `Path point ${index + 1}`);
    if (point.length !== 2) throw new Error(`Path point ${index + 1} must contain x and y coordinates`);
    return [
        svgNumber(point[0], `Path point ${index + 1} x`, policy, "x"),
        svgNumber(point[1], `Path point ${index + 1} y`, policy, "y"),
    ];
}

function svgPair(value, label, policy, roles = ["x", "y"]) {
    const pair = sequence(value, label);
    if (pair.length !== 2) throw new Error(`${label} must contain two coordinates`);
    return [svgNumber(pair[0], `${label} x`, policy, roles[0]), svgNumber(pair[1], `${label} y`, policy, roles[1])];
}

function sceneField(value, name) {
    if (value?.type === "map" && value.entries instanceof Map) return get(value.entries, name);
    return value?.[name] ?? null;
}

function svgFlag(value, label) {
    if (value === true) return "1";
    if (value === false || value === null || value === undefined) return "0";
    return numericValue(value, label) === 0 ? "0" : "1";
}

function svgPathData(path, policy, scenePath) {
    if (!path.commands) {
        if (path.points.length === 0) return "";
        const points = path.points.map((point, index) => svgPoint(point, index, policy));
        const closed = styleEntry(path.style, "closed")?.value === 1n || styleEntry(path.style, "closed") === true;
        return points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x} ${y}`).join(" ") + (closed ? " Z" : "");
    }
    return path.commands.map((command, index) => {
        const op = (asString(sceneField(command, "op")) ?? sceneField(command, "op") ?? "").toLowerCase();
        const destination = () => svgPair(sceneField(command, "to"), `Path command ${index + 1} destination`, policy);
        if (op === "move" || op === "m") {
            const [x, y] = destination();
            return `M${x} ${y}`;
        }
        if (op === "line" || op === "l") {
            const [x, y] = destination();
            return `L${x} ${y}`;
        }
        if (op === "quadratic" || op === "quad" || op === "q") {
            const [cx, cy] = svgPair(sceneField(command, "control"), `Path command ${index + 1} control`, policy);
            const [x, y] = destination();
            return `Q${cx} ${cy} ${x} ${y}`;
        }
        if (op === "cubic" || op === "curve" || op === "c") {
            const [c1x, c1y] = svgPair(sceneField(command, "control1"), `Path command ${index + 1} control1`, policy);
            const [c2x, c2y] = svgPair(sceneField(command, "control2"), `Path command ${index + 1} control2`, policy);
            const [x, y] = destination();
            return `C${c1x} ${c1y} ${c2x} ${c2y} ${x} ${y}`;
        }
        if (op === "arc" || op === "a") {
            const [rx, ry] = svgPair(sceneField(command, "radius"), `Path command ${index + 1} radius`, policy);
            const rotation = svgNumber(sceneField(command, "rotation") ?? int(0), `Path command ${index + 1} rotation`, policy, "angle");
            const large = svgFlag(sceneField(command, "large"), `Path command ${index + 1} large flag`);
            const sweep = svgFlag(sceneField(command, "sweep"), `Path command ${index + 1} sweep flag`);
            const [x, y] = destination();
            return `A${rx} ${ry} ${rotation} ${large} ${sweep} ${x} ${y}`;
        }
        if (op === "close" || op === "z") return "Z";
        const commandPath = `${scenePath}.commands[${index + 1}]`;
        unsupportedSvg(`SVG does not support Path command '${op || "(missing op)"}'`, commandPath, "svg-unsupported-path-command");
    }).join(" ");
}

function svgStyle(style, defaultFill = null, policy) {
    const attrs = [];
    const stroke = asString(styleEntry(style, "stroke"));
    const fill = asString(styleEntry(style, "fill"));
    const dash = asString(styleEntry(style, "dash"));
    const opacity = styleEntry(style, "opacity");
    const width = styleEntry(style, "width") ?? styleEntry(style, "strokeWidth");
    if (fill || defaultFill !== null) attrs.push(`fill="${escapeHtml(fill || defaultFill)}"`);
    if (stroke) attrs.push(`stroke="${escapeHtml(stroke)}"`);
    if (width !== null && width !== undefined) attrs.push(`stroke-width="${svgNumber(width, "Path stroke width", policy, "width")}"`);
    if (dash) attrs.push(`stroke-dasharray="${escapeHtml(dash)}"`);
    if (opacity !== null && opacity !== undefined) attrs.push(`opacity="${svgNumber(opacity, "Path opacity", policy, "opacity")}"`);
    return attrs.join(" ");
}

function svgTransform(node, policy) {
    const transforms = [];
    const entryStart = policy.entries.length;
    if (node.translate !== null && node.translate !== undefined) {
        const [x, y] = svgPair(node.translate, "Transform translate", policy);
        transforms.push(`translate(${x} ${y})`);
    }
    if (node.rotate !== null && node.rotate !== undefined) {
        const angle = svgNumber(node.rotate, "Transform rotate", policy, "angle");
        const origin = node.origin === null || node.origin === undefined ? null : svgPair(node.origin, "Transform origin", policy);
        transforms.push(origin ? `rotate(${angle} ${origin[0]} ${origin[1]})` : `rotate(${angle})`);
    }
    if (node.scale !== null && node.scale !== undefined) {
        const scale = isSequence(node.scale) || Array.isArray(node.scale)
            ? svgPair(node.scale, "Transform scale", policy, ["scale", "scale"])
            : [svgNumber(node.scale, "Transform scale", policy, "scale"), svgNumber(node.scale, "Transform scale", policy, "scale")];
        transforms.push(`scale(${scale[0]} ${scale[1]})`);
    }
    const transformEntries = policy.entries.slice(entryStart);
    const scaleGain = Math.max(1, ...transformEntries
        .filter(({ role }) => role === "scale")
        .flatMap(({ exact, lowered, lower, upper }) => [exact, lowered, lower, upper])
        .map(Number)
        .filter(Number.isFinite)
        .map(Math.abs));
    for (const entry of transformEntries) {
        if (entry.role !== "scale") entry.gain *= scaleGain;
    }
    return { text: transforms.join(" "), childGain: policy.gain * scaleGain };
}

function renderSvgText(node, format, policy) {
    const [x, y] = svgPair(node.position, "TextMark position", policy);
    const anchor = asString(styleEntry(node.style, "anchor"));
    const size = styleEntry(node.style, "size") ?? styleEntry(node.style, "fontSize");
    const font = asString(styleEntry(node.style, "font"));
    const weight = asString(styleEntry(node.style, "weight"));
    const attrs = [svgStyle(node.style, "currentColor", policy)];
    if (anchor) attrs.push(`text-anchor="${escapeHtml(anchor)}"`);
    if (size !== null && size !== undefined) attrs.push(`font-size="${svgNumber(size, "TextMark size", policy, "font-size")}"`);
    if (font) attrs.push(`font-family="${escapeHtml(font)}"`);
    if (weight) attrs.push(`font-weight="${escapeHtml(weight)}"`);
    return `<text x="${x}" y="${y}" ${attrs.filter(Boolean).join(" ")}>${escapeHtml(cellText(node.text, format))}</text>`;
}

function renderSvgNode(node, format, defs, policy, path) {
    if (!isOutputValue(node)) unsupportedSvg("expected a Graphics output node", path, "svg-invalid-scene-node");
    if (node.kind === "path") {
        validateSvgStyle(node.style, SVG_PATH_STYLE_KEYS, path);
        const d = svgPathData(node, policy, path);
        if (!d) return "";
        return `<path d="${d}" ${svgStyle(node.style, "none", policy)}/>`;
    }
    if (node.kind === "rectangle") {
        validateSvgStyle(node.style, SVG_SHAPE_STYLE_KEYS, path);
        const [x, y] = svgPair(node.origin, "Rectangle origin", policy);
        const [width, height] = svgPair(node.size, "Rectangle size", policy, ["width", "height"]);
        return `<rect x="${x}" y="${y}" width="${width}" height="${height}" ${svgStyle(node.style, "none", policy)}/>`;
    }
    if (node.kind === "circle") {
        validateSvgStyle(node.style, SVG_SHAPE_STYLE_KEYS, path);
        const [cx, cy] = svgPair(node.center, "Circle center", policy);
        return `<circle cx="${cx}" cy="${cy}" r="${svgNumber(node.radius, "Circle radius", policy, "radius")}" ${svgStyle(node.style, "none", policy)}/>`;
    }
    if (node.kind === "drag_point") {
        validateSvgStyle(node.style, SVG_SHAPE_STYLE_KEYS, path);
        const [cx, cy] = svgPair(node.center, "DragPoint center", policy);
        const replaced = node.replacesDependencies?.length
            ? ` data-rix-replaces-dependencies="${escapeHtml(node.replacesDependencies.join(","))}"`
            : "";
        return `<circle class="rix-output-drag-point" cx="${cx}" cy="${cy}" r="${svgNumber(node.radius, "DragPoint radius", policy, "radius")}" ${svgStyle(node.style, "#7c3aed", policy)} tabindex="0" role="button" aria-label="${escapeHtml(node.label)}" data-rix-drag-target="${escapeHtml(node.targetId)}" data-rix-position="${cx},${cy}"${replaced}/>`;
    }
    if (node.kind === "graphic_action") {
        validateSvgStyle(node.style, SVG_SHAPE_STYLE_KEYS, path);
        const replaced = node.replacesDependencies?.length
            ? ` data-rix-replaces-dependencies="${escapeHtml(node.replacesDependencies.join(","))}"`
            : "";
        const style = svgStyle(node.style, null, policy);
        return `<g class="rix-output-graphic-action"${style ? ` ${style}` : ""} tabindex="0" role="button" aria-label="${escapeHtml(node.label)}" data-rix-graphic-action="${escapeHtml(node.id)}" data-rix-graphic-target="${escapeHtml(node.targetId)}"${replaced}>${node.children.map((child, index) => renderSvgNode(child, format, defs, policy, `${path}.graphic_action[${index + 1}]`)).join("")}</g>`;
    }
    if (node.kind === "text_mark") {
        validateSvgStyle(node.style, SVG_TEXT_STYLE_KEYS, path);
        return renderSvgText(node, format, policy);
    }
    if (node.kind === "group") {
        validateSvgStyle(node.style, SVG_SHAPE_STYLE_KEYS, path);
        return `<g ${svgStyle(node.style, null, policy)}>${node.children.map((child, index) => renderSvgNode(child, format, defs, policy, `${path}.group[${index + 1}]`)).join("")}</g>`;
    }
    if (node.kind === "transform") {
        validateSvgStyle(node.style, SVG_SHAPE_STYLE_KEYS, path);
        const transform = svgTransform(node, policy);
        const parentGain = policy.gain;
        policy.gain = transform.childGain;
        const style = svgStyle(node.style, null, policy);
        const children = node.children.map((child, index) => renderSvgNode(child, format, defs, policy, `${path}.transform[${index + 1}]`)).join("");
        policy.gain = parentGain;
        return `<g${transform.text ? ` transform="${transform.text}"` : ""}${style ? ` ${style}` : ""}>${children}</g>`;
    }
    if (node.kind === "clip") {
        validateSvgStyle(node.style, SVG_SHAPE_STYLE_KEYS, path);
        const clipRoles = ["x", "y", "width", "height"];
        const [x, y, width, height] = node.bounds.map((value, index) => svgNumber(value, `Clip bounds ${index + 1}`, policy, clipRoles[index]));
        const id = `rix-clip-${defs.length + 1}`;
        defs.push(`<clipPath id="${id}"><rect x="${x}" y="${y}" width="${width}" height="${height}"/></clipPath>`);
        const style = svgStyle(node.style, null, policy);
        return `<g clip-path="url(#${id})"${style ? ` ${style}` : ""}>${node.children.map((child, index) => renderSvgNode(child, format, defs, policy, `${path}.clip[${index + 1}]`)).join("")}</g>`;
    }
    unsupportedSvg(`SVG does not support Graphics node '${node.kind}'`, path, "svg-unsupported-node");
}

export function lowerGraphicSvg(graphic, format = (item) => String(item ?? ""), options = {}) {
    if (!isOutputValue(graphic) || graphic.kind !== "graphic") throw new Error("Expected a Graphic output value");
    const policy = svgPolicy(options);
    const size = graphic.size.map((value, index) => svgNumber(value, `Graphic size ${index + 1}`, policy, index === 0 ? "width" : "height"));
    const defs = [];
    const children = graphic.children.map((child, index) => renderSvgNode(child, format, defs, policy, `graphic[${index + 1}]`)).join("");
    const collisions = [...policy.collisions.entries()]
        .filter(([, exactValues]) => exactValues.size > 1)
        .map(([key, exactValues]) => ({ lowered: key.slice(key.indexOf(":") + 1), role: key.slice(0, key.indexOf(":")), exact: [...exactValues] }));
    const approximated = policy.entries.filter((entry) => entry.approximated);
    const exactErrors = policy.entries.filter((entry) => entry.certified && entry.error > 0);
    const viewportEntries = policy.entries.filter(({ path }) => path.startsWith("Graphic size "));
    const viewportExtent = Math.hypot(...viewportEntries.map(({ lower, upper }) => Math.max(Math.abs(Number(lower)), Math.abs(Number(upper)))));
    const coordinateExtent = Math.max(0, ...policy.entries
        .filter(({ role }) => ["x", "y", "width", "height", "radius"].includes(role))
        .flatMap(({ lower, upper }) => [lower, upper].map((bound) => Math.abs(Number(bound))).filter(Number.isFinite)));
    const extent = Math.max(viewportExtent, coordinateExtent);
    const coordinateError = Math.SQRT2 * Math.max(0, ...exactErrors
        .filter(({ role, path }) => ["x", "y"].includes(role) && !path.startsWith("Transform translate"))
        .map(({ error, gain }) => error * gain));
    const translationError = Math.SQRT2 * exactErrors
        .filter(({ path }) => path.startsWith("Transform translate"))
        .reduce((sum, { error, gain }) => sum + error * gain, 0);
    const extentError = Math.SQRT2 * Math.max(0, ...exactErrors
        .filter(({ role }) => ["width", "height"].includes(role))
        .map(({ error, gain }) => error * gain));
    const radialError = Math.max(0, ...exactErrors
        .filter(({ role }) => role === "radius")
        .map(({ error, gain }) => error * gain));
    const directError = coordinateError + translationError + extentError + radialError;
    const transformError = exactErrors.reduce((sum, { role, error, gain }) => (
        role === "angle" ? sum + extent * error * gain * Math.PI / 180
            : role === "scale" ? sum + extent * error * gain
                : sum
    ), 0);
    const rawRadius = directError + transformError;
    const enclosureRadius = rawRadius === 0
        ? 0
        : rawRadius * (1 + Number.EPSILON * 8) + Number.MIN_VALUE;
    const diagnostics = [];
    if (approximated.length) diagnostics.push({
        level: "warning",
        code: "svg-coordinate-approximation",
        message: `${approximated.length} SVG numeric value${approximated.length === 1 ? " was" : "s were"} rounded with ${policy.rounding} at ${policy.precision} decimal places.`,
    });
    if (collisions.length) diagnostics.push({
        level: "warning",
        code: "svg-coordinate-collision",
        message: `${collisions.length} distinct exact coordinate set${collisions.length === 1 ? "" : "s"} collided after SVG decimal lowering.`,
    });
    if (enclosureRadius > 0) diagnostics.push({
        level: "info",
        code: "svg-certified-outward-enclosure",
        message: `Exact geometry was expanded outward by at most ${enclosureRadius} SVG user units to contain its decimal lowering.`,
    });
    if (enclosureRadius > 0) {
        const maxGain = Math.max(1, ...policy.entries.map(({ gain }) => gain || 1));
        const translationExtent = policy.entries
            .filter(({ path }) => path.startsWith("Transform translate"))
            .reduce((sum, { lowered, lower, upper, gain }) => sum + Math.max(
                Math.abs(Number(lowered)), Math.abs(Number(lower)), Math.abs(Number(upper)),
            ) * (gain || 1), 0);
        const filterExtent = (Math.SQRT2 * Math.max(extent, coordinateExtent) * maxGain) + translationExtent + enclosureRadius;
        if (!Number.isFinite(filterExtent) || !Number.isFinite(filterExtent * 2)) {
            throw new Error("Certified SVG enclosure exceeds the finite SVG filter range");
        }
        const filterOrigin = -filterExtent;
        const filterSize = filterExtent * 2;
        defs.unshift(`<filter id="rix-exact-enclosure" filterUnits="userSpaceOnUse" x="${filterOrigin}" y="${filterOrigin}" width="${filterSize}" height="${filterSize}" color-interpolation-filters="sRGB"><feMorphology operator="dilate" radius="${enclosureRadius}"/></filter>`);
    }
    const renderedChildren = enclosureRadius > 0
        ? `<g class="rix-exact-enclosure" filter="url(#rix-exact-enclosure)">${children}</g>`
        : children;
    return {
        content: `<svg class="rix-output-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size[0]} ${size[1]}" width="${size[0]}" height="${size[1]}" overflow="visible" role="img">${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${renderedChildren}</svg>`,
        diagnostics,
        metadata: {
            schema: "rix.svg.coordinate-lowering@1",
            precision: policy.precision,
            rounding: policy.rounding,
            guarantee: "outward-exact-enclosure",
            enclosureRadius,
            approximated: approximated.length,
            entries: policy.entries,
            collisions,
        },
    };
}

export function renderGraphicSvg(graphic, format = (item) => String(item ?? ""), options = {}) {
    return lowerGraphicSvg(graphic, format, options).content;
}

function graphicIsInteractive(graphic) {
    const visit = (node) => {
        if (!isOutputValue(node)) return false;
        if (node.kind === "drag_point" || node.kind === "graphic_action") return true;
        return Array.isArray(node.children) && node.children.some(visit);
    };
    return graphic.children.some(visit);
}

function formatSheetText(sheet, format) {
    const strings = sheet.cells.map((row) => row.map((cell) =>
        cell.blank ? "" : cell.value === null ? "_" : cellText(cell.value, format)));
    const rowHeaderWidth = Math.max(1, ...sheet.rowHeaders.map((header) => header.length));
    const columnWidths = sheet.columnHeaders.map((header, column) =>
        Math.max(header.length, 1, ...strings.map((row) => row[column]?.length ?? 0)));
    const heading = [
        sheet.title ? `Sheet: ${sheet.title}` : "Sheet",
        sheet.addressBase,
        `shape ${sheet.shape.join("×")}`,
        sheet.showAxisSummary
            ? `rows ${sheet.rowAxis.name} (axis ${sheet.rowAxis.axis})`
            : `view axes ${sheet.viewAxes.join(",")}`,
        sheet.showAxisSummary && sheet.columnAxis
            ? `columns ${sheet.columnAxis.name} (axis ${sheet.columnAxis.axis})`
            : null,
        ...sheet.hiddenAxes.map((axis) =>
            `${axis.name} ${axis.selectedLabel ?? axis.selected} (axis ${axis.axis}:${axis.selected})`),
    ].filter(Boolean).join(" · ");
    const header = `${"".padStart(rowHeaderWidth)}  ${sheet.columnHeaders
        .map((label, column) => label.padStart(columnWidths[column]))
        .join("  ")}`;
    const rows = strings.map((row, rowIndex) =>
        `${sheet.rowHeaders[rowIndex].padStart(rowHeaderWidth)}  ${row
            .map((cell, column) => cell.padStart(columnWidths[column]))
            .join("  ")}`);
    return [heading, header, ...rows].join("\n");
}

function formatInlineText(value, format) {
    if (!isOutputValue(value)) return cellText(value, format);
    if (value.kind === "text") return cellText(value.value, format);
    if (value.kind === "emphasis" || value.kind === "strong") {
        return value.children.map((child) => formatInlineText(child, format)).join("");
    }
    if (value.kind === "code") return value.code;
    if (value.kind === "math") return value.alt || value.source;
    if (value.kind === "link") {
        return `${value.children.map((child) => formatInlineText(child, format)).join("")} <${value.href}>`;
    }
    if (value.kind === "image") return value.alt;
    if (value.kind === "line_break") return "\n";
    return formatOutputText(value, format);
}

function indentText(text, prefix = "  ") {
    return String(text).split("\n").map((line) => `${prefix}${line}`).join("\n");
}

function formatBlockChildren(children, format) {
    return children.map((child) => formatOutputText(child, format)).join("\n\n");
}

export function formatOutputText(value, format) {
    if (!isOutputValue(value)) return format(value);
    if (value.kind === "live_view") return formatOutputText(value.current, format);
    if (value.kind === "text") return cellText(value.value, format);
    if (value.kind === "emphasis" || value.kind === "strong" || value.kind === "code" || value.kind === "math" || value.kind === "link" || value.kind === "line_break") return formatInlineText(value, format);
    if (value.kind === "paragraph") return value.children.map((child) => formatInlineText(child, format)).join("");
    if (value.kind === "heading") return `${"#".repeat(value.level)} ${Array.isArray(value.content) ? value.content.map((child) => formatInlineText(child, format)).join("") : formatInlineText(value.content, format)}`;
    if (value.kind === "section") return `${"#".repeat(value.level)} ${value.title.map((child) => formatInlineText(child, format)).join("")}\n\n${formatBlockChildren(value.children, format)}`;
    if (value.kind === "list") {
        return value.items.map((item, index) => {
            const marker = value.ordered ? `${(value.start ?? 1) + index}.` : "-";
            return `${marker} ${indentText(formatBlockChildren(item.children, format), "  ").trimStart()}`;
        }).join("\n");
    }
    if (value.kind === "list_item") return formatBlockChildren(value.children, format);
    if (value.kind === "quote") {
        const quote = formatBlockChildren(value.children, format).split("\n").map((line) => `> ${line}`).join("\n");
        const attribution = value.attribution ? `\n> — ${value.attribution.map((child) => formatInlineText(child, format)).join("")}` : "";
        return `${quote}${attribution}`;
    }
    if (value.kind === "callout") {
        const title = value.title ? ` ${value.title.map((child) => formatInlineText(child, format)).join("")}` : "";
        return `[${value.variant[0].toUpperCase()}${value.variant.slice(1)}${title}]\n${formatBlockChildren(value.children, format)}`;
    }
    if (value.kind === "code_block") return `${value.caption ? `${value.caption.map((child) => formatInlineText(child, format)).join("")}\n` : ""}\`\`\`${value.language}\n${value.code}\n\`\`\``;
    if (value.kind === "math_block") return value.alt || `math: ${value.source}`;
    if (value.kind === "asset") return `[Asset: ${value.mime} — ${value.ref}]`;
    if (value.kind === "image") return `[Image: ${value.alt} — ${value.asset.ref}]`;
    if (value.kind === "audio") return `[Audio: ${value.title || value.asset.ref}]${value.transcript ? `\n${value.transcript.map((child) => formatInlineText(child, format)).join("")}` : ""}`;
    if (value.kind === "video") return `[Video: ${value.title || value.asset.ref}]${value.transcript ? `\n${value.transcript.map((child) => formatInlineText(child, format)).join("")}` : ""}`;
    if (value.kind === "fragment") return value.children.map((child) => formatOutputText(child, format)).join("\n\n");
    if (value.kind === "snapshots") {
        return [value.title, ...value.snapshots.map((snapshot) => formatOutputText(snapshot.content, format))]
            .filter(Boolean).join("\n\n");
    }
    if (value.kind === "timeline") return `[Timeline: ${value.frames.length} frames]`;
    if (value.kind === "timeline_render") return [value.title, formatOutputText(value.content, format)].filter(Boolean).join("\n\n");
    if (value.kind === "control_slider") {
        return `${value.label}: ${cellText(controlField(value, "value"), format)} (${cellText(controlField(value, "low"), format)} … ${cellText(controlField(value, "high"), format)}; step ${cellText(controlField(value, "step"), format)})`;
    }
    if (value.kind === "control_input") return `${value.label}: ${cellText(controlField(value, "value"), format)}`;
    if (value.kind === "control_choice") {
        return `${value.label}: ${cellText(controlField(value, "value"), format)}`;
    }
    if (value.kind === "control_toggle") {
        return `${value.label}: ${cellText(controlField(value, "value"), format)} (${cellText(controlField(value, "off"), format)} ↔ ${cellText(controlField(value, "on"), format)})`;
    }
    if (value.kind === "control_range") {
        const current = value.formatKeys.includes("value")
            ? cellText(controlField(value, "value"), format)
            : `${cellText(controlField(value, "start"), format)} … ${cellText(controlField(value, "end"), format)}`;
        return `${value.label}: ${current} within ${cellText(controlField(value, "low"), format)} … ${cellText(controlField(value, "high"), format)}; step ${cellText(controlField(value, "step"), format)}`;
    }
    if (value.kind === "control_reset") {
        return `${value.label}: ${cellText(controlField(value, "value"), format)} → ${cellText(controlField(value, "initial"), format)}`;
    }
    if (value.kind === "control_action") return `[Action: ${value.label}]`;
    if (value.kind === "control_hold") return `${value.label}: ${value.index === 1 ? "held" : "released"}`;
    if (value.kind === "control_panel") {
        return [value.title, value.description, ...value.controls.map((control) => formatOutputText(control, format))]
            .filter(Boolean)
            .join("\n");
    }
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
            let line = parts[0] || "";
            for (let column = 1; column < parts.length; column += 1) {
                line += hasRule(value, "vertical", column + 1) ? " │ " : "  ";
                line += parts[column];
            }
            lines.push(line);
        }
        return lines.join("\n");
    }
    if (value.kind === "sheet") return formatSheetText(value, format);
    if (value.kind === "figure") return [formatOutputText(value.content, format), value.caption].filter(Boolean).join("\n");
    if (value.kind === "graphic") return `[Graphic: ${cellText(value.size[0], format)} × ${cellText(value.size[1], format)}, ${value.children.length} scene nodes]`;
    if (value.kind === "path") return value.commands ? `[Path: ${value.commands.length} commands]` : `[Path: ${value.points.length} points]`;
    if (value.kind === "slide") return [value.title, formatOutputText(value.content, format)].filter(Boolean).join("\n");
    if (value.kind === "slides") return value.slides.map((slide, index) => `Slide ${index + 1}:\n${formatOutputText(slide, format)}`).join("\n\n");
    return `[Output: ${value.kind}]`;
}

function safeHtmlUrl(value, { media = false } = {}) {
    const url = String(value || "").trim();
    if (!url || /[\u0000-\u001f\u007f]/.test(url) || url.startsWith("//")) return null;
    const scheme = url.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase() ?? null;
    if (!scheme) return url;
    if (media) return null;
    const allowed = new Set(["http", "https", "mailto"]);
    return allowed.has(scheme) ? url : null;
}

function renderInlineHtml(value, format) {
    if (!isOutputValue(value)) return escapeHtml(cellText(value, format));
    if (value.kind === "text") return `<span class="rix-output-text">${escapeHtml(cellText(value.value, format))}</span>`;
    if (value.kind === "emphasis") return `<em class="rix-output-emphasis">${value.children.map((child) => renderInlineHtml(child, format)).join("")}</em>`;
    if (value.kind === "strong") return `<strong class="rix-output-strong">${value.children.map((child) => renderInlineHtml(child, format)).join("")}</strong>`;
    if (value.kind === "code") return `<code class="rix-output-code">${escapeHtml(value.code)}</code>`;
    if (value.kind === "math") return `<span class="rix-output-math" data-rix-math-notation="${escapeHtml(value.notation)}"${value.alt ? ` aria-label="${escapeHtml(value.alt)}"` : ""}>${escapeHtml(value.source)}</span>`;
    if (value.kind === "link") {
        const href = safeHtmlUrl(value.href);
        const label = value.children.map((child) => renderInlineHtml(child, format)).join("");
        return href
            ? `<a class="rix-output-link" href="${escapeHtml(href)}"${value.title ? ` title="${escapeHtml(value.title)}"` : ""}>${label}</a>`
            : `<span class="rix-output-link-invalid" title="Unsupported link scheme">${label}</span>`;
    }
    if (value.kind === "image") {
        const src = safeHtmlUrl(value.asset.ref, { media: true });
        return src
            ? `<img class="rix-output-image" src="${escapeHtml(src)}" alt="${escapeHtml(value.alt)}"${value.title ? ` title="${escapeHtml(value.title)}"` : ""}${mediaDimensions(value)} loading="lazy">`
            : `<span class="rix-output-image-unavailable" role="img" aria-label="${escapeHtml(value.alt)}">[Image unavailable: ${escapeHtml(value.asset.ref)}]</span>`;
    }
    if (value.kind === "line_break") return "<br>";
    return escapeHtml(formatOutputText(value, format));
}

function renderInlineSequence(values, format) {
    return values.map((value) => renderInlineHtml(value, format)).join("");
}

function mediaCaption(value, format) {
    return value.caption ? `<figcaption>${renderInlineSequence(value.caption, format)}</figcaption>` : "";
}

function mediaDimensions(value) {
    return `${value.width ? ` width="${value.width}"` : ""}${value.height ? ` height="${value.height}"` : ""}`;
}

export function renderOutputHtml(value, format = (item) => String(item ?? "")) {
    const text = (item) => escapeHtml(isOutputValue(item) ? formatOutputText(item, format) : cellText(item, format));
    if (!isOutputValue(value)) return `<pre>${text(value)}</pre>`;
    if (value.kind === "live_view") {
        return `<section class="rix-output-live-view" data-rix-live-view="${escapeHtml(value.id)}" data-rix-live-revision="${value.revision}">${renderOutputHtml(value.current, format)}</section>`;
    }
    if (isInlineOutput(value)) return renderInlineHtml(value, format);
    if (value.kind === "paragraph") return `<p class="rix-output-paragraph">${renderInlineSequence(value.children, format)}</p>`;
    if (value.kind === "heading") return `<h${value.level} class="rix-output-heading"${value.id ? ` id="${escapeHtml(value.id)}"` : ""}>${Array.isArray(value.content) ? renderInlineSequence(value.content, format) : renderInlineHtml(value.content, format)}</h${value.level}>`;
    if (value.kind === "section") return `<section class="rix-output-section" data-rix-section-level="${value.level}"${portableBlockStyleAttributes(value.style)}${value.id ? ` id="${escapeHtml(value.id)}"` : ""}><h${value.level}>${renderInlineSequence(value.title, format)}</h${value.level}>${value.children.map((child) => renderOutputHtml(child, format)).join("")}</section>`;
    if (value.kind === "list") {
        const tag = value.ordered ? "ol" : "ul";
        return `<${tag} class="rix-output-list"${value.ordered && value.start !== null ? ` start="${value.start}"` : ""}${value.tight ? ' data-rix-list-tight="true"' : ""}>${value.items.map((item) => renderOutputHtml(item, format)).join("")}</${tag}>`;
    }
    if (value.kind === "list_item") return `<li class="rix-output-list-item">${value.children.map((child) => renderOutputHtml(child, format)).join("")}</li>`;
    if (value.kind === "quote") return `<blockquote class="rix-output-quote"${value.id ? ` id="${escapeHtml(value.id)}"` : ""}${value.cite ? ` cite="${escapeHtml(value.cite)}"` : ""}>${value.children.map((child) => renderOutputHtml(child, format)).join("")}${value.attribution ? `<footer>— ${renderInlineSequence(value.attribution, format)}</footer>` : ""}</blockquote>`;
    if (value.kind === "callout") return `<aside class="rix-output-callout rix-output-callout-${escapeHtml(value.variant)}" data-rix-callout="${escapeHtml(value.variant)}"${value.id ? ` id="${escapeHtml(value.id)}"` : ""}${value.variant === "warning" || value.variant === "caution" ? ' role="note"' : ""}>${value.title ? `<h${Math.min(6, 3)}>${renderInlineSequence(value.title, format)}</h3>` : ""}${value.children.map((child) => renderOutputHtml(child, format)).join("")}</aside>`;
    if (value.kind === "code_block") {
        const code = `<pre class="rix-output-code-block"${value.id ? ` id="${escapeHtml(value.id)}"` : ""}${value.lineNumbers ? ' data-rix-line-numbers="true"' : ""}><code data-language="${escapeHtml(value.language)}">${escapeHtml(value.code)}</code></pre>`;
        return value.caption ? `<figure class="rix-output-code-figure">${code}<figcaption>${renderInlineSequence(value.caption, format)}</figcaption></figure>` : code;
    }
    if (value.kind === "math_block") return `<div class="rix-output-math-block"${value.id ? ` id="${escapeHtml(value.id)}"` : ""} data-rix-math-notation="${escapeHtml(value.notation)}"${value.alt ? ` aria-label="${escapeHtml(value.alt)}"` : ""}>${escapeHtml(value.source)}${value.label ? `<span class="rix-output-math-label">${escapeHtml(value.label)}</span>` : ""}</div>`;
    if (value.kind === "asset") {
        const href = safeHtmlUrl(value.ref, { media: true });
        return href ? `<a class="rix-output-asset" href="${escapeHtml(href)}" data-rix-mime="${escapeHtml(value.mime)}">${escapeHtml(value.filename || value.ref)}</a>` : `<span class="rix-output-asset" data-rix-mime="${escapeHtml(value.mime)}">${escapeHtml(value.filename || value.ref)}</span>`;
    }
    if (value.kind === "image") {
        const src = safeHtmlUrl(value.asset.ref, { media: true });
        const image = src
            ? `<img class="rix-output-image" src="${escapeHtml(src)}" alt="${escapeHtml(value.alt)}"${value.title ? ` title="${escapeHtml(value.title)}"` : ""}${mediaDimensions(value)} loading="lazy">`
            : `<span class="rix-output-image-unavailable" role="img" aria-label="${escapeHtml(value.alt)}">[Image unavailable: ${escapeHtml(value.asset.ref)}]</span>`;
        return value.caption ? `<figure class="rix-output-image-figure"${value.id ? ` id="${escapeHtml(value.id)}"` : ""}>${image}${mediaCaption(value, format)}</figure>` : image;
    }
    if (value.kind === "audio" || value.kind === "video") {
        const src = safeHtmlUrl(value.asset.ref, { media: true });
        const tag = value.kind;
        const poster = value.kind === "video" && value.poster ? safeHtmlUrl(value.poster.ref, { media: true }) : null;
        const media = src
            ? `<${tag} class="rix-output-${tag}" controls${mediaDimensions(value)}${poster ? ` poster="${escapeHtml(poster)}"` : ""}><source src="${escapeHtml(src)}" type="${escapeHtml(value.asset.mime)}"><a href="${escapeHtml(src)}">${escapeHtml(value.title || value.asset.ref)}</a></${tag}>`
            : `<span class="rix-output-${tag}-unavailable">[${tag}: ${escapeHtml(value.asset.ref)}]</span>`;
        const transcript = value.transcript ? `<details class="rix-output-${tag}-transcript"><summary>Transcript</summary><p>${renderInlineSequence(value.transcript, format)}</p></details>` : "";
        const content = `${value.title ? `<h3>${escapeHtml(value.title)}</h3>` : ""}${media}${transcript}${mediaCaption(value, format)}`;
        return value.caption ? `<figure class="rix-output-${tag}-figure"${value.id ? ` id="${escapeHtml(value.id)}"` : ""}>${content}</figure>` : `<section class="rix-output-${tag}-asset"${value.id ? ` id="${escapeHtml(value.id)}"` : ""}>${content}</section>`;
    }
    if (value.kind === "fragment") return `<section class="rix-output-fragment"${portableBlockStyleAttributes(value.style)}>${value.children.map((child) => renderOutputHtml(child, format)).join("")}</section>`;
    if (value.kind === "snapshots") {
        return `<section class="rix-output-snapshots">${value.title ? `<h2>${escapeHtml(value.title)}</h2>` : ""}<div class="rix-output-snapshot-list">${value.snapshots.map((snapshot) => {
            const origin = snapshot.origin.entries;
            return `<article class="rix-output-snapshot" data-rix-snapshot-entry="${exactInteger(origin.get("entry"), "Snapshot origin entry")}" data-rix-snapshot-state="${exactInteger(origin.get("state"), "Snapshot origin state")}" data-rix-snapshot-ordinal="${exactInteger(origin.get("ordinal"), "Snapshot origin ordinal")}">${renderOutputHtml(snapshot.content, format)}</article>`;
        }).join("")}</div>${value.caption ? `<p class="rix-output-snapshots-caption">${escapeHtml(value.caption)}</p>` : ""}</section>`;
    }
    if (value.kind === "timeline") return `<section class="rix-output-timeline"><p>${escapeHtml(value.title || "Timeline")} · ${value.frames.length} frames</p></section>`;
    if (value.kind === "timeline_render") return `<section class="rix-output-timeline-render" data-rix-timeline-frame="${value.frame}" data-rix-timeline-length="${value.timeline.frames.length}">${value.title ? `<h2>${escapeHtml(value.title)}</h2>` : ""}${renderOutputHtml(value.content, format)}<p class="rix-output-timeline-caption">Frame ${value.frame} of ${value.timeline.frames.length}</p></section>`;
    if (value.kind === "control_slider") {
        const dependencies = value.replacesDependencies.length > 0
            ? ` data-rix-replaces-dependencies="${escapeHtml(value.replacesDependencies.join(","))}"`
            : "";
        return `<label class="rix-output-control rix-output-control-slider" data-rix-control-kind="slider" data-rix-control-id="${escapeHtml(value.id)}" data-rix-control-target="${escapeHtml(value.targetId)}"${controlStyleAttributes(value)}${controlStateAttributes(value)}${dependencies}><span class="rix-output-control-label">${escapeHtml(value.label)}</span><input type="range" min="0" max="${value.steps}" step="1" value="${value.index}" data-rix-control-input aria-label="${escapeHtml(value.label)}"${controlInputAttributes(value)}><output data-rix-control-value>${text(controlField(value, "value"))}</output><small class="rix-output-control-scale">${text(controlField(value, "low"))} … ${text(controlField(value, "high"))} · step ${text(controlField(value, "step"))}</small>${controlMessages(value)}</label>`;
    }
    if (value.kind === "control_input") {
        const dependencies = value.replacesDependencies.length > 0
            ? ` data-rix-replaces-dependencies="${escapeHtml(value.replacesDependencies.join(","))}"`
            : "";
        return `<label class="rix-output-control rix-output-control-input" data-rix-control-kind="input" data-rix-control-input-mode="${escapeHtml(value.inputMode || "expression")}" data-rix-control-id="${escapeHtml(value.id)}" data-rix-control-target="${escapeHtml(value.targetId)}"${controlStyleAttributes(value)}${controlStateAttributes(value)}${dependencies}><span class="rix-output-control-label">${escapeHtml(value.label)}</span><span class="rix-output-control-input-row"><input type="text" value="${text(controlField(value, "value"))}" placeholder="${escapeHtml(value.placeholder)}" data-rix-control-input aria-label="${escapeHtml(value.label)}"${controlInputAttributes(value, { text: true })}><button type="button" data-rix-control-commit${controlInputAttributes(value)}>Set</button></span><output data-rix-control-value>${text(controlField(value, "value"))}</output>${controlMessages(value)}</label>`;
    }
    if (value.kind === "control_choice") {
        const dependencies = value.replacesDependencies.length > 0
            ? ` data-rix-replaces-dependencies="${escapeHtml(value.replacesDependencies.join(","))}"`
            : "";
        const options = value.options.map((option, index) => `<option value="${index}"${index === value.index ? " selected" : ""}>${escapeHtml(cellText(value.displayOptions[index], format))}</option>`).join("");
        return `<label class="rix-output-control rix-output-control-choice" data-rix-control-kind="choice" data-rix-control-id="${escapeHtml(value.id)}" data-rix-control-target="${escapeHtml(value.targetId)}"${controlStyleAttributes(value)}${controlStateAttributes(value)}${dependencies}><span class="rix-output-control-label">${escapeHtml(value.label)}</span><select data-rix-control-input aria-label="${escapeHtml(value.label)}"${controlInputAttributes(value)}>${options}</select><output data-rix-control-value>${text(controlField(value, "value"))}</output>${controlMessages(value)}</label>`;
    }
    if (value.kind === "control_toggle") {
        const dependencies = value.replacesDependencies.length > 0
            ? ` data-rix-replaces-dependencies="${escapeHtml(value.replacesDependencies.join(","))}"`
            : "";
        return `<label class="rix-output-control rix-output-control-toggle" data-rix-control-kind="toggle" data-rix-control-id="${escapeHtml(value.id)}" data-rix-control-target="${escapeHtml(value.targetId)}"${controlStyleAttributes(value)}${controlStateAttributes(value)}${dependencies}><span class="rix-output-control-label">${escapeHtml(value.label)}</span><input type="checkbox"${value.index === 1 ? " checked" : ""} data-rix-control-input aria-label="${escapeHtml(value.label)}"${controlInputAttributes(value)}><output data-rix-control-value>${text(controlField(value, "value"))}</output><small class="rix-output-control-scale">${text(controlField(value, "off"))} ↔ ${text(controlField(value, "on"))}</small>${controlMessages(value)}</label>`;
    }
    if (value.kind === "control_range") {
        const dependencies = value.replacesDependencies.length > 0
            ? ` data-rix-replaces-dependencies="${escapeHtml(value.replacesDependencies.join(","))}"`
            : "";
        const current = value.formatKeys.includes("value")
            ? text(controlField(value, "value"))
            : `${text(controlField(value, "start"))} … ${text(controlField(value, "end"))}`;
        return `<fieldset class="rix-output-control rix-output-control-range" data-rix-control-kind="range" data-rix-control-id="${escapeHtml(value.id)}" data-rix-control-target="${escapeHtml(value.targetId)}"${controlStyleAttributes(value)}${controlStateAttributes(value)}${dependencies}><legend class="rix-output-control-label">${escapeHtml(value.label)}</legend><span class="rix-output-control-range-inputs"><input type="range" min="0" max="${value.steps}" step="1" value="${value.indices[0]}" data-rix-control-input data-rix-control-endpoint="low" aria-label="${escapeHtml(value.label)} lower endpoint"${controlInputAttributes(value)}><input type="range" min="0" max="${value.steps}" step="1" value="${value.indices[1]}" data-rix-control-input data-rix-control-endpoint="high" aria-label="${escapeHtml(value.label)} upper endpoint"${controlInputAttributes(value)}></span><output data-rix-control-value>${current}</output><small class="rix-output-control-scale">${text(controlField(value, "low"))} … ${text(controlField(value, "high"))} · step ${text(controlField(value, "step"))}</small>${controlMessages(value)}</fieldset>`;
    }
    if (value.kind === "control_reset") {
        const dependencies = value.replacesDependencies.length > 0
            ? ` data-rix-replaces-dependencies="${escapeHtml(value.replacesDependencies.join(","))}"`
            : "";
        return `<div class="rix-output-control rix-output-control-reset" data-rix-control-kind="reset" data-rix-control-id="${escapeHtml(value.id)}" data-rix-control-target="${escapeHtml(value.targetId)}"${controlStyleAttributes(value)}${controlStateAttributes(value)}${dependencies}><span class="rix-output-control-label">${escapeHtml(value.label)}</span><button type="button" data-rix-control-input aria-label="${escapeHtml(value.label)}"${controlInputAttributes(value)}>Reset to ${text(controlField(value, "initial"))}</button><output data-rix-control-value>${text(controlField(value, "value"))}</output>${controlMessages(value)}</div>`;
    }
    if (value.kind === "control_action") {
        const dependencies = value.replacesDependencies.length > 0
            ? ` data-rix-replaces-dependencies="${escapeHtml(value.replacesDependencies.join(","))}"`
            : "";
        const shortcut = value.shortcut
            ? ` data-rix-control-shortcut="${escapeHtml(value.shortcut)}"`
            : "";
        return `<div class="rix-output-control rix-output-control-action" data-rix-control-kind="action" data-rix-control-id="${escapeHtml(value.id)}" data-rix-control-target="${escapeHtml(value.targetId)}"${shortcut}${controlStyleAttributes(value)}${controlStateAttributes(value)}${dependencies}><span class="rix-output-control-label">${escapeHtml(value.label)}</span><button type="button" data-rix-control-input aria-label="${escapeHtml(value.label)}"${value.shortcut ? ` aria-keyshortcuts="${escapeHtml(value.shortcut)}"` : ""}${controlInputAttributes(value)}>${escapeHtml(value.label)}</button>${controlMessages(value)}</div>`;
    }
    if (value.kind === "control_hold") {
        const dependencies = value.replacesDependencies.length > 0
            ? ` data-rix-replaces-dependencies="${escapeHtml(value.replacesDependencies.join(","))}"`
            : "";
        return `<div class="rix-output-control rix-output-control-hold" data-rix-control-kind="hold" data-rix-control-id="${escapeHtml(value.id)}" data-rix-control-target="${escapeHtml(value.targetId)}" data-rix-control-hold="${escapeHtml(value.key)}" data-rix-control-hold-state="${value.index === 1 ? "held" : "released"}" aria-keyshortcuts="${escapeHtml(value.key)}"${controlStyleAttributes(value)}${controlStateAttributes(value)}${dependencies}><span class="rix-output-control-label">${escapeHtml(value.label)}</span><kbd>${escapeHtml(value.key)}</kbd><output data-rix-control-value>${value.index === 1 ? "Held" : "Released"}</output><button type="button" hidden data-rix-control-input data-rix-control-hold-press aria-label="Press ${escapeHtml(value.label)}"${controlInputAttributes(value)}>Press</button><button type="button" hidden data-rix-control-hold-release aria-label="Release ${escapeHtml(value.label)}"${controlInputAttributes(value)}>Release</button>${controlMessages(value)}</div>`;
    }
    if (value.kind === "control_panel") {
        const actions = value.mode === "staged"
            ? `<div class="rix-output-control-actions"><button type="button" data-rix-control-submit disabled>${escapeHtml(value.submitLabel)}</button><button type="button" data-rix-control-discard disabled>${escapeHtml(value.discardLabel)}</button></div>`
            : "";
        return `<section class="rix-output-control-panel" data-rix-interactive="${value.interactive === false ? "false" : "true"}" data-rix-control-mode="${escapeHtml(value.mode || "immediate")}"${portableBlockStyleAttributes(value.style)}>${value.title ? `<h3>${escapeHtml(value.title)}</h3>` : ""}${value.description ? `<p>${escapeHtml(value.description)}</p>` : ""}<div class="rix-output-control-list">${value.controls.map((control) => renderOutputHtml({ ...control, style: resolvedControlStyle(value.style, control) }, format)).join("")}</div>${actions}<output class="rix-output-control-status" aria-live="polite"></output></section>`;
    }
    if (value.kind === "table") return `<table class="rix-output-table"${portableBlockStyleAttributes(value.options)}${value.label ? ` id="${escapeHtml(value.label)}"` : ""}>${value.caption ? `<caption>${escapeHtml(value.caption)}</caption>` : ""}<thead><tr>${value.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${value.rows.map((row) => `<tr>${row.map((cell) => `<td>${text(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    if (value.kind === "grid") return `<table class="rix-output-grid"><tbody>${value.rows.map((row, rowIndex) => `<tr${hasRule(value, "horizontal", rowIndex + 1) ? " class=\"rix-grid-rule-top\"" : ""}>${row.map((cell, column) => `<td${hasRule(value, "vertical", column + 1) ? " class=\"rix-grid-rule-left\"" : ""}>${text(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    if (value.kind === "sheet") {
        const summary = `${value.addressBase} · shape ${value.shape.join("×")}`;
        const axisSummary = value.columnAxis
            ? `Rows: ${value.rowAxis.name} · Columns: ${value.columnAxis.name}`
            : `Rows: ${value.rowAxis.name}`;
        const controls = value.hiddenAxes.length === 0 ? "" : `<div class="rix-output-sheet-plane-controls" aria-label="Shaped plane">${value.hiddenAxes.map(({ axis, name, length, selected, labels }) => `<label><span>${escapeHtml(name)} · axis ${axis}</span><select data-rix-sheet-axis="${axis}" aria-label="${escapeHtml(name)} axis ${axis}">${Array.from({ length }, (_item, index) => `<option value="${index + 1}"${selected === index + 1 ? " selected" : ""}>${escapeHtml(labels?.[index] ?? String(index + 1))}</option>`).join("")}</select></label>`).join("")}</div>`;
        const headerAttributes = (axis, coordinate, fallback) => value.formulaBacked
            ? ` class="rix-sheet-header-editable" tabindex="0" data-rix-header-axis="${axis}" data-rix-header-coordinate="${coordinate}" data-rix-header-label="${escapeHtml(value.axisLabels[axis - 1]?.[coordinate - 1] ?? "")}" data-rix-header-fallback="${escapeHtml(fallback)}"`
            : "";
        const renderSheetCell = (cell, rowIndex, columnIndex) => {
            const diagnostic = cell.diagnostics[0] ?? null;
            const cellValue = cell.blank ? "" : cell.value === null ? "_" : text(cell.value);
            const title = [
                cell.coordinateLabel,
                cell.displayAddress,
                cell.address,
                cell.dependencies.length > 0 ? `depends on ${cell.dependencies.map((dependency) => `${value.addressBase}[${dependency}]`).join(", ")}` : null,
                diagnostic ? `${cell.diagnosticKind ?? "runtime"} error: ${diagnostic}` : null,
            ].filter(Boolean).join(" · ");
            const diagnosticAttributes = diagnostic === null
                ? ""
                : ` data-rix-state="error" data-rix-diagnostic-kind="${escapeHtml(cell.diagnosticKind ?? "runtime")}" data-rix-diagnostics="${escapeHtml(JSON.stringify(cell.diagnostics))}"${cell.diagnosticSource === null ? "" : ` data-rix-diagnostic-source="${escapeHtml(cell.diagnosticSource)}"`} aria-invalid="true"`;
            return `<td data-rix-row="${rowIndex + 1}" data-rix-column="${columnIndex + 1}" data-rix-index="${cell.index.join(",")}" data-rix-address="${escapeHtml(cell.address)}" data-rix-display-address="${escapeHtml(cell.displayAddress)}"${cell.blank ? ' data-rix-blank="true"' : ""}${cell.coordinateLabel === null ? "" : ` data-rix-coordinate-labels="${escapeHtml(JSON.stringify(cell.coordinateLabels))}" data-rix-coordinate-label="${escapeHtml(cell.coordinateLabel)}"`}${cell.formulaSource === null ? "" : ` data-rix-formula-source="${escapeHtml(cell.formulaSource)}"`}${cell.slotId === null ? "" : ` data-rix-slot-id="${escapeHtml(cell.slotId)}"`}${cell.assignmentMode === null ? "" : ` data-rix-assignment-mode="${escapeHtml(cell.assignmentMode)}"`}${cell.dependencies.length === 0 ? "" : ` data-rix-dependencies="${escapeHtml(JSON.stringify(cell.dependencies))}"`}${diagnosticAttributes} title="${escapeHtml(title)}">${cellValue}</td>`;
        };
        const bodies = value.planes.map((plane) => `<tbody data-rix-plane-key="${escapeHtml(plane.key)}" data-rix-slice="${plane.slice.map((item) => item ?? "").join(",")}"${plane.key === value.selectedPlaneKey ? "" : " hidden"}>${plane.cells.map((row, rowIndex) => {
            const rowCoordinate = value.window?.rowStart + rowIndex || rowIndex + 1;
            return `<tr><th scope="row" data-rix-row="${rowIndex + 1}"${headerAttributes(value.rowAxis.axis, rowCoordinate, String(rowCoordinate))}${value.axisLabels[value.rowAxis.axis - 1] ? ` title="${escapeHtml(value.rowAxis.name)} ${rowCoordinate}"` : ""}>${escapeHtml(value.rowHeaders[rowIndex])}</th>${row.map((cell, columnIndex) => renderSheetCell(cell, rowIndex, columnIndex)).join("")}</tr>`;
        }).join("")}</tbody>`).join("");
        const liveAttributes = value.editable
            ? ` data-rix-editable="true" data-rix-edit-mode="${value.editMode}"${value.bindingId ? ` data-rix-binding-id="${escapeHtml(value.bindingId)}"` : ""}`
            : "";
        const assignmentControl = value.editMode === "formula"
            ? `<label class="rix-output-sheet-assignment"><span>Assignment</span><select data-rix-edit-assignment-mode aria-label="Formula assignment mode">${FORMULA_SHEET_ASSIGNMENT_MODES.map((mode) => `<option value="${escapeHtml(mode)}"${mode === ":=" ? " selected" : ""}>${escapeHtml(mode)}</option>`).join("")}</select></label>`
            : "";
        const editor = value.editable
            ? `<form class="rix-output-sheet-editor" hidden><label class="rix-output-sheet-formula"><span data-rix-edit-label>Choose a cell to edit</span><input data-rix-edit-source aria-label="${value.editMode === "formula" ? "RiX formula" : "RiX value"}" autocomplete="off" spellcheck="false"></label>${assignmentControl}<button type="submit">${value.editMode === "formula" ? "Set formula" : "Set"}</button><output data-rix-edit-value aria-live="polite"></output><output data-rix-edit-status aria-live="polite"></output></form>`
            : "";
        const formulaAttributes = value.formulaBacked ? ` data-rix-formula-sheet="true" data-rix-formula-epoch="${value.formulaSheet.epoch}"` : "";
        const windowAttributes = value.window
            ? ` data-rix-window-row-start="${value.window.rowStart}" data-rix-window-row-count="${value.window.rowCount}" data-rix-window-row-total="${value.window.totalRowCount}" data-rix-window-column-start="${value.window.columnStart}" data-rix-window-column-count="${value.window.columnCount}" data-rix-window-column-total="${value.window.totalColumnCount}"`
            : "";
        return `<section class="rix-output-sheet" data-rix-rank="${value.rank}" data-rix-selected-plane="${escapeHtml(value.selectedPlaneKey)}"${windowAttributes}${liveAttributes}${formulaAttributes}>${value.title ? `<h3 class="rix-output-sheet-title">${escapeHtml(value.title)}</h3>` : ""}<div class="rix-output-sheet-location" aria-live="polite" data-rix-summary="${escapeHtml(summary)}">${escapeHtml(summary)}</div>${value.showAxisSummary ? `<div class="rix-output-sheet-axis-summary">${escapeHtml(axisSummary)}</div>` : ""}${controls}${editor}<table><thead><tr><th class="rix-output-sheet-corner" scope="col">${escapeHtml(value.addressBase)}</th>${value.columnHeaders.map((header, column) => {
            const columnCoordinate = value.window?.columnStart + column || column + 1;
            return `<th scope="col" data-rix-column="${column + 1}"${value.columnAxis ? headerAttributes(value.columnAxis.axis, columnCoordinate, sheetColumnLabel(columnCoordinate, value.columnLabelMode)) : ""}${value.columnAxis && value.axisLabels[value.columnAxis.axis - 1] ? ` title="${escapeHtml(value.columnAxis.name)} ${columnCoordinate}"` : ""}>${escapeHtml(header)}</th>`;
        }).join("")}</tr></thead>${bodies}</table></section>`;
    }
    if (value.kind === "figure") return `<figure class="rix-output-figure"${portableBlockStyleAttributes(value.style)}${value.label ? ` id="${escapeHtml(value.label)}"` : ""}>${renderOutputHtml(value.content, format)}${value.caption ? `<figcaption>${escapeHtml(value.caption)}</figcaption>` : ""}</figure>`;
    if (value.kind === "graphic") {
        const interactive = graphicIsInteractive(value);
        const replacesDependencies = interactive && value.children.some(function hasReplacement(node) {
            return isOutputValue(node) && (
                ((node.kind === "drag_point" || node.kind === "graphic_action") && node.replacesDependencies?.length > 0)
                || (node.children || []).some(hasReplacement)
            );
        });
        const hasDragPoint = value.children.some(function containsDragPoint(node) {
            return isOutputValue(node) && (node.kind === "drag_point" || (node.children || []).some(containsDragPoint));
        });
        const interactionStatus = replacesDependencies
            ? hasDragPoint
                ? "Dragging will replace this point’s current reactive dependencies."
                : "Using this scene action will replace its target’s current reactive dependencies."
            : hasDragPoint
                ? "Drag the highlighted point or use its arrow keys."
                : "Choose a highlighted scene node to navigate.";
        return `<div class="rix-output-graphic"${interactive ? ' data-rix-interactive="true"' : ""}>${renderGraphicSvg(value, format)}${interactive ? `<output class="rix-output-graphic-status" aria-live="polite">${interactionStatus}</output>` : ""}</div>`;
    }
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
 * Graphics is the intrinsic, renderer-facing scene language.  Plugins such as
 * Draw, Plot, and Geometry construct these values; renderers only need this
 * stable collection and the Graphic output schema.
 */
export function createGraphicsOutputCollection() {
    const methods = new Map([
        ["Graphic", createGraphic],
        ["Path", createPath],
        ["Group", createGroup],
        ["Transform", createTransform],
        ["Text", createTextMark],
        ["Rectangle", createRectangle],
        ["Circle", createCircle],
        ["DragPoint", createDragPoint],
        ["Action", createGraphicAction],
        ["Clip", createClip],
        ["Snapshots", createSnapshots],
    ]);
    const entries = new Map();
    const extension = new Map([["immutable", int(1)]]);
    for (const [name, constructor] of methods) {
        entries.set(name, constructor);
        entries.set(name.toUpperCase(), constructor);
        extension.set(name.toUpperCase(), {
            type: "method_builtin",
            name,
            impl: (args, context, evaluate, invoke) => constructor(args.slice(1), {
                context,
                evaluate,
                invoke,
            }),
        });
    }
    return { type: "map", entries, _ext: extension };
}

export function createTimelineOutputCollection() {
    const methods = new Map([
        ["Sequence", createTimelineSequence],
        ["Render", createTimelineRender],
    ]);
    const entries = new Map();
    const extension = new Map([["immutable", int(1)]]);
    for (const [name, constructor] of methods) {
        entries.set(name, constructor);
        entries.set(name.toUpperCase(), constructor);
        extension.set(name.toUpperCase(), {
            type: "method_builtin",
            name,
            impl: (args, context, evaluate, invoke) => constructor(args.slice(1), {
                context,
                evaluate,
                invoke,
            }),
        });
    }
    return { type: "map", entries, _ext: extension };
}

export function createControlsOutputCollection() {
    const methods = new Map([
        ["Slider", createSliderControl],
        ["Input", createInputControl],
        ["Choice", createChoiceControl],
        ["Toggle", createToggleControl],
        ["Range", createRangeControl],
        ["Reset", createResetControl],
        ["Action", createActionControl],
        ["Hold", createHoldControl],
    ]);
    const entries = new Map();
    const extension = new Map([["immutable", int(1)]]);
    for (const [name, constructor] of methods) {
        entries.set(name, constructor);
        entries.set(name.toUpperCase(), constructor);
        extension.set(name.toUpperCase(), {
            type: "method_builtin",
            name,
            impl: (args, context, evaluate, invoke) => constructor(args.slice(1), {
                context,
                evaluate,
                invoke,
            }),
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
