/**
 * Comparison system functions: EQ, NEQ, LT, GT, LTE, GTE, SAME_CELL
 *
 * Return Integer(1) for true, null for false.
 * (In RiX, only null is falsy; 0 is truthy.)
 */

import { Integer, Rational } from "@ratmath/core";

function compare(a, b) {
    // Both have .equals and .subtract (ratmath types)
    if (a && b && typeof a.subtract === "function" && typeof b.subtract === "function") {
        const diff = a.subtract(b);
        if (typeof diff.sign === "function") return Number(diff.sign().value ?? diff.sign());
        if (typeof diff.numerator === "bigint") {
            if (diff.numerator < 0n) return -1;
            if (diff.numerator > 0n) return 1;
            return 0;
        }
        if (typeof diff.value === "bigint") {
            if (diff.value < 0n) return -1;
            if (diff.value > 0n) return 1;
            return 0;
        }
    }
    const valA = a && a.type === "string" ? a.value : a;
    const valB = b && b.type === "string" ? b.value : b;
    // Fallback for primitives
    if (valA < valB) return -1;
    if (valA > valB) return 1;
    return 0;
}

function boolResult(val) {
    return val ? new Integer(1) : null;
}

function classifyMinMaxType(val) {
    if (val === null || val === undefined) return null;
    if (val instanceof Integer || val instanceof Rational) return "number";
    if (typeof val === "number" || typeof val === "bigint") return "number";
    if (typeof val === "string") return "string";
    if (val && typeof val === "object" && val.type === "string") return "string";
    return "invalid";
}

/**
 * Resolve an IR node to its Cell reference (if it names a variable).
 * Returns the Cell object or null if the node is not a simple variable reference.
 */
function resolveCell(irNode, context) {
    if (!irNode || typeof irNode !== "object") return null;
    if (irNode.fn === "RETRIEVE") {
        return context.getCell(irNode.args[0]);
    }
    if (irNode.fn === "OUTER_RETRIEVE") {
        return context.getOuterCell(irNode.args[0]);
    }
    return null;
}

function comparisonInteger(value) {
    if (value instanceof Integer && [-1n, 0n, 1n].includes(value.value)) return Number(value.value);
    throw new Error("COMPARE variants must return -1, 0, or 1 as a RiX integer");
}

function minMaxImpl(args, mode, context, evaluate) {
    const filtered = args.filter((v) => v !== null && v !== undefined);
    if (filtered.length === 0) {
        throw new Error(`${mode} requires at least one non-null comparable argument`);
    }
    let best = filtered[0];
    for (let i = 1; i < filtered.length; i++) {
        const registry = context?.getEnv?.("__registry__", null);
        if (!registry?.invokeWithVariant) {
            throw new Error(`${mode} requires an active evaluator registry`);
        }
        const invocation = registry.invokeWithVariant("COMPARE", [filtered[i], best], context, evaluate);
        const c = comparisonInteger(invocation.value);
        // A type's compare variant may promote both values. Carry that result
        // forward so Min/Max returns a value in the chosen common domain.
        const [candidate, normalizedBest] = invocation.args;
        if ((mode === "MIN" && c < 0) || (mode === "MAX" && c > 0)) {
            best = candidate;
        } else {
            best = normalizedBest;
        }
    }
    return best;
}

export const comparisonFunctions = {
    COMPARE: {
        impl(args) {
            const leftType = classifyMinMaxType(args[0]);
            const rightType = classifyMinMaxType(args[1]);
            if (!leftType || leftType === "invalid" || leftType !== rightType) {
                throw new Error("COMPARE requires two values from the same built-in ordered domain");
            }
            const result = compare(args[0], args[1]);
            return new Integer(BigInt(result < 0 ? -1 : result > 0 ? 1 : 0));
        },
        pure: true,
        doc: "Compare two values; returns -1, 0, or 1",
    },
    EQ: {
        impl(args) {
            const [a, b] = args;
            if (a && b && typeof a.equals === "function") {
                return boolResult(a.equals(b));
            }
            if (a && b && a.type === "string" && b.type === "string") return boolResult(a.value === b.value); return boolResult(a === b);
        },
        pure: true,
        doc: "Equality check — returns 1 or null",
    },

    NEQ: {
        impl(args) {
            const [a, b] = args;
            if (a && b && typeof a.equals === "function") {
                return boolResult(!a.equals(b));
            }
            if (a && b && a.type === "string" && b.type === "string") return boolResult(a.value !== b.value); return boolResult(a !== b);
        },
        pure: true,
        doc: "Inequality check — returns 1 or null",
    },

    LT: {
        impl(args) {
            return boolResult(compare(args[0], args[1]) < 0);
        },
        pure: true,
        doc: "Less than — returns 1 or null",
    },

    GT: {
        impl(args) {
            return boolResult(compare(args[0], args[1]) > 0);
        },
        pure: true,
        doc: "Greater than — returns 1 or null",
    },

    LTE: {
        impl(args) {
            return boolResult(compare(args[0], args[1]) <= 0);
        },
        pure: true,
        doc: "Less than or equal — returns 1 or null",
    },

    GTE: {
        impl(args) {
            return boolResult(compare(args[0], args[1]) >= 0);
        },
        pure: true,
        doc: "Greater than or equal — returns 1 or null",
    },

    SAME_CELL: {
        lazy: true,
        impl(args, context, evalFn) {
            // Resolve Cell references for both sides
            const leftCell = resolveCell(args[0], context);
            const rightCell = resolveCell(args[1], context);
            if (leftCell && rightCell && leftCell === rightCell) {
                return new Integer(1);
            }
            return null;
        },
        doc: "Identity comparison (===) — returns 1 if both sides refer to the same cell, null otherwise",
    },

    MIN: {
        impl(args, context, evaluate) {
            return minMaxImpl(args, "MIN", context, evaluate);
        },
        pure: true,
        doc: "Minimum over n arguments (ignores nulls)",
    },

    MAX: {
        impl(args, context, evaluate) {
            return minMaxImpl(args, "MAX", context, evaluate);
        },
        pure: true,
        doc: "Maximum over n arguments (ignores nulls)",
    },
};
