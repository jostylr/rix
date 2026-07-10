import { describe, expect, test } from "bun:test";
import { cmp, nthRoot, prettyNthRoot, rat } from "./nth-root.js";

function containsPower(n, q, result) {
    const loPow = result.interval.lo.pow(BigInt(n));
    const hiPow = result.interval.hi.pow(BigInt(n));
    return cmp(loPow, q) <= 0 && cmp(q, hiPow) <= 0;
}

describe("readable JavaScript Newton nth-root", () => {
    test("square root of 2 brackets the exact value", () => {
        const result = nthRoot(2, "2", 6, "1/1000000000000");
        expect(containsPower(2, rat("2"), result)).toBe(true);
        expect(result.steps.length).toBeLessThanOrEqual(6);
    });

    test("cube and tenth-root examples run", () => {
        expect(containsPower(3, rat("4567890"), nthRoot(3, "4567890", 4, "1/100000000"))).toBe(true);
        expect(nthRoot(10, "1/567898765", 3, "1/100000000").steps.length).toBe(3);
    });

    test("pretty output summarizes progression", () => {
        const pretty = prettyNthRoot("sqrt 3", 2, "3", nthRoot(2, "3", 4, "1/100000000"));
        expect(pretty.label).toBe("sqrt 3");
        expect(pretty.steps.length).toBeGreaterThan(0);
        expect(pretty.steps[0]).toHaveProperty("widthPower10");
    });
});
