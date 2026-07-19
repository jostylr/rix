/**
 * Browser-safe approximate arithmetic plugin.
 *
 * It intentionally has no filesystem, CommonJS, or dynamic-import dependency,
 * so browser hosts can deliberately bundle it. The Node example plugin keeps
 * its richer semantic-type startup path separately.
 */
import { Integer, Rational, RationalInterval } from "@ratmath/core";

function toNumber(value) {
    if (value?.type === "float") return value.value;
    if (value instanceof Integer) return Number(value.value);
    if (value instanceof Rational) return Number(value.numerator) / Number(value.denominator);
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    if (value?.type === "string") return Number(value.value);
    return Number(value);
}

function float(value) {
    const number = toNumber(value);
    if (!Number.isFinite(number)) throw new Error("Cannot convert value to finite Float");
    return {
        type: "float",
        value: number,
        add(other) { return float(number + toNumber(other)); },
        subtract(other) { return float(number - toNumber(other)); },
        multiply(other) { return float(number * toNumber(other)); },
        divide(other) { return float(number / toNumber(other)); },
        negate() { return float(-number); },
        pow(other) { return float(number ** toNumber(other)); },
        equals(other) { return number === toNumber(other); },
        sign() { return new Integer(number < 0 ? -1n : number > 0 ? 1n : 0n); },
        toString() { return String(number); },
    };
}

function exactFloatRational(value) {
    const number = float(value).value;
    if (number === 0) return new Rational(0n, 1n);
    const bytes = new ArrayBuffer(8);
    const view = new DataView(bytes);
    view.setFloat64(0, number, false);
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

function decimalPlaces(value) {
    if (value === undefined || value === null) return 0;
    if (!(value instanceof Integer) || value.value < 0n || value.value > 10000n) {
        throw new Error("Float rounding places must be a non-negative integer no greater than 10000");
    }
    return Number(value.value);
}

function floorDiv(numerator, denominator) {
    return numerator >= 0n ? numerator / denominator : -((-numerator + denominator - 1n) / denominator);
}

function decimalRounded(value, places, mode) {
    const exact = exactFloatRational(value);
    const scale = 10n ** BigInt(places);
    const scaled = exact.numerator * scale;
    const lower = floorDiv(scaled, exact.denominator);
    let coefficient = lower;
    if (mode === "ceiling" && scaled !== lower * exact.denominator) coefficient += 1n;
    if (mode === "round") {
        const remainder = scaled - lower * exact.denominator;
        const doubled = remainder * 2n;
        if (doubled > exact.denominator || (doubled === exact.denominator && (lower & 1n) !== 0n)) coefficient += 1n;
    }
    return new Rational(coefficient, scale);
}

function method(name, impl) {
    return { type: "method_builtin", name, impl };
}

/** Install `.float`, `.float.Float`, and browser-native approximate methods. */
export function installBrowserApproxMathPlugin({ systemContext }) {
    const entries = new Map();
    const extension = new Map();
    const add = (name, impl) => {
        const entry = method(name, impl);
        entries.set(name, entry);
        extension.set(name.toUpperCase(), entry);
    };

    add("Float", (args) => float(args[1]));
    add("Interval", (args) => {
        const exact = exactFloatRational(args[1]);
        return new RationalInterval(exact, exact);
    });
    add("Round", (args) => decimalRounded(args[1], decimalPlaces(args[2]), "round"));
    add("Floor", (args) => decimalRounded(args[1], decimalPlaces(args[2]), "floor"));
    add("Ceiling", (args) => decimalRounded(args[1], decimalPlaces(args[2]), "ceiling"));
    for (const [name, fn] of Object.entries({
        Abs: Math.abs, Sqrt: Math.sqrt, Sin: Math.sin, Cos: Math.cos, Tan: Math.tan,
        Asin: Math.asin, Acos: Math.acos, Atan: Math.atan, Log: Math.log, Ln: Math.log,
        Log10: Math.log10, Exp: Math.exp,
    })) {
        add(name, (args) => float(fn(toNumber(args[1]))));
    }
    add("Atan2", (args) => float(Math.atan2(toNumber(args[1]), toNumber(args[2]))));

    const value = { type: "map", entries, _ext: extension };
    systemContext.registerHostCallableValue("float", value, {
        impl(args) { return float(args[0]); },
    }, {
        doc: "Optional browser-native Float conversion and approximate math",
        groups: ["ApproximateMath", "Float"],
    });
    return systemContext;
}
