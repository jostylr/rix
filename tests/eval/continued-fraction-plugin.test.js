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
            {: finite.Coefficients(), finite.Convergents(), finite.Value(), literal.Coefficients(), literal.Value() }
        `, options);

        expect(result.values[0].values.map(String)).toEqual(["3", "7", "16"]);
        expect(result.values[1].values.map(String)).toEqual(["3", "22/7", "355/113"]);
        expect(result.values[2].toString()).toBe("355/113");
        expect(result.values[3].values.map(String)).toEqual(["3", "7", "16"]);
        expect(result.values[4].toString()).toBe("355/113");
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
                .numerics.Refine(.cf.Finite([3, 7, 16]), {= absoluteWidth=1/1000 })
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
});
