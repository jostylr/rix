import { Integer } from "@ratmath/core";
import { parse } from "../../parser/parser.js";
import { resolveMethod } from "../../runtime/methods.js";
import { lower } from "../lower.js";
import {
    createStructuralFunction,
    createStructuralOperatorTable,
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

function parseFunctionModifier(modifiers) {
    const matches = modifiers.filter((modifier) => /^FUN(?:\((.*)\))?$/iu.test(modifier));
    if (matches.length === 0) return null;
    if (matches.length > 1) throw new Error(".SArith accepts only one Fun modifier");
    const match = matches[0].match(/^FUN(?:\((.*)\))?$/iu);
    if (match[1] === undefined) return { names: null };
    const names = match[1].split(",").map((name) => name.trim()).filter(Boolean);
    if (new Set(names).size !== names.length) {
        throw new Error(".SArith.Fun parameter names must be unique");
    }
    return { names };
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
    return info.entries.get(name) ?? null;
}

function evaluateRiXExpression(source, context, evaluate) {
    const runtime = context.getEnv("__script_runtime__", null);
    const ast = parse(source, runtime?.systemLookup);
    const irNodes = lower(ast);
    if (irNodes.length === 0) {
        throw new Error("'@(expression)' must contain a RiX expression");
    }

    let value = null;
    for (const node of irNodes) value = evaluate(node);
    return value;
}

function sarithParse(args, context, evaluate) {
    const body = stringFromValue(args[1], ".SArith.Parse body");
    const modifiers = modifierNames(args[2]);
    const info = args[3];
    const unsupported = modifiers.filter((modifier) => !/^FUN(?:\(.*\))?$/iu.test(modifier));
    if (unsupported.length > 0) {
        throw new Error(`Unknown .SArith modifier${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}`);
    }

    const value = parseStructuralArithmetic(body, context, {
        evaluateRiX: (source) => evaluateRiXExpression(source, context, evaluate),
        operators: args[0]?.operators,
    });
    const explicitParameters = parseFunctionModifier(modifiers);
    const explicitFunction = explicitParameters !== null;
    const inferredFunction = infoEntry(info, "function") !== null;
    if (!explicitFunction && !inferredFunction) return value;

    const inferredNameValue = infoEntry(info, "name");
    const inferredName = inferredNameValue?.type === "string" ? inferredNameValue.value : null;
    if (explicitParameters && explicitParameters.names !== null) {
        const free = sortedStructuralFreeSymbols(value);
        const missing = free.filter((name) => !explicitParameters.names.includes(name));
        if (missing.length > 0) {
            throw new Error(`.SArith.Fun parameter list is missing free symbol${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`);
        }
    }
    return createStructuralFunction(
        value,
        context,
        inferredName,
        explicitParameters?.names ?? null,
    );
}

function mapField(map, name) {
    if (map?.type !== "map" || !(map.entries instanceof Map)) {
        throw new Error(".SArith.Configure declarations must be maps");
    }
    return map.entries.get(name);
}

function operatorDeclaration(value, context, evaluate, invoke) {
    const text = (name, fallback = null) => {
        const field = mapField(value, name);
        return field === undefined ? fallback : stringFromValue(field, `.SArith.Configure ${name}`);
    };
    const precedence = mapField(value, "precedence");
    const apply = mapField(value, "apply");
    return {
        symbol: text("symbol"),
        head: text("head"),
        fixity: text("fixity", "infix"),
        associativity: text("associativity", "left"),
        precedence: precedence instanceof Integer ? Number(precedence.value) : undefined,
        apply: apply
            ? (...args) => invoke(apply, args, context, evaluate)
            : null,
    };
}

function configureSArith(args, context, evaluate, invoke) {
    const values = args.slice(1).flatMap((value) =>
        value?.type === "sequence" ? value.values : [value]);
    const operators = createStructuralOperatorTable(
        values.map((value) => operatorDeclaration(value, context, evaluate, invoke)),
    );
    return createSArithSystemValue(operators);
}

export function createSArithSystemValue(operators = null) {
    const parseMethod = {
        type: "method_builtin",
        name: "Parse",
        impl: sarithParse,
    };
    const configureMethod = {
        type: "method_builtin",
        name: "Configure",
        impl: configureSArith,
    };
    return {
        type: "structural_parser",
        name: "SArith",
        ...(operators ? { operators } : {}),
        _ext: new Map([
            ["Parse", parseMethod],
            ["PARSE", parseMethod],
            ["Configure", configureMethod],
            ["CONFIGURE", configureMethod],
        ]),
    };
}

function polyParse(args, context, evaluate) {
    const body = stringFromValue(args[1], ".Poly.Parse body");
    const modifiers = modifierNames(args[2]);
    const unsupported = modifiers.filter((modifier) => modifier.toUpperCase() !== "FUN");
    if (unsupported.length > 0) {
        throw new Error(`Unknown .Poly modifier${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}`);
    }
    const structural = parseStructuralArithmetic(body, context, {
        evaluateRiX: (source) => evaluateRiXExpression(source, context, evaluate),
    });
    const spec = createSymbolicSpec({
        inputs: sortedStructuralFreeSymbols(structural),
        outputMode: "expression",
        expression: structuralValueToIr(structural),
        origin: ".Poly.Parse",
    }, context);
    return polyFromSpec(spec);
}

export function createPolySystemValue() {
    const parseMethod = {
        type: "method_builtin",
        name: "Parse",
        impl: polyParse,
    };
    return {
        type: "symbolic_parser",
        name: "Poly",
        _ext: new Map([
            ["Parse", parseMethod],
            ["PARSE", parseMethod],
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
        {
            type: "sequence",
            values: modifiers.map((modifier) => stringValue(
                typeof modifier === "string"
                    ? modifier
                    : `${modifier.name}(${(modifier.args || []).join(",")})`,
            )),
        },
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

function notationParserCapability(args) {
    const parseFunction = args[0];
    if (!parseFunction) throw new Error(".NotationParser requires a parse function");
    const parseMethod = {
        type: "method_builtin",
        name: "Parse",
        impl(methodArgs, context, evaluate) {
            return callWithConcreteArgs(parseFunction, methodArgs.slice(1), context, evaluate);
        },
    };
    return {
        type: "notation_parser",
        _ext: new Map([
            ["Parse", parseMethod],
            ["PARSE", parseMethod],
        ]),
    };
}

export const notationParserFunction = {
    impl: notationParserCapability,
    doc: "Wrap a RiX callable as a registered backtick parser object",
};

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
                impl(args, context, evaluate) {
                    const body = args[0];
                    const modifiers = args[1] || { type: "sequence", values: [] };
                    const info = args[2] || { type: "map", entries: new Map() };
                    return sarithParse([value, body, modifiers, info], context, evaluate);
                },
                doc: "Parse structural arithmetic; backticks use this parser by default",
            },
        };
    },
};
