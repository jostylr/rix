/**
 * Optional host plugin for JavaScript-number transcendental math.
 *
 * It deliberately lives outside the default RiX system context so hosts can
 * substitute interval, arbitrary-precision, or domain-specific behavior.
 */

import { MATH_FUNCTION_NAMES, mathFunctions } from "./math-functions.js";
import { installRegisteredTypes, typeRegistry } from "../../src/runtime/type-system.js";
import { loadFloatPluginStartup } from "./float-loader.js";
import { Integer, Rational, RationalInterval } from "@ratmath/core";
import { exactFloatRational } from "./protocol.js";
import {
    Binary32 as makeBinary32,
    Binary64 as makeBinary64,
    Classify as classify,
    Diagnostics as diagnostics,
    Format as format,
    From as makeFloat,
    NextAfter as nextAfter,
    NextDown as nextDown,
    NextUp as nextUp,
} from "./floats.js";
import { formatOf } from "./ieee754.js";
import { createApproximateAlgorithms, FLOAT_ALGORITHM_EXPORTS } from "./approximate-algorithms.js";

const FLOAT_METHOD_NAMES = ["ABS", ...MATH_FUNCTION_NAMES];

function displayName(name) {
    return name[0] + name.slice(1).toLowerCase();
}

function requireFloat(value, evaluate) {
    return evaluate({
        fn: "SEMANTIC_CONVERT_STRICT",
        args: [value, "Float"],
    });
}

function installFloatCompareVariant(registry) {
    registry.installVariant("COMPARE", {
        name: "ApproxMathFloatCompare",
        priority: 500,
        prepare(args) {
            if (args.length !== 2 || !args.every((value) => value?.type === "float")) return false;
            return { args };
        },
        impl(args) {
            const [leftValue, rightValue] = args;
            if (formatOf(leftValue) !== formatOf(rightValue)) {
                throw new Error("Mixed binary32/binary64 Float comparison requires an explicit format conversion");
            }
            const [left, right] = args.map((value) => value.value);
            if (Number.isNaN(left) || Number.isNaN(right)) {
                throw new Error("Float NaN is unordered; inspect Classify() or Diagnostics()");
            }
            return new Integer(left < right ? -1n : left > right ? 1n : 0n);
        },
    });
}

function decimalPlaces(value) {
    if (value === undefined || value === null) return 0;
    const places = value?.value;
    if (typeof places !== "bigint" || places < 0n) {
        throw new Error("Float rounding places must be a non-negative integer");
    }
    if (places > 10000n) throw new Error("Float rounding places must not exceed 10000");
    return Number(places);
}

function floorDiv(numerator, denominator) {
    if (numerator >= 0n) return numerator / denominator;
    return -((-numerator + denominator - 1n) / denominator);
}

function decimalRounded(float, places, mode) {
    const exact = exactFloatRational(float);
    const scale = 10n ** BigInt(places);
    const scaledNumerator = exact.numerator * scale;
    const denominator = exact.denominator;
    const lower = floorDiv(scaledNumerator, denominator);
    let coefficient;

    if (mode === "floor") {
        coefficient = lower;
    } else if (mode === "ceiling") {
        coefficient = scaledNumerator === lower * denominator ? lower : lower + 1n;
    } else {
        const remainder = scaledNumerator - lower * denominator;
        const doubled = remainder * 2n;
        coefficient = doubled < denominator
            ? lower
            : doubled > denominator
                ? lower + 1n
                : (lower & 1n) === 0n ? lower : lower + 1n;
    }
    return new Rational(coefficient, scale);
}

function floatValue(registry) {
    const entries = new Map();
    const extension = new Map([[
        "immutable",
        { type: "integer", value: 1n },
    ]]);

    const convert = {
        type: "method_builtin",
        name: "Float",
        impl(args, context, evaluate) {
            if (args[2] !== undefined && args[2] !== null) return requireFloat(makeFloat(args[1], args[2]), evaluate);
            return evaluate({
                fn: "SEMANTIC_CONVERT_STRICT",
                args: [args[1], "Float"],
            });
        },
    };
    entries.set("Float", convert);
    extension.set("FLOAT", convert);

    const add = (name, impl) => {
        const method = { type: "method_builtin", name, impl };
        entries.set(name, method);
        extension.set(name.toUpperCase(), method);
    };
    add("Binary32", (args, _context, evaluate) => requireFloat(makeBinary32(args[1]), evaluate));
    add("Binary64", (args, _context, evaluate) => requireFloat(makeBinary64(args[1]), evaluate));
    add("Format", (args, _context, evaluate) => format(requireFloat(args[1], evaluate)));
    add("Classify", (args, _context, evaluate) => classify(requireFloat(args[1], evaluate)));
    add("Diagnostics", (args, _context, evaluate) => diagnostics(requireFloat(args[1], evaluate)));
    add("NextUp", (args, _context, evaluate) => requireFloat(nextUp(requireFloat(args[1], evaluate)), evaluate));
    add("NextDown", (args, _context, evaluate) => requireFloat(nextDown(requireFloat(args[1], evaluate)), evaluate));
    add("NextAfter", (args, _context, evaluate) => requireFloat(nextAfter(requireFloat(args[1], evaluate), args[2]), evaluate));
    const algorithms = createApproximateAlgorithms("float");
    for (const name of FLOAT_ALGORITHM_EXPORTS) {
        add(name, (args) => algorithms[name](...args.slice(1)));
    }

    const interval = {
        type: "method_builtin",
        name: "Interval",
        impl(args, _context, evaluate) {
            const value = requireFloat(args[1], evaluate);
            if (!Number.isFinite(value.value)) {
                throw new Error("Float Interval requires a finite stored value; use Classify() for NaN or infinity");
            }
            const exact = exactFloatRational(value);
            // A Float denotes one specific IEEE-754 value, so its exact dyadic
            // rational is a point interval and therefore a proven enclosure.
            return new RationalInterval(exact, exact);
        },
    };
    entries.set("Interval", interval);
    extension.set("INTERVAL", interval);

    for (const [name, mode] of [["Round", "round"], ["Floor", "floor"], ["Ceiling", "ceiling"]]) {
        const method = {
            type: "method_builtin",
            name,
            impl(args, _context, evaluate) {
                const float = requireFloat(args[1], evaluate);
                return decimalRounded(float, decimalPlaces(args[2]), mode);
            },
        };
        entries.set(name, method);
        extension.set(name.toUpperCase(), method);
    }

    for (const name of FLOAT_METHOD_NAMES) {
        const display = displayName(name);
        const method = {
            type: "method_builtin",
            name: display,
            impl(args, context, evaluate) {
                // This namespace is the Float implementation, rather than a
                // generic Math facade: normalize every argument first so
                // `.float.Sin(1)` has the same Float result as
                // `.float.Sin(.float.Float(1))`.
                const floatArgs = args.slice(1).map((arg) => requireFloat(arg, evaluate));
                return evaluate({ fn: name, args: floatArgs });
            },
        };
        entries.set(display, method);
        extension.set(name, method);
    }

    return { type: "map", entries, _ext: extension };
}

/**
 * Install JavaScript Float support and its approximate functions as `.float`.
 *
 * The plugin owns both the semantic Float type and the host-facing method
 * namespace, so `.float.Float(1/3)` and `.float.Sin(x)` always refer to the
 * same numeric implementation.
 */
export function loadFloatPlugin(systemContext, registry, owner = { pluginId: "float", mount: "float" }) {
    if (!systemContext?.registerHostValue) {
        throw new Error("Approximate math plugin requires a SystemContext");
    }
    if (!registry?.registerAll) {
        throw new Error("Approximate math plugin requires an evaluator Registry");
    }
    registry.registerAll(mathFunctions);
    loadFloatPluginStartup(registry, systemContext);
    installFloatCompareVariant(registry);
    installRegisteredTypes(registry, typeRegistry.list(), {
        onlyFunctions: new Set(MATH_FUNCTION_NAMES),
        skipMissing: true,
        skipExisting: true,
    });
    const value = floatValue(registry);
    systemContext.registerHostCallableValue("float", value, {
        impl(args, _context, evaluate) {
            if (args[1] !== undefined && args[1] !== null) return requireFloat(makeFloat(args[0], args[1]), evaluate);
            return requireFloat(args[0], evaluate);
        },
    }, {
        doc: "Optional JavaScript Float conversion and approximate math",
        groups: ["ApproximateMath", "Float"],
    });
    const floatExtension = {
        type: "method_builtin",
        name: "Float",
        impl(args, _context, evaluate) {
            return args[1] === undefined || args[1] === null
                ? requireFloat(args[0], evaluate)
                : requireFloat(makeFloat(args[0], args[1]), evaluate);
        },
    };
    systemContext.registerMethod("Integer", "Float", floatExtension, owner);
    systemContext.registerMethod("Rational", "Float", floatExtension, owner);
    return systemContext;
}

/** @deprecated Use loadFloatPlugin. */
export const loadApproxMathPlugin = loadFloatPlugin;
