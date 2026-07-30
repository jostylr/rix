import { createFormulaSheet } from "../../runtime/formula-sheet.js";
import { tokenize } from "../../parser/tokenizer.js";
import { parse } from "../../parser/parser.js";
import { lower } from "../lower.js";
import { isReactiveNode, REACTIVE_READ_ENV } from "../../runtime/reactive-graph.js";
import { createSystemLookup } from "../../runtime/system-manifest.js";

export function containsOuterRead(node) {
    if (!node || typeof node !== "object") return false;
    if (node.fn === "OUTER_RETRIEVE") return true;
    if (Array.isArray(node)) return node.some(containsOuterRead);
    return Array.isArray(node.args) && node.args.some(containsOuterRead);
}

export function deferredSource(formula) {
    const source = formula?.__source;
    const start = formula?.pos?.[1] ?? formula?.pos?.[0];
    if (typeof source !== "string" || !Number.isInteger(start)) return null;
    const tokens = tokenize(source);
    const atIndex = tokens.findIndex((token) => token.value === "@" && token.pos?.[1] === start);
    if (atIndex === -1) return null;
    const open = tokens[atIndex + 1];
    if (!open || !String(open.value).startsWith("{")) return null;
    let depth = 0;
    for (let index = atIndex + 1; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (String(token.value).startsWith("{")) depth += 1;
        else if (token.value === "}") depth -= 1;
        if (depth === 0) {
            return source.slice(open.pos[2], token.pos[1]).trim();
        }
    }
    return null;
}

function formulaSheetCapability(args, context, evaluate, systemContext) {
    if (args.length < 1 || args.length > 2) {
        throw new Error(".FormulaSheet expects deferred formulas and an optional options map");
    }
    const optionEntries = args[1]?.type === "map" && args[1].entries instanceof Map
        ? args[1].entries
        : args[1] === undefined
            ? new Map()
            : null;
    if (!optionEntries) throw new Error(".FormulaSheet options must be a map");
    const option = (name, fallback = null) =>
        optionEntries.get(name) ?? optionEntries.get(name.toLowerCase()) ?? fallback;
    const stringOption = (name, fallback = null) => {
        const value = option(name);
        if (value === null) return fallback;
        const text = value?.type === "string" ? value.value : typeof value === "string" ? value : null;
        if (text === null) throw new Error(`FormulaSheet ${name} must be a string`);
        return text;
    };
    return createFormulaSheet(args[0], {
        id: stringOption("id"),
        assignmentMode: stringOption("assignmentMode", ":="),
        formulaSource: deferredSource,
        compileFormula(source) {
            const wrapped = `@{ ${source}\n}`;
            const nodes = lower(parse(wrapped, createSystemLookup(systemContext)));
            if (nodes.length !== 1 || nodes[0]?.fn !== "DEFER") {
                throw new Error("FormulaSheet source must compile to one deferred formula");
            }
            const attachSource = (node, seen = new Set()) => {
                if (!node || typeof node !== "object" || seen.has(node)) return;
                seen.add(node);
                if (Array.isArray(node)) {
                    for (const item of node) attachSource(item, seen);
                    return;
                }
                if (node.fn) {
                    Object.defineProperty(node, "__source", {
                        value: wrapped,
                        enumerable: false,
                        configurable: true,
                    });
                }
                for (const arg of node.args || []) attachSource(arg, seen);
            };
            attachSource(nodes[0]);
            return nodes[0];
        },
        runFormula(formula, bindings, runOptions = {}) {
            if (containsOuterRead(formula.args[0])) {
                throw new Error("FormulaSheet formulas cannot access caller bindings with @; use explicit sheet imports");
            }
            const reactiveGraph = runOptions.reactiveGraph || null;
            const previousRead = context.getEnv(REACTIVE_READ_ENV, undefined);
            context.push(new Map(Object.entries(bindings)), {
                isolated: true,
                callableBoundary: true,
            });
            context.setEnv(REACTIVE_READ_ENV, (value) => {
                if (reactiveGraph && isReactiveNode(value) && value.graph === reactiveGraph) return value.get();
                return typeof previousRead === "function" ? previousRead(value) : value;
            });
            try {
                return context.withSharedBody(formula.args[0], () => evaluate(formula.args[0]));
            } finally {
                context.setEnv(REACTIVE_READ_ENV, previousRead);
                context.pop();
            }
        },
    });
}

export const formulaSheetFunctions = {
    FORMULASHEET: {
        pure: false,
        impl: formulaSheetCapability,
        doc: "Create a formula-backed sheet from a tensor or rectangular array of deferred RiX formulas",
    },
};
