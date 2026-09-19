import { describe, expect, test } from "bun:test";
import { CertifiedApproximation, Rational, RationalInterval } from "@ratmath/core";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
    undecidedReason,
} from "../../src/index.js";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

function entry(map, key) {
    const requested = String(key).toLowerCase();
    for (const [name, value] of map.entries) {
        if (String(name).toLowerCase() === requested) return value;
    }
    return null;
}

function textValue(value) {
    return value?.value ?? null;
}

describe("Continued Fraction plugin", () => {
    test("is a bundled opt-in pure RiX EnclosableReal with a short alias", () => {
        const options = runtime();
        const info = parseAndEvaluate('.Plugin.Info("continued-fraction")', options);

        expect(textValue(entry(info, "kind"))).toBe("rix");
        expect(textValue(entry(info, "mount"))).toBe("continuedFraction");
        expect(entry(info, "aliases").values.map(textValue)).toEqual(["cf"]);
        expect(entry(info, "provides").values.map(textValue)).toContain("rix.enclosable-real@1");
        expect(() => parseAndEvaluate(".cf.Sqrt2()", options)).toThrow("available but not loaded");

        const value = parseAndEvaluate('.Plugin.Load("continued-fraction"); .cf.Sqrt2()', options);
        expect(textValue(entry(value, "kind"))).toBe("periodic");
        expect(() => parseAndEvaluate('value = .cf.Sqrt2(); value.Set!("kind", :fake)', options))
            .toThrow("immutable value");
    });

    test("represents finite simple continued fractions and interoperates with exact literals", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("continued-fraction");
            finite = .cf.Finite([3, 7, 16]);
            literal = .continuedFraction(3.~7~16);
            {: finite.Coefficients(), finite.Convergents(), finite.Value(), finite.Enclosure(), literal.Coefficients(), literal.Value() }
        `, options);

        expect(result.values[0].values.map(String)).toEqual(["3", "7", "16"]);
        expect(result.values[1].values.map(String)).toEqual(["3", "22/7", "355/113"]);
        expect(result.values[2].toString()).toBe("355/113");
        expect(result.values[3].toString()).toBe("355/113:355/113");
        expect(result.values[4].values.map(String)).toEqual(["3", "7", "16"]);
        expect(result.values[5].toString()).toBe("355/113");
        expect(result.values[2]).toEqual(parseAndEvaluate("355/113", options));
    });

    test("supports lazy coefficient rules with explicit observed-coefficient validation", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("continued-fraction");
            lazy = .cf.Lazy((n) -> n == 0 ?: 1 ?_ 2);
            {: lazy.Coefficients(6), lazy.Convergent(5), lazy.Enclosure(4) }
        `, options);

        expect(result.values[0].values.map(String)).toEqual(["1", "2", "2", "2", "2", "2"]);
        expect(result.values[1].toString()).toBe("41/29");
        expect(result.values[2]).toBeInstanceOf(RationalInterval);
        expect(result.values[2].toString()).toBe("7/5:17/12");

        expect(() => parseAndEvaluate(
            ".cf.Lazy((n) -> n < 2 ?: 1 ?_ 0).Coefficient(2)",
            options,
        )).toThrow("must be a positive Integer");
    });

    test("gives exact convergent cylinders and error intervals for sqrt(2)", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("continued-fraction");
            root = .cf.Sqrt2();
            {: root.Coefficients(6), root.Convergents(5), root.Enclosure(4), root.ErrorInterval(4), root.Record() }
        `, options);

        expect(result.values[0].values.map(String)).toEqual(["1", "2", "2", "2", "2", "2"]);
        expect(result.values[1].values.map(String)).toEqual(["1", "3/2", "7/5", "17/12", "41/29"]);
        expect(result.values[2].toString()).toBe("7/5:17/12");
        expect(result.values[3].toString()).toBe("-1/60:0");
        expect(textValue(entry(entry(result.values[4], "evidence"), "kind"))).toBe("periodicQuadraticIrrational");
    });

    test("implements bounded Numerics refinement for finite and lazy values", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .Plugin.Load("continued-fraction");
            {:
                .numerics.Refine(.cf.Sqrt2(), {= absoluteWidth=1/1000, maxWork=20 }),
                .numerics.Refine(.cf.Sqrt2(), {= absoluteWidth=1/1000, maxWork=2 }),
                .numerics.Refine(.cf.Finite([3, 7, 16]), {= absoluteWidth=1/1000 }),
                .cf.Finite([3, 7, 16]).NumericsCapabilities()
            }
        `, options);

        const [enclosed, exhausted, finite] = result.values;
        expect(textValue(entry(enclosed, "status"))).toBe("enclosed");
        expect(textValue(entry(enclosed, "backend"))).toBe("continuedFraction");
        expect(entry(enclosed, "achievedWidth").toString()).toBe("1/2030");
        expect(entry(enclosed, "approximation")).toBeInstanceOf(CertifiedApproximation);
        expect(entry(entry(enclosed, "work"), "calls").value).toBe(4n);

        expect(textValue(entry(exhausted, "status"))).toBe("budgetExhausted");
        expect(entry(exhausted, "achievedWidth").toString()).toBe("1/60");
        expect(entry(entry(exhausted, "work"), "calls").value).toBe(2n);

        expect(textValue(entry(finite, "status"))).toBe("enclosed");
        expect(entry(finite, "achievedWidth").toString()).toBe("0");
        expect(entry(result.values[3], "arbitraryRefinement").value).toBe(1n);
    });

    test("participates in Halo comparisons and preserves bounded undecided results", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("continued-fraction")', options);

        expect(parseAndEvaluate(".cf.Sqrt2() < {~ 3/2, 1/1000 }", options).value).toBe(1n);
        expect(parseAndEvaluate(".cf.Sqrt2() > {~ 3/2, 1/1000 }", options)).toBeNull();

        const undecided = parseAndEvaluate(
            ".cf.Sqrt2() < {~ 3/2, 1/1000, {= maxCalls=0 } }",
            options,
        );
        expect(undecidedReason(undecided)).toBe("budgetExhausted");
    });

    test("rejects empty, non-simple, and out-of-range definitions", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("continued-fraction")', options);

        expect(() => parseAndEvaluate(".cf.Finite([])", options)).toThrow("at least one coefficient");
        expect(() => parseAndEvaluate(".cf.Finite([1, 0])", options)).toThrow("positive Integer");
        expect(() => parseAndEvaluate(".cf.Finite([1, 2]).Coefficient(2)", options)).toThrow("no coefficient");
        expect(() => parseAndEvaluate(".cf.Lazy((n) -> 1).Coefficients()", options)).toThrow("explicit coefficient count");
    });

    test("derives primitive quadratic forms from exact periodic Mobius fixed points", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("continued-fraction");
            root = .cf.Sqrt2();
            shifted = root.Translate(3);
            reciprocal = root.Reciprocal();
            {: root.QuadraticForm(), shifted.QuadraticForm(), reciprocal.QuadraticForm() };
        `, options);

        expect(entry(result.values[0], "coefficients").values.map(String)).toEqual(["-2", "0", "1"]);
        expect(entry(result.values[0], "discriminant").toString()).toBe("8");
        expect(textValue(entry(result.values[0], "evidenceLevel"))).toBe("proof");
        expect(textValue(entry(entry(result.values[0], "evidence"), "kind")))
            .toBe("periodicMobiusFixedPoint");
        expect(entry(result.values[1], "coefficients").values.map(String)).toEqual(["7", "-6", "1"]);
        expect(entry(result.values[2], "coefficients").values.map(String)).toEqual(["-1", "0", "2"]);

        expect(() => parseAndEvaluate(".cf.Finite([1,2]).QuadraticForm()", options))
            .toThrow("explicitly periodic");
    });

    test("answers denominator-bounded best-approximation queries with visible work", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("continued-fraction");
            root = .cf.Sqrt2();
            pi = .cf.Finite([3,7,16]);
            {:
                root.BestApproximation(10),
                root.BestApproximation(100, {= maxCoefficients=2 }),
                pi.BestApproximation(100),
                pi.BestApproximation(200)
            };
        `, options);

        const [best, exhausted, finiteBounded, finiteExact] = result.values;
        expect(textValue(entry(best, "status"))).toBe("certified");
        expect(entry(best, "approximation").toString()).toBe("7/5");
        expect(entry(best, "nextDenominator").toString()).toBe("12");
        expect(textValue(entry(best, "optimality"))).toBe("bestApproximationSecondKind");
        expect(entry(entry(best, "work"), "calls").value).toBe(4n);

        expect(textValue(entry(exhausted, "status"))).toBe("budgetExhausted");
        expect(entry(exhausted, "approximation").toString()).toBe("3/2");
        expect(entry(exhausted, "certified")).toBeNull();
        expect(entry(exhausted, "diagnostics").values.map(textValue)).toEqual(["maxCoefficientsReached"]);

        expect(entry(finiteBounded, "approximation").toString()).toBe("22/7");
        expect(entry(finiteExact, "approximation").toString()).toBe("355/113");
        expect(textValue(entry(finiteExact, "status"))).toBe("certified");

        expect(() => parseAndEvaluate("root.BestApproximation(0)", options)).toThrow("positive Integer");
        expect(() => parseAndEvaluate("root.BestApproximation(10, {= maxCoefficients=0 })", options))
            .toThrow("positive Integer");
    });

    test("performs selected exact coefficient-stream arithmetic transformations", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("continued-fraction");
            .Plugin.Load("numerics");
            root = .cf.Sqrt2();
            shifted = root.Translate(3);
            reciprocal = root.Reciprocal();
            finite = .cf.Finite([3,7,16]);
            product = .numerics.Refine(root*reciprocal, {= absoluteWidth=1/1000, maxWork=100 });
            {:
                shifted.Coefficients(6),
                reciprocal.Coefficients(6),
                finite.Translate(3).Value(),
                finite.Reciprocal().Value(),
                product
            };
        `, options);

        expect(result.values[0].values.map(String)).toEqual(["4", "2", "2", "2", "2", "2"]);
        expect(result.values[1].values.map(String)).toEqual(["0", "1", "2", "2", "2", "2"]);
        expect(result.values[2].toString()).toBe("694/113");
        expect(result.values[3].toString()).toBe("113/355");
        expect(textValue(entry(result.values[4], "status"))).toBe("enclosed");
        expect(entry(result.values[4], "interval").containsValue(new Rational(1n))).toBe(true);

        expect(() => parseAndEvaluate(".cf.Finite([-2,2]).Reciprocal()", options))
            .toThrow("positive represented real");
        expect(() => parseAndEvaluate(".cf.Finite([0]).Reciprocal()", options))
            .toThrow("undefined at zero");
    });

    test("uses native Gosper bihomographic streams for all four binary operations", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .Plugin.Load("continued-fraction");
            x = .cf.Sqrt2();
            y = .cf.Periodic([1], [1,2], {= name=:sqrt3 });
            sum = x+y;
            difference = x-y;
            product = x*y;
            quotient = x/y;
            {:
                sum.Record(), difference.Record(), product.Record(), quotient.Record(),
                sum.Coefficients(6), difference.Coefficients(6),
                product.Coefficients(6), quotient.Coefficients(6),
                .numerics.Refine(sum, {= absoluteWidth=1/1000, maxWork=100 })
            };
        `, options);

        for (const record of result.values.slice(0, 4)) {
            expect(textValue(entry(record, "kind"))).toBe("gosper");
            expect(textValue(entry(record, "transducer"))).toBe("bihomographic");
            expect(entry(record, "certified").value).toBe(1n);
        }
        expect(result.values[4].values.map(String)).toEqual(["3", "6", "1", "5", "7", "1"]);
        expect(result.values[5].values.map(String)).toEqual(["-1", "1", "2", "6", "1", "5"]);
        expect(result.values[6].values.map(String)).toEqual(["2", "2", "4", "2", "4", "2"]);
        expect(result.values[7].values.map(String)).toEqual(["0", "1", "4", "2", "4", "2"]);
        expect(textValue(entry(result.values[8], "status"))).toBe("enclosed");
        expect(textValue(entry(result.values[8], "backend"))).toBe("continuedFraction");
        expect(textValue(entry(entry(result.values[8], "evidence"), "kind")))
            .toBe("gosperTransducerEnclosure");
    });

    test("folds exact cases and uses homographic streams for unary and correlated cases", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("continued-fraction");
            finiteSum = .cf.Finite([1,2]) + .cf.Finite([3,4]);
            x = .cf.Sqrt2();
            negated = -x;
            doubled = x+x;
            {:
                finiteSum.Record(), finiteSum.Value(), finiteSum.Coefficients(),
                negated.Record(), negated.Coefficients(6),
                doubled.Record(), doubled.Coefficients(6),
                (x*x).Value(), (x-x).Value(), (x/x).Value()
            };
        `, options);

        expect(textValue(entry(result.values[0], "kind"))).toBe("finite");
        expect(result.values[1].toString()).toBe("19/4");
        expect(result.values[2].values.map(String)).toEqual(["4", "1", "3"]);
        expect(textValue(entry(result.values[3], "transducer"))).toBe("homographic");
        expect(result.values[4].values.map(String)).toEqual(["-2", "1", "1", "2", "2", "2"]);
        expect(textValue(entry(result.values[5], "transducer"))).toBe("homographic");
        expect(result.values[6].values.map(String)).toEqual(["2", "1", "4", "1", "4", "1"]);
        expect(result.values.slice(7).map(String)).toEqual(["2", "0", "1"]);

        const undefinedDivision = parseAndEvaluate("(x/.cf.Finite([0])).Record()", options);
        expect(textValue(entry(undefinedDivision, "valueKind"))).toBe("continuedFractionArithmeticReal");
    });

    test("reports exact zero facts separately from bounded coefficient uncertainty", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("continued-fraction");
            x = .cf.Sqrt2();
            unresolved = .cf.Sqrt2() - .cf.Sqrt2();
            trace = (x + .cf.Periodic([1], [1,2])).CoefficientResult(1, {= trace=1 });
            {:
                .cf.Finite([0]).ZeroStatus(),
                .cf.Finite([0,2]).ZeroStatus(),
                .cf.Lazy((n)->n == 0 ?: 0 ?_ 2).ZeroStatus(),
                (x-x).ZeroStatus(),
                unresolved.CoefficientResult(0, {= maxInputTerms=8 }),
                unresolved.ZeroStatus({= maxInputTerms=8 }),
                trace
            };
        `, options);

        expect(textValue(entry(result.values[0], "status"))).toBe("zero");
        expect(textValue(entry(result.values[1], "status"))).toBe("nonzero");
        expect(textValue(entry(result.values[2], "status"))).toBe("nonzero");
        expect(textValue(entry(result.values[3], "status"))).toBe("zero");
        expect(textValue(entry(result.values[4], "status"))).toBe("budgetExhausted");
        expect(textValue(entry(result.values[4], "reason"))).toBe("coefficientNotStable");
        expect(textValue(entry(result.values[5], "status"))).toBe("unknown");

        const actions = entry(result.values[6], "trace").values
            .map((event) => textValue(entry(event, "action")));
        expect(actions).toContain("input");
        expect(actions).toContain("output");
        expect(entry(result.values[6], "certified").value).toBe(1n);
    });

    test("extracts native regular-CF streams from certified refinable functions", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .Plugin.Load("continued-fraction");
            exponential = .cf.FromRefinable(.numerics.Exp(1));
            logarithm = .cf.FromRefinable(.numerics.Ln(2));
            refined = .numerics.Refine(exponential, {=
                absoluteWidth=1/1000,
                maxWork=100
            });
            transaction = exponential.CoefficientResult(3, {= trace=1 });
            {:
                exponential.Record(),
                exponential.Coefficients(8),
                logarithm.Coefficients(6),
                exponential.Enclosure(5),
                refined,
                transaction
            };
        `, options);

        expect(textValue(entry(result.values[0], "kind"))).toBe("extractor");
        expect(textValue(entry(result.values[0], "transducer"))).toBe("mobiusStableFloor");
        expect(textValue(entry(result.values[0], "extraction"))).toBe("acceleratedFarey");
        expect(result.values[1].values.map(String)).toEqual(["2", "1", "2", "1", "1", "4", "1", "1"]);
        expect(result.values[2].values.map(String)).toEqual(["0", "1", "2", "3", "1", "6"]);
        // CFWitness retains previous-to-current orientation, including a descending pair.
        expect(result.values[3].toString()).toBe("11/4:19/7");
        expect(result.values[3].low.toString()).toBe("19/7");
        expect(result.values[3].high.toString()).toBe("11/4");
        expect(textValue(entry(result.values[4], "status"))).toBe("enclosed");
        expect(textValue(entry(result.values[4], "backend"))).toBe("continuedFraction");
        expect(textValue(entry(entry(result.values[4], "evidence"), "kind")))
            .toBe("certifiedContinuedFractionExtraction");
        expect(entry(result.values[5], "coefficient").toString()).toBe("1");
        expect(entry(result.values[5], "trace").values.length).toBeGreaterThan(0);
    });

    test("keeps rational-boundary uncertainty structured during generic extraction", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .Plugin.Load("continued-fraction");
            generic = .cf.FromRefinable(.numerics.Sqrt(4));
            bounded = generic.CoefficientResult(0, {= maxRefinements=4 });
            {:
                bounded,
                generic.ZeroStatus({= maxRefinements=4 }),
                .cf.Sqrt(4).Value()
            };
        `, options);

        expect(textValue(entry(result.values[0], "status"))).toBe("budgetExhausted");
        expect(textValue(entry(result.values[0], "reason"))).toBe("coefficientNotStable");
        expect(entry(result.values[0], "certified")).toBeNull();
        expect(textValue(entry(result.values[1], "status"))).toBe("unknown");
        expect(result.values[2].toString()).toBe("2");
    });

    test("uses exact and periodic root specializations before generic extraction", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("continued-fraction");
            square = .cf.Sqrt(2/3);
            cube = .cf.NthRoot(2,3);
            {:
                .cf.Sqrt(2).Coefficients(8),
                square.Record(), square.Coefficients(8),
                .cf.NthRoot(27,3).Value(),
                .cf.NthRoot(8/27,3).Value(),
                .cf.NthRoot(-8,3).Value(),
                cube.Record(), cube.Coefficients(6)
            };
        `, options);

        expect(result.values[0].values.map(String)).toEqual(["1", "2", "2", "2", "2", "2", "2", "2"]);
        expect(textValue(entry(result.values[1], "kind"))).toBe("periodic");
        expect(entry(result.values[1], "prefix").values.map(String)).toEqual(["0", "1"]);
        expect(entry(result.values[1], "period").values.map(String)).toEqual(["4", "2"]);
        expect(result.values[2].values.map(String)).toEqual(["0", "1", "4", "2", "4", "2", "4", "2"]);
        expect(result.values.slice(3, 6).map(String)).toEqual(["3", "2/3", "-2"]);
        expect(textValue(entry(result.values[6], "kind"))).toBe("extractor");
        expect(result.values[7].values.map(String)).toEqual(["1", "3", "1", "5", "1", "1"]);

        expect(() => parseAndEvaluate(".cf.Sqrt(-1)", options))
            .toThrow("nonnegative");
    });

    test("Phase 3 evaluates and canonically regularizes signed generalized forms", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("continued-fraction");
            nonregular := .cf.GeneralizedFinite(1,[-1,2],[2,-3],{= name=:signed });
            normalization := nonregular.Normalize();
            {:
                nonregular.Record(),nonregular.Convergents(),nonregular.Value(),
                normalization,normalization[:normalized].Value(),nonregular.ZeroStatus()
            };
        `, options);
        expect(entry(result.values[0], "schema").value)
            .toBe("rix.continued-fraction.generalized-finite@1");
        expect(entry(result.values[0], "numerators").values.map(String)).toEqual(["-1", "2"]);
        expect(result.values[1].values.map(String)).toEqual(["1", "1/2", "1/4"]);
        expect(result.values[2].toString()).toBe("1/4");
        expect(entry(result.values[3], "coefficients").values.map(String)).toEqual(["0", "4"]);
        expect(textValue(entry(result.values[3], "rule"))).toBe("exactFiniteRegularization");
        expect(result.values[4].toString()).toBe("1/4");
        expect(textValue(entry(result.values[5], "status"))).toBe("nonzero");
        expect(textValue(entry(result.values[5], "reason"))).toBe("exactGeneralizedFiniteValue");
    });

    test("Phase 3 keeps generalized zero-denominator separation explicit", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("continued-fraction");
            singular := .cf.GeneralizedFinite(1,[1],[0]);
            {: singular.ConvergentResult(2),singular.ZeroStatus() };
        `, options);
        expect(textValue(entry(result.values[0], "status"))).toBe("denominatorZero");
        expect(entry(result.values[0], "denominator").toString()).toBe("0");
        expect(textValue(entry(result.values[0], "reason")))
            .toBe("convergentDenominatorNotSeparatedFromZero");
        expect(textValue(entry(result.values[1], "status"))).toBe("unknown");
        expect(entry(result.values[1], "certified")).toBeNull();

        expect(() => parseAndEvaluate("singular.Value()", options)).toThrow("denominator is zero");
        expect(() => parseAndEvaluate("singular.Normalize()", options)).toThrow("denominator nonzero");
        expect(() => parseAndEvaluate(".cf.GeneralizedFinite(0,[0],[1])", options))
            .toThrow("zero numerator terminates");
        expect(() => parseAndEvaluate(".cf.GeneralizedFinite(0,[1],[1,2])", options))
            .toThrow("equal length");
    });
});
