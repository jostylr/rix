/**
 * Logic system functions: AND, OR, NOT
 *
 * Truthiness: only null/undefined is falsy. Everything else (including 0) is truthy.
 * AND/OR return the deciding operand (JS-style short-circuit).
 * NOT returns Integer(1) for null, null for anything else.
 * Comparisons elsewhere return Integer(1) for true, null for false.
 */

import { Integer } from "@ratmath/core";
import { UNDECIDED, decisionState } from "../../runtime/decision.js";

export const logicFunctions = {
    AND: {
        lazy: true,
        impl(args, ctx, evaluate) {
            let last = new Integer(1);
            let uncertain = false;
            for (const arg of args) {
                last = evaluate(arg);
                const state = decisionState(last);
                if (state === "null") return null;
                if (state === "undecided") uncertain = true;
            }
            return uncertain ? UNDECIDED : last;
        },
        pure: true,
        doc: "Logical AND (short-circuits on first falsy, returns deciding value)",
    },

    OR: {
        lazy: true,
        impl(args, ctx, evaluate) {
            let last = null;
            let uncertain = false;
            for (const arg of args) {
                last = evaluate(arg);
                const state = decisionState(last);
                if (state === "truth") return last;
                if (state === "undecided") uncertain = true;
            }
            return uncertain ? UNDECIDED : last;
        },
        pure: true,
        doc: "Logical OR (short-circuits on first truthy, returns deciding value)",
    },

    NOT: {
        impl(args) {
            const state = decisionState(args[0]);
            return state === "truth" ? null : state === "null" ? new Integer(1) : UNDECIDED;
        },
        pure: true,
        doc: "Logical NOT — returns Integer(1) for null input, null otherwise",
    },
};
