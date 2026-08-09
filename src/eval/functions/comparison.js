/**
 * Comparison system functions: EQ, NEQ, LT, GT, LTE, GTE, SAME_CELL
 *
 * Return Integer(1) for true, null for false.
 * (In RiX, only null is falsy; 0 is truthy.)
 */

import {
    CertifiedApproximation,
    Integer,
    Rational,
    RationalInterval,
    Relation,
    possibleRelations,
} from "@ratmath/core";
import { UNDECIDED, isUndecided, undecidedDiagnostic } from "../../runtime/decision.js";
import { HaloNeighborhood } from "../../runtime/halo.js";
import {
    normalizeRefinementRequest,
    refinementEntry,
    refinementMap,
    refinementOutcome,
    refinementSupports,
} from "../../runtime/refinement.js";
import { resolveMethod } from "../../runtime/methods.js";
import { callWithConcreteArgs } from "./functions.js";

function haloRequest(halo, purpose, capabilities = null) {
    const entries = new Map(halo.limits?.entries ?? []);
    entries.set("absolutewidth", halo.epsilon);
    entries.set("purpose", { type: "string", value: purpose });
    return normalizeRefinementRequest(refinementMap(entries), {
        operation: { type: "string", value: "refine" },
        capabilities,
    });
}

export function maybeRefineForHalo(value, halo, operation, context, evaluate) {
    if (!(halo instanceof HaloNeighborhood)) return { value, diagnostic: null };
    if (isEnclosed(value) || value instanceof Integer || value instanceof Rational) return { value, diagnostic: null };
    let method;
    try {
        method = resolveMethod(value, "REFINE", context);
    } catch (error) {
        if (/Method not found/.test(error?.message || "")) {
            return { value, diagnostic: undecidedDiagnostic("unsupported", refinementMap([
                ["operation", { type: "string", value: "refine" }],
            ])) };
        }
        throw error;
    }
    const invokeMethod = (resolved, args) => resolved.type === "method_builtin"
        ? resolved.impl(args, context, evaluate, callWithConcreteArgs)
        : callWithConcreteArgs(resolved, args, context, evaluate);
    let capabilitiesMethod = null;
    try {
        capabilitiesMethod = resolveMethod(value, "NUMERICSCAPABILITIES", context);
    } catch (error) {
        if (!/Method not found/.test(error?.message || "")) throw error;
    }
    const capabilities = capabilitiesMethod ? invokeMethod(capabilitiesMethod, [value]) : null;
    if (capabilities && typeof capabilities.then === "function") {
        throw new Error("Async halo capabilities require an async comparison context");
    }
    if (capabilities === null) {
        return { value, diagnostic: undecidedDiagnostic("unsupported", refinementMap([
            ["operation", { type: "string", value: "refine" }],
            ["diagnostics", { type: "sequence", values: [{ type: "string", value: "missingNumericsCapabilities" }] }],
        ])) };
    }
    const request = haloRequest(halo, operation, capabilities);
    if (capabilities !== null && !refinementSupports(capabilities, "refine")) {
        const reason = refinementEntry(capabilities, "certified", null) === null
            ? "providerUncertified"
            : "unsupported";
        return { value, diagnostic: undecidedDiagnostic(reason, refinementMap([
            ["operation", { type: "string", value: "refine" }],
            ["backend", refinementEntry(capabilities, "backend", null)],
            ["capabilities", capabilities],
        ])) };
    }
    const result = invokeMethod(method, [value, request]);
    if (result && typeof result.then === "function") {
        throw new Error("Async halo refinement requires an async comparison context");
    }
    const outcome = refinementOutcome(result, request, capabilities);
    return {
        value: outcome.value ?? value,
        diagnostic: outcome.value === null ? undecidedDiagnostic(outcome.reason, outcome.details) :
            outcome.reason === "haloResolutionReached" ? null : undecidedDiagnostic(outcome.reason, outcome.details),
    };
}

function isEnclosed(value) {
    return value instanceof CertifiedApproximation || value instanceof RationalInterval;
}

function relationDecision(a, b, operation) {
    if (!isEnclosed(a) && !isEnclosed(b)) return null;
    const mask = possibleRelations(a, b);
    switch (operation) {
    case "eq": return mask === Relation.EQUAL ? true : (mask & Relation.EQUAL) === 0 ? false : UNDECIDED;
    case "neq": return mask === Relation.EQUAL ? false : (mask & Relation.EQUAL) === 0 ? true : UNDECIDED;
    case "lt": return mask === Relation.LESS ? true : (mask & Relation.LESS) === 0 ? false : UNDECIDED;
    case "gt": return mask === Relation.GREATER ? true : (mask & Relation.GREATER) === 0 ? false : UNDECIDED;
    case "lte": return (mask & Relation.GREATER) === 0 ? true : mask === Relation.GREATER ? false : UNDECIDED;
    case "gte": return (mask & Relation.LESS) === 0 ? true : mask === Relation.LESS ? false : UNDECIDED;
    default: throw new Error(`Unknown relation operation '${operation}'`);
    }
}

function haloDecision(left, right, operation, unresolvedDiagnostic = null) {
    if (!(right instanceof HaloNeighborhood)) return null;
    if (unresolvedDiagnostic && !isEnclosed(left) && !(left instanceof Integer || left instanceof Rational)) {
        return unresolvedDiagnostic;
    }
    if (right.target instanceof RationalInterval) {
        throw new Error(`Relational halo target for '${operation}' must be an exact scalar`);
    }
    const mask = possibleRelations(left, right.target);
    const unresolved = () => unresolvedDiagnostic ?? undecidedDiagnostic("haloResolutionReached", {
        type: "map",
        entries: new Map([
            ["epsilon", right.epsilon],
            ["limits", right.limits],
        ]),
    });
    switch (operation) {
    case "eq": return mask === Relation.EQUAL ? true : (mask & Relation.EQUAL) === 0 ? false : unresolved();
    case "neq": return mask === Relation.EQUAL ? false : (mask & Relation.EQUAL) === 0 ? true : unresolved();
    case "lt": return mask === Relation.LESS ? true : (mask & Relation.LESS) === 0 ? false : unresolved();
    case "gt": return mask === Relation.GREATER ? true : (mask & Relation.GREATER) === 0 ? false : unresolved();
    case "lte": return (mask & Relation.GREATER) === 0 ? true : mask === Relation.GREATER ? false : unresolved();
    case "gte": return (mask & Relation.LESS) === 0 ? true : mask === Relation.LESS ? false : unresolved();
    default: throw new Error(`Unknown halo relation '${operation}'`);
    }
}

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
    if (isUndecided(val)) return val;
    return val ? new Integer(1) : null;
}

function classifyMinMaxType(val) {
    if (val === null || val === undefined) return null;
    if (val instanceof Integer || val instanceof Rational || isEnclosed(val)) return "number";
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
        if (isUndecided(invocation.value)) return UNDECIDED;
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
            if (isEnclosed(args[0]) || isEnclosed(args[1])) {
                const mask = possibleRelations(args[0], args[1]);
                if (mask === Relation.LESS) return new Integer(-1n);
                if (mask === Relation.EQUAL) return new Integer(0n);
                if (mask === Relation.GREATER) return new Integer(1n);
                return UNDECIDED;
            }
            return new Integer(BigInt(result < 0 ? -1 : result > 0 ? 1 : 0));
        },
        pure: true,
        doc: "Compare two values; returns -1, 0, or 1",
    },
    EQ: {
        impl(args, context, evaluate) {
            const [rawA, b] = args;
            const refinement = maybeRefineForHalo(rawA, b, "eq", context, evaluate);
            const a = refinement.value;
            const decision = haloDecision(a, b, "eq", refinement.diagnostic) ?? relationDecision(a, b, "eq");
            if (decision !== null) return boolResult(decision);
            if (a && b && typeof a.equals === "function") {
                return boolResult(a.equals(b));
            }
            if (a && b && a.type === "string" && b.type === "string") return boolResult(a.value === b.value); return boolResult(a === b);
        },
        preempt: (args) => args[1] instanceof HaloNeighborhood,
        pure: false,
        doc: "Equality check — returns 1 or null",
    },

    NEQ: {
        impl(args, context, evaluate) {
            const [rawA, b] = args;
            const refinement = maybeRefineForHalo(rawA, b, "neq", context, evaluate);
            const a = refinement.value;
            const decision = haloDecision(a, b, "neq", refinement.diagnostic) ?? relationDecision(a, b, "neq");
            if (decision !== null) return boolResult(decision);
            if (a && b && typeof a.equals === "function") {
                return boolResult(!a.equals(b));
            }
            if (a && b && a.type === "string" && b.type === "string") return boolResult(a.value !== b.value); return boolResult(a !== b);
        },
        preempt: (args) => args[1] instanceof HaloNeighborhood,
        pure: false,
        doc: "Inequality check — returns 1 or null",
    },

    LT: {
        impl(args, context, evaluate) {
            const refinement = maybeRefineForHalo(args[0], args[1], "lt", context, evaluate);
            const left = refinement.value;
            const decision = haloDecision(left, args[1], "lt", refinement.diagnostic) ?? relationDecision(left, args[1], "lt");
            return decision === null ? boolResult(compare(left, args[1]) < 0) : boolResult(decision);
        },
        preempt: (args) => args[1] instanceof HaloNeighborhood,
        pure: false,
        doc: "Less than — returns 1 or null",
    },

    GT: {
        impl(args, context, evaluate) {
            const refinement = maybeRefineForHalo(args[0], args[1], "gt", context, evaluate);
            const left = refinement.value;
            const decision = haloDecision(left, args[1], "gt", refinement.diagnostic) ?? relationDecision(left, args[1], "gt");
            return decision === null ? boolResult(compare(left, args[1]) > 0) : boolResult(decision);
        },
        preempt: (args) => args[1] instanceof HaloNeighborhood,
        pure: false,
        doc: "Greater than — returns 1 or null",
    },

    LTE: {
        impl(args, context, evaluate) {
            const refinement = maybeRefineForHalo(args[0], args[1], "lte", context, evaluate);
            const left = refinement.value;
            const decision = haloDecision(left, args[1], "lte", refinement.diagnostic) ?? relationDecision(left, args[1], "lte");
            return decision === null ? boolResult(compare(left, args[1]) <= 0) : boolResult(decision);
        },
        preempt: (args) => args[1] instanceof HaloNeighborhood,
        pure: false,
        doc: "Less than or equal — returns 1 or null",
    },

    GTE: {
        impl(args, context, evaluate) {
            const refinement = maybeRefineForHalo(args[0], args[1], "gte", context, evaluate);
            const left = refinement.value;
            const decision = haloDecision(left, args[1], "gte", refinement.diagnostic) ?? relationDecision(left, args[1], "gte");
            return decision === null ? boolResult(compare(left, args[1]) >= 0) : boolResult(decision);
        },
        preempt: (args) => args[1] instanceof HaloNeighborhood,
        pure: false,
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
