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
import { createShaped } from "../../src/runtime/shaped.js";
import { mathFunctions } from "./math-functions.js";
import { createFloatTensorAdapters, FLOAT_TENSOR_EXPORTS } from "./tensor-adapters.js";
import { createApproximateAlgorithms, FLOAT_ALGORITHM_EXPORTS } from "./approximate-algorithms.js";
import { Enclose, NumericsCapabilities, Refine, Sample, exactFloatRational } from "./protocol.js";
import {
    BINARY32,
    BINARY64,
    classifyFloat,
    convertFloat,
    diagnosticsOf,
    floatText,
    formatInfo,
    formatOf,
    nextAfterValue,
    nextValue,
    numberFrom,
    operateFloat,
} from "./ieee754.js";

const TYPE_NAME = "FloatIEEE754";
const NATIVE_TYPE = "float_ieee754";

function isFloat(value) {
    return value?.type === NATIVE_TYPE && typeof value.value === "number";
}

function float(value, format) {
    return convertFloat(value, format, NATIVE_TYPE);
}

function int(value) {
    return new Integer(BigInt(value));
}

function bool(value) {
    return value ? int(1) : null;
}

function sequence(values) {
    return { type: "sequence", values };
}

function classificationMap(value) {
    const classification = classifyFloat(value);
    const info = formatInfo(classification.format);
    return {
        type: "map",
        entries: new Map([
            ["valueKind", stringObj("floatClassification")],
            ["schema", stringObj("rix.float.classification@1")],
            ["format", stringObj(classification.format)],
            ["bits", int(classification.bits)],
            ["precisionBits", int(info.precisionBits)],
            ["class", stringObj(classification.className)],
            ["sign", stringObj(classification.sign)],
            ["finite", bool(classification.finite)],
            ["subnormal", bool(classification.subnormal)],
            ["negativeZero", bool(classification.negativeZero)],
            ["operation", value.operation ? stringObj(value.operation) : null],
            ["diagnostics", diagnosticSequence(value)],
        ]),
    };
}

function diagnosticSequence(value) {
    return sequence(diagnosticsOf(value).map(stringObj));
}

function requireFloat(value, evaluate) {
    return evaluate({ fn: "SEMANTIC_CONVERT_STRICT", args: [value, TYPE_NAME] });
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

function numericVariant(name, operation, fn, arity = 2) {
    return {
        name,
        priority: 500,
        prep(args) { return args.length >= arity && args.slice(0, arity).every(isFloat); },
        impl(args) { return operateFloat(operation, args, fn, NATIVE_TYPE); },
    };
}

function compareVariant(name, relation) {
    return {
        name,
        priority: 500,
        prep(args) { return args.length === 2 && args.every(isFloat); },
        impl(args) {
            if (formatOf(args[0]) !== formatOf(args[1])) {
                throw new Error("Mixed binary32/binary64 Float comparison requires an explicit format conversion");
            }
            return relation(numberFrom(args[0]), numberFrom(args[1])) ? new Integer(1n) : null;
        },
    };
}

function prepareFloatComparison(args) {
    return args.length === 2 && args.every(isFloat) ? { args } : false;
}

function registerFloatType() {
    if (typeRegistry.has(TYPE_NAME)) return;
    const installs = new Map([
        ["ADD", [numericVariant("FloatIEEE754Add", "add", (...args) => args.reduce((total, value) => total + value, 0))]],
        ["SUB", [numericVariant("FloatIEEE754Sub", "sub", (left, right) => left - right)]],
        ["MUL", [numericVariant("FloatIEEE754Mul", "mul", (...args) => args.reduce((total, value) => total * value, 1))]],
        ["DIV", [numericVariant("FloatIEEE754Div", "div", (left, right) => left / right)]],
        ["POW", [numericVariant("FloatIEEE754Pow", "pow", (left, right) => left ** right)]],
        ["POWPROD", [numericVariant("FloatIEEE754PowProd", "pow", (left, right) => left ** right)]],
        ["NEG", [numericVariant("FloatIEEE754Neg", "neg", (value) => -value, 1)]],
        ["COMPARE", [{
            name: "FloatIEEE754Compare",
            priority: 500,
            prepare: prepareFloatComparison,
            impl(args) {
                if (formatOf(args[0]) !== formatOf(args[1])) {
                    throw new Error("Mixed binary32/binary64 Float comparison requires an explicit format conversion");
                }
                const [left, right] = args.map(numberFrom);
                if (Number.isNaN(left) || Number.isNaN(right)) {
                    throw new Error("Float NaN is unordered; inspect Classify() or Diagnostics()");
                }
                return new Integer(left < right ? -1n : left > right ? 1n : 0n);
            },
        }]],
        ["EQ", [compareVariant("FloatIEEE754Eq", (left, right) => left === right)]],
        ["NEQ", [compareVariant("FloatIEEE754Neq", (left, right) => left !== right)]],
        ["LT", [compareVariant("FloatIEEE754Lt", (left, right) => left < right)]],
        ["GT", [compareVariant("FloatIEEE754Gt", (left, right) => left > right)]],
        ["LTE", [compareVariant("FloatIEEE754Lte", (left, right) => left <= right)]],
        ["GTE", [compareVariant("FloatIEEE754Gte", (left, right) => left >= right)]],
        ["ABS", [numericVariant("FloatIEEE754Abs", "abs", Math.abs, 1)]],
        ["SQRT", [numericVariant("FloatIEEE754Sqrt", "sqrt", Math.sqrt, 1)]],
        ["SIN", [numericVariant("FloatIEEE754Sin", "sin", Math.sin, 1)]],
        ["COS", [numericVariant("FloatIEEE754Cos", "cos", Math.cos, 1)]],
        ["TAN", [numericVariant("FloatIEEE754Tan", "tan", Math.tan, 1)]],
        ["ASIN", [numericVariant("FloatIEEE754Asin", "asin", Math.asin, 1)]],
        ["ACOS", [numericVariant("FloatIEEE754Acos", "acos", Math.acos, 1)]],
        ["ATAN", [numericVariant("FloatIEEE754Atan", "atan", Math.atan, 1)]],
        ["ATAN2", [numericVariant("FloatIEEE754Atan2", "atan2", Math.atan2, 2)]],
        ["LOG", [numericVariant("FloatIEEE754Log", "log", Math.log, 1)]],
        ["LN", [numericVariant("FloatIEEE754Ln", "log", Math.log, 1)]],
        ["LOG10", [numericVariant("FloatIEEE754Log10", "log10", Math.log10, 1)]],
        ["EXP", [numericVariant("FloatIEEE754Exp", "exp", Math.exp, 1)]],
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
            ["ToString", valueMethod("ToString", (value) => stringObj(floatText(value.value)))],
            ["Value", valueMethod("Value", (value) => stringObj(floatText(value.value)))],
            ["Format", valueMethod("Format", (value) => stringObj(formatOf(value)))],
            ["Classify", valueMethod("Classify", (value) => classificationMap(value))],
            ["Diagnostics", valueMethod("Diagnostics", (value) => diagnosticSequence(value))],
            ["Binary32", valueMethod("Binary32", (value, _args, _context, evaluate) => requireFloat(float(value, BINARY32), evaluate))],
            ["Binary64", valueMethod("Binary64", (value, _args, _context, evaluate) => requireFloat(float(value, BINARY64), evaluate))],
            ["NextUp", valueMethod("NextUp", (value, _args, _context, evaluate) => requireFloat(nextValue(value, 1, NATIVE_TYPE), evaluate))],
            ["NextDown", valueMethod("NextDown", (value, _args, _context, evaluate) => requireFloat(nextValue(value, -1, NATIVE_TYPE), evaluate))],
            ["NextAfter", valueMethod("NextAfter", (value, [target], _context, evaluate) => requireFloat(nextAfterValue(value, target, NATIVE_TYPE), evaluate))],
            ["Sample", valueMethod("Sample", (value, [request]) => Sample(value, request))],
            ["Enclose", valueMethod("Enclose", (value, [request]) => Enclose(value, request))],
            ["Refine", valueMethod("Refine", (value, [request]) => Refine(value, request))],
            ["NumericsCapabilities", valueMethod("NumericsCapabilities", (value) => NumericsCapabilities(value))],
        ]),
        installs,
    });
}

function method(name, impl) {
    return { type: "method_builtin", name, impl };
}

/** Install `.float` plus the FloatIEEE754 semantic type and its variants. */
export function installBrowserApproxMathPlugin({ systemContext, registry, metadata = {}, options = {} }) {
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
    add("Float", (args, _context, evaluate) => args[2] === undefined || args[2] === null
        ? requireFloat(args[1], evaluate)
        : requireFloat(float(args[1], args[2]), evaluate));
    add("Binary32", (args, _context, evaluate) => requireFloat(float(args[1], BINARY32), evaluate));
    add("Binary64", (args, _context, evaluate) => requireFloat(float(args[1], BINARY64), evaluate));
    add("Format", (args, _context, evaluate) => stringObj(formatOf(requireFloat(args[1], evaluate))));
    add("Classify", (args, _context, evaluate) => classificationMap(requireFloat(args[1], evaluate)));
    add("Diagnostics", (args, _context, evaluate) => diagnosticSequence(requireFloat(args[1], evaluate)));
    add("NextUp", (args, _context, evaluate) => requireFloat(nextValue(requireFloat(args[1], evaluate), 1, NATIVE_TYPE), evaluate));
    add("NextDown", (args, _context, evaluate) => requireFloat(nextValue(requireFloat(args[1], evaluate), -1, NATIVE_TYPE), evaluate));
    add("NextAfter", (args, _context, evaluate) => requireFloat(nextAfterValue(requireFloat(args[1], evaluate), args[2], NATIVE_TYPE), evaluate));
    add("Interval", (args, _context, evaluate) => {
        const value = requireFloat(args[1], evaluate);
        if (!Number.isFinite(value.value)) {
            throw new Error("Float Interval requires a finite stored value; use Classify() for NaN or infinity");
        }
        const exact = exactFloatRational(value);
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
    const tensors = createFloatTensorAdapters(NATIVE_TYPE);
    for (const name of FLOAT_TENSOR_EXPORTS) add(name, (args, _context, evaluate) => {
        const result = tensors[name](...args.slice(1));
        if (name !== "ToShaped") return result;
        // Attach the normal Float semantic methods without discarding buffer provenance.
        const cells = result.data.map((value) => {
            const converted = requireFloat(value, evaluate);
            const preserve = (cell) => ({ ...cell, diagnostics: value.diagnostics, operation: value.operation });
            return converted && typeof converted.then === "function"
                ? converted.then(preserve) : preserve(converted);
        });
        return cells.some((cell) => cell && typeof cell.then === "function")
            ? Promise.all(cells).then((resolved) => createShaped(result.shape, resolved))
            : createShaped(result.shape, cells);
    });
    const algorithms = createApproximateAlgorithms(NATIVE_TYPE);
    for (const name of FLOAT_ALGORITHM_EXPORTS) {
        add(name, (args) => algorithms[name](...args.slice(1)));
    }

    const value = { type: "map", entries, _ext: extension };
    systemContext.registerHostCallableValue("float", value, {
        impl(args, _context, evaluate) {
            return args[1] === undefined || args[1] === null
                ? requireFloat(args[0], evaluate)
                : requireFloat(float(args[0], args[1]), evaluate);
        },
    }, {
        doc: "Optional IEEE-754 Float conversion and approximate math",
        groups: ["ApproximateMath", "Float"],
    });
    const floatExtension = method("Float", (args, _context, evaluate) => args[1] === undefined || args[1] === null
        ? requireFloat(args[0], evaluate)
        : requireFloat(float(args[0], args[1]), evaluate));
    const owner = {
        pluginId: metadata.id || "float",
        mount: options.as || metadata.mount || "float",
    };
    systemContext.registerMethod("Integer", "Float", floatExtension, owner);
    systemContext.registerMethod("Rational", "Float", floatExtension, owner);
    return systemContext;
}

/** Browser host entry used by the RiX Web generated plugin catalog. */
export const install = installBrowserApproxMathPlugin;
