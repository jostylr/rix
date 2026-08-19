import { Integer } from "@ratmath/core";

export const RANGE_MATH_POLICY_KEY = "__range_math_policy__";

export const DEFAULT_RANGE_MATH_POLICY = Object.freeze({
    defaultAction: "report",
    zeroPowerZero: "undefined",
    actions: Object.freeze({}),
});

function mapEntries(value) {
    if (!value || value.type !== "map" || !(value.entries instanceof Map)) {
        throw new Error("RangePolicy options must be a map");
    }
    return value.entries;
}

function text(value, label) {
    if (typeof value === "string") return value;
    if (value?.type === "string") return value.value;
    throw new Error(`${label} must be a name or string`);
}

function truth(value) {
    return value instanceof Integer && value.value !== 0n;
}

function normalizedAction(value, label) {
    const action = text(value, label).toLowerCase();
    if (action !== "report" && action !== "throw") {
        throw new Error(`${label} must be :report or :throw`);
    }
    return action;
}

function entryCaseInsensitive(entries, wanted) {
    if (entries.has(wanted)) return entries.get(wanted);
    const lower = wanted.toLowerCase();
    for (const [key, value] of entries) {
        if (String(key).toLowerCase() === lower) return value;
    }
    return undefined;
}

export function rangeMathPolicy(context) {
    return context?.getScopedEnv?.(RANGE_MATH_POLICY_KEY, DEFAULT_RANGE_MATH_POLICY) ||
        DEFAULT_RANGE_MATH_POLICY;
}

export function mergeRangeMathPolicy(parent, value) {
    const entries = mapEntries(value);
    const inherited = parent || DEFAULT_RANGE_MATH_POLICY;
    const actions = { ...(inherited.actions || {}) };
    let defaultAction = inherited.defaultAction || "report";
    let zeroPowerZero = inherited.zeroPowerZero || "undefined";

    const strict = entryCaseInsensitive(entries, "strict");
    if (strict !== undefined) defaultAction = truth(strict) ? "throw" : "report";

    const defaultValue = entryCaseInsensitive(entries, "default");
    if (defaultValue !== undefined) {
        defaultAction = normalizedAction(defaultValue, "RangePolicy default");
    }

    const zeroConvention = entryCaseInsensitive(entries, "zeroPowerZero");
    if (zeroConvention !== undefined) {
        zeroPowerZero = text(zeroConvention, "RangePolicy zeroPowerZero").toLowerCase();
        if (zeroPowerZero !== "undefined" && zeroPowerZero !== "one") {
            throw new Error("RangePolicy zeroPowerZero must be :undefined or :one");
        }
    }

    for (const [key, setting] of entries) {
        const name = String(key);
        const lower = name.toLowerCase();
        if (lower === "strict" || lower === "default" || lower === "zeropowerzero") continue;
        actions[name] = normalizedAction(setting, `RangePolicy ${name}`);
    }
    return Object.freeze({
        defaultAction,
        zeroPowerZero,
        actions: Object.freeze(actions),
    });
}

export function rangeDiagnosticAction(policy, category) {
    const direct = policy?.actions?.[category];
    if (direct) return direct;
    const lower = String(category).toLowerCase();
    for (const [key, value] of Object.entries(policy?.actions || {})) {
        if (key.toLowerCase() === lower) return value;
    }
    return policy?.defaultAction || "report";
}
