import { describe, expect, test } from "bun:test";
import { Integer } from "@ratmath/core";
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
        expect(polynomial.type).toBe("lambda");
        expect(polynomial._ext.get("__type").value).toBe("Polynomial");
        expect(polynomial._ext.get("schema").value).toBe("rix.polynomial@1");
        expect(polynomial._ext.get("variable").value).toBe("x");
        expect(record.entries.get("schema").value).toBe("rix.polynomial@1");
        expect(copy.type).toBe("lambda");
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
            [division[:schema], division[:method], division[:identity][:verified],
             division[:factor][:divisorIsFactor], division[:factor][:status],
             .algebra.Coefficients(.algebra.Quotient(division)),
             .algebra.Coefficients(.algebra.Remainder(division)),
             .algebra.IsFactor(p, factor), .algebra.IsFactor(p, other)];
        `);
        const [schema, method, verified, divisorIsFactor, status, quotient, remainder, factor, other] = result.values;
        expect(schema.value).toBe("rix.algebra.division@1");
        expect(method.value).toBe("long");
        expect(verified.value).toBe(1n);
        expect(divisorIsFactor.value).toBe(1n);
        expect(status.value).toBe("exactFactor");
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
        expect(division.entries.get("method").value).toBe("synthetic");
        expect(division.entries.get("identity").entries.get("verified").value).toBe(1n);
        expect(division.entries.get("factor").entries.get("divisorisfactor").value).toBe(0n);
        expect(division.entries.get("factor").entries.get("status").value).toBe("nonzeroRemainder");
        expect(quotient.values.map(String)).toEqual(["2", "-4", "-2"]);
        expect(remainder.values.map(String)).toEqual(["-3"]);
        expect(grid).toMatchObject({ type: "output", kind: "grid" });
        expect(grid.semantic.bottom.map(String)).toEqual(["2", "-4", "-2", "-3"]);

        expect(() => parseAndEvaluate('.Plugin.Load("algebra"); .algebra.Polynomial([])'))
            .toThrow("cannot be empty");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("algebra");
            .algebra.Divide(.algebra.Polynomial([1,2]), .algebra.Polynomial([0]));
        `)).toThrow("division by zero");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("algebra");
            .algebra.Grid(.algebra.Divide(.algebra.Polynomial([1,2]), .algebra.Polynomial([1])));
        `)).toThrow("SyntheticDivide result");
    });
});
