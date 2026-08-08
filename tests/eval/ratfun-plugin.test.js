import { describe, expect, test } from "bun:test";
import { Integer } from "@ratmath/core";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

const strings = (value) => value.values.map((item) => String(item));

describe("semantic RationalFunction plugin", () => {
    test("is opt-in, loads Polynomial transitively, and exposes aliases", () => {
        expect(() => parseAndEvaluate(".ratfun([1], [1, 1])")).toThrow("available but not loaded");
        const result = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            A := .ratfun(.p\`x + 1\`, .p\`x - 1\`);
            B := .rationalFunction(.p\`x + 1\`, .p\`x - 1\`);
            C := .rf(.p\`x + 1\`, .p\`x - 1\`);
            [A(3), B(3), C(3)];
        `);
        expect(strings(result)).toEqual(["2", "2", "2"]);
    });

    test("supports backtick labels, symbolic and structural .R conversion, and records", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            A := .rf\`(x^2 - 1)/(x - 1)\`;
            B := \`.ratfun.Var(t):(t^2 - 4)/(t - 2)\`;
            C := ({#u# (u^2 - 9)/(u - 3)}).R();
            D := (\`(z^2 - 16)/(z - 4)\`).R(:z);
            Copy := .ratfun(A.Record());
            [A(5), B(5), C(5), D(5), Copy(5), A.Record().Get("schema"), B.Variable()];
        `);
        expect(strings(result)).toEqual(["6", "7", "8", "9", "6", "[object Object]", "[object Object]"]);
        expect(result.values[5].value).toBe("rix.rational-function@1");
        expect(result.values[6].value).toBe("t");
    });

    test("canonicalizes to coprime expanded polynomials with monic denominator", () => {
        const rationalFunction = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            R := .rf\`(2x^3 - 2x)/(4x^2 - 4)\`;
            R;
        `);
        expect(rationalFunction).toMatchObject({
            type: "lambda",
            schema: "rix.rational-function@1",
            variable: "x",
            canonical: true,
            equalityPolicy: "canonical-reduced-fraction-field",
            domainPolicy: "reduced-denominator-nonzero",
        });
        expect(rationalFunction._ext.get("__type").value).toBe("RationalFunction");
        const result = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            R := .rf\`(2x^3 - 2x)/(4x^2 - 4)\`;
            [R.Numerator().Coefficients(), R.Denominator().Coefficients(), R(3), R == .rf\`x/2\`];
        `);
        expect(result.values[0].values.map(String)).toEqual(["1/2", "0"]);
        expect(result.values[1].values.map(String)).toEqual(["1"]);
        expect(String(result.values[2])).toBe("3/2");
        expect(result.values[3]).toBeInstanceOf(Integer);
        expect(result.values[3].value).toBe(1n);
    });

    test("promotes Polynomial division and closes ordinary field operations", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            P := .p\`x^2 - 1\`;
            Q := .p\`x - 1\`;
            R := P/Q;
            S := 1/Q;
            A := R + S;
            B := R*S;
            C := S/R;
            D := Q^-2;
            E := -S;
            [R(2), A(2), B(2), C(2), D(2), E(2), R.IsPolynomial(), R.ToPolynomial()(4)];
        `);
        expect(strings(result)).toEqual(["3", "4", "3", "1/3", "1", "-1", "1", "5"]);
    });

    test("composes RationalFunctions with Polynomials and other RationalFunctions", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            R := .rf\`(x + 1)/(x - 1)\`;
            P := .p\`x^2\`;
            Q := .rf\`1/x\`;
            A := R(P);
            B := R.Compose(Q);
            [A(2), B(2), A.RationalFunction() == .rf\`(x^2 + 1)/(x^2 - 1)\`];
        `);
        expect(strings(result)).toEqual(["5/3", "-3", "1"]);
    });

    test("uses reduced fraction-field domains and rejects zero denominators", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("ratfun");
            R := .rf\`(x^2 - 1)/(x - 1)\`;
            D := R.Domain();
            [R(1), D.Get("condition"), D.Get("cancelledInputRestrictionsPreserved")];
        `);
        expect(String(result.values[0])).toBe("2");
        expect(result.values[1].value).toBe("reduced denominator != 0");
        expect(result.values[2].value).toBe(0n);
        expect(() => parseAndEvaluate('.Plugin.Load("ratfun"); .rf`1/0`')).toThrow("zero");
        expect(() => parseAndEvaluate('.Plugin.Load("ratfun"); R:=.rf`1/x`; R.ToPolynomial()')).toThrow("denominator 1");
    });

    test("algebra loads ratfun and reactive dependency chains rebuild canonical values", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("algebra");
            $$y := 2;
            $$P := \`.p.Var(x):x + @($y)\`;
            Q := .p\`x - 1\`;
            $$R := $P/Q;
            $$S := $R + 1/Q;
            before := [$R(3), $S(3)];
            $y := 4;
            after := [$R(3), $S(3)];
            [before, after];
        `);
        expect(result.values.map(strings)).toEqual([["5/2", "3"], ["7/2", "4"]]);
    });
});
