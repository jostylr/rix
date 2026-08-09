import { Integer } from "@ratmath/core";
import { HOLE, isHole } from "./hole.js";

/** A decision that is valid but not determined by the available evidence. */
export const UNDECIDED = Object.freeze({
    __rix_undecided__: true,
    toJSON() {
        return { $rix: "Undecided" };
    },
});
export const isUndecided = (value) => value === UNDECIDED;

export function reviveDecisionValue(_key, value) {
    return value?.$rix === "Undecided" ? UNDECIDED : value;
}

/** Classify a value for RiX decision-aware logic and control flow. */
export function decisionState(value) {
    if (isHole(value) || value === undefined) {
        throw new Error("Missing data cannot be used as a decision");
    }
    if (value === null) return "null";
    if (isUndecided(value)) return "undecided";
    return "truth";
}

export function decisionValue(state) {
    if (state === "truth") return new Integer(1n);
    if (state === "null") return null;
    if (state === "undecided") return UNDECIDED;
    throw new Error(`Unknown decision state '${state}'`);
}
