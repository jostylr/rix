import { BaseSystem, CertifiedApproximation, Integer, Rational, RationalInterval } from "@ratmath/core";
import { HaloNeighborhood } from "../runtime/halo.js";
import { isHole } from "../runtime/hole.js";
import { isUndecided } from "../runtime/decision.js";
import { isShaped, shapedOffsetForTuple, shapedSize } from "../runtime/shaped.js";
import { irToText } from "./ir-to-text.js";
import { resolveMethod } from "../runtime/methods.js";
import { callWithConcreteArgs } from "./functions/functions.js";
import { formatExact, isCayleyInfinity, isCayleyValue } from "../runtime/exact-values.js";
import { formatQuantity, formatUnit, isQuantity, isUnitValue } from "../runtime/quantities.js";
import { isLazySequence, lazyKnownLength } from "../runtime/lazy-sequence.js";
import { isAsyncStream } from "../runtime/async-stream.js";
import { formatSymbolicSpec, getAttachedSpec, isSymbolicSpec, renderSymbolicIr } from "./functions/symbolic.js";
import { formatOutputText, isOutputValue } from "../runtime/output.js";
import {
    formatStructuralValue,
    isStructuralAlgebra,
    isStructuralForm,
    isStructuralLiteral,
    isStructuralSymbol,
} from "../runtime/structural-arithmetic.js";

function shapedValueAtTuple(shaped, tuple) {
    const value = shaped.data[shapedOffsetForTuple(shaped, tuple)];
    return value;
}

function shapedDisplayLevels(shape) {
    if (shape.length === 0) return [];
    if (shape.length === 1) {
        return [{ size: shape[0], separatorCount: 0 }];
    }

    const levels = [];
    for (let axis = shape.length - 1; axis >= 2; axis--) {
        levels.push({ size: shape[axis], separatorCount: axis });
    }
    levels.push({ size: shape[0], separatorCount: 1 });
    levels.push({ size: shape[1], separatorCount: 0 });
    return levels;
}

function displayPathToExternalTuple(displayPath) {
    if (displayPath.length === 1) {
        return [displayPath[0]];
    }

    const higher = displayPath.slice(0, -2).reverse();
    return [displayPath[displayPath.length - 2], displayPath[displayPath.length - 1], ...higher];
}

function shapedSeparator(separatorCount) {
    if (separatorCount <= 0) return ", ";
    if (separatorCount === 1) return "; ";
    return ` ${";".repeat(separatorCount)} `;
}

function formatShapedBody(shaped, formatValue, levels, levelIndex = 0, displayPath = []) {
    const level = levels[levelIndex];

    if (level.separatorCount === 0) {
        const values = [];
        for (let i = 1; i <= level.size; i++) {
            const tuple = displayPathToExternalTuple([...displayPath, i]);
            values.push(formatValue(shapedValueAtTuple(shaped, tuple)));
        }
        return values.join(", ");
    }

    const parts = [];
    for (let i = 1; i <= level.size; i++) {
        parts.push(formatShapedBody(shaped, formatValue, levels, levelIndex + 1, [...displayPath, i]));
    }
    return parts.join(shapedSeparator(level.separatorCount));
}

function formatShaped(shaped, formatValue) {
    const shapeText = shaped.shape.join("x");
    if (shapedSize(shaped) === 0) {
        return `{:${shapeText}:}`;
    }
    const levels = shapedDisplayLevels(shaped.shape);
    return `{:${shapeText}: ${formatShapedBody(shaped, formatValue, levels)} }`;
}

function truncate(text, limit = 40) {
    if (text.length <= limit) return text;
    return `${text.slice(0, Math.max(0, limit - 3))}...`;
}

const BINARY_OPS = new Map([
    ["ADD", "+"],
    ["SUB", "-"],
    ["MUL", "*"],
    ["DIV", "/"],
    ["INTDIV", "//"],
    ["MOD", "%"],
    ["POW", "^"],
    ["POWPROD", "**"],
    ["EQ", "=="],
    ["NEQ", "!="],
    ["LT", "<"],
    ["GT", ">"],
    ["LTE", "<="],
    ["GTE", ">="],
    ["AND", "&&"],
    ["OR", "||"],
]);

function previewIr(node, options = {}) {
    const { maxLen = 40, depth = 0 } = options;
    if (node === null) return "_";
    if (node === undefined) return "undefined";
    if (typeof node === "string") return node;
    if (typeof node === "number" || typeof node === "bigint" || typeof node === "boolean") {
        return String(node);
    }
    if (Array.isArray(node)) {
        return truncate(`[${node.map((item) => previewIr(item, { maxLen: 12, depth: depth + 1 })).join(", ")}]`, maxLen);
    }
    if (!node || typeof node !== "object") {
        return truncate(String(node), maxLen);
    }
    if (!node.fn) {
        return truncate(irToText(node), maxLen);
    }

    if (depth >= 5) {
        return truncate(irToText(node), maxLen);
    }

    switch (node.fn) {
    case "LITERAL":
        return String(node.args[0]);
    case "STRING":
        return JSON.stringify(node.args[0]);
    case "NULL":
        return "_";
    case "RETRIEVE":
        return node.args[0];
    case "OUTER_RETRIEVE":
        return `@${node.args[0]}`;
    case "SELF":
        return "$";
    case "PARENT_SELF":
        return "$$";
    case "REACTIVE_READ":
        return `$${node.args[0]}`;
    case "REACTIVE_NODE":
        return `$$${node.args[0]}`;
    case "REACTIVE_INDEX_READ":
    case "REACTIVE_INDEX_NODE": {
        const sigil = node.fn === "REACTIVE_INDEX_READ" ? "$" : "$$";
        const count = node.args[1];
        const indices = node.args
            .slice(2, 2 + count)
            .map((arg) => previewIr(arg, { maxLen: 12, depth: depth + 1 }));
        return `${sigil}${node.args[0]}[${indices.join(", ")}]`;
    }
    case "NEG":
        return truncate(`-${previewIr(node.args[0], { maxLen: maxLen - 1, depth: depth + 1 })}`, maxLen);
    case "CALL":
        return truncate(
            `${node.args[0]}(${node.args.slice(1).map((arg) => previewIr(arg, { maxLen: 16, depth: depth + 1 })).join(", ")})`,
            maxLen,
        );
    case "CALL_EXPR":
        return truncate(
            `${previewIr(node.args[0], { maxLen: 14, depth: depth + 1 })}(${node.args.slice(1).map((arg) => previewIr(arg, { maxLen: 12, depth: depth + 1 })).join(", ")})`,
            maxLen,
        );
    case "BLOCK": {
        const start = node.args[0]?.kind === "block_meta" ? 1 : 0;
        const statements = node.args
            .slice(start)
            .map((stmt) => previewIr(stmt, { maxLen: 18, depth: depth + 1 }));
        return truncate(`{ ${statements.join("; ")} }`, maxLen);
    }
    case "ASSIGN":
    case "ASSIGN_COPY":
    case "ASSIGN_UPDATE":
    case "ASSIGN_DEEP_COPY":
    case "ASSIGN_DEEP_UPDATE":
    case "OUTER_ASSIGN":
        return truncate(`${node.args[0]} = ${previewIr(node.args[1], { maxLen: Math.max(12, maxLen - String(node.args[0]).length - 3), depth: depth + 1 })}`, maxLen);
    case "ASSIGN_EXPR":
        return truncate(
            `${previewIr(node.args[0], { maxLen: 12, depth: depth + 1 })} = ${previewIr(node.args[1], { maxLen: 16, depth: depth + 1 })}`,
            maxLen,
        );
    case "OUTER_UPDATE":
        return truncate(`@${node.args[0]} ~= ${previewIr(node.args[1], { maxLen: Math.max(12, maxLen - String(node.args[0]).length - 5), depth: depth + 1 })}`, maxLen);
    default:
        break;
    }

    const op = BINARY_OPS.get(node.fn);
    if (op && node.args.length >= 2) {
        return truncate(
            `${previewIr(node.args[0], { maxLen: 14, depth: depth + 1 })} ${op} ${previewIr(node.args[1], { maxLen: 14, depth: depth + 1 })}`,
            maxLen,
        );
    }

    return truncate(irToText(node), maxLen);
}

function formatCallablePreview(fn, label) {
    const attachedSpec = getAttachedSpec(fn);
    const symbolicKind = fn._ext?.get?.("_symbolicKind")?.value || null;
    if (attachedSpec && (symbolicKind === "Poly" || symbolicKind === "Polynomial" || symbolicKind === "RationalFunction" || symbolicKind === "FractionFunction")) {
        const params = fn.params?.positional?.map((param) => param.name).join(", ") || "";
        const label = symbolicKind === "RationalFunction" ? "RationalFunction"
            : symbolicKind === "FractionFunction" ? "FractionFunction"
                : symbolicKind === "Polynomial" ? "Polynomial" : "Poly";
        return `[${label} ${params} -> ${renderSymbolicIr(fn.body)}; Spec ${formatSymbolicSpec(attachedSpec)}]`;
    }
    const params = fn.params?.positional?.map((param) => param.isRest ? `...${param.name}` : param.name).join(", ") || "";
    const prepEntries = [
        ...(Array.isArray(fn.params?.conditionals) ? fn.params.conditionals : []),
        ...(Array.isArray(fn.params?.prep) ? fn.params.prep : []),
    ];
    const prepText = prepEntries.length > 0
        ? ` ${fn.params?.prepStrict ? "?!-" : "?-"} [${truncate(prepEntries.map((entry) => previewIr(entry, { maxLen: 18 })).join(", "), 42)}]`
        : "";
    const bodyText = previewIr(fn.body, { maxLen: 48 });
    const displayName = fn.__name || fn.name || null;
    const nameText = displayName ? ` ${displayName}:` : ":";
    const specText = attachedSpec ? `; Spec ${formatSymbolicSpec(attachedSpec)}` : "";
    return `[${label}${nameText} (${params})${prepText} -> ${bodyText}${specText}]`;
}

function formatMultifunctionPreview(multifn) {
    const displayName = multifn.__name || null;
    const variants = (multifn.values || []).map((variant, index) => {
        if (!variant || (variant.type !== "function" && variant.type !== "lambda")) {
            return `#${index + 1}: <invalid>`;
        }
        const params = variant.params?.positional?.map((param) => param.isRest ? `...${param.name}` : param.name).join(", ") || "";
        const prepEntries = [
            ...(Array.isArray(variant.params?.conditionals) ? variant.params.conditionals : []),
            ...(Array.isArray(variant.params?.prep) ? variant.params.prep : []),
        ];
        const prepText = prepEntries.length > 0
            ? ` ${variant.params?.prepStrict ? "?!-" : "?-"} [${truncate(prepEntries.map((entry) => previewIr(entry, { maxLen: 12 })).join(", "), 24)}]`
            : "";
        const variantName = variant.__name ? `/${variant.__name}/ ` : "";
        const bodyText = previewIr(variant.body, { maxLen: 20 });
        return `${variantName}(${params})${prepText} -> ${bodyText}`;
    });
    if (variants.length === 0) {
        return displayName ? `[Multifunction ${displayName}: empty]` : "[Multifunction: empty]";
    }
    const prefix = displayName ? `[Multifunction ${displayName}:\n` : "[Multifunction:\n";
    return `${prefix}${variants.map((variant) => `${variant},`).join("\n")}\n]`;
}

function isSemanticObject(value) {
    return value && typeof value === "object" && value._ext instanceof Map && value._ext.has("__type");
}

function formatViaSemanticDisplay(value, options) {
    if (!isSemanticObject(value) || !options?.context || !options?.evaluate) return null;
    for (const methodName of ["ToString", "TOSTRING", "Value", "VALUE"]) {
        let fn;
        try {
            fn = resolveMethod(value, methodName, options.context);
        } catch {
            continue;
        }
        try {
            const displayed = fn?.type === "method_builtin"
                ? fn.impl([value], options.context, options.evaluate, callWithConcreteArgs)
                : callWithConcreteArgs(fn, [value], options.context, options.evaluate);
            if (displayed === value) continue;
            return formatValue(displayed, { ...options, semanticDisplay: false });
        } catch {
            continue;
        }
    }
    return null;
}

const FORMAT_ACTIVE_VALUES = Symbol("formatActiveValues");
const FORMAT_CYCLE_MARKER = "<cycle>";

function numericRational(value) {
    return value instanceof Integer ? value.toRational() : value;
}

function decimalPresentation(value, places) {
    const rational = numericRational(value);
    const negative = rational.numerator < 0n;
    const numerator = negative ? -rational.numerator : rational.numerator;
    const whole = numerator / rational.denominator;
    let remainder = numerator % rational.denominator;
    if (remainder === 0n || places === 0) return `${negative ? "-" : ""}${whole}${remainder ? "…" : ""}`;
    let digits = "";
    for (let index = 0; index < places && remainder !== 0n; index++) {
        remainder *= 10n;
        digits += String(remainder / rational.denominator);
        remainder %= rational.denominator;
    }
    return `${negative ? "-" : ""}${whole}.${digits}${remainder ? "…" : ""}`;
}

function displayBase(token, context) {
    const active = context?.getEnv?.("numInputBase", BaseSystem.DECIMAL) || BaseSystem.DECIMAL;
    if (!token) return active;
    const short = token.match(/^([A-Za-z])(?:\.|\/|$)/)?.[1];
    if (short) return BaseSystem.getSystemForPrefix(short) || active;
    const custom = token.match(/^z\[(\d+)\]/);
    return custom ? BaseSystem.fromBase(Number(custom[1])) : active;
}

function profileNumber(value, profile, context) {
    const token = profile.replace(/\s+/g, "");
    const rational = numericRational(value);
    if (token === ".." || token === "mixed") return rational.toMixedString();
    if (token === "/" || token === "fraction") return `${rational.numerator}/${rational.denominator}`;
    if (token === ".~" || token === "cf") return rational.toContinuedFractionString();
    const scientific = token.match(/^(?:sci|scientific)(?:\[(\d+)\])?$/);
    if (scientific) {
        const precision = scientific[1] ? Number(scientific[1]) : 10;
        return rational.toScientificNotation(true, precision, false);
    }
    const scientificWithPeriod = token.match(/^(?:sci-period|scientific-period)(?:\[(\d+)\])?$/);
    if (scientificWithPeriod) {
        const precision = scientificWithPeriod[1] ? Number(scientificWithPeriod[1]) : 10;
        return rational.toScientificNotation(true, precision, true);
    }
    const decimal = token.match(/^\.\[(\d+)\]$/);
    if (decimal) return decimalPresentation(rational, Number(decimal[1]));

    const base = displayBase(token, context);
    const prefix = token.match(/^(?:[A-Za-z]|z\[\d+\])/)?.[0];
    const suffix = prefix ? token.slice(prefix.length) : token;
    if (!prefix && token !== ".") throw new Error(`Unknown number display token '${profile}'`);
    if (suffix === "..") {
        const sign = rational.numerator < 0n ? -1n : 1n;
        const absolute = rational.numerator < 0n ? -rational.numerator : rational.numerator;
        const whole = absolute / rational.denominator;
        const remainder = absolute % rational.denominator;
        if (remainder === 0n) return base.fromDecimal(sign * whole);
        return `${base.fromDecimal(sign * whole)}..${base.fromDecimal(remainder)}/${base.fromDecimal(rational.denominator)}`;
    }
    if (suffix === "/") return `${base.fromDecimal(rational.numerator)}/${base.fromDecimal(rational.denominator)}`;
    const limited = suffix.match(/^\.\[(\d+)\]$/);
    if (limited && base.base === 10) return decimalPresentation(rational, Number(limited[1]));
    if (!base.supportsPositionalFractions && rational.denominator !== 1n) {
        return `${base.fromDecimal(rational.numerator)}/${base.fromDecimal(rational.denominator)}`;
    }
    return rational.toRepeatingBase(base).replace(/#0$/, "");
}

/** Format only the numeric leaf according to a validated session profile. */
export function formatNumberWithProfile(value, profile, context = null) {
    const pieces = String(profile || "..").split(",").map((part) => part.trim()).filter(Boolean);
    return pieces.map((part) => profileNumber(value, part, context)).join(" · ");
}

function formatIntervalWithProfile(value, profile, context = null) {
    const pieces = String(profile || "..").split(",").map((part) => part.trim()).filter(Boolean);
    return pieces.map((part) =>
        `${profileNumber(value.start, part, context)}:${profileNumber(value.end, part, context)}`
    ).join(" · ");
}

/** Lossless RiX source used by copy/injection controls. */
export function formatValueSource(value) {
    if (value instanceof Integer) return value.toString();
    if (value instanceof Rational) {
        return value.denominator === 1n ? value.numerator.toString() : `${value.numerator}/${value.denominator}`;
    }
    if (value?.type === "string") return JSON.stringify(value.value);
    return formatValue(value, { numberDisplay: ".." });
}

function formatWithCycleGuard(value, activeValues, format) {
    if (activeValues.has(value)) return FORMAT_CYCLE_MARKER;
    activeValues.add(value);
    try {
        return format();
    } finally {
        activeValues.delete(value);
    }
}

export function formatValue(val, options = {}) {
    const activeValues = options[FORMAT_ACTIVE_VALUES] || new WeakSet();
    const childOptions = options[FORMAT_ACTIVE_VALUES]
        ? options
        : { ...options, [FORMAT_ACTIVE_VALUES]: activeValues };
    const formatChild = (child) => formatValue(child, childOptions);
    if (isHole(val)) return "undefined";
    if (isUndecided(val)) return "?";
    if (val === null) return "_";
    if (val === undefined) return "undefined";

    if (typeof val === "object" && val !== null) {
        if (isOutputValue(val)) {
            return formatWithCycleGuard(val, activeValues, () => formatOutputText(val, formatChild));
        }
        if (isSymbolicSpec(val)) return formatSymbolicSpec(val);
        if (isStructuralAlgebra(val) || isStructuralForm(val) || isStructuralLiteral(val) || isStructuralSymbol(val) || val.type === "structural_value") {
            return formatWithCycleGuard(val, activeValues, () => formatStructuralValue(val, formatChild));
        }
        if (isLazySequence(val)) {
            return formatWithCycleGuard(val, activeValues, () => {
                const cached = val._lazy.cache.slice(0, 8).map(formatChild).join(", ");
                const more = val._lazy.cache.length > 8 || !val._lazy.done ? (cached ? ", …" : "…") : "";
                const length = lazyKnownLength(val);
                const suffix = length === null ? "" : `; length ${length}`;
                return `[LazySequence${suffix}: ${cached}${more}]`;
            });
        }
        if (isAsyncStream(val)) {
            const root = val._stream.root;
            return `[AsyncStream ${val._stream.label}; ${root.status}; pulled ${root.pulled}]`;
        }
        if (val.type === "iterator") {
            return val.cursor === null ? "[Iterator: done]" : `[Iterator: index ${val.cursor}]`;
        }
        if (val.type === "binding") return val.toString();
        if (val.type === "formula_sheet") return val.toString();
        if (val.type === "reactive_graph" || val.type === "reactive_node") return val.toString();
        if (val.type === "string") return val.value;
        if (isCayleyInfinity(val)) return "Infinity";
        if (isCayleyValue(val)) {
            return formatWithCycleGuard(
                val,
                activeValues,
                () => `Cayley(${formatChild(val.magnitude)}, ${formatChild(val.direction)})`,
            );
        }
        if (isQuantity(val)) {
            return formatWithCycleGuard(val, activeValues, () => formatQuantity(val, formatChild));
        }
        if (isUnitValue(val)) return `~[${formatUnit(val)}]`;
        if (val.type === "exact_generator" || val.type === "exact_expression") {
            return formatWithCycleGuard(val, activeValues, () => formatExact(val, formatChild));
        }
        if (isShaped(val)) {
            return formatWithCycleGuard(val, activeValues, () => formatShaped(val, formatChild));
        }
        if (val.type === "sequence" && val._ext instanceof Map && val._ext.get("_type")?.value === "multifunction") {
            return formatMultifunctionPreview(val);
        }
        if (val.type === "sequence") {
            const open = val.kind === "set" ? "{| " : val.kind === "tuple" ? "( " : "[";
            const close = val.kind === "set" ? " |}" : val.kind === "tuple" ? " )" : "]";
            const items = val.values || val.elements || [];
            return formatWithCycleGuard(
                val,
                activeValues,
                () => open + items.map(formatChild).join(", ") + close,
            );
        }
        if (val.type === "set" || val.type === "tuple") {
            const open = val.type === "set" ? "{| " : "( ";
            const close = val.type === "set" ? " |}" : " )";
            return formatWithCycleGuard(
                val,
                activeValues,
                () => open + val.values.map(formatChild).join(", ") + close,
            );
        }
        if (val.type === "map") {
            return formatWithCycleGuard(val, activeValues, () => {
                const entries = [];
                const mapObj = val.entries || val.elements || new Map();
                mapObj.forEach((entryValue, key) => {
                    entries.push(`${key}=${formatChild(entryValue)}`);
                });
                return `{= ${entries.join(", ")} }`;
            });
        }
        if (val.type === "export_bundle") {
            return formatWithCycleGuard(val, activeValues, () => {
                const entries = [];
                const mapObj = val.entries || new Map();
                mapObj.forEach((cell, key) => {
                    entries.push(`${key}=${formatChild(cell?.value)}`);
                });
                return `{= ${entries.join(", ")} }`;
            });
        }
        if (val.type === "function" || val.type === "lambda") {
            return formatCallablePreview(val, val.type === "lambda" ? "Lambda" : "Function");
        }
        if (val.type === "system_context") {
            const names = val.context.getAllNames();
            const frozenMark = val.context.frozen ? " frozen" : " mutable";
            return `[SystemContext${frozenMark}: ${names.slice(0, 5).join(", ")}${names.length > 5 ? ", ..." : ""}]`;
        }
        if (val.type === "sysref") {
            return `[SystemFunction: ${val.name}]`;
        }
        if (val.type === "partial") {
            const arity = (val.template || []).reduce(
                (max, templateValue) =>
                    (templateValue && templateValue.type === "placeholder")
                        ? Math.max(max, templateValue.index)
                        : max,
                0,
            );
            return `[Partial: ${arity}]`;
        }
        if (val.type === "method_lift") {
            return `[..${val.methodName}]`;
        }
        if (val.type === "bound_method") {
            return `[PluginFunction: ${val.pluginId}.${val.methodName}]`;
        }
        if (val.type === "interval") {
            return `${val.start || val.lo}:${val.end || val.hi}`;
        }
        if (options.semanticDisplay !== false) {
            const semanticDisplay = formatWithCycleGuard(
                val,
                activeValues,
                () => formatViaSemanticDisplay(val, childOptions),
            );
            if (semanticDisplay !== null) return semanticDisplay;
        }
        if (val.fn === "DEFER") {
            const inner = val.args && val.args[0];
            const kind = inner ? (inner.fn || inner.type || "AST") : "AST";
            return `[Deferred ${kind}]`;
        }
    }

    if (val instanceof Integer || val instanceof Rational) {
        const profile = options.numberDisplay
            ?? options.context?.getEnv?.("numDisplay", null);
        return profile
            ? formatNumberWithProfile(val, profile, options.context)
            : val instanceof Rational ? val.toMixedString() : val.toString();
    }
    if (val instanceof RationalInterval) {
        const profile = options.numberDisplay
            ?? options.context?.getEnv?.("numDisplay", null);
        return profile
            ? formatIntervalWithProfile(val, profile, options.context)
            : val.toMixedString();
    }
    if (val instanceof CertifiedApproximation) return val.toString();
    if (val instanceof HaloNeighborhood) return val.toString();
    return val.toString();
}
