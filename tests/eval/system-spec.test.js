import { describe, test, expect } from "bun:test";
import { tokenize } from "../../src/parser/tokenizer.js";
import { parse } from "../../src/parser/parser.js";
import { lower } from "../../src/eval/lower.js";
import { evaluate, createDefaultRegistry, createDefaultSystemContext } from "../../src/eval/evaluator.js";
import { formatValue } from "../../src/eval/format.js";
import { Context } from "../../src/runtime/context.js";

function systemLookup(name) {
    return { type: "identifier", name };
}

function evalRix(code, context = null) {
    const ctx = context || new Context();
    const registry = createDefaultRegistry();
    const systemContext = createDefaultSystemContext();
    let result = null;
    for (const node of lower(parse(tokenize(code), systemLookup))) {
        result = evaluate(node, ctx, registry, systemContext);
    }
    return { result, context: ctx };
}

describe("first-class symbolic specs", () => {
    test("identity, expression, and named-output specs preserve source-like display", () => {
        expect(formatValue(evalRix("{#x}").result)).toBe("{#x}");
        expect(formatValue(evalRix("{#t# t^2 - 4 }").result)).toBe("{#t# t ^ 2 - 4 }");
        expect(formatValue(evalRix("{#x:p# p = 2*x }").result)).toBe("{#x:p# p = 2 * x }");
        expect(formatValue(evalRix("{# p = x + 1 }").result)).toBe("{# p = x + 1 }");
        expect(formatValue(evalRix("{#x# p = x + 1 }").result)).toBe("{#x# p = x + 1 }");
    });

    test("InspectSpec provides the structural form without making it the default display", () => {
        const { result } = evalRix('.InspectSpec({#x# x^2})');
        expect(result.type).toBe("map");
        expect(result.entries.get("kind").value).toBe("systemSpec");
        expect(result.entries.get("source").value).toBe("{#x# x ^ 2 }");
        expect(result.entries.get("expression").entries.get("kind").value).toBe("binary");
    });

    test("multi-output named specs remain available for display and inspection", () => {
        const { result } = evalRix("{: {#x:p,q# p=x; q=x^2 }, .InspectSpec({#x:p,q# p=x; q=x^2 }) };");
        expect(formatValue(result.values[0])).toBe("{#x:p,q# p = x; q = x ^ 2 }");
        expect(result.values[1].entries.get("outputs").values.map((value) => value.value)).toEqual(["p", "q"]);
        expect(result.values[1].entries.get("expression")).toBeNull();
    });

    test("Poly compiles expression and named specs and displays its attached spec", () => {
        const { result } = evalRix("P=.Poly({#x:p# p=x^2 + 1}); {: P(3), P }");
        expect(result.values[0].value).toBe(10n);
        expect(formatValue(result.values[1])).toBe("[Poly x -> x ^ 2 + 1; Spec {#x:p# p = x ^ 2 + 1 }]");
    });

    test("spec calls perform positional symbolic substitution and composition", () => {
        const { result } = evalRix(`
            G={#t# t^2 - 4};
            A=G({#x});
            B=G({#x# x + 1});
            C=G(3);
            {: A, B, C, .Poly(C)() };
        `);
        expect(formatValue(result.values[0])).toBe("{#x# x ^ 2 - 4 }");
        expect(formatValue(result.values[1])).toBe("{#x# (x + 1) ^ 2 - 4 }");
        expect(formatValue(result.values[2])).toBe("{# 3 ^ 2 - 4 }");
        expect(result.values[3].value).toBe(5n);
    });

    test("arithmetic unions inputs by name and does not simplify implicitly", () => {
        const { result } = evalRix(`
            A={#x# 2*x};
            B={#t# t^2 - 4};
            C={#x# x + 1};
            {: A*B, A*C, A*1 };
        `);
        expect(formatValue(result.values[0])).toBe("{#x,t# 2 * x * (t ^ 2 - 4) }");
        expect(formatValue(result.values[1])).toBe("{#x# 2 * x * (x + 1) }");
        expect(formatValue(result.values[2])).toBe("{#x# 2 * x * 1 }");
    });

    test("arithmetic on spec-backed functions produces a multi-input spec-backed callable", () => {
        const { result } = evalRix("F=x->2*x; G=t->t^2 - 4; H=F*G; {: H(2,3), .Spec(H) };");
        expect(result.values[0].value).toBe(20n);
        expect(formatValue(result.values[1])).toBe("{#x,t# 2 * x * (t ^ 2 - 4) }");
    });
});

describe("exact symbolic calculus", () => {
    test("Deriv accepts specs, preserves named output form, and creates executable functions", () => {
        const { result } = evalRix(`
            S={#x:p# p=x^3};
            D=.Deriv(S,{#x});
            P=.Poly(D);
            {: D, P(4) };
        `);
        expect(formatValue(result.values[0])).toBe("{#x:p# p = 3 * x ^ 2 }");
        expect(result.values[1].value).toBe(48n);
    });

    test("Deriv and Integrate preserve attached specs on Poly callables", () => {
        const { result } = evalRix(`
            P=.Poly({#x:p# p=x^2});
            D=.Deriv(P,"x");
            A=.Integrate(D,{#x});
            {: D(4), A(4), .Spec(D), .Spec(A) };
        `);
        expect(result.values[0].value).toBe(8n);
        expect(result.values[1].value).toBe(16n);
        expect(formatValue(result.values[2])).toBe("{#x:p# p = 2 * x }");
        expect(formatValue(result.values[3])).toBe("{#x:p# p = x ^ 2 }");
    });

    test("Integrate exactly reverses supported polynomial derivatives", () => {
        const { result } = evalRix(`
            A=.Integrate({#x# 2*x},{#x});
            B=.Integrate({#x# 3*x^2 + 4},{#x});
            {: A, B, .Poly(B)(2) };
        `);
        expect(formatValue(result.values[0])).toBe("{#x# x ^ 2 }");
        expect(formatValue(result.values[1])).toBe("{#x# x ^ 3 + 4 * x }");
        expect(result.values[2].value).toBe(16n);
    });

    test("Integrate recognizes products of monomial forms without requiring simplification", () => {
        const { result } = evalRix(".Integrate({#x# (2*x)*(x^2)},{#x})");
        expect(formatValue(result)).toBe("{#x# 1 / 2 * x ^ 4 }");
    });

    test("pure lambdas are auto-specced and captured coefficients stay live", () => {
        const { result } = evalRix("a=2; F=x->a*x^2; D=.Deriv(F,{#x}); a~=3; {: F(2), D(2), .Spec(F) };");
        expect(result.values[0].value).toBe(12n);
        expect(result.values[1].value).toBe(12n);
        expect(formatValue(result.values[2])).toBe("{#x# a * x ^ 2 }");
    });

    test("Speccability reports safe pure functions and rejects effectful bodies", () => {
        const { result } = evalRix("F=x->x^2; G=x->{ x~=2; x }; {: .Speccability(F), .Speccability(G) };");
        expect(result.values[0].entries.get("speccable").value).toBe(1n);
        expect(result.values[1].entries.get("speccable")).toBeNull();
        expect(result.values[1].entries.get("reason").value).toMatch(/unsupported or effectful/);
    });

    test("automatic function analysis is configurable and Spec can attach explicitly", () => {
        const context = new Context();
        context.setEnv("symbolicAutoSpec", "off");
        const { result } = evalRix("F=x->x^2; S=.Spec(F); D=.Deriv(F,{#x}); {: S, D(3) };", context);
        expect(formatValue(result.values[0])).toBe("{#x# x ^ 2 }");
        expect(result.values[1].value).toBe(6n);
    });

    test("Simplify is explicit and supports directed expansion", () => {
        const { result } = evalRix(`
            A={#x# (x*1) + 0};
            B={#x# x*(x + 1)};
            {: A, .Simplify(A), .Simplify(B,"expand") };
        `);
        expect(formatValue(result.values[0])).toBe("{#x# x * 1 + 0 }");
        expect(formatValue(result.values[1])).toBe("{#x# x }");
        expect(formatValue(result.values[2])).toBe("{#x# x * x + x }");
    });

    test("Simplify's default profile covers every documented local rewrite", () => {
        const inputs = [
            "0 + x", "x + 0", "x - 0", "0 - x",
            "0 * x", "x * 0", "1 * x", "x * 1",
            "0 / x", "x / 1", "x ^ 0", "x ^ 1",
            "2 + 3", "7 - 2", "2 * 3", "6 / 8", "-(2 + 3)",
        ];
        const expected = [
            "x", "x", "x", "-x",
            "0", "0", "x", "x",
            "0", "x", "1", "x",
            "5", "5", "6", "3 / 4", "-5",
        ];
        const forms = inputs.map((expression) => formatValue(evalRix(`.Simplify({#x# ${expression} })`).result));
        expect(forms).toEqual(expected.map((expression) => `{#x# ${expression} }`));
    });

    test("Simplify direction names accept colon-strings, strings, and arbitrary capitalization", () => {
        const { result } = evalRix(`
            P={#x# x*(x + 1)};
            {: .Simplify(P,:expand), .Simplify(P,"expand"),
               .Simplify(P,:Expand), .Simplify(P,"EXPAND") };
        `);
        const forms = result.values.map(formatValue);
        expect(forms).toEqual(Array(4).fill("{#x# x * x + x }"));
    });

    test("Taylor simplification expands and combines a polynomial in powers of its input", () => {
        const { result } = evalRix(`
            P=.Poly({#x# (x - 1)*(x + 2)});
            S=.Simplify(P,:Taylor);
            {: .Spec(P), .Spec(S), S(4) };
        `);
        expect(formatValue(result.values[0])).toBe("{#x# (x - 1) * (x + 2) }");
        expect(formatValue(result.values[1])).toBe("{#x# x ^ 2 + x - 2 }");
        expect(result.values[2].value).toBe(18n);
    });

    test("Taylor simplification exactly recenters a polynomial", () => {
        const { result } = evalRix(`
            P={#x# (x - 1)*(x + 2)};
            A=.Simplify(P,:taylor,3);
            B=.Simplify(P,"TAYLOR",-2);
            R=.Simplify({#x# x^2},:taylor,1 / 2);
            {: A, B, .Poly(A)(4), .Poly(B)(4), .Poly(R)(3 / 2) };
        `);
        expect(formatValue(result.values[0])).toBe("{#x# (x - 3) ^ 2 + 7 * (x - 3) + 10 }");
        expect(formatValue(result.values[1])).toBe("{#x# (x + 2) ^ 2 - 3 * (x + 2) }");
        expect(result.values[2].value).toBe(18n);
        expect(result.values[3].value).toBe(18n);
        expect(formatValue(result.values[4])).toBe("2..1/4");
    });

    test("Taylor simplification preserves live captured coefficients", () => {
        const { result } = evalRix(`
            a=2;
            F=x->(x + a)*(x + 1);
            T=.Simplify(F,:taylor);
            a~=3;
            {: F(2), T(2), .Spec(T) };
        `);
        expect(result.values[0].value).toBe(15n);
        expect(result.values[1].value).toBe(15n);
        expect(formatValue(result.values[2])).toBe("{#x# x ^ 2 + (1 + a) * x + a }");
    });

    test("Taylor simplification rejects ambiguous and non-polynomial requests", () => {
        expect(() => evalRix(".Simplify({#x,t# x+t},:taylor)")).toThrow(/exactly one symbolic input/);
        expect(() => evalRix(".Simplify({#x# 1\/x},:taylor)")).toThrow(/requires a polynomial/);
        expect(() => evalRix(".Simplify({#x# x+1},:mystery)")).toThrow(/Unknown Simplify direction/);
        expect(() => evalRix(".Simplify({#x# x+1},:expand,3)")).toThrow(/third argument/);
    });

    test("postfix derivative and prefix integral syntax execute", () => {
        const { result } = evalRix("F=x->x^3; G=x->2*x; {: F'(4), F'[x](4), 'G(3) };");
        expect(result.values[0].value).toBe(48n);
        expect(result.values[1].value).toBe(48n);
        expect(result.values[2].value).toBe(9n);
    });

    test("combining closures rejects ambiguous captured cells with the same name", () => {
        expect(() => evalRix("Make=a->x->a*x; F=Make(2); G=Make(3); F+G")).toThrow(/different captured cells named 'a'/);
    });

    test("symbolic capabilities are available only behind dot syntax", () => {
        for (const name of ["Poly", "Deriv", "Integrate", "Simplify", "Spec", "Speccability", "InspectSpec"]) {
            expect(() => evalRix(name)).toThrow(new RegExp(`Undefined variable: ${name.toUpperCase()}`));
        }
    });

    test("unsupported exact transforms fail clearly", () => {
        expect(() => evalRix(".Poly({#x# .ADD(x,1)})")).toThrow(/Poly cannot compile unsupported or effectful symbolic IR 'SYS_CALL'/);
        expect(() => evalRix(".Deriv({#x# .ADD(x,1)},{#x})")).toThrow(/Deriv does not support symbolic IR 'SYS_CALL'/);
        expect(() => evalRix(".Integrate({#x# 1/x},{#x})")).toThrow(/cannot integrate/);
    });
});
