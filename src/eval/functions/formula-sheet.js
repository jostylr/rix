import { createFormulaSheet } from "../../runtime/formula-sheet.js";
import { tokenize } from "../../parser/tokenizer.js";
import { isReactiveNode, REACTIVE_READ_ENV } from "../../runtime/reactive-graph.js";

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

function formulaSheetCapability(args, context, evaluate) {
    if (args.length !== 1) throw new Error(".FormulaSheet expects one rectangular array of deferred formulas");
    return createFormulaSheet(args[0], {
        formulaSource: deferredSource,
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
        doc: "Create a formula-backed sheet from a rectangular array of deferred RiX formulas",
    },
};
