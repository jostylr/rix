import { Integer, Rational } from "@ratmath/core";
import { createEvent, getCurrentFilePath, getDiagnostics } from "../../runtime/diagnostics.js";
import { runtimeDefaults } from "../../runtime/runtime-config.js";
import {
    addScalars,
    divideScalars,
    equalScalars,
    exactGeneratorFromPolynomial,
    isExactValue,
    multiplyScalars,
    negateScalar,
    powScalar,
    subtractScalars,
} from "../../runtime/exact-values.js";
import {
    addQuantities,
    compareQuantities,
    constructQuantity,
    convertQuantity,
    defineUnitFromValue,
    divideQuantityValues,
    divideUnits,
    invertUnit,
    isQuantity,
    isScalar,
    isUnitValue,
    formatUnit,
    multiplyQuantityValues,
    multiplyUnits,
    negateQuantity,
    parseUnitExpression,
    powQuantity,
    powUnit,
    quantitiesEqual,
    subtractQuantities,
    unitName,
    unitsEquivalent,
} from "../../runtime/quantities.js";

function int(value) {
    return new Integer(BigInt(value));
}

function stringValue(value, label) {
    if (typeof value === "string") return value;
    if (value?.type === "string") return value.value;
    throw new Error(`${label} must be a string or colon string`);
}

function systemValue(systemContext, ...names) {
    for (const name of names) {
        const entry = systemContext?.get?.(name);
        if (entry?.kind === "value") return entry.value;
    }
    return null;
}

function activeCollection(context, systemContext, lexicalName, systemNames) {
    const lexical = context?.get?.(lexicalName) ?? context?.get?.(lexicalName.toUpperCase());
    if (lexical !== undefined) {
        if (lexical?.type !== "map" || !(lexical.entries instanceof Map)) {
            throw new Error(`${lexicalName} must be a RiX map collection`);
        }
        return lexical;
    }
    const fromArgument = systemValue(systemContext, ...systemNames);
    if (fromArgument) return fromArgument;
    const storedContext = context?.getEnv?.("__system_context__");
    const fromEnvironment = systemValue(storedContext, ...systemNames);
    if (fromEnvironment) return fromEnvironment;
    throw new Error(`No active ${lexicalName} collection`);
}

function exactEntry(collection, name) {
    if (!collection || collection.type !== "map" || !(collection.entries instanceof Map)) {
        throw new Error("Active Exact value must be a RiX map collection");
    }
    const value = collection.entries.get(name);
    if (!isExactValue(value) && !isScalar(value)) throw new Error(`Unknown exact generator '${name}'`);
    return value;
}

function parseExactExpression(source, collection) {
    const input = String(source).replace(/\s+/g, "");
    let index = 0;

    function primary() {
        if (input[index] === "(") {
            index++;
            const value = product();
            if (input[index] !== ")") throw new Error(`Expected ')' in exact expression '${source}'`);
            index++;
            return value;
        }
        const match = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(input.slice(index));
        if (!match) throw new Error(`Invalid exact expression '${source}' at character ${index + 1}`);
        index += match[0].length;
        return exactEntry(collection, match[0]);
    }

    function power() {
        let value = primary();
        if (input[index] === "^") {
            index++;
            const match = /^-?\d+/.exec(input.slice(index));
            if (!match) throw new Error(`Expected integer exponent in exact expression '${source}'`);
            index += match[0].length;
            value = powScalar(value, int(match[0]));
        }
        return value;
    }

    function product() {
        let value = power();
        while (input[index] === "*" || input[index] === "/") {
            const operator = input[index++];
            const right = power();
            value = operator === "*" ? multiplyScalars(value, right) : divideScalars(value, right);
        }
        return value;
    }

    if (!input) throw new Error("Exact expression cannot be empty");
    const result = product();
    if (index !== input.length) throw new Error(`Invalid trailing input in exact expression '${source}'`);
    return result;
}

function multiplyWithUnits(left, right) {
    if (isUnitValue(left) && isUnitValue(right)) return multiplyUnits(left, right);
    if (isUnitValue(left) && isScalar(right)) return constructQuantity(right, left);
    if (isScalar(left) && isUnitValue(right)) return constructQuantity(left, right);
    if (isQuantity(left) && isUnitValue(right)) {
        return multiplyQuantityValues(left, constructQuantity(int(1), right));
    }
    if (isUnitValue(left) && isQuantity(right)) {
        return multiplyQuantityValues(constructQuantity(int(1), left), right);
    }
    return multiplyQuantityValues(left, right);
}

function divideWithUnits(left, right) {
    if (isUnitValue(left) && isUnitValue(right)) return divideUnits(left, right);
    if (isScalar(left) && isUnitValue(right)) return constructQuantity(left, invertUnit(right));
    if (isUnitValue(left) && isScalar(right)) return constructQuantity(divideScalars(int(1), right), left);
    if (isQuantity(left) && isUnitValue(right)) {
        return divideQuantityValues(left, constructQuantity(int(1), right));
    }
    if (isUnitValue(left) && isQuantity(right)) {
        return divideQuantityValues(constructQuantity(int(1), left), right);
    }
    return divideQuantityValues(left, right);
}

function resolveTargetUnit(target, context, systemContext) {
    if (isUnitValue(target)) return target;
    const text = stringValue(target, "ConvertUnit target");
    const collection = activeCollection(context, systemContext, "Units", ["UNITS", "Units"]);
    return parseUnitExpression(text, collection);
}

export const unitExactFunctions = {
    UNIT: {
        impl(args, context, _evaluate, systemContext) {
            const collection = activeCollection(context, systemContext, "Units", ["UNITS", "Units"]);
            const unit = parseUnitExpression(args[1], collection);
            return multiplyWithUnits(args[0], unit);
        },
        pure: true,
        doc: "Resolve scientific unit sugar through the active Units RiX collection",
    },

    MATHUNIT: {
        impl(args, context, _evaluate, systemContext) {
            const collection = activeCollection(context, systemContext, "Exact", ["EXACT", "Exact"]);
            return multiplyScalars(args[0], parseExactExpression(args[1], collection));
        },
        pure: true,
        doc: "Resolve exact-generator sugar through the active Exact RiX collection",
    },

    CONVERTUNIT: {
        impl(args, context) {
            const systemContext = context?.getEnv?.("__system_context__");
            return convertQuantity(args[0], resolveTargetUnit(args[1], context, systemContext));
        },
        pure: true,
        doc: "Convert a quantity to a compatible display unit",
    },

    DEFINEUNIT: {
        impl(args) {
            return defineUnitFromValue(args[0], args[1]);
        },
        pure: true,
        doc: "Create a linear Unit value from a name and Unit/Quantity definition",
    },

    DEFINEEXACTGENERATOR: {
        impl(args) {
            return exactGeneratorFromPolynomial(unitName(args[0]), args[1]);
        },
        pure: true,
        doc: "Create an algebraic exact generator from low-to-high polynomial coefficients",
    },
};

function boolResult(value) {
    return value ? int(1) : null;
}

function addWithOptionalWarning([left, right], context) {
    const warnings = context?.getEnv?.("warnings", runtimeDefaults.warnings) ?? runtimeDefaults.warnings;
    if (warnings.implicitUnitConversion && formatUnit(left.displayUnit) !== formatUnit(right.displayUnit)) {
        getDiagnostics(context).addEvent(createEvent({
            kind: "warning",
            label: "Implicit unit conversion",
            file: getCurrentFilePath(context),
            data: {
                type: "map",
                entries: new Map([
                    ["from", { type: "string", value: formatUnit(right.displayUnit) }],
                    ["to", { type: "string", value: formatUnit(left.displayUnit) }],
                ]),
            },
        }));
    }
    return addQuantities(left, right);
}

function exactArgs(args) {
    return args.length === 2 && args.some(isExactValue) && args.every(isScalar);
}

function unitArgs(args) {
    return args.length === 2 && args.some((value) => isUnitValue(value) || isQuantity(value));
}

export function installUnitExactVariants(registry) {
    const exactVariants = {
        ADD: ([a, b]) => addScalars(a, b),
        SUB: ([a, b]) => subtractScalars(a, b),
        MUL: ([a, b]) => multiplyScalars(a, b),
        DIV: ([a, b]) => divideScalars(a, b),
        POW: ([a, b]) => powScalar(a, b),
        EQ: ([a, b]) => boolResult(equalScalars(a, b)),
        NEQ: ([a, b]) => boolResult(!equalScalars(a, b)),
    };
    for (const [name, impl] of Object.entries(exactVariants)) {
        registry.installVariant(name, {
            name: `Exact_${name}`,
            prep: (args) => name === "POW" ? args.length === 2 && isExactValue(args[0]) : exactArgs(args),
            impl,
        });
    }
    registry.installVariant("NEG", {
        name: "Exact_NEG",
        prep: (args) => args.length === 1 && isExactValue(args[0]),
        impl: ([value]) => negateScalar(value),
    });

    const unitVariants = {
        ADD: addWithOptionalWarning,
        SUB: ([a, b]) => subtractQuantities(a, b),
        MUL: ([a, b]) => multiplyWithUnits(a, b),
        DIV: ([a, b]) => divideWithUnits(a, b),
        POW: ([a, b]) => isUnitValue(a) ? powUnit(a, b) : powQuantity(a, b),
        EQ: ([a, b]) => boolResult(isQuantity(a) && isQuantity(b) ? quantitiesEqual(a, b) : unitsEquivalent(a, b)),
        NEQ: ([a, b]) => boolResult(isQuantity(a) && isQuantity(b) ? !quantitiesEqual(a, b) : !unitsEquivalent(a, b)),
        LT: ([a, b]) => boolResult(compareQuantities(a, b) < 0),
        GT: ([a, b]) => boolResult(compareQuantities(a, b) > 0),
        LTE: ([a, b]) => boolResult(compareQuantities(a, b) <= 0),
        GTE: ([a, b]) => boolResult(compareQuantities(a, b) >= 0),
    };
    for (const [name, impl] of Object.entries(unitVariants)) {
        registry.installVariant(name, {
            name: `Units_${name}`,
            prep: (args) => {
                if (name === "POW") return args.length === 2 && (isUnitValue(args[0]) || isQuantity(args[0]));
                if (["ADD", "SUB", "LT", "GT", "LTE", "GTE"].includes(name)) {
                    return args.length === 2 && args.every(isQuantity);
                }
                return unitArgs(args);
            },
            impl,
        });
    }
    registry.installVariant("NEG", {
        name: "Units_NEG",
        prep: (args) => args.length === 1 && isQuantity(args[0]),
        impl: ([value]) => negateQuantity(value),
    });
}
