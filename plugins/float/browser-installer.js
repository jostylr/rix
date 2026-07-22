/**
 * Browser-safe IEEE-754 Float plugin implementation.
 *
 * The public spelling is `.float`, while the semantic type name is unique so
 * several approximate-number implementations can coexist in one RiX process.
 */
import { Integer, Rational, RationalInterval } from "@ratmath/core";
import {
    installRegisteredTypes,
    makeProto,
    registerType,
    stringObj,
    typeRegistry,
    valueMethod,
} from "../../src/runtime/type-system.js";
import { mathFunctions } from "../../src/eval/functions/math.js";

const TYPE_NAME = "FloatIEEE754";
const NATIVE_TYPE = "float_ieee754";

function isFloat(value) {
    return value?.type === NATIVE_TYPE && typeof value.value === "number";
}

function numberFrom(value) {
    if (isFloat(value)) return value.value;
    if (value instanceof Integer) return Number(value.value);
    if (value instanceof Rational) return Number(value.numerator) / Number(value.denominator);
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    if (value?.type === "string") return Number(value.value);
    return Number(value);
}

function float(value) {
    const number = numberFrom(value);
    if (!Number.isFinite(number)) throw new Error("Cannot convert value to finite Float");
    // toString is a plugin-owned fallback for hosts that format a value without
    // evaluating semantic display methods.
    return { type: NATIVE_TYPE, value: number, toString() { return String(number); } };
}

function requireFloat(value, evaluate) {
    return evaluate({ fn: "SEMANTIC_CONVERT_STRICT", args: [value, TYPE_NAME] });
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

function numericVariant(name, fn, arity = 2) {
    return {
        name,
        prep(args) { return args.length >= arity && args.some(isFloat); },
        impl(args) { return float(fn(...args.map(numberFrom))); },
    };
}

function compareVariant(name, relation) {
    return {
        name,
        prep(args) { return args.length === 2 && args.some(isFloat); },
        impl(args) { return relation(numberFrom(args[0]), numberFrom(args[1])) ? new Integer(1n) : null; },
    };
}

function prepareFloatComparison(args, _context, evaluate) {
    if (args.length !== 2 || !args.some(isFloat)) return false;
    try {
        return { args: args.map((value) => requireFloat(value, evaluate)) };
    } catch {
        return false;
    }
}

function registerFloatType() {
    if (typeRegistry.has(TYPE_NAME)) return;
    const installs = new Map([
        ["ADD", [numericVariant("FloatIEEE754Add", (...args) => args.reduce((total, value) => total + value, 0))]],
        ["SUB", [numericVariant("FloatIEEE754Sub", (left, right) => left - right)]],
        ["MUL", [numericVariant("FloatIEEE754Mul", (...args) => args.reduce((total, value) => total * value, 1))]],
        ["DIV", [numericVariant("FloatIEEE754Div", (left, right) => left / right)]],
        ["POW", [numericVariant("FloatIEEE754Pow", (left, right) => left ** right)]],
        ["POWPROD", [numericVariant("FloatIEEE754PowProd", (left, right) => left ** right)]],
        ["NEG", [numericVariant("FloatIEEE754Neg", (value) => -value, 1)]],
        ["COMPARE", [{
            name: "FloatIEEE754Compare",
            prepare: prepareFloatComparison,
            impl(args) {
                const [left, right] = args.map(numberFrom);
                return new Integer(left < right ? -1n : left > right ? 1n : 0n);
            },
        }]],
        ["EQ", [compareVariant("FloatIEEE754Eq", (left, right) => left === right)]],
        ["NEQ", [compareVariant("FloatIEEE754Neq", (left, right) => left !== right)]],
        ["LT", [compareVariant("FloatIEEE754Lt", (left, right) => left < right)]],
        ["GT", [compareVariant("FloatIEEE754Gt", (left, right) => left > right)]],
        ["LTE", [compareVariant("FloatIEEE754Lte", (left, right) => left <= right)]],
        ["GTE", [compareVariant("FloatIEEE754Gte", (left, right) => left >= right)]],
        ["ABS", [numericVariant("FloatIEEE754Abs", Math.abs, 1)]],
        ["SIN", [numericVariant("FloatIEEE754Sin", Math.sin, 1)]],
        ["COS", [numericVariant("FloatIEEE754Cos", Math.cos, 1)]],
        ["TAN", [numericVariant("FloatIEEE754Tan", Math.tan, 1)]],
        ["ASIN", [numericVariant("FloatIEEE754Asin", Math.asin, 1)]],
        ["ACOS", [numericVariant("FloatIEEE754Acos", Math.acos, 1)]],
        ["ATAN", [numericVariant("FloatIEEE754Atan", Math.atan, 1)]],
        ["ATAN2", [numericVariant("FloatIEEE754Atan2", Math.atan2, 2)]],
        ["LOG", [numericVariant("FloatIEEE754Log", Math.log, 1)]],
        ["LN", [numericVariant("FloatIEEE754Ln", Math.log, 1)]],
        ["LOG10", [numericVariant("FloatIEEE754Log10", Math.log10, 1)]],
        ["EXP", [numericVariant("FloatIEEE754Exp", Math.exp, 1)]],
    ]);

    registerType({
        name: TYPE_NAME,
        nativeType: NATIVE_TYPE,
        defaultTraits: ["field", "ordered"],
        convertFrom: new Map([
            ["Integer", float],
            ["Rational", float],
            [NATIVE_TYPE, float],
        ]),
        convert: float,
        normalize: float,
        validate: isFloat,
        proto: () => makeProto([
            ["ToString", valueMethod("ToString", (value) => stringObj(String(value.value)))],
            ["Value", valueMethod("Value", (value) => stringObj(String(value.value)))],
        ]),
        installs,
    });
}

function method(name, impl) {
    return { type: "method_builtin", name, impl };
}

/** Install `.float` plus the FloatIEEE754 semantic type and its variants. */
export function installBrowserApproxMathPlugin({ systemContext, registry }) {
    registerFloatType();
    registry.registerAll(mathFunctions);
    installRegisteredTypes(registry, [TYPE_NAME], { skipMissing: true, skipExisting: true });

    const entries = new Map();
    const extension = new Map();
    const add = (name, impl) => {
        const entry = method(name, impl);
        entries.set(name, entry);
        extension.set(name.toUpperCase(), entry);
    };
    add("Float", (args, _context, evaluate) => requireFloat(args[1], evaluate));
    add("Interval", (args, _context, evaluate) => {
        const exact = exactFloatRational(requireFloat(args[1], evaluate));
        return new RationalInterval(exact, exact);
    });
    add("Round", (args, _context, evaluate) => decimalRounded(requireFloat(args[1], evaluate), decimalPlaces(args[2]), "round"));
    add("Floor", (args, _context, evaluate) => decimalRounded(requireFloat(args[1], evaluate), decimalPlaces(args[2]), "floor"));
    add("Ceiling", (args, _context, evaluate) => decimalRounded(requireFloat(args[1], evaluate), decimalPlaces(args[2]), "ceiling"));
    add("Abs", (args, _context, evaluate) => evaluate({ fn: "ABS", args: [requireFloat(args[1], evaluate)] }));
    for (const name of ["Sqrt", "Sin", "Cos", "Tan", "Asin", "Acos", "Atan", "Log", "Ln", "Log10", "Exp"]) {
        add(name, (args, _context, evaluate) => evaluate({ fn: name.toUpperCase(), args: [requireFloat(args[1], evaluate)] }));
    }
    add("Atan2", (args, _context, evaluate) => evaluate({ fn: "ATAN2", args: [requireFloat(args[1], evaluate), requireFloat(args[2], evaluate)] }));

    const value = { type: "map", entries, _ext: extension };
    systemContext.registerHostCallableValue("float", value, {
        impl(args, _context, evaluate) { return requireFloat(args[0], evaluate); },
    }, {
        doc: "Optional IEEE-754 Float conversion and approximate math",
        groups: ["ApproximateMath", "Float"],
    });
    return systemContext;
}

/** Browser host entry used by the RiX Web generated plugin catalog. */
export const install = installBrowserApproxMathPlugin;
