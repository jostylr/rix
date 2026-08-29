import { describe, expect, test } from "bun:test";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/index.js";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

function entry(value, key) {
    return value.entries.get(String(key).toLowerCase());
}

function text(value) {
    return value?.value ?? null;
}

describe("browser-safe course CAS plugin", () => {
    test("is bundled over Calculus, Polynomial, and RationalFunction services", () => {
        const info = parseAndEvaluate('.Plugin.Info("cas")', runtime());
        expect(text(entry(info, "kind"))).toBe("rix");
        expect(entry(info, "requires").values.map(text)).toEqual([
            "rix.calculus@1",
            "rix.polynomial@1",
            "rix.rational-function@1",
        ]);
        expect(entry(info, "schemas").values.map(text)).toEqual([
            "rix.cas.rewrite@1",
            "rix.cas.integral@1",
        ]);
    });

    test("replays checked simplification and rejects a changed expression", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            x := .calculus.Variable(:x);
            simplified := .cas.Simplify(-(-(x+0)));
            accepted := .cas.CheckSimplification(simplified);
            changed := simplified.Set("expression",x+1);
            rejected := .cas.CheckSimplification(changed);
            {: simplified,accepted,rejected };
        `, runtime());
        expect(text(entry(result.values[0], "status"))).toBe("complete");
        expect(entry(result.values[1], "accepted").value).toBe(1n);
        expect(entry(result.values[2], "accepted")).toBeNull();
    });

    test("normalizes, collects, expands, and factors exact course polynomials", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            x := .calculus.Variable(:x);
            source := (x+1)*(x-1);
            normalized := .cas.NormalizePolynomial(source,:x);
            collected := .cas.Collect(source,:x);
            expanded := .cas.Expand(source,:x);
            factored := .cas.Factor(source,:x);
            {: normalized,collected,expanded,factored };
        `, runtime());
        expect(entry(result.values[1], "coefficients").values.map(String)).toEqual(["-1", "0", "1"]);
        expect(text(entry(result.values[2], "operation"))).toBe("expand");
        expect(entry(result.values[3], "factors").values).toHaveLength(2);
    });

    test("integrates powers, affine substitutions, exponentials, and logarithms by parts", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            x := .calculus.Variable(:x);
            Exp := .calculus.Exp();
            Log := .calculus.Log();
            polynomial := .cas.Integrate(3*x^2+4,x);
            affinePower := .cas.Integrate((2*x+3)^4,x);
            exponential := .cas.Integrate(Exp(2*x+3),x);
            byParts := .cas.Integrate(x^2*Exp(x),x);
            logarithm := .cas.Integrate(Log(2*x+1),x);
            {: polynomial,affinePower,exponential,byParts,logarithm,
               .calculus.Evaluate(polynomial[:antiderivative],{= x=2 }) };
        `, runtime());
        for (const item of result.values.slice(0, 5)) {
            expect(text(entry(item, "status"))).toBe("complete");
        }
        expect(result.values[5].toString()).toBe("16");
        expect(entry(result.values[4], "obligations").values).toHaveLength(1);
        expect(entry(result.values[3], "rules").values.map((rule) => text(entry(rule, "rule"))))
            .toContain("integrationByPartsExpPower");
    });

    test("integrates exact linear partial fractions and independently replays the result", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            rational := .rf\`(2*x+3)/(x^2-1)\`;
            integral := .cas.Integrate(rational);
            checked := .cas.CheckIntegral(integral);
            {: integral,checked };
        `, runtime());
        const integral = result.values[0];
        expect(text(entry(integral, "status"))).toBe("complete");
        expect(entry(integral, "obligations").values).toHaveLength(2);
        expect(entry(result.values[1], "accepted").value).toBe(1n);
    });

    test("uses log absolute value for reciprocal domains without a false positivity restriction", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            x := .calculus.Variable(:x);
            integral := .cas.Integrate(1/x,x);
            {: integral,.cas.CheckIntegral(integral) };
        `, runtime());
        const integral = result.values[0];
        const antiderivative = entry(integral, "antiderivative");
        const product = entry(antiderivative, "operands").values[0];
        const logarithm = entry(product, "operands").values[1];
        expect(text(entry(logarithm, "semanticid"))).toBe("rix.function.log.real-principal@1");
        const absolute = entry(logarithm, "arguments").values[0];
        expect(text(entry(absolute, "semanticid"))).toBe("rix.function.abs.real@1");
        expect(text(entry(entry(integral, "obligations").values[0], "relation"))).toBe("nonzero");
        expect(entry(result.values[1], "accepted").value).toBe(1n);
    });

    test("integrates affine sine and cosine course cases", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            x := .calculus.Variable(:x);
            Sin := .calculus.Sin();
            Cos := .calculus.Cos();
            {: .cas.Integrate(Sin(2*x+1),x),.cas.Integrate(Cos(3*x-2),x) };
        `, runtime());
        for (const integral of result.values) {
            expect(text(entry(integral, "status"))).toBe("complete");
            expect(entry(integral, "obligations").values).toHaveLength(0);
        }
        expect(text(entry(entry(result.values[0], "rules").values[0], "rule")))
            .toBe("affineSineSubstitution");
        expect(text(entry(entry(result.values[1], "rules").values[0], "rule")))
            .toBe("affineCosineSubstitution");
    });

    test("integrates irreducible quadratic partial fractions with an Atan graph", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            integral := .cas.Integrate(.rf\`1/(x^2+1)\`);
            {: integral,.cas.CheckIntegral(integral) };
        `, runtime());
        const integral = result.values[0];
        expect(text(entry(integral, "status"))).toBe("complete");
        expect(entry(integral, "rules").values.map((rule) => text(entry(rule, "rule"))))
            .toContain("irreducibleQuadraticPartialFraction");
        expect(entry(result.values[1], "accepted").value).toBe(1n);
    });

    test("returns a structured unsupported result outside the course ladder", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cas");
            x := .calculus.Variable(:x);
            Sqrt := .calculus.Sqrt();
            .cas.Integrate(Sqrt(x^2+1),x);
        `, runtime());
        expect(text(entry(result, "status"))).toBe("unsupported");
        expect(text(entry(result, "reason"))).toBe("unsupportedSemanticFunction");
        expect(entry(result, "antiderivative")).toBeNull();
    });
});
