import { describe, expect, test } from "bun:test";
import { Integer, Rational } from "@ratmath/core";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

describe("algebra Phase 1 plugin", () => {
    test("normalizes and round-trips canonical exact polynomials", () => {
        expect(() => parseAndEvaluate(".algebra.Polynomial([1,2])")).toThrow("available but not loaded");
        const result = parseAndEvaluate(`
            .Plugin.Load("algebra");
            p := .algebra.Polynomial([0, 0, 1/2, -3, 2]);
            record := .algebra.Record(p);
            copy := .algebra.Polynomial(record);
            [p, record, copy, .algebra.Equal(p, copy), .algebra.Evaluate(p, 2), .algebra.Coefficients(p)];
        `);
        const [polynomial, record, copy, equal, evaluated, coefficients] = result.values;
        expect(polynomial).toMatchObject({
            type: "algebra_polynomial",
            kind: "polynomial",
            schema: "rix.algebra.polynomial@1",
            variable: "x",
            degree: 2,
            canonical: true,
            equalityPolicy: "canonical-coefficients",
        });
        expect(polynomial.coefficients).toHaveLength(3);
        expect(polynomial.coefficients.every((value) => value instanceof Rational)).toBe(true);
        expect(record.entries.get("schema").value).toBe("rix.algebra.polynomial@1");
        expect(copy.coefficients.map(String)).toEqual(["1/2", "-3", "2"]);
        expect(equal).toBeInstanceOf(Integer);
        expect(equal.value).toBe(1n);
        expect(String(evaluated)).toBe("-2");
        expect(coefficients.values.map(String)).toEqual(["1/2", "-3", "2"]);
    });

    test("performs verified exact quotient/remainder division and factor checks", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("algebra");
            p := .algebra.Polynomial([1, -6, 11, -6]);
            factor := .algebra.Polynomial([1, -2]);
            other := .algebra.Polynomial([1, -4]);
            division := .algebra.Divide(p, factor);
            [division, .algebra.Coefficients(.algebra.Quotient(division)),
             .algebra.Coefficients(.algebra.Remainder(division)),
             .algebra.IsFactor(p, factor), .algebra.IsFactor(p, other)];
        `);
        const [division, quotient, remainder, factor, other] = result.values;
        expect(division).toMatchObject({
            type: "algebra_division",
            schema: "rix.algebra.division@1",
            method: "long",
            exact: true,
            identity: { verified: true },
            factor: { divisorIsFactor: true, status: "exact-factor" },
        });
        expect(quotient.values.map(String)).toEqual(["1", "-4", "3"]);
        expect(remainder.values.map(String)).toEqual(["0"]);
        expect(factor.value).toBe(1n);
        expect(other.value).toBe(0n);
    });

    test("retains a portable synthetic-division Grid and rejects malformed work", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("algebra");
            p := .algebra.Polynomial([2, -6, 2, -1]);
            division := .algebra.SyntheticDivide(p, 1);
            [division, .algebra.Coefficients(.algebra.Quotient(division)),
             .algebra.Coefficients(.algebra.Remainder(division)), .algebra.Grid(division)];
        `);
        const [division, quotient, remainder, grid] = result.values;
        expect(division.method).toBe("synthetic");
        expect(division.identity.verified).toBe(true);
        expect(division.factor).toMatchObject({ divisorIsFactor: false, status: "nonzero-remainder" });
        expect(quotient.values.map(String)).toEqual(["2", "-4", "-2"]);
        expect(remainder.values.map(String)).toEqual(["-3"]);
        expect(grid).toMatchObject({ type: "output", kind: "grid" });
        expect(grid.semantic.bottom.map(String)).toEqual(["2", "-4", "-2", "-3"]);

        expect(() => parseAndEvaluate('.Plugin.Load("algebra"); .algebra.Polynomial([])'))
            .toThrow("cannot be empty");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("algebra");
            .algebra.Divide(.algebra.Polynomial([1,2]), .algebra.Polynomial([0]));
        `)).toThrow("zero polynomial");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("algebra");
            .algebra.Grid(.algebra.Divide(.algebra.Polynomial([1,2]), .algebra.Polynomial([1])));
        `)).toThrow("SyntheticDivide result");
    });
});
