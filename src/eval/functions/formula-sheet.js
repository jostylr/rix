import { createFormulaSheet } from "../../runtime/formula-sheet.js";

function containsOuterRead(node) {
    if (!node || typeof node !== "object") return false;
    if (node.fn === "OUTER_RETRIEVE") return true;
    if (Array.isArray(node)) return node.some(containsOuterRead);
    return Array.isArray(node.args) && node.args.some(containsOuterRead);
}

function formulaSheetCapability(args, context, evaluate) {
    if (args.length !== 1) throw new Error(".FormulaSheet expects one rectangular array of deferred formulas");
    return createFormulaSheet(args[0], {
        runFormula(formula, bindings) {
            if (containsOuterRead(formula.args[0])) {
                throw new Error("FormulaSheet formulas cannot access caller bindings with @; use explicit sheet imports");
            }
            context.push(new Map(Object.entries(bindings)), {
                isolated: true,
                callableBoundary: true,
            });
            try {
                return context.withSharedBody(formula.args[0], () => evaluate(formula.args[0]));
            } finally {
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
