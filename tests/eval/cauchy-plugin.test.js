import { describe, expect, test } from "bun:test";
import { CertifiedApproximation, RationalInterval } from "@ratmath/core";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
    undecidedReason,
} from "../../src/index.js";
import { CauchySequence, CertifiedCauchyReal } from "../../plugins/cauchy/cauchy.js";

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

function textValue(value) {
    return value?.value ?? null;
}

describe("Cauchy plugin", () => {
    test("is bundled as an opt-in EnclosableReal and Refinable host plugin", () => {
        const options = runtime();
        const info = parseAndEvaluate('.Plugin.Info("cauchy")', options);

        expect(textValue(entry(info, "kind"))).toBe("host");
        expect(textValue(entry(info, "mount"))).toBe("cauchy");
        expect(entry(info, "provides").values.map(textValue)).toEqual([
            "rix.cauchy@1", "rix.refinable@1", "rix.enclosable-real@1",
        ]);
        expect(() => parseAndEvaluate(".cauchy.Geometric(1, 1/2)", options)).toThrow("available but not loaded");
        expect(parseAndEvaluate('.Plugin.Load("cauchy"); .cauchy.Geometric(1, 1/2)', options))
            .toBeInstanceOf(CertifiedCauchyReal);
    });

    test("keeps a bare rational sequence explicitly non-certifying", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("cauchy");
            .Plugin.Load("numerics");
            s = .cauchy.Sequence((n) -> 1/(n+1));
            {: s, s.Term(3), s.Record(), s.NumericsCapabilities(), .numerics.Refine(s) }
        `, options);

        expect(result.values[0]).toBeInstanceOf(CauchySequence);
        expect(result.values[1].toString()).toBe("1/4");
        expect(entry(result.values[2], "certified")).toBeNull();
        expect(entry(result.values[2], "tailModulus")).toBeNull();
        expect(entry(result.values[3], "operations").values).toHaveLength(0);
        expect(textValue(entry(result.values[4], "status"))).toBe("unsupported");
        expect(entry(result.values[4], "diagnostics").values.map(textValue)).toContain("operationUnsupported");

        const undecided = parseAndEvaluate("s < {~ 1, 1/100 }", options);
        expect(undecidedReason(undecided)).toBe("providerUncertified");
    });

    test("represents an explicit term, tail bound, and modulus certificate", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("cauchy");
            .Plugin.Load("numerics");
            c = .cauchy.Certified(
                (n) -> n == 0 ?: 0 ?_ 1,
                (n) -> n == 0 ?: 1 ?_ 0,
                (radius) -> 1,
                {= name="eventually one", evidence=:eventuallyConstant }
            );
            {: c, c.Term(0), c.Term(1), c.TailBound(1), c.Modulus(1/100),
               c.Enclosure(1), c.Record(),
               .numerics.Refine(c, {= absoluteWidth=1/100, maxWork=3 }) }
        `, options);

        expect(result.values[0]).toBeInstanceOf(CertifiedCauchyReal);
        expect(result.values.slice(1, 5).map(String)).toEqual(["0", "1", "0", "1"]);
        expect(result.values[5].toString()).toBe("1:1");
        expect(textValue(entry(result.values[6], "kind"))).toBe("declared");
        expect(textValue(entry(result.values[7], "status"))).toBe("enclosed");
        expect(textValue(entry(result.values[7], "evidenceLevel"))).toBe("constructorGuarantee");
        expect(entry(result.values[7], "approximation")).toBeInstanceOf(CertifiedApproximation);
        expect(parseAndEvaluate("c.NumericsCapabilities()[:evidenceLevels]", options).values.map(textValue))
            .toEqual(["constructorGuarantee"]);
    });

    test("computes exact geometric terms, tail bounds, moduli, and enclosures", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("cauchy");
            g = .cauchy.Geometric(1, 1/2, {= name="binary geometric" });
            {: g, g.Term(0), g.Term(1), g.Term(3),
               g.TailBound(0), g.TailBound(3), g.Modulus(1/1000),
               g.Enclosure(3), g.Record() }
        `, options);

        expect(result.values[0]).toBeInstanceOf(CertifiedCauchyReal);
        expect(result.values.slice(1, 7).map(String)).toEqual([
            "1", "3/2", "15/8", "1", "1/8", "10",
        ]);
        expect(result.values[7]).toBeInstanceOf(RationalInterval);
        expect(result.values[7].toString()).toBe("7/4:2");
        expect(textValue(entry(result.values[8], "kind"))).toBe("geometric");
        expect(textValue(entry(result.values[8], "name"))).toBe("binary geometric");
        expect(parseAndEvaluate("g.NumericsCapabilities()[:evidenceLevels]", options).values.map(textValue))
            .toEqual(["proof"]);
    });

    test("uses exact geometric tail evidence for generic refinement", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("cauchy");
            .Plugin.Load("numerics");
            g = .cauchy.Geometric(1, 1/2);
            {:
                .numerics.Refine(g, {= absoluteWidth=1/1000, maxWork=20 }),
                .numerics.Refine(g, {= absoluteWidth=1/1000, maxWork=3 })
            }
        `, options);

        const [enclosed, exhausted] = result.values;
        expect(textValue(entry(enclosed, "status"))).toBe("enclosed");
        expect(textValue(entry(enclosed, "backend"))).toBe("cauchy");
        expect(entry(enclosed, "goalMet").value).toBe(1n);
        expect(entry(enclosed, "achievedWidth").toString()).toBe("1/1024");
        expect(entry(enclosed, "interval").toString()).toBe("2047/1024:2");
        expect(entry(entry(enclosed, "work"), "calls").value).toBe(11n);
        expect(entry(entry(enclosed, "work"), "index").value).toBe(11n);
        expect(entry(enclosed, "approximation")).toBeInstanceOf(CertifiedApproximation);

        expect(textValue(entry(exhausted, "status"))).toBe("budgetExhausted");
        expect(entry(exhausted, "achievedWidth").toString()).toBe("1/4");
        expect(entry(entry(exhausted, "work"), "calls").value).toBe(3n);
        expect(entry(exhausted, "certified").value).toBe(1n);
    });

    test("keeps alternating geometric limits inside every certified tail interval", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("cauchy");
            g = .cauchy.Geometric(1, -1/2);
            [0,1,2,3,8].Map((n) -> g.Enclosure(n));
        `, options);

        for (const interval of result.values) {
            expect(interval.containsValue(parseAndEvaluate("2/3", options))).toBe(true);
        }
    });

    test("Halo comparisons use bounded Cauchy refinement evidence", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("cauchy"); g = .cauchy.Geometric(1, 1/2)', options);

        expect(parseAndEvaluate("g < {~ 3, 1/1000 }", options).value).toBe(1n);
        expect(parseAndEvaluate("g > {~ 3, 1/1000 }", options)).toBeNull();

        const undecided = parseAndEvaluate("g < {~ 3/2, 1/1000, {= maxCalls=0 } }", options);
        expect(undecidedReason(undecided)).toBe("budgetExhausted");
    });

    test("validates ratios, exact callbacks, and declared modulus witnesses", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("cauchy")', options);

        expect(() => parseAndEvaluate(".cauchy.Geometric(1, 1)", options)).toThrow("less than one");
        expect(() => parseAndEvaluate(".cauchy.Geometric(1, -1)", options)).toThrow("less than one");
        expect(() => parseAndEvaluate(".cauchy.Sequence((n) -> \"not rational\").Term(0)", options))
            .toThrow("exact Integer or Rational");
        expect(() => parseAndEvaluate(`
            .cauchy.Certified((n)->0, (n)->-1, (radius)->0)
        `, options)).toThrow("must be nonnegative");
        expect(() => parseAndEvaluate(`
            .cauchy.Certified((n)->0, (n)->1, (radius)->0)
                .Refine({= absoluteWidth=1/100, maxWork=3 })
        `, options)).toThrow("modulus certificate failed");
    });
});
