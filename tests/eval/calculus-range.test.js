import { describe, expect, test } from "bun:test";
import { RationalIntervalSet } from "@ratmath/core";
import {
    Context,
    calculusGraphRangeCheckValue,
    checkCalculusGraphSimplification,
    checkCalculusDerivativeTransformation,
    checkCalculusStrategyRangeResult,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
    evaluateCalculusLipschitzRange,
    evaluateCalculusTaylorRange,
} from "../../src/index.js";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

function entry(value, key) {
    const wanted = String(key).toLowerCase();
    for (const [candidate, result] of value.entries) {
        if (String(candidate).toLowerCase() === wanted) return result;
    }
    return undefined;
}

function text(value) {
    return value?.value ?? null;
}

function graphRange(source, bindings = "{= x=(-1):1 }", options = "{= }") {
    return parseAndEvaluate(`
        .Plugin.Load("calculus");
        .Plugin.Load("numerics");
        x := .calculus.Variable(:x);
        y := .calculus.Variable(:y);
        expression := ${source};
        .numerics.GraphRange(expression, ${bindings}, ${options});
    `, runtime());
}

describe("checked Calculus graph ranges", () => {
    test("checks safe identities without erasing partial-function domains", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            safe := .numerics.SimplifyGraph(-(-(0 + ((x*1)/1))));
            quotient := .numerics.SimplifyGraph(x/x);
            difference := .numerics.SimplifyGraph(x-x);
            zeroProduct := .numerics.SimplifyGraph(0*(1/x));
            zeroPower := .numerics.SimplifyGraph(x^0);
            {: safe, quotient, difference, zeroProduct, zeroPower };
        `, options);
        const [safe, quotient, difference, zeroProduct, zeroPower] = result.values;
        expect(entry(safe, "changed").value).toBe(1n);
        expect(text(entry(safe, "targetGraph"))).toBe("variable(x)");
        expect(entry(safe, "rules").values.map((rule) => text(entry(rule, "rule"))))
            .toEqual([
                "multiplicativeIdentityRight",
                "divisionIdentity",
                "additiveIdentityLeft",
                "doubleNegation",
            ]);
        expect(entry(entry(safe, "checker"), "accepted").value).toBe(1n);
        for (const unsafe of [quotient, difference, zeroProduct, zeroPower]) {
            expect(entry(unsafe, "changed")).toBeNull();
            expect(text(entry(unsafe, "sourceGraph"))).toBe(text(entry(unsafe, "targetGraph")));
            expect(entry(entry(unsafe, "checker"), "accepted").value).toBe(1n);
        }

        const changed = { ...safe, entries: new Map(safe.entries) };
        changed.entries.set("expression", entry(safe, "source"));
        expect(checkCalculusGraphSimplification(changed)).toMatchObject({
            accepted: false,
            reason: "graphSimplificationMismatch",
        });
    });

    test("lets graph-range evaluation consume only the checked simplification", () => {
        const simplified = graphRange(
            "-(-(x+0))",
            "{= x=(-2):3 }",
            "{= checkedSimplify=1 }",
        );
        expect(entry(simplified, "range").toString()).toBe("[-2,3]");
        expect(entry(simplified, "certified").value).toBe(1n);
        expect(entry(entry(simplified, "simplification"), "changed").value).toBe(1n);
        expect(text(entry(entry(simplified, "simplification"), "targetGraph")))
            .toBe("variable(x)");

        const quotient = graphRange(
            "x/x",
            "{= x=(-1):1 }",
            "{= checkedSimplify=1 }",
        );
        expect(entry(quotient, "range").toString()).toBe("[1,1]");
        expect(text(entry(quotient, "domainStatus"))).toBe("partiallyDefined");
        expect(entry(entry(quotient, "simplification"), "changed")).toBeNull();
        expect(entry(entry(quotient, "checker"), "accepted").value).toBe(1n);
    });

    test("evaluates exact primitive graph nodes and nested composition", () => {
        const square = graphRange("x^2", "{= x=(-2):1 }");
        expect(entry(square, "range").toString()).toBe("[0,4]");
        expect(text(entry(square, "status"))).toBe("enclosed");
        expect(entry(square, "certified").value).toBe(1n);
        expect(entry(square, "exactImage").value).toBe(1n);

        const nested = graphRange("(x+1)*(x-1)");
        expect(entry(nested, "range").toString()).toBe("[-4,0]");
        expect(entry(nested, "certified").value).toBe(1n);
        expect(entry(nested, "exactImage")).toBeNull();
    });

    test("preserves repeated-input identity for subtraction and division", () => {
        const difference = graphRange("x-x", "{= x=1:2 }");
        expect(entry(difference, "range").toString()).toBe("[0,0]");
        expect(entry(entry(difference, "work"), "reuses").value).toBe(1n);
        expect(entry(difference, "exactImage").value).toBe(1n);

        const quotient = graphRange("x/x");
        expect(entry(quotient, "range").toString()).toBe("[1,1]");
        expect(text(entry(quotient, "domainStatus"))).toBe("partiallyDefined");
        expect(text(entry(entry(quotient, "exclusions").values[0], "reason")))
            .toBe("divisionByZero");

        const zero = graphRange("x/x", "{= x=0:0 }");
        expect(entry(zero, "range").isEmpty).toBe(true);
        expect(text(entry(zero, "domainStatus"))).toBe("noDefinedInputs");
    });

    test("does not erase a source-domain hole through a correlated identity", () => {
        const result = graphRange("1/(x-x)");
        expect(entry(result, "range").isEmpty).toBe(true);
        expect(text(entry(result, "domainStatus"))).toBe("noDefinedInputs");
        expect(entry(result, "certified").value).toBe(1n);
    });

    test("inherits scoped domain policy and records the active 0^0 convention", () => {
        const defaultPower = graphRange("x^0", "{= x=0:0 }");
        expect(entry(defaultPower, "range").isEmpty).toBe(true);
        expect(text(entry(defaultPower, "domainStatus"))).toBe("noDefinedInputs");

        const conventional = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            .RangePolicy(
                {= zeroPowerZero=:one },
                .numerics.GraphRange(x^0,{= x=0:0 })
            );
        `, runtime());
        expect(entry(conventional, "range").toString()).toBe("[1,1]");
        expect(text(entry(conventional, "domainStatus"))).toBe("allDefined");
        expect(entry(conventional, "certified").value).toBe(1n);
        expect(entry(entry(conventional, "checker"), "accepted").value).toBe(1n);

        expect(() => parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            .RangePolicy(
                {= divisionByZero=:throw },
                .numerics.GraphRange(x/x,{= x=(-1):1 })
            );
        `, runtime())).toThrow("divisionByZero");
    });

    test("subdivides one exact binding while retaining graph identity", () => {
        const broad = graphRange("x*x");
        const split = graphRange("x*x", "{= x=(-1):1 }", "{= maxSubintervals=2 }");
        expect(entry(broad, "range").toString()).toBe("[-1,1]");
        expect(entry(split, "range").toString()).toBe("[0,1]");
        expect(entry(entry(split, "work"), "subintervals").value).toBe(2n);
        expect(entry(entry(split, "work"), "reuses").value).toBe(2n);
        expect(entry(split, "certified").value).toBe(1n);
    });

    test("treats different variables as independent box coordinates", () => {
        const result = graphRange("x+y", "{= x=1:2, y=3:4 }");
        expect(entry(result, "range").toString()).toBe("[4,6]");
        expect(entry(result, "exactImage").value).toBe(1n);
    });

    test("leaves unsupported semantic applications explicitly unresolved", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            expression := .calculus.Function("test.opaque@1")(x);
            .numerics.GraphRange(expression,{= x=0:1 });
        `, runtime());
        expect(text(entry(result, "status"))).toBe("unknown");
        expect(entry(result, "certified")).toBeNull();
        expect(text(entry(result, "domainStatus"))).toBe("unresolved");
        expect(text(entry(result, "diagnostics").values[0])).toBe(
            "unsupportedSemanticApplication:test.opaque@1",
        );
    });

    test("recognizes polynomial and rational graphs without cancelling source holes", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            {:
              .numerics.RecognizeGraph(x^3-2*x+1,:x),
              .numerics.RecognizeGraph((x+1)/(x-1),:x),
              .numerics.RecognizeGraph(x/x,:x),
              .numerics.RecognizeGraph(1/(x-x),:x)
            };
        `, runtime());
        const [polynomial, rational, cancellation, impossible] = result.values;
        expect(text(entry(polynomial, "kind"))).toBe("polynomial");
        expect(entry(polynomial, "numerator").values.map(String)).toEqual(["1", "-2", "0", "1"]);
        expect(text(entry(rational, "kind"))).toBe("rationalFunction");
        expect(entry(rational, "numerator").values.map(String)).toEqual(["1", "1"]);
        expect(entry(rational, "denominator").values.map(String)).toEqual(["-1", "1"]);
        expect(entry(rational, "sourceDomainRestrictions").values).toHaveLength(1);
        expect(text(entry(cancellation, "kind"))).toBe("rationalFunction");
        expect(entry(cancellation, "sourceDomainRestrictions").values).toHaveLength(1);
        expect(entry(impossible, "recognized")).toBeNull();
        expect(text(entry(impossible, "reason"))).toBe("identicallyZeroDenominator");
    });

    test("recomputes public results and rejects a changed range claim", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            range := .numerics.GraphRange(x-x,{= x=1:2 });
            .numerics.CheckGraphRange(range);
        `, options);
        expect(entry(result, "accepted").value).toBe(1n);

        const rangeValue = options.context.get("range");
        rangeValue.entries.set("range", RationalIntervalSet.point(99));
        const rejected = calculusGraphRangeCheckValue(rangeValue);
        expect(entry(rejected, "accepted")).toBeNull();
        expect(text(entry(rejected, "reason"))).toBe("graphRangeClaimMismatch");
    });

    test("independently checks primitive derivative graphs and domain obligations", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            quotient := .calculus.DifferentiateResult((x+1)/(x-1),:x);
            zeroPower := .calculus.DifferentiateResult(x^0,:x);
            sine := .calculus.DifferentiateResult(.calculus.Sin()(x),:x);
            {:
              .numerics.CheckDerivativeGraph(quotient),
              .numerics.CheckDerivativeGraph(zeroPower),
              .numerics.CheckDerivativeGraph(sine),
              quotient,
              zeroPower
            };
        `, options);
        const [quotientCheck, zeroCheck, sineCheck] = result.values;
        expect(entry(quotientCheck, "accepted").value).toBe(1n);
        expect(entry(quotientCheck, "obligationDescriptors").values).toHaveLength(1);
        expect(entry(zeroCheck, "accepted").value).toBe(1n);
        expect(text(entry(zeroCheck, "obligationDescriptors").values[0]))
            .toContain("zeroPowerZeroDomain");
        expect(entry(sineCheck, "accepted").value).toBe(1n);

        const transformation = result.values[3];
        const changedGraph = { ...transformation, entries: new Map(transformation.entries) };
        changedGraph.entries.set("expression", entry(transformation, "source"));
        expect(checkCalculusDerivativeTransformation(changedGraph)).toMatchObject({
            accepted: false,
            reason: "derivativeGraphMismatch",
        });

        const zeroPower = result.values[4];
        const erasedDomain = { ...zeroPower, entries: new Map(zeroPower.entries) };
        erasedDomain.entries.set("obligations", { type: "sequence", values: [] });
        expect(checkCalculusDerivativeTransformation(erasedDomain)).toMatchObject({
            accepted: false,
            reason: "derivativeObligationMismatch",
        });
    });

    test("certifies a generic derivative sign only after discharging obligations", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            square := .calculus.DifferentiateResult(x^2,:x);
            quotient := .calculus.DifferentiateResult((x+1)/(x-1),:x);
            zeroPower := .calculus.DifferentiateResult(x^0,:x);
            {:
              .numerics.DerivativeSign(square,{= x=1:2 }),
              .numerics.DerivativeSign(square,{= x=(-2):(-1) }),
              .numerics.DerivativeSign(square,{= x=(-1):1 }),
              .numerics.DerivativeSign(quotient,{= x=2:3 }),
              .numerics.DerivativeSign(quotient,{= x=0:2 }),
              .numerics.DerivativeSign(zeroPower,{= x=1:2 }),
              .numerics.DerivativeSign(zeroPower,{= x=0:1 }),
              .RangePolicy(
                {= zeroPowerZero=:one },
                .numerics.DerivativeSign(zeroPower,{= x=0:1 })
              )
            };
        `, runtime());
        const [
            increasing, decreasing, crossing, quotient, pole, constant,
            defaultZeroPower, conventionalZeroPower,
        ] = result.values;
        expect(text(entry(increasing, "direction"))).toBe("nondecreasing");
        expect(entry(increasing, "monotonicityCertified").value).toBe(1n);
        expect(text(entry(decreasing, "direction"))).toBe("nonincreasing");
        expect(text(entry(crossing, "direction"))).toBe("unknown");
        expect(entry(crossing, "certified").value).toBe(1n);
        expect(entry(crossing, "monotonicityCertified")).toBeNull();
        expect(text(entry(quotient, "direction"))).toBe("nonincreasing");
        expect(entry(entry(quotient, "obligationChecks").values[0], "discharged").value)
            .toBe(1n);
        expect(entry(pole, "certified")).toBeNull();
        expect(text(entry(pole, "domainStatus"))).toBe("unresolved");
        expect(text(entry(constant, "direction"))).toBe("constant");
        expect(entry(defaultZeroPower, "monotonicityCertified")).toBeNull();
        expect(text(entry(conventionalZeroPower, "direction"))).toBe("constant");
        expect(text(entry(entry(conventionalZeroPower, "conventions"), "zeroPowerZero")))
            .toBe("one");
    });

    test("certifies midpoint Lipschitz ranges and tightens them by subdivision", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            squareDerivative := .calculus.DifferentiateResult(x^2,:x);
            quotientDerivative := .calculus.DifferentiateResult((x+1)/(x-1),:x);
            {:
              .numerics.LipschitzRange(squareDerivative,{= x=(-1):1 }),
              .numerics.LipschitzRange(
                squareDerivative,{= x=(-1):1 },{= maxSubintervals=2 }
              ),
              .numerics.LipschitzRange(quotientDerivative,{= x=0:2 })
            };
        `, runtime());
        const [broad, split, pole] = result.values;
        expect(entry(broad, "range").toString()).toBe("[-2,2]");
        expect(entry(broad, "certified").value).toBe(1n);
        expect(entry(entry(broad, "checker"), "accepted").value).toBe(1n);
        expect(entry(split, "range").toString()).toBe("[-3/4,5/4]");
        expect(entry(entry(split, "work"), "subintervals").value).toBe(2n);
        expect(entry(entry(split, "partitions").values[0], "lipschitzBound").toString())
            .toBe("2");
        expect(entry(pole, "certified")).toBeNull();
        expect(text(entry(pole, "domainStatus"))).toBe("unresolved");
        expect(text(entry(pole, "diagnostics").values[0])).toBe("lipschitzPremiseNotCertified");
    });

    test("certifies second-derivative Taylor ranges and curvature", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("calculus");
            .Plugin.Load("numerics");
            x := .calculus.Variable(:x);
            squareSecond := .calculus.DifferentiateNResult(x^2,:x,2);
            cubeSecond := .calculus.DifferentiateNResult(x^3,:x,2);
            {:
              .numerics.CheckDerivativeGraph(squareSecond),
              .numerics.DerivativeSign(squareSecond,{= x=(-1):1 }),
              .numerics.TaylorRange(squareSecond,{= x=(-1):1 }),
              .numerics.TaylorRange(cubeSecond,{= x=(-1):1 }),
              .numerics.TaylorRange(
                cubeSecond,{= x=(-1):1 },{= maxSubintervals=2 }
              )
            };
        `, runtime());
        const [identity, wrongOrderSign, square, cube, splitCube] = result.values;
        expect(entry(identity, "accepted").value).toBe(1n);
        expect(entry(identity, "order").value).toBe(2n);
        expect(entry(wrongOrderSign, "certified")).toBeNull();
        expect(text(entry(wrongOrderSign, "diagnostics").values[0]))
            .toBe("derivativeSignRequiresFirstDerivative");
        expect(entry(square, "range").toString()).toBe("[0,1]");
        expect(text(entry(square, "curvature"))).toBe("convex");
        expect(text(entry(entry(square, "partitions").values[0], "curvature")))
            .toBe("convex");
        expect(entry(entry(square, "checker"), "certified").value).toBe(1n);
        expect(entry(cube, "range").toString()).toBe("[-3,3]");
        expect(text(entry(cube, "curvature"))).toBe("unknown");
        expect(entry(splitCube, "range").toString()).toBe("[-5/4,5/4]");
        expect(text(entry(splitCube, "curvature"))).toBe("mixed");
    });

    test("strategy checkers recompute claims and reject changed enclosures", () => {
        const options = runtime();
        const values = parseAndEvaluate(`
            .Plugin.Load("calculus");
            x := .calculus.Variable(:x);
            {:
              .calculus.DifferentiateResult(x^2,:x),
              .calculus.DifferentiateNResult(x^2,:x,2),
              {= x=(-1):1 },
              {= maxSubintervals=2 }
            };
        `, options).values;
        const lipschitz = evaluateCalculusLipschitzRange(values[0], values[2], values[3]);
        const taylor = evaluateCalculusTaylorRange(values[1], values[2], values[3]);
        expect(checkCalculusStrategyRangeResult(lipschitz)).toMatchObject({
            accepted: true, certified: true, strategy: "lipschitzMidpoint",
        });
        expect(checkCalculusStrategyRangeResult(taylor)).toMatchObject({
            accepted: true, certified: true, strategy: "secondDerivativeTaylor",
        });
        expect(checkCalculusStrategyRangeResult({
            ...lipschitz, range: RationalIntervalSet.point(99),
        })).toMatchObject({ accepted: false, reason: "strategyRangeClaimMismatch" });
        expect(checkCalculusStrategyRangeResult({
            ...taylor,
            strategy: "futureTaylorRule",
            evidence: { ...taylor.evidence, strategy: "futureTaylorRule" },
        })).toMatchObject({ accepted: false, reason: "unsupportedRangeStrategy" });
    });
});
