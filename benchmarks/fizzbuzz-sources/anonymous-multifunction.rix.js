// Generated from anonymous-multifunction.rix; trusted build artifact only.
import { Integer } from "@ratmath/core";
import { decisionState, UNDECIDED, NO_MATCH, rixModulo, rixEqual, rixGenerator, rixMap, rixFunction, rixMultifunction, rixInvoke } from "../../src/compile/js-runtime.js";
export const sourceHash = "3eca37380c60b6bf79c132b7dc14f3996474b54cb3167dfe7070a5c381c88d21";
const i0 = new Integer(1n);
const i1 = new Integer(15n);
const i2 = new Integer(0n);
const i3 = new Integer(3n);
const i4 = new Integer(5n);
const s0 = Object.freeze({ type: "string", value: "FizzBuzz" });
const s1 = Object.freeze({ type: "string", value: "Fizz" });
const s2 = Object.freeze({ type: "string", value: "Buzz" });
const v_RUN = rixFunction("RUN", (p0) => {
    return rixMap(rixGenerator(i0, i0, p0), rixMultifunction("<anonymous>", [
    { name: null, invoke: (p0) => {
        const d0 = decisionState(rixEqual(rixModulo(p0, i1), i2));
        if (d0 === "null") return NO_MATCH;
        if (d0 === "undecided") return UNDECIDED;
        return s0;
    } },
    { name: null, invoke: (p0) => {
        const d1 = decisionState(rixEqual(rixModulo(p0, i3), i2));
        if (d1 === "null") return NO_MATCH;
        if (d1 === "undecided") return UNDECIDED;
        return s1;
    } },
    { name: null, invoke: (p0) => {
        const d2 = decisionState(rixEqual(rixModulo(p0, i4), i2));
        if (d2 === "null") return NO_MATCH;
        if (d2 === "undecided") return UNDECIDED;
        return s2;
    } },
    { name: null, invoke: (p0) => {
        return p0;
    } }
]));
});

export const rixExports = Object.freeze({ RUN: v_RUN });
export function run(count) { return rixInvoke(v_RUN, count instanceof Integer ? count : new Integer(count)); }
