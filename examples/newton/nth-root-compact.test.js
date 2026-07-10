import { describe, expect, test } from "bun:test";
import { C, nthRootCompact, Q } from "./nth-root-compact.js";

describe("compact JavaScript Newton nth-root", () => {
    test("square root of 2 brackets the exact value", () => {
        const result = nthRootCompact(2, "2", 6, "1/1000000000000");
        expect(C(result.interval.lo.pow(2n), Q("2")) <= 0).toBe(true);
        expect(C(Q("2"), result.interval.hi.pow(2n)) <= 0).toBe(true);
    });

    test("honors iteration cap", () => {
        expect(nthRootCompact(10, "3", 2, "1/100000000").steps.length).toBe(2);
    });
});
