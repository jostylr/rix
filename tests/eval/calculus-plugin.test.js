import { describe, expect, test } from "bun:test";
import {
    Context,
    formatValue,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/index.js";
import {
    calculusExpressionToSpec,
    symbolicSpecToCalculusExpression,
} from "../../src/eval/index.js";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

function entry(map, key) {
    return map.entries.get(String(key).toLowerCase());
}

function text(value) {
    return value?.value ?? null;
}

describe("pure RiX Calculus plugin", () => {
    test("is bundled as a portable RiX plugin with versioned schemas", () => {
        const options = runtime();
        const info = parseAndEvaluate('.Plugin.Info("calculus")', options);
        expect(text(entry(info, "kind"))).toBe("rix");
        expect(entry(info, "provides").values.map(text)).toEqual([
            "rix.calculus@1",
            "rix.abstract-function@1",
        ]);
        expect(entry(info, "schemas").values.map(text)).toEqual([
            "rix.calculus.function@1",
            "rix.calculus.expression@1",
        ]);
    });

    test("builds immutable semantic application and arithmetic graphs", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            x := .calculus.Variable(:x);
            Exp := .calculus.Exp();
            expression := 3 * Exp(x^2 + 1);
            expression;
        `, options);

        expect(text(entry(result, "schema"))).toBe("rix.calculus.expression@1");
        expect(text(entry(result, "kind"))).toBe("operator");
        expect(text(entry(result, "operation"))).toBe("multiply");
        const application = entry(result, "operands").values[1];
        expect(text(entry(application, "kind"))).toBe("apply");
        expect(text(entry(application, "semanticId"))).toBe("rix.function.exp@1");
        expect(() => parseAndEvaluate("expression.operation ~= :add", options)).toThrow();
    });

    test("keeps Exp characterization separate from its implementation", () => {
        const options = runtime();
        const record = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .calculus.Exp().Record();
        `, options);
        expect(text(entry(record, "semanticId"))).toBe("rix.function.exp@1");
        expect(entry(record, "hasImplementation")).toBeNull();
        const fact = entry(record, "facts").values[0];
        expect(text(entry(fact, "equation"))).toBe("derivativeEqualsSelf");
        expect(entry(fact, "initialPoint").value).toBe(0n);
        expect(entry(fact, "initialValue").value).toBe(1n);
        expect(() => parseAndEvaluate(".calculus.Exp()(1)", options)).toThrow("no attached implementation");
    });

    test("dispatches concrete evaluation through an explicitly attached callable", () => {
        const options = runtime();
        const exact = parseAndEvaluate(`
            .Plugin.Load("calculus");
            Square := .calculus.Function("example.square@1", {=
                name=:Square,
                implementation=(x)->x*x,
                implementationEvidence=:definition
            });
            {: Square(3/2), Square.Record() };
        `, options);
        expect(exact.values[0].toString()).toBe("9/4");
        expect(entry(exact.values[1], "hasImplementation").value).toBe(1n);
        expect(text(entry(exact.values[1], "implementationEvidence"))).toBe("definition");
    });

    test("links abstract Exp to the certified Numerics realization", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            CertifiedExp := (x)->.numerics.Exp(x);
            Exp := .calculus.Exp(CertifiedExp);
            .numerics.Refine(Exp(0), {= absoluteWidth=1/1000, maxWork=20 });
        `, options);
        expect(text(entry(result, "status"))).toBe("enclosed");
        expect(entry(result, "certified").value).toBe(1n);
        expect(entry(result, "interval").toString()).toBe("1:1");
    });

    test("round-trips semantic applications through core symbolic specs", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            x := .calculus.Variable(:x);
            Exp := .calculus.Exp();
            expression := 3 * Exp(x^2 + 1);
            spec := .calculus.ToSpec(expression);
            restored := .calculus.FromSpec(spec);
            {: spec, restored, .calculus.ToSpec(restored),
               .calculus.IsExpression(restored), .calculus.ToSpec(restored + 1) };
        `, options);

        expect(formatValue(result.values[0])).toBe("{#x# 3 * Exp(x ^ 2 + 1) }");
        expect(text(entry(result.values[1], "schema"))).toBe("rix.calculus.expression@1");
        expect(formatValue(result.values[2])).toBe("{#x# 3 * Exp(x ^ 2 + 1) }");
        expect(result.values[3].value).toBe(1n);
        expect(formatValue(result.values[4])).toBe("{#x# 3 * Exp(x ^ 2 + 1) + 1 }");
        expect(() => parseAndEvaluate(".calculus.ToSpec(expression, [])", options))
            .toThrow("inputs omit free variable(s): x");
        expect(() => parseAndEvaluate(".calculus.FromSpec({#x# .Abs(x) })", options))
            .toThrow("unsupported symbolic operation 'SYS_CALL'");
    });

    test("exports the same bridge for JavaScript plugin consumers", () => {
        const options = runtime();
        const expression = parseAndEvaluate(`
            .Plugin.Load("calculus");
            x := .calculus.Variable(:x);
            2*x + 1;
        `, options);
        const spec = calculusExpressionToSpec(expression);
        expect(formatValue(spec)).toBe("{#x# 2 * x + 1 }");
        const restored = symbolicSpecToCalculusExpression(spec);
        expect(text(entry(restored, "schema"))).toBe("rix.calculus.expression@1");
        expect(text(entry(restored, "operation"))).toBe("add");
    });
});
