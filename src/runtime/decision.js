import { Integer } from "@ratmath/core";
import { HOLE, isHole } from "./hole.js";

/** A decision that is valid but not determined by the available evidence. */
export const UNDECIDED = Object.freeze({
    __rix_undecided__: true,
    toJSON() {
        return { $rix: "Undecided" };
    },
});

/** Per-occurrence evidence for an undecided result. Plain `?` stays singleton. */
export class UndecidedDiagnostic {
    constructor(reason, details = null) {
        this.__rix_undecided__ = true;
        this.reason = String(reason || "undecided");
        this.details = details;
        this._ext = new Map([
            ["reason", { type: "string", value: this.reason }],
            ...(details === null ? [] : [["details", details]]),
        ]);
    }

    toJSON() {
        return { $rix: "Undecided", reason: this.reason, details: this.details };
    }

    copy() {
        return new UndecidedDiagnostic(this.reason, this.details);
    }
}

export const undecidedDiagnostic = (reason, details = null) => new UndecidedDiagnostic(reason, details);
export const isUndecided = (value) => value === UNDECIDED || value instanceof UndecidedDiagnostic;
export const undecidedReason = (value) => value instanceof UndecidedDiagnostic ? value.reason : null;

export function reviveDecisionValue(_key, value) {
    if (value?.$rix !== "Undecided") return value;
    return value.reason ? new UndecidedDiagnostic(value.reason, value.details ?? null) : UNDECIDED;
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
