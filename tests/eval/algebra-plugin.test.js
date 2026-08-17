import { describe, expect, test } from "bun:test";
import { Integer } from "@ratmath/core";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

const text = (value) => value?.value;

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

    test("Phase 2 exposes exact gcd, square-free, factor, and resultant evidence", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("algebra");
            p := .p\`(x-1)^2*(x+2)^3\`;
            support := .p\`(x-1)*(x+2)\`;
            squareFree := .algebra.SquareFreeDecomposition(p);
            factors := .algebra.FactorEvidence(p);
            rational := .p\`x*(2x-1)*(3x+2)\`;
            zero := .poly([0]);
            [
                .algebra.Gcd(p, support).Coefficients(),
                .algebra.Lcm(p, support).Coefficients(),
                squareFree[:schema], squareFree[:verified],
                squareFree[:factors].Map((entry)->[entry[:factor].Coefficients(), entry[:multiplicity]]),
                .algebra.RationalRoots(rational),
                factors[:schema], factors[:verified], factors[:complete],
                factors[:factors].Map((entry)->[entry[:root],entry[:multiplicity]]),
                factors[:residual].Coefficients(),
                .algebra.Resultant(.p\`x^2-2\`, .p\`x-1\`),
                .algebra.Resultant(.poly([1/2,1/3]), .poly([2/3,-1/5])),
                .algebra.Resultant(.poly([2]), .p\`x^2+1\`),
                .algebra.Resultant(p, support),
                .algebra.Gcd(p, zero).Coefficients(),
                .algebra.Lcm(p, zero).Coefficients()
            ];
        `);
        const [gcd, lcm, squareSchema, squareVerified, squareFactors, roots,
            factorSchema, factorVerified, complete, factorRoots, residual,
            separatedResultant, rationalResultant, constantResultant,
            sharedResultant, gcdZero, lcmZero] = result.values;

        expect(gcd.values.map(String)).toEqual(["1", "1", "-2"]);
        expect(lcm.values.map(String)).toEqual(["1", "4", "1", "-10", "-4", "8"]);
        expect(squareSchema.value).toBe("rix.polynomial.square-free@1");
        expect(squareVerified.value).toBe(1n);
        expect(squareFactors.values.map((entry) => ({
            coefficients: entry.values[0].values.map(String),
            multiplicity: String(entry.values[1]),
        }))).toEqual([
            { coefficients: ["1", "-1"], multiplicity: "2" },
            { coefficients: ["1", "2"], multiplicity: "3" },
        ]);
        expect(roots.values.map(String)).toEqual(["-2/3", "0", "1/2"]);
        expect(factorSchema.value).toBe("rix.polynomial.factor-evidence@1");
        expect(factorVerified.value).toBe(1n);
        expect(complete.value).toBe(1n);
        expect(factorRoots.values.map((entry) => entry.values.map(String))).toEqual([["-2", "3"], ["1", "2"]]);
        expect(residual.values.map(String)).toEqual(["1"]);
        expect(String(separatedResultant)).toBe("-1");
        expect(String(rationalResultant)).toBe("-29/90");
        expect(String(constantResultant)).toBe("4");
        expect(String(sharedResultant)).toBe("0");
        expect(gcdZero.values.map(String)).toEqual(lcm.values.map(String));
        expect(lcmZero.values.map(String)).toEqual(["0"]);

        expect(() => parseAndEvaluate(`
            .Plugin.Load("algebra");
            .algebra.RationalRoots(.poly([0]));
        `)).toThrow("infinitely many roots");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("algebra");
            .algebra.Resultant(.poly([0]), .poly([1,1]));
        `)).toThrow("undefined for the zero polynomial");
    });

    test("Phase 2 exposes versioned exact sign and distinct-root-count witnesses", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("algebra");
            polynomial := .p\`(x-1)^2*(x+2)^3\`;
            negative := .algebra.SignEvidence(polynomial, -3);
            roots := .algebra.RootCountEvidence(polynomial, -10:10);
            endpoint := .algebra.RootCountEvidence(.p\`x*(x-1)\`, 0:1);
            [
                negative[:schema], negative[:sign], negative[:value], negative[:certified],
                polynomial.SignAt(-2), polynomial.SignAt(2),
                roots[:schema], roots[:property], roots[:count], roots[:endpointPolicy],
                roots[:variations][:low], roots[:variations][:high], roots[:verified],
                endpoint[:count], endpoint[:endpointValues][:low], endpoint[:endpointValues][:high],
                polynomial.IsSquareFree(), roots[:countingPolynomial].IsSquareFree(),
                polynomial.SturmSequence().Len()
            ];
        `);
        const values = result.values;
        expect(text(values[0])).toBe("rix.exact.sign-witness@1");
        expect(text(values[1])).toBe("negative");
        expect(String(values[2])).toBe("-16");
        expect(values[3].value).toBe(1n);
        expect([text(values[4]), text(values[5])]).toEqual(["zero", "positive"]);
        expect(text(values[6])).toBe("rix.exact.root-count@1");
        expect(text(values[7])).toBe("distinctRealRoots");
        expect(String(values[8])).toBe("2");
        expect(text(values[9])).toBe("leftOpenRightClosed");
        expect(Number(values[10])).toBeGreaterThan(Number(values[11]));
        expect(values[12].value).toBe(1n);
        expect([String(values[13]), String(values[14]), String(values[15])]).toEqual(["1", "0", "0"]);
        expect(values[16]).toBeNull();
        expect([String(values[17]), String(values[18])]).toEqual(["1", "3"]);

        expect(() => parseAndEvaluate(`
            .Plugin.Load("algebra");
            .algebra.RootCountEvidence(.poly([0]), -1:1);
        `)).toThrow("infinitely many roots");
    });
});
