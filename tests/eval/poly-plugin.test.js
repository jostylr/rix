import { describe, expect, test } from "bun:test";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

const strings = (value) => value.values.map((item) => item?.type === "string" ? item.value : String(item));

describe("semantic Polynomial plugin", () => {
    test("is opt-in and exposes one callable capability through three aliases", () => {
        expect(() => parseAndEvaluate(".poly([1, 2])")).toThrow("available but not loaded");
        const result = parseAndEvaluate(`
            .Plugin.Load("poly");
            [.poly([1, 2])(3), .polynomial([1, 2])(3), .p([1, 2])(3)];
        `);
        expect(strings(result)).toEqual(["5", "5", "5"]);
    });

    test("supports outside labels, named parser headers, structural postfix conversion, and records", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("poly");
            y := 4;
            A := .p\`x^2 + 2x + 1\`;
            B := \`.polynomial.Var(t):t^2 + y*t\`;
            C := (\`z^3 - z\`).P();
            D := .poly({= coefficients=[1, -3, 2], variable=:u });
            [A(3), B(2), C(3), D(2), A.Degree(), B.Variable(), D.Record().Get("schema")];
        `);
        expect(strings(result)).toEqual(["16", "12", "24", "0", "2", "t", "rix.polynomial@1"]);
    });

    test("symbolic specs retain surrounding coefficient cells", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("poly");
            y := 2;
            P := {#x# x^2 + y*x}.P();
            before := P(2);
            y ~= 3;
            [before, P(2)];
        `);
        expect(strings(result)).toEqual(["8", "10"]);
    });

    test("keeps Polynomial identity while remaining an ordinary callable", () => {
        const polynomial = parseAndEvaluate('.Plugin.Load("poly"); .p`x^2-1`');
        expect(polynomial.type).toBe("lambda");
        expect(polynomial._ext.get("__type").value).toBe("Polynomial");
        expect(polynomial._ext.get("schema").value).toBe("rix.polynomial@1");
        expect(polynomial._ext.get("variable").value).toBe("x");
        expect(polynomial._ext.get("degreebound").value).toBe(2n);
        expect(polynomial._ext.get("coefficientfunction").type).toBe("lambda");
    });

    test("closes polynomial arithmetic under composition and exact scalar operations", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("poly");
            P := .p\`x^2 + 1\`;
            Q := .p\`x + 2\`;
            A := P + Q;
            B := P*Q - 3;
            C := (P^2)/2;
            R := P(Q) + Q;
            N := -Q;
            [A(3), B(3), C(3), R(3), N(3), P == P.Polynomial()];
        `);
        expect(strings(result)).toEqual(["15", "47", "50", "31", "-5", "1"]);
    });

    test("algebra auto-loads poly and adds methods plus quotient/remainder operators", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("algebra");
            P := .p\`x^3 - 6x^2 + 11x - 6\`;
            F := .p\`x - 2\`;
            synthetic := P.SyntheticDiv(2);
            qr := P /% F;
            Quotient := P // F;
            Remainder := P % F;
            [P(4), synthetic.Quotient()(4), synthetic.Remainder()(4),
             Quotient(4), Remainder(4), qr[1](4), qr[2](4)];
        `);
        expect(strings(result)).toEqual(["6", "3", "0", "3", "0", "3", "0"]);
    });

    test("reactive Polynomial operations propagate through a reactive dependency chain", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("poly");
            $$y := 2;
            $$P := \`.p.Var(x):x^2 + @($y)*x\`;
            $$Q := $P*$P + 1;
            before := [$P(2), $Q(2)];
            $y := 3;
            after := [$P(2), $Q(2)];
            [before, after];
        `);
        expect(result.values.map(strings)).toEqual([["8", "65"], ["10", "101"]]);
    });

    test("rejects non-polynomial and ambiguous multivariate forms", () => {
        expect(() => parseAndEvaluate('.Plugin.Load("poly"); .p`x^-1`'))
            .toThrow("nonnegative exact Integer");
        expect(() => parseAndEvaluate('.Plugin.Load("poly"); .p`x^2+y*x`'))
            .toThrow("multiple symbols");
        expect(() => parseAndEvaluate('.Plugin.Load("poly"); P:=.p`x^2-1`; F:=.p`x-1`; P/F'))
            .toThrow("creates a RationalFunction");
        expect(() => parseAndEvaluate('.Plugin.Load("poly"); P:=.p`x+1`; P^-1'))
            .toThrow("nonnegative exact Integer");
    });
});
