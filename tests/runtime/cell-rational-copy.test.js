import { describe, expect, test } from "bun:test";
import { Rational, RationalInterval } from "@ratmath/core";
import { deepCopyValue, shallowCopyValue } from "../../src/runtime/cell.js";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

describe("cell copies of Rationals", () => {
    for (const [label, copy] of [["shallow", shallowCopyValue], ["deep", deepCopyValue]]) {
        test(`${label} copies are fresh, equal and canonical`, () => {
            const value = new Rational(-6, 4);
            value._ext = new Map([["unit", 1]]);
            const result = copy(value);
            expect(result).not.toBe(value);
            expect(result).toBeInstanceOf(Rational);
            expect([result.numerator, result.denominator]).toEqual([-3n, 2n]);
            expect(result._ext === value._ext).toBe(false);
        });

        test(`${label} copies of intervals copy both endpoints`, () => {
            const interval = new RationalInterval(new Rational(1, 3), new Rational(5, 2));
            const result = copy(interval);
            expect(result).not.toBe(interval);
            expect(result.start.equals(interval.start) && result.end.equals(interval.end)).toBe(true);
            expect(result.start).not.toBe(interval.start);
        });

        test(`${label} copies of subclasses with other accessors renormalise`, () => {
            class Unreduced extends Rational {
                get numerator() { return 4n; }
                get denominator() { return 8n; }
            }
            const result = copy(new Unreduced(1, 3));
            expect([result.numerator, result.denominator]).toEqual([1n, 2n]);

            const shadowed = new Rational(1, 3);
            Object.defineProperty(shadowed, "numerator", { value: 2n });
            expect(copy(shadowed).equals(new Rational(2, 3))).toBe(true);
        });
    }

    test("assignment copies keep values independent", () => {
        const result = parseAndEvaluate("a := 3/4; b := a; b := b + 1/4; [a, b]");
        expect(result.values.map(String)).toEqual(["3/4", "1"]);
    });
});
