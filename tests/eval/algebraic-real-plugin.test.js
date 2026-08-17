import { describe, expect, test } from "bun:test";
import { CertifiedApproximation, RationalInterval } from "@ratmath/core";
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

describe("Algebraic Real plugin", () => {
    test("is a bundled opt-in pure RiX exact-real provider with a short alias", () => {
        const options = runtime();
        const info = parseAndEvaluate('.Plugin.Info("algebraic-real")', options);

        expect(textValue(entry(info, "kind"))).toBe("rix");
        expect(textValue(entry(info, "mount"))).toBe("algebraicReal");
        expect(entry(info, "aliases").values.map(textValue)).toEqual(["ar"]);
        expect(entry(info, "provides").values.map(textValue)).toContain("rix.exact-sign@1");
        expect(entry(info, "provides").values.map(textValue)).toContain("rix.enclosable-real@1");
        expect(() => parseAndEvaluate(".ar.Sqrt2()", options)).toThrow("available but not loaded");

        const value = parseAndEvaluate('.Plugin.Load("algebraic-real"); .ar.Sqrt2()', options);
        expect(textValue(entry(value, "valueKind"))).toBe("algebraicReal");
        const polynomial = parseAndEvaluate(".ar.Sqrt2().Polynomial()", options);
        expect(polynomial.type).toBe("lambda");
        expect(polynomial._ext.get("__type").value).toBe("Polynomial");
        expect(() => parseAndEvaluate('value = .ar.Sqrt2(); value.Set!("rootIndex", 1)', options))
            .toThrow("immutable value");
    });

    test("normalizes integer polynomials and certifies square-free Sturm isolation", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("algebraic-real");
            root = .ar.Root([-4, 0, 2], 1:2, 2);
            {:
                root.Coefficients(),
                root.Polynomial().Degree(),
                root.Polynomial().SturmSequence(),
                .ar.RootCount([-2, 0, 1], -2:-1),
                .ar.RootCount([-2, 0, 1], 1:2),
                root.Record()
            }
        `, options);

        expect(result.values[0].values.map(String)).toEqual(["-2", "0", "1"]);
        expect(result.values[1].value).toBe(2n);
        expect(result.values[2].values.map((polynomial) => polynomial.values.map(String)))
            .toEqual([["-2", "0", "1"], ["0", "2"], ["2"]]);
        expect(result.values[3].value).toBe(1n);
        expect(result.values[4].value).toBe(1n);
        expect(textValue(entry(entry(result.values[5], "evidence"), "kind"))).toBe("sturmIsolation");
        expect(entry(entry(result.values[5], "evidence"), "rootIndex").value).toBe(2n);
    });

    test("gives exact sign and rational comparisons for sqrt(2), including zero roots", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("algebraic-real");
            positive = .ar.Sqrt2();
            negative = .ar.Sqrt2(-1);
            zero = .ar.Root([0, 1], -1:1, 1);
            {:
                positive.Sign(), negative.Sign(), zero.Sign(),
                positive.CompareRational(7/5),
                positive.CompareRational(3/2),
                zero.CompareRational(0),
                positive.EvaluatePolynomial(3/2),
                positive.SignEvidence()[:schema],
                positive.SignEvidence()[:sign],
                positive.RootCountEvidence(-2:2)[:schema],
                positive.RootCountEvidence(-2:2)[:count]
            }
        `, options);

        expect(result.values.slice(0, 6).map(textValue)).toEqual([
            "positive", "negative", "zero", "greater", "less", "equal",
        ]);
        expect(result.values[6].toString()).toBe("1/4");
        expect(result.values.slice(7, 10).map(textValue)).toEqual([
            "rix.exact.sign-witness@1", "positive", "rix.exact.root-count@1",
        ]);
        expect(String(result.values[10])).toBe("2");
    });

    test("refines by exact bisection and participates in Numerics and Halo", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .Plugin.Load("algebraic-real");
            root = .ar.Sqrt2();
            {:
                .numerics.Refine(root, {= absoluteWidth=1/1000, maxWork=20 }),
                .numerics.Refine(root, {= absoluteWidth=1/1000, maxWork=2 }),
                root < {~ 3/2, 1/1000 }
            }
        `, options);

        const [enclosed, exhausted, comparison] = result.values;
        expect(textValue(entry(enclosed, "status"))).toBe("enclosed");
        expect(textValue(entry(enclosed, "backend"))).toBe("algebraicReal");
        expect(entry(enclosed, "interval")).toBeInstanceOf(RationalInterval);
        expect(entry(enclosed, "achievedWidth").toString()).toBe("1/1024");
        expect(entry(enclosed, "approximation")).toBeInstanceOf(CertifiedApproximation);
        expect(entry(entry(enclosed, "work"), "calls").value).toBe(10n);

        expect(textValue(entry(exhausted, "status"))).toBe("budgetExhausted");
        expect(entry(exhausted, "achievedWidth").toString()).toBe("1/4");
        expect(comparison.value).toBe(1n);

        const undecided = parseAndEvaluate(
            ".ar.Sqrt2() < {~ 3/2, 1/1000, {= maxCalls=0 } }",
            options,
        );
        expect(undecidedReason(undecided)).toBe("budgetExhausted");
    });

    test("round-trips the portable versioned export and revalidates its certificate", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("algebraic-real");
            original = .ar.Sqrt2();
            encoded = original.Export();
            decoded = .ar.Import(encoded);
            {: encoded, decoded.Coefficients(), decoded.Interval(), decoded.RootIndex(), decoded.Sign() }
        `, options);

        expect(textValue(entry(result.values[0], "schema"))).toBe("rix.algebraic-real.export@1");
        expect(entry(result.values[0], "version").value).toBe(1n);
        expect(result.values[1].values.map(String)).toEqual(["-2", "0", "1"]);
        expect(result.values[2].toString()).toBe("1:2");
        expect(result.values[3].value).toBe(2n);
        expect(textValue(result.values[4])).toBe("positive");
    });

    test("rejects repeated factors, non-isolating intervals, endpoint roots, and wrong indices", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("algebraic-real")', options);

        expect(() => parseAndEvaluate(".ar.Root([1, -2, 1], 0:2, 1)", options))
            .toThrow("must be square-free");
        expect(() => parseAndEvaluate(".ar.Root([-2, 0, 1], -2:2, 1)", options))
            .toThrow("exactly one distinct real root");
        expect(() => parseAndEvaluate(".ar.Root([-1, 0, 1], 1:2, 2)", options))
            .toThrow("endpoints cannot be roots");
        expect(() => parseAndEvaluate(".ar.Root([-2, 0, 1], 1:2, 1)", options))
            .toThrow("does not match certified index 2");
    });
});
