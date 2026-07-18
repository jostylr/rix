/**
 * Optional host plugin for JavaScript-number transcendental math.
 *
 * It deliberately lives outside the default RiX system context so hosts can
 * substitute interval, arbitrary-precision, or domain-specific behavior.
 */

import { MATH_FUNCTION_NAMES, mathFunctions } from "../../src/eval/functions/math.js";
import { installRegisteredTypes, typeRegistry } from "../../src/runtime/type-system.js";
import { loadFloatExampleStartup } from "../floats/floats-loader.js";
import { Rational, RationalInterval } from "@ratmath/core";

const FLOAT_METHOD_NAMES = ["ABS", "SQRT", ...MATH_FUNCTION_NAMES];

function displayName(name) {
    return name[0] + name.slice(1).toLowerCase();
}

function requireFloat(value, evaluate) {
    return evaluate({
        fn: "SEMANTIC_CONVERT_STRICT",
        args: [value, "Float"],
    });
}

function exactFloatRational(float) {
    const value = float?.value;
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error("Float exact conversion requires a finite Float");
    }
    if (value === 0) return new Rational(0n, 1n);

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
            return evaluate({
                fn: "SEMANTIC_CONVERT_STRICT",
                args: [args[1], "Float"],
            });
        },
    };
    entries.set("Float", convert);
    extension.set("FLOAT", convert);

    const interval = {
        type: "method_builtin",
        name: "Interval",
        impl(args, _context, evaluate) {
            const exact = exactFloatRational(requireFloat(args[1], evaluate));
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
export function loadApproxMathPlugin(systemContext, registry) {
    if (!systemContext?.registerHostValue) {
        throw new Error("Approximate math plugin requires a SystemContext");
    }
    if (!registry?.registerAll) {
        throw new Error("Approximate math plugin requires an evaluator Registry");
    }
    registry.registerAll(mathFunctions);
    loadFloatExampleStartup(registry, systemContext);
    installRegisteredTypes(registry, typeRegistry.list(), {
        onlyFunctions: new Set(MATH_FUNCTION_NAMES),
        skipMissing: true,
        skipExisting: true,
    });
    const value = floatValue(registry);
    systemContext.registerHostCallableValue("float", value, {
        impl(args, _context, evaluate) {
            return requireFloat(args[0], evaluate);
        },
    }, {
        doc: "Optional JavaScript Float conversion and approximate math",
        groups: ["ApproximateMath", "Float"],
    });
    return systemContext;
}

export const loadFloatPlugin = loadApproxMathPlugin;
