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
import { createSequent, checkSequent, renderSequentTree, exactProposition, checkExactProposition, sequentValue } from "../../runtime/logic-sequent.js";

function logicService(fn, minimum, maximum, doc) {
    return {pure:true,doc,impl(args){
        if(args.length<minimum||args.length>maximum)throw new Error(`Expected ${minimum}…${maximum} logic service arguments`);
        return sequentValue(fn(...args));
    }};
}

export const logicFunctions = {
    LOGIC_SEQUENT: logicService(createSequent,2,3,"Build a bounded classical propositional sequent derivation"),
    LOGIC_CHECK_SEQUENT: logicService(checkSequent,1,1,"Replay every rule and retained budget/countermodel claim in a sequent record"),
    LOGIC_SEQUENT_TREE: logicService(renderSequentTree,1,2,"Render a checked sequent as bounded Graphics and an exact text table"),
    LOGIC_EXACT_PROPOSITION: logicService(exactProposition,3,3,"Decide exact rational or interval comparisons without importing assumptions"),
    LOGIC_CHECK_PROPOSITION: logicService(checkExactProposition,1,1,"Recheck an exact arithmetic proposition record"),
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
