// Generated from named-multifunction.rix; trusted build artifact only.
import { Integer } from "@ratmath/core";
import { decisionState, UNDECIDED, NO_MATCH, rixModulo, rixEqual, rixGenerator, rixMap, rixFunction, rixMultifunction, rixInvoke } from "../../src/compile/js-runtime.js";
export const sourceHash = "d72fcb76b5e8396c0a2c521ecf21fb165fbd48618e7a54f1470441478e8d5881";
const i0 = new Integer(15n);
const i1 = new Integer(0n);
const i2 = new Integer(3n);
const i3 = new Integer(5n);
const i4 = new Integer(1n);
const s0 = Object.freeze({ type: "string", value: "FizzBuzz" });
const s1 = Object.freeze({ type: "string", value: "Fizz" });
const s2 = Object.freeze({ type: "string", value: "Buzz" });
const v_FIZZBUZZ = rixMultifunction("FIZZBUZZ", [
    { name: "Both", invoke: (p0) => {
        const d0 = decisionState(rixEqual(rixModulo(p0, i0), i1));
        if (d0 === "null") return NO_MATCH;
        if (d0 === "undecided") return UNDECIDED;
        return s0;
    } },
    { name: "Three", invoke: (p0) => {
        const d1 = decisionState(rixEqual(rixModulo(p0, i2), i1));
        if (d1 === "null") return NO_MATCH;
        if (d1 === "undecided") return UNDECIDED;
        return s1;
    } },
    { name: "Five", invoke: (p0) => {
        const d2 = decisionState(rixEqual(rixModulo(p0, i3), i1));
        if (d2 === "null") return NO_MATCH;
        if (d2 === "undecided") return UNDECIDED;
        return s2;
    } },
    { name: "Number", invoke: (p0) => {
        return p0;
    } }
]);

const v_RUN = rixFunction("RUN", (p0) => {
    return rixMap(rixGenerator(i4, i4, p0), v_FIZZBUZZ);
});

export const rixExports = Object.freeze({ FIZZBUZZ: v_FIZZBUZZ, RUN: v_RUN });
export function run(count) { return rixInvoke(v_RUN, count instanceof Integer ? count : new Integer(count)); }
