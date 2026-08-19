import { describe, expect, test } from "bun:test";
import { RationalIntervalSet } from "@ratmath/core";
import {
    Context,
    calculusGraphRangeCheckValue,
    checkCalculusDerivativeTransformation,
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
            expression := .calculus.Exp()(x);
            .numerics.GraphRange(expression,{= x=0:1 });
        `, runtime());
        expect(text(entry(result, "status"))).toBe("unknown");
        expect(entry(result, "certified")).toBeNull();
        expect(text(entry(result, "domainStatus"))).toBe("unresolved");
        expect(text(entry(result, "diagnostics").values[0])).toBe(
            "unsupportedSemanticApplication:rix.function.exp@1",
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
            {:
              .numerics.CheckDerivativeGraph(quotient),
              .numerics.CheckDerivativeGraph(zeroPower),
              quotient,
              zeroPower
            };
        `, options);
        const [quotientCheck, zeroCheck] = result.values;
        expect(entry(quotientCheck, "accepted").value).toBe(1n);
        expect(entry(quotientCheck, "obligationDescriptors").values).toHaveLength(1);
        expect(entry(zeroCheck, "accepted").value).toBe(1n);
        expect(text(entry(zeroCheck, "obligationDescriptors").values[0]))
            .toContain("zeroPowerZeroDomain");

        const transformation = result.values[2];
        const changedGraph = { ...transformation, entries: new Map(transformation.entries) };
        changedGraph.entries.set("expression", entry(transformation, "source"));
        expect(checkCalculusDerivativeTransformation(changedGraph)).toMatchObject({
            accepted: false,
            reason: "derivativeGraphMismatch",
        });

        const zeroPower = result.values[3];
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
});
