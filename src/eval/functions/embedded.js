import { Integer } from "@ratmath/core";
import { resolveMethod } from "../../runtime/methods.js";
import {
    createStructuralFunction,
    parseStructuralArithmetic,
    resolveStructuralValue,
    sortedStructuralFreeSymbols,
    structuralValueToIr,
} from "../../runtime/structural-arithmetic.js";
import { callWithConcreteArgs } from "./functions.js";
import { createSymbolicSpec, polyFromSpec } from "./symbolic.js";

function stringValue(value) {
    return { type: "string", value: String(value) };
}

function stringFromValue(value, label) {
    if (value?.type === "string") return value.value;
    if (typeof value === "string") return value;
    throw new Error(`${label} must be a string`);
}

function modifierNames(value) {
    if (!value) return [];
    if (!Array.isArray(value.values)) throw new Error("Embedded parser modifiers must be a sequence");
    return value.values.map((item) => stringFromValue(item, "Embedded parser modifier"));
}

function parseInfoValue(meta = {}) {
    const entries = new Map();
    entries.set("function", meta.expectedFunction ? new Integer(1n) : null);
    entries.set("name", meta.inferredName ? stringValue(meta.inferredName) : null);
    entries.set("explicit", meta.explicitParser ? new Integer(1n) : null);
    return { type: "map", entries };
}

function infoEntry(info, name) {
    if (info?.type !== "map" || !(info.entries instanceof Map)) return null;
    return info.entries.get(name);
}

function sarithParse(args, context) {
    const body = stringFromValue(args[1], ".SArith.Parse body");
    const modifiers = modifierNames(args[2]);
    const info = args[3];
    const unsupported = modifiers.filter((modifier) => modifier.toUpperCase() !== "FUN");
    if (unsupported.length > 0) {
        throw new Error(`Unknown .SArith modifier${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}`);
    }

    const value = parseStructuralArithmetic(body, context);
    const explicitFunction = modifiers.some((modifier) => modifier.toUpperCase() === "FUN");
    const inferredFunction = infoEntry(info, "function") !== null;
    if (!explicitFunction && !inferredFunction) return value;

    const inferredNameValue = infoEntry(info, "name");
    const inferredName = inferredNameValue?.type === "string" ? inferredNameValue.value : null;
    return createStructuralFunction(value, context, inferredName);
}

export function createSArithSystemValue() {
    return {
        type: "structural_parser",
        name: "SArith",
        _ext: new Map([
            ["Parse", {
                type: "method_builtin",
                name: "Parse",
                impl: sarithParse,
            }],
        ]),
    };
}

function polyParse(args, context) {
    const body = stringFromValue(args[1], ".Poly.Parse body");
    const modifiers = modifierNames(args[2]);
    const unsupported = modifiers.filter((modifier) => modifier.toUpperCase() !== "FUN");
    if (unsupported.length > 0) {
        throw new Error(`Unknown .Poly modifier${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}`);
    }
    const structural = parseStructuralArithmetic(body, context);
    const spec = createSymbolicSpec({
        inputs: sortedStructuralFreeSymbols(structural),
        outputMode: "expression",
        expression: structuralValueToIr(structural),
        origin: ".Poly.Parse",
    }, context);
    return polyFromSpec(spec);
}

export function createPolySystemValue() {
    return {
        type: "symbolic_parser",
        name: "Poly",
        _ext: new Map([
            ["Parse", {
                type: "method_builtin",
                name: "Parse",
                impl: polyParse,
            }],
        ]),
    };
}

function callRegisteredParser(parserName, body, modifiers, meta, context, evaluate, systemContext) {
    if (!systemContext) throw new Error("No system context is available for embedded parsing");
    const entry = systemContext.get(parserName);
    if (!entry) {
        throw new Error(`Unknown backtick parser '.${parserName}'`);
    }
    if (!Object.prototype.hasOwnProperty.call(entry, "value")) {
        throw new Error(`Backtick parser '.${entry.displayName}' must be a registered object exposing .Parse`);
    }

    const parserObject = entry.value;
    let parseMethod;
    try {
        parseMethod = resolveMethod(parserObject, "Parse");
    } catch {
        throw new Error(`Backtick parser '.${entry.displayName}' does not expose a callable .Parse method`);
    }

    const callArgs = [
        stringValue(body),
        { type: "sequence", values: modifiers.map(stringValue) },
        parseInfoValue(meta),
    ];
    if (parseMethod?.type === "method_builtin") {
        return parseMethod.impl(
            [parserObject, ...callArgs],
            context,
            evaluate,
            callWithConcreteArgs,
        );
    }
    return callWithConcreteArgs(parseMethod, [parserObject, ...callArgs], context, evaluate);
}

export const embeddedFunctions = {
    EMBEDDED: {
        impl(args, context, evaluate, systemContext) {
            const parserName = args[0] || "SArith";
            const modifiers = Array.isArray(args[1]) ? args[1] : [];
            const body = args[2] ?? "";
            const meta = args[3] || {};

            if (parserName === "RiX-String") return stringValue(body);
            return callRegisteredParser(
                parserName,
                body,
                modifiers,
                meta,
                context,
                evaluate,
                systemContext,
            );
        },
        doc: "Dispatch a backtick body to a registered .Name.Parse parser",
    },

    SARITH_FUNCTION_BODY: {
        impl(args, context) {
            return resolveStructuralValue(args[0], context);
        },
        doc: "Resolve a structural-arithmetic function template against its arguments",
    },
};

export const sArithCapability = {
    create() {
        const value = createSArithSystemValue();
        return {
            value,
            definition: {
                impl(args, context) {
                    const body = args[0];
                    const modifiers = args[1] || { type: "sequence", values: [] };
                    const info = args[2] || { type: "map", entries: new Map() };
                    return sarithParse([value, body, modifiers, info], context);
                },
                doc: "Parse structural arithmetic; backticks use this parser by default",
            },
        };
    },
};
