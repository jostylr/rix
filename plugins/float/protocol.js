import { Integer, Rational, RationalInterval } from "@ratmath/core";
import { unsupportedRefinementResult } from "../../src/runtime/refinement.js";
import { classifyFloat, diagnosticsOf, formatInfo, formatOf } from "./ieee754.js";

function int(value) {
    return new Integer(BigInt(value));
}

function text(value) {
    return { type: "string", value };
}

function map(entries) {
    return { type: "map", entries: new Map(entries) };
}

function sequence(values) {
    return { type: "sequence", values };
}

function entry(value, key, fallback = null) {
    if (!(value?.entries instanceof Map)) return fallback;
    if (value.entries.has(key)) return value.entries.get(key);
    const lower = key.toLowerCase();
    for (const [candidate, item] of value.entries) {
        if (String(candidate).toLowerCase() === lower) return item;
    }
    return fallback;
}

export function exactFloatRational(float) {
    const value = float?.value;
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error("Float exact conversion requires a finite Float");
    }
    if (value === 0) return Rational.zero;

    const bytes = new ArrayBuffer(8);
    const view = new DataView(bytes);
    view.setFloat64(0, value, false);
    const bits = view.getBigUint64(0, false);
    const negative = (bits >> 63n) !== 0n;
    const exponent = Number((bits >> 52n) & 0x7ffn);
    const fraction = bits & ((1n << 52n) - 1n);
    const significand = exponent === 0 ? fraction : (1n << 52n) | fraction;
    const binaryExponent = exponent === 0 ? -1074 : exponent - 1075;
    const numerator = negative ? -significand : significand;
    return binaryExponent >= 0
        ? new Rational(numerator << BigInt(binaryExponent), 1n)
        : new Rational(numerator, 1n << BigInt(-binaryExponent));
}

export function NumericsCapabilities(value = null) {
    const format = formatOf(value);
    return map([
        ["valuekind", text("numericsCapabilities")],
        ["schema", text("rix.numerics.capabilities@1")],
        ["backend", text("float")],
        ["representation", text(format === "binary32" ? "ieee754Binary32" : "ieee754Binary64")],
        ["format", text(format)],
        ["precisionbits", int(formatInfo(format).precisionBits)],
        ["denotation", text("storedScalar")],
        ["operations", sequence([text("sample"), text("enclose")])],
        ["evidencelevels", sequence([text("approximate")])],
        ["certified", null],
        ["arbitraryrefinement", null],
        ["deterministic", int(1)],
        ["minimumwidth", Rational.zero],
        ["storedvalueexact", int(1)],
        ["intendedrealcertified", null],
    ]);
}

function approximateStoredValue(value, request, operation) {
    const classification = classifyFloat(value);
    const finite = classification.finite;
    const exact = finite ? exactFloatRational(value) : Rational.zero;
    const requestedWidth = entry(request, "absolutewidth", null);
    const requestedWork = entry(entry(request, "work", null), "maxwork", int(0));
    const valueDiagnostics = diagnosticsOf(value);
    const diagnostics = finite
        ? ["storedValueOnly", "noErrorBoundForIntendedReal", ...valueDiagnostics]
        : ["storedValueNonFinite", "noFiniteRationalInterval", ...valueDiagnostics];
    return map([
        ["valuekind", text("enclosure")],
        ["schema", text("rix.numerics.enclosure@1")],
        ["status", text(finite ? "approximate" : "unknown")],
        ["interval", new RationalInterval(exact, exact)],
        ["certified", null],
        ["goalmet", null],
        ["requestedwidth", requestedWidth],
        ["achievedwidth", Rational.zero],
        ["evidencelevel", text("approximate")],
        ["backend", text("float")],
        ["operation", text(operation)],
        ["trace", sequence([])],
        ["work", map([
            ["samples", int(1)],
            ["maxwork", requestedWork],
            ["exhausted", null],
        ])],
        ["diagnostics", sequence([...new Set(diagnostics)].map(text))],
        ["source", map([
            ["plugin", text("float")],
            ["representation", text(classification.format === "binary32" ? "ieee754Binary32" : "ieee754Binary64")],
            ["format", text(classification.format)],
            ["classification", text(classification.className)],
            ["sign", text(classification.sign)],
            ["storedvalueexact", finite ? int(1) : null],
        ])],
    ]);
}

export function Sample(value, request) {
    return approximateStoredValue(value, request, "sample");
}

export function Enclose(value, request) {
    return approximateStoredValue(value, request, "enclose");
}

export function Refine(value, request) {
    return unsupportedRefinementResult(request, NumericsCapabilities(value), "noArbitraryRefinementForIntendedReal");
}
