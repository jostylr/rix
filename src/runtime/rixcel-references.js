import { tokenize } from "../parser/tokenizer.js";

function positiveInteger(value, label) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive safe integer`);
    return value;
}

function signedInteger(tokens, offset) {
    let sign = 1;
    let token = tokens[offset];
    let start = token?.pos?.[1];
    if (token?.type === "Symbol" && ["+", "-"].includes(token.value)) {
        sign = token.value === "-" ? -1 : 1;
        token = tokens[offset + 1];
    }
    if (token?.type !== "Number" || !/^\d+$/u.test(token.value)) return null;
    return {
        value: sign * Number(token.value),
        start,
        end: token.pos[2],
        next: tokens[offset]?.type === "Symbol" && ["+", "-"].includes(tokens[offset].value)
            ? offset + 2
            : offset + 1,
    };
}

function numericReference(tokens, offset) {
    if (tokens[offset + 1]?.value !== "[") return null;
    const coordinates = [];
    let cursor = offset + 2;
    while (cursor < tokens.length) {
        const coordinate = signedInteger(tokens, cursor);
        if (!coordinate) return null;
        coordinates.push(coordinate);
        cursor = coordinate.next;
        if (tokens[cursor]?.value === "]") return { coordinates, end: cursor + 1 };
        if (tokens[cursor]?.value !== ",") return null;
        cursor += 1;
    }
    return null;
}

/**
 * Rewrite literal grid/near coordinates after inserting positions on one axis.
 *
 * Token positions preserve all unrelated whitespace, comments, strings, and
 * formatting. Dynamic references such as grid[row, 2] are reported but left
 * unchanged because a structural edit cannot safely infer their intent.
 */
export function rewriteRixCelReferences(source, options = {}) {
    if (typeof source !== "string") throw new Error("RiXCel formula source must be a string");
    const axis = positiveInteger(options.axis, "RiXCel insertion axis");
    const coordinate = positiveInteger(options.coordinate, "RiXCel insertion coordinate");
    const count = positiveInteger(options.count ?? 1, "RiXCel insertion count");
    const origin = options.originIndex ?? null;
    if (origin !== null && (!Array.isArray(origin) || origin.length < axis)) {
        throw new Error(`RiXCel formula origin must contain axis ${axis}`);
    }

    const tokens = tokenize(source);
    const replacements = [];
    const dynamic = [];
    for (let offset = 0; offset < tokens.length; offset += 1) {
        const token = tokens[offset];
        if (token.type !== "Identifier" || !["grid", "near"].includes(token.value)) continue;
        if (tokens[offset - 1]?.value === "." || tokens[offset + 1]?.value !== "[") continue;
        const reference = numericReference(tokens, offset);
        if (!reference) {
            dynamic.push({ kind: token.value, position: token.pos[1] });
            continue;
        }
        if (reference.coordinates.length < axis) continue;
        const component = reference.coordinates[axis - 1];
        let nextValue = component.value;
        if (token.value === "grid") {
            if (nextValue >= coordinate) nextValue += count;
        } else {
            if (origin === null) {
                dynamic.push({ kind: "near", position: token.pos[1] });
                continue;
            }
            const oldOrigin = positiveInteger(origin[axis - 1], `RiXCel formula origin axis ${axis}`);
            const oldTarget = oldOrigin + nextValue;
            const newOrigin = oldOrigin >= coordinate ? oldOrigin + count : oldOrigin;
            const newTarget = oldTarget >= coordinate ? oldTarget + count : oldTarget;
            nextValue = newTarget - newOrigin;
        }
        if (nextValue !== component.value) {
            replacements.push({ start: component.start, end: component.end, text: String(nextValue) });
        }
        offset = reference.end - 1;
    }

    let rewritten = source;
    for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
        rewritten = `${rewritten.slice(0, replacement.start)}${replacement.text}${rewritten.slice(replacement.end)}`;
    }
    return Object.freeze({
        source: rewritten,
        rewrites: replacements.length,
        dynamic: Object.freeze(dynamic.map((entry) => Object.freeze(entry))),
    });
}
