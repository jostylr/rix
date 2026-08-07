import { Integer, Rational, RationalInterval } from "@ratmath/core";

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

export function NumericsCapabilities() {
    return map([
        ["valuekind", text("numericsCapabilities")],
        ["schema", text("rix.numerics.capabilities@1")],
        ["backend", text("float")],
        ["representation", text("ieee754Binary64")],
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

export function Enclose(value, request) {
    const exact = exactFloatRational(value);
    const requestedWidth = entry(request, "absolutewidth", null);
    const requestedWork = entry(entry(request, "work", null), "maxwork", int(0));
    return map([
        ["valuekind", text("enclosure")],
        ["schema", text("rix.numerics.enclosure@1")],
        ["status", text("approximate")],
        ["interval", new RationalInterval(exact, exact)],
        ["certified", null],
        ["goalmet", null],
        ["requestedwidth", requestedWidth],
        ["achievedwidth", Rational.zero],
        ["evidencelevel", text("approximate")],
        ["backend", text("float")],
        ["operation", text("sample")],
        ["trace", sequence([])],
        ["work", map([
            ["samples", int(1)],
            ["maxwork", requestedWork],
            ["exhausted", null],
        ])],
        ["diagnostics", sequence([
            text("storedValueOnly"),
            text("noErrorBoundForIntendedReal"),
        ])],
        ["source", map([
            ["plugin", text("float")],
            ["representation", text("ieee754Binary64")],
            ["storedvalueexact", int(1)],
        ])],
    ]);
}

export const Refine = Enclose;
