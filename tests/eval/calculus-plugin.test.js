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
            "rix.calculus.registry-entry@1",
            "rix.calculus.obligation@1",
            "rix.calculus.transformation@1",
            "rix.calculus.evaluation@1",
            "rix.calculus.derivative-collection@1",
            "rix.calculus.integral@1",
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

    test("propagates linked implementations through composition and exact differentiation", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            Exp := .calculus.Exp((value)->.numerics.Exp(value));
            Log := .calculus.Log((value)->.numerics.Ln(value));
            expression := Exp(x^2);
            derivative := .calculus.Differentiate(expression,:x);
            evaluation := .calculus.EvaluateResult(derivative,{= x=1 });
            composedDerivative := .calculus.DifferentiateResult(Exp(Log(x)),:x);
            composedEvaluation := .calculus.EvaluateResult(composedDerivative,{= x=2 });
            refined := .numerics.Refine(evaluation[:value],{=
                absoluteWidth=1/100,
                maxWork=30
            });
            {: .calculus.Evaluate(x^2+1,{= x=2 }),
               .calculus.ToSpec(derivative), evaluation, composedEvaluation, refined };
        `, options);

        expect(result.values[0].value).toBe(5n);
        expect(formatValue(result.values[1])).toBe("{#x# Exp(x ^ 2) * 2 * x }");
        const evaluation = result.values[2];
        expect(text(entry(evaluation, "schema"))).toBe("rix.calculus.evaluation@1");
        const link = entry(evaluation, "links").values[0];
        expect(text(entry(link, "semanticId"))).toBe("rix.function.exp@1");
        expect(text(entry(link, "evidence"))).toBe("declaredByCaller");
        const composed = result.values[3];
        expect(entry(composed, "links").values.map((item) => text(entry(item, "semanticId"))))
            .toEqual(["rix.function.log.real-principal@1", "rix.function.exp@1"]);
        expect(entry(composed, "obligations").values).toHaveLength(1);
        expect(entry(composed, "obligationValues").values[0].entries.get("subject").value).toBe(2n);
        expect(text(entry(result.values[4], "status"))).toBe("enclosed");
        expect(entry(result.values[4], "certified").value).toBe(1n);
    });

    test("evaluates conditional transformations without pretending to discharge obligations", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            x := .calculus.Variable(:x);
            derivative := .calculus.DifferentiateResult(.calculus.Log()(x),:x);
            .calculus.EvaluateResult(derivative,{= x=2 });
        `, options);

        expect(entry(result, "value").toString()).toBe("1/2");
        expect(entry(result, "obligationsDischarged")).toBeNull();
        const evaluated = entry(result, "obligationValues").values[0];
        expect(entry(evaluated, "subject").value).toBe(2n);
        expect(text(entry(evaluated, "status"))).toBe("unresolved");
        expect(() => parseAndEvaluate(
            ".calculus.Evaluate(derivative,{= x=2 })",
            options,
        )).toThrow("use .calculus.EvaluateResult");
    });

    test("resolves semantic functions through separate registry slots", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            expEntry := .calculus.Resolve("rix.function.exp@1");
            First := .calculus.Function("example.shift@1", {=
                name=:Shift,
                implementation=(x)->x+1,
                implementationEvidence=:definition
            });
            Second := .calculus.Function("example.shift@1", {= name=:Shift });
            {: expEntry, Second(2), .calculus.Resolve(Second) };
        `, options);

        const expEntry = result.values[0];
        expect(text(entry(expEntry, "schema"))).toBe("rix.calculus.registry-entry@1");
        expect(text(entry(expEntry, "semanticId"))).toBe("rix.function.exp@1");
        expect(entry(entry(expEntry, "exactRules"), "derivative")).toBeTruthy();
        expect(entry(expEntry, "implementation")).toBeNull();
        expect(text(entry(entry(expEntry, "domain"), "domain"))).toBe("real");
        expect(entry(expEntry, "branches").values).toEqual([]);
        expect(text(entry(entry(entry(expEntry, "evidence"), "derivative"), "identity")))
            .toBe("derivativeEqualsSelf");

        expect(result.values[1].value).toBe(3n);
        expect(text(entry(entry(result.values[2], "evidence"), "implementation")))
            .toBe("definition");
    });

    test("differentiates arithmetic and Exp compositions exactly", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            x := .calculus.Variable(:x);
            Exp := .calculus.Exp();
            quotient := .calculus.DifferentiateResult((x+1)/(x-1),:x);
            {: .calculus.ToSpec(.calculus.Differentiate(x^3,:x)),
               .calculus.ToSpec(.calculus.Differentiate((x+1)*(x-1),x)),
               .calculus.ToSpec(quotient[:expression]),
               quotient[:obligations],
               .calculus.ToSpec(.calculus.Differentiate(Exp(x^2+1),:x)) };
        `, options);

        expect(result.values.slice(0, 3).map(formatValue)).toEqual([
            "{#x# 3 * x ^ 2 }",
            "{#x# x - 1 + x + 1 }",
            "{#x# (x - 1 - (x + 1)) / (x - 1) ^ 2 }",
        ]);
        const quotientObligations = result.values[3].values;
        expect(quotientObligations).toHaveLength(1);
        expect(text(entry(quotientObligations[0], "relation"))).toBe("nonzero");
        expect(text(entry(quotientObligations[0], "reason"))).toBe("divisionDomain");
        expect(formatValue(result.values[4])).toBe("{#x# Exp(x ^ 2 + 1) * 2 * x }");
        expect(() => parseAndEvaluate(
            ".calculus.Differentiate((x+1)/(x-1),:x)",
            options,
        )).toThrow("use .calculus.DifferentiateResult");
    });

    test("uses differential identities to retain reusable derivative graphs", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            x := .calculus.Variable(:x);
            Exp := .calculus.Exp((value)->value+1);
            derivative := .calculus.DifferentiateResult(Exp(x)^2,:x);
            evaluation := .calculus.EvaluateResult(derivative,{= x=2 });
            {: .calculus.ToSpec(derivative[:expression]),
               derivative[:evidence],
               evaluation };
        `, options);

        expect(formatValue(result.values[0])).toBe("{#x# 2 * Exp(x) ^ 2 }");
        const optimization = result.values[1].values.at(-1);
        expect(text(entry(optimization, "optimization"))).toBe("differentialIdentityReuse");
        expect(text(entry(optimization, "relation"))).toBe("scaledSelfDerivative");
        expect(entry(result.values[2], "value").value).toBe(18n);
        expect(entry(result.values[2], "semanticEvaluations").value).toBe(1n);
    });

    test("shares repeated semantic applications during linked evaluation", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            x := .calculus.Variable(:x);
            Shift := .calculus.Function("example.shift.reuse@1", {=
                name=:Shift,
                implementation=(value)->value+1,
                implementationEvidence=:definition
            });
            expression := Shift(x)+Shift(x);
            shared := .calculus.EvaluateResult(expression,{= x=2 });
            repeated := .calculus.EvaluateResult(expression,{= x=2 },{=
                reuseCommonSubexpressions=_
            });
            {: shared, repeated,
               .calculus.StructuralKey(expression[:operands][1]),
               .calculus.StructuralKey(expression[:operands][2]) };
        `, options);

        const shared = result.values[0];
        const repeated = result.values[1];
        expect(entry(shared, "value").value).toBe(6n);
        expect(entry(shared, "semanticEvaluations").value).toBe(1n);
        expect(entry(shared, "reuseCount").value).toBe(1n);
        expect(entry(shared, "links").values).toHaveLength(1);
        expect(text(entry(entry(shared, "reused").values[0], "kind")))
            .toBe("commonSubexpressionReuse");
        expect(entry(repeated, "semanticEvaluations").value).toBe(2n);
        expect(entry(repeated, "reuseCount").value).toBe(0n);
        expect(text(result.values[2])).toBe(text(result.values[3]));
    });

    test("distinguishes selected primitives, families, and definite integrals", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            x := .calculus.Variable(:x);
            integrand := 2*x;
            primitive := x^2;
            selected := .calculus.SelectedPrimitive(integrand,:x,primitive,{=
                verification=:declaredIdentity,
                evidence=[:powerRule]
            });
            family := .calculus.AntiderivativeFamily(integrand,:x,primitive,:K);
            definite := .calculus.DefiniteIntegral(integrand,:x,0,3);
            {: selected, family, definite,
               .calculus.IsIntegral(selected), .calculus.IsIntegral(integrand) };
        `, options);

        const [selected, family, definite] = result.values;
        expect(text(entry(selected, "schema"))).toBe("rix.calculus.integral@1");
        expect(text(entry(selected, "kind"))).toBe("selectedPrimitive");
        expect(text(entry(selected, "verification"))).toBe("declaredIdentity");
        expect(formatValue(calculusExpressionToSpec(entry(selected, "primitive"))))
            .toBe("{#x# x ^ 2 }");
        expect(text(entry(family, "kind"))).toBe("antiderivativeFamily");
        expect(text(entry(family, "constant"))).toBe("K");
        expect(text(entry(definite, "kind"))).toBe("definiteIntegral");
        expect(entry(entry(definite, "lower"), "value").value).toBe(0n);
        expect(entry(entry(definite, "upper"), "value").value).toBe(3n);
        expect(result.values[3].value).toBe(1n);
        expect(result.values[4]).toBeNull();
    });

    test("preserves real domains and complex branches in differentiation results", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            x := .calculus.Variable(:x);
            logResult := .calculus.DifferentiateResult(.calculus.Log()(x^2),:x);
            sqrtResult := .calculus.DifferentiateResult(.calculus.Sqrt()(x),:x);
            asinResult := .calculus.DifferentiateResult(.calculus.Asin()(x),:x);
            complexResult := .calculus.DifferentiateResult(.calculus.ComplexLog()(x),:x);
            constantLogResult := .calculus.DifferentiateResult(
                .calculus.Log()(.calculus.Constant(1)),
                :x
            );
            {: logResult, sqrtResult, asinResult, complexResult, constantLogResult };
        `, options);

        const [logResult, sqrtResult, asinResult, complexResult, constantLogResult] = result.values;
        expect(text(entry(logResult, "schema"))).toBe("rix.calculus.transformation@1");
        expect(formatValue(parseAndEvaluate(
            ".calculus.ToSpec(logResult[:expression])",
            options,
        ))).toBe("{#x# 1 / x ^ 2 * 2 * x }");
        expect(text(entry(entry(logResult, "obligations").values[0], "relation"))).toBe("positive");
        expect(text(entry(entry(sqrtResult, "obligations").values[0], "relation"))).toBe("positive");
        expect(text(entry(entry(asinResult, "obligations").values[0], "relation")))
            .toBe("insideOpenUnitInterval");
        const branch = entry(complexResult, "obligations").values[0];
        expect(text(entry(branch, "kind"))).toBe("branch");
        expect(text(entry(branch, "relation"))).toBe("offPrincipalLogBranchCut");
        expect(entry(entry(constantLogResult, "expression"), "value").value).toBe(0n);
        expect(entry(constantLogResult, "obligations").values).toHaveLength(1);
        expect(() => parseAndEvaluate(
            ".calculus.Differentiate(.calculus.Log()(x),:x)",
            options,
        )).toThrow("use .calculus.DifferentiateResult");
    });

    test("uses custom exact rules by semantic ID and rejects unjustified rules", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            SquareA := .calculus.Function("example.square@1", {=
                name=:Square,
                domain=:real,
                codomain=:nonnegativeReal
            });
            .calculus.Register(SquareA, {=
                derivative=(application)->2*application[:arguments][1],
                derivativeEvidence=:definition
            });
            SquareB := .calculus.Function("example.square@1", {=
                name=:Square,
                domain=:real,
                codomain=:nonnegativeReal
            });
            x := .calculus.Variable(:x);
            .calculus.ToSpec(.calculus.Differentiate(SquareB(x+1),:x));
        `, options);
        expect(formatValue(result)).toBe("{#x# 2 * (x + 1) }");

        expect(() => parseAndEvaluate(`
            Unknown := .calculus.Function("example.unknown@1", {= name=:Unknown });
            .calculus.Differentiate(Unknown(x),:x);
        `, options)).toThrow("No exact derivative rule is registered");
        expect(() => parseAndEvaluate(
            ".calculus.Differentiate(x^(1/2),:x)",
            options,
        )).toThrow("requires an Integer constant exponent");
    });

    test("lets custom semantic rules declare obligations separately", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            PositiveOnly := .calculus.Function("example.positive-only@1", {=
                name=:PositiveOnly,
                domain=:positiveReal,
                codomain=:real
            });
            .calculus.Register(PositiveOnly, {=
                derivative=(application)->1,
                derivativeObligations=(application)->[
                    .calculus.Obligation(:domain,:positive,application[:arguments][1],{=
                        reason=:customPositiveDomain
                    })
                ],
                derivativeEvidence=:definition
            });
            x := .calculus.Variable(:x);
            .calculus.DifferentiateResult(PositiveOnly(x^2),:x);
        `, options);

        expect(formatValue(calculusExpressionToSpec(entry(result, "expression"))))
            .toBe("{#x# 2 * x }");
        const obligation = entry(result, "obligations").values[0];
        expect(text(entry(obligation, "relation"))).toBe("positive");
        expect(text(entry(obligation, "reason"))).toBe("customPositiveDomain");
        expect(text(entry(entry(result, "evidence").values.at(-1), "rule"))).toBe("semanticChain");
    });

    test("builds higher, partial, gradient, Jacobian, and Hessian derivatives", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            x := .calculus.Variable(:x);
            y := .calculus.Variable(:y);
            scalar := x^2+x*y+y^2;
            gradient := .calculus.Gradient(scalar,[:x,:y]);
            jacobian := .calculus.Jacobian([x*y,x+y],[:x,:y]);
            hessian := .calculus.Hessian(scalar,[:x,:y]);
            higher := .calculus.DifferentiateNResult(.calculus.Log()(x),:x,2);
            {: .calculus.ToSpec(.calculus.DifferentiateN(x^4,:x,3)),
               gradient.Map((expression)->.calculus.ToSpec(expression)),
               jacobian.Map((row)->row.Map((expression)->.calculus.ToSpec(expression))),
               hessian.Map((row)->row.Map((expression)->.calculus.ToSpec(expression))),
               higher };
        `, options);

        expect(formatValue(result.values[0])).toBe("{#x# 4 * 3 * 2 * x }");
        expect(result.values[1].values.map(formatValue)).toEqual([
            "{#x,y# 2 * x + y }",
            "{#x,y# x + 2 * y }",
        ]);
        expect(result.values[2].values.map((row) => row.values.map(formatValue))).toEqual([
            ["{#y# y }", "{#x# x }"],
            ["{# 1 }", "{# 1 }"],
        ]);
        expect(result.values[3].values.map((row) => row.values.map(formatValue))).toEqual([
            ["{# 2 }", "{# 1 }"],
            ["{# 1 }", "{# 2 }"],
        ]);
        const higher = result.values[4];
        expect(entry(higher, "order").value).toBe(2n);
        expect(entry(higher, "variables").values.map(text)).toEqual(["x", "x"]);
        expect(formatValue(calculusExpressionToSpec(entry(higher, "expression"))))
            .toBe("{#x# -1 / x ^ 2 }");
        expect(entry(higher, "obligations").values.map((item) => text(entry(item, "relation"))))
            .toEqual(["positive", "nonzero"]);
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
