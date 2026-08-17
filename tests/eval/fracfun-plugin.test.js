import { describe, expect, test } from "bun:test";
import { Fraction, Integer } from "@ratmath/core";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";
import { formatValue } from "../../src/eval/format.js";
import { expressionOf, renderSymbolicIr } from "../../src/eval/functions/symbolic.js";

const strings = (value) => value.values.map(String);
const form = (value) => renderSymbolicIr(expressionOf(value._fractionFunction.displaySpec));

describe("form-preserving FractionFunction plugin", () => {
    test("is opt-in, exposes aliases, and loads its canonical dependencies", () => {
        expect(() => parseAndEvaluate(".ff`x+1`")).toThrow("available but not loaded");
        const result = parseAndEvaluate(`
            .Plugin.Load("fracfun");
            A := .fracfun\`x^2+1\`;
            B := .fractionFunction\`x^2+1\`;
            C := .ff\`x^2+1\`;
            P := .p\`x+1\`;
            R := .rf\`1/x\`;
            [A(2), B(2), C(2), .frac(6,8), P(2), R(2)];
        `);
        expect(strings(result)).toEqual(["5", "5", "5", "6/8", "3", "1/2"]);
    });

    test("uses the same natural entry for preserved polynomial and fraction forms", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("fracfun");
            A := .ff\`(x+1)*(x+1)\`;
            B := (\`(t+1)*(t+1)\`).ff(:t);
            C := {#u# (u+1)*(u+1)}.ff();
            [A, B, C];
        `);
        expect(result.values.every((value) => value.schema === "rix.fraction-function@1")).toBe(true);
        expect(result.values.map(form)).toEqual([
            "(x + 1) * (x + 1)", "(t + 1) * (t + 1)", "(u + 1) * (u + 1)",
        ]);
    });

    test("preserves operation trees until an explicit transformation", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("fracfun");
            A := .ff\`1/x\`;
            B := .ff\`1/(x+1)\`;
            Sum := A+B;
            Product := A*B;
            [Sum, Product, Sum.Together(), (.ff\`(x+1)*(x+1)\`).Expand(), (.ff\`x^2+1\`).Recenter(2)];
        `);
        expect(form(result.values[0])).toBe("1 / x + 1 / (x + 1)");
        expect(form(result.values[1])).toBe("1 / x * 1 / (x + 1)");
        expect(form(result.values[2])).toBe("(x + 1 + x) / (x * (x + 1))");
        expect(form(result.values[3])).toBe("x * x + x + x + 1");
        expect(form(result.values[4])).toBe("(x - 2) ^ 2 + 4 * (x - 2) + 5");
    });

    test("provides explicit canonical Polynomial and RationalFunction projections", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("fracfun");
            PForm := .ff\`(x+1)*(x+1)\`;
            RForm := .ff\`(x^2-1)/(x-1)\`;
            P := PForm.P();
            R := RForm.R();
            [P(3), R(3), PForm.IsPolynomial(), RForm.IsPolynomial(),
             PForm.Record().Get("canonicalAvailable"), RForm.Record().Get("polynomialAvailable")];
        `);
        expect(strings(result).slice(0, 4)).toEqual(["16", "4", "1", "null"]);
        expect(result.values[4]).toBeInstanceOf(Integer);
        expect(result.values[5]).toBeNull();
    });

    test("separates form equality, value equivalence, and source-domain equality", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("fracfun");
            A := .ff\`(x^2-1)/(x-1)\`;
            B := .ff\`x+1\`;
            C := A.Cancel();
            [A==B, A.SameForm(B), A.Equivalent(B), A.SameFunction(B),
             C==B, C.Equivalent(B), C.SameFunction(A)];
        `);
        expect(result.values.map((value) => value instanceof Integer ? 1 : 0)).toEqual([0, 0, 1, 0, 0, 1, 1]);
    });

    test("cancellation preserves holes until the explicit canonical boundary", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("fracfun");
            F := .ff\`(x^2-1)/(x-1)\`;
            C := F.Cancel();
            [F(3), C(3), F.Domain().Get("restrictions").Len(), C.Domain().Get("cancelledRestrictionsPreserved"), F.Canonical()(1)];
        `);
        expect(strings(result)).toEqual(["4", "4", "1", "1", "2"]);
        expect(() => parseAndEvaluate(`
            .Plugin.Load("fracfun");
            F := .ff\`(x^2-1)/(x-1)\`;
            F.Cancel()(1);
        `)).toThrow("Division by zero");
    });

    test("evaluates naturally over unreduced Fractions and composes form functions", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("fracfun");
            xvalue := \`2/4\`;
            F := .ff\`x^2+1\`;
            G := .ff\`x+1\`;
            H := F(G);
            [F(xvalue), H(2), H];
        `);
        expect(result.values[0]).toBeInstanceOf(Fraction);
        expect(String(result.values[0])).toBe("20/16");
        expect(String(result.values[1])).toBe("10");
        expect(form(result.values[2])).toBe("(x + 1) ^ 2 + 1");
    });

    test("reactive definitions rebuild forms and the symbolic meta-plugin loads the workspace", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("symbolic");
            $$y := 2;
            $$F := \`.ff.Var(x):(x+@($y))/(x-1)\`;
            $$G := $F + .ff\`1/(x-1)\`;
            before := [$F(3), $G(3)];
            $y := 4;
            after := [$F(3), $G(3)];
            [before, after, .symbolic.Services()];
        `);
        expect(result.values.slice(0, 2).map(strings)).toEqual([["5/2", "3"], ["7/2", "4"]]);
        expect(result.values[2].values.map((item) => item.value)).toEqual([
            "fraction", "fracfun", "poly", "ratfun", "calculus",
        ]);
    });

    test("exports preserved forms and source-domain restrictions to Calculus", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("symbolic");
            F := .ff\`(x^2-1)/(x-1)\`;
            C := F.Cancel();
            derivative := .symbolic.DifferentiateResult(F,:x);
            sourceObligations := .symbolic.Obligations(F);
            {: .calculus.ToSpec(F.CalculusExpression()),
               .calculus.ToSpec(C.CalculusExpression()),
               .calculus.ToSpec(C.EvaluationCalculusExpression()),
               .calculus.ToSpec(derivative[:expression]),
               derivative[:obligations].Len(),
               sourceObligations[1][:reason],
               F.Record().Get("calculusRestrictions").Len(),
               F.Domain().Get("calculusRestrictions").Len() };
        `);

        expect(formatValue(result.values[0])).toBe("{#x# (x ^ 2 - 1) / (x - 1) }");
        expect(formatValue(result.values[1])).toBe("{#x# (x + 1) / 1 }");
        expect(formatValue(result.values[2])).toBe("{#x# (x ^ 2 - 1) / (x - 1) }");
        expect(formatValue(result.values[3])).toBe("{#x# (2 * x * (x - 1) - (x ^ 2 - 1)) / (x - 1) ^ 2 }");
        expect(String(result.values[4])).toBe("1");
        expect(result.values[5].value).toBe("fractionFunctionSourceDomain");
        expect(String(result.values[6])).toBe("1");
        expect(String(result.values[7])).toBe("1");
    });

    test("uses Symbolic facades for higher derivatives and concrete evaluation", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("symbolic");
            P := .ff\`x^3+x\`;
            second := .symbolic.DifferentiateN(P,:x,2);
            gradient := .symbolic.Gradient({#x,y# x^2+x*y },[:x,:y]);
            {: .calculus.ToSpec(second),
               .symbolic.Evaluate(second,{= x=3 }),
               gradient.Map((expression)->.calculus.ToSpec(expression)) };
        `);

        expect(formatValue(result.values[0])).toBe("{#x# 3 * 2 * x }");
        expect(String(result.values[1])).toBe("18");
        expect(result.values[2].values.map(formatValue)).toEqual([
            "{#x,y# 2 * x + y }",
            "{#x# x }",
        ]);
    });

    test("carries FractionFunction restrictions into symbolic integral records", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("symbolic");
            F := .ff\`1/x\`;
            x := .calculus.Variable(:x);
            family := .symbolic.AntiderivativeFamily(F,:x,.calculus.Log()(x),:C);
            definite := .symbolic.DefiniteIntegral(F,:x,1,2);
            {: family, definite };
        `);

        const family = result.values[0];
        const definite = result.values[1];
        expect(family.entries.get("kind").value).toBe("antiderivativeFamily");
        expect(family.entries.get("constant").value).toBe("C");
        expect(family.entries.get("obligations").values).toHaveLength(1);
        expect(family.entries.get("obligations").values[0].entries.get("relation").value)
            .toBe("nonzero");
        expect(definite.entries.get("obligations").values).toHaveLength(1);
    });
});
