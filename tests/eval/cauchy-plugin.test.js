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
    const normalized = String(key).toLowerCase();
    for (const [candidate, value] of map.entries) {
        if (String(candidate).toLowerCase() === normalized) return value;
    }
    return undefined;
}

function textValue(value) {
    return value?.value ?? null;
}

describe("Cauchy plugin", () => {
    test("is bundled as an opt-in pure RiX EnclosableReal and Refinable plugin", async () => {
        const options = runtime();
        const info = parseAndEvaluate('.Plugin.Info("cauchy")', options);

        expect(textValue(entry(info, "kind"))).toBe("rix");
        expect(textValue(entry(info, "mount"))).toBe("cauchy");
        expect(entry(info, "provides").values.map(textValue)).toEqual([
            "rix.cauchy@1", "rix.refinable@1", "rix.enclosable-real@1",
        ]);
        expect(() => parseAndEvaluate(".cauchy.Geometric(1, 1/2)", options)).toThrow("available but not loaded");
        const value = parseAndEvaluate('.Plugin.Load("cauchy"); .cauchy.Geometric(1, 1/2)', options);
        expect(textValue(entry(value, "kind"))).toBe("geometric");

        const reference = await Bun.file(new URL("../../plugins/cauchy/cauchy.js", import.meta.url)).text();
        expect(reference).toContain("Reference host implementation for comparison");
    });

    test("keeps a bare rational sequence explicitly non-certifying", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("cauchy");
            .Plugin.Load("numerics");
            s = .cauchy.Sequence((n) -> 1/(n+1));
            {: s, s.Term(3), s.Record(), s.NumericsCapabilities(), .numerics.Refine(s) }
        `, options);

        expect(textValue(entry(result.values[0], "kind"))).toBe("bare");
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

        expect(textValue(entry(result.values[0], "kind"))).toBe("declared");
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

        expect(textValue(entry(result.values[0], "kind"))).toBe("geometric");
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
            .toThrow("semantic type Rational");
        expect(() => parseAndEvaluate(`
            .cauchy.Certified((n)->0, (n)->-1, (radius)->0)
        `, options)).toThrow("must be nonnegative");
        expect(() => parseAndEvaluate(`
            .cauchy.Certified((n)->0, (n)->1, (radius)->0)
                .Refine({= absoluteWidth=1/100, maxWork=3 })
        `, options)).toThrow("modulus certificate failed");
    });

    test("builds native arithmetic sequences with exact computed moduli", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("cauchy");
            .Plugin.Load("numerics");
            x = .cauchy.Geometric(1, 1/2);
            y = .cauchy.Geometric(1, -1/2);
            z = .cauchy.Geometric(1, -1/4);
            values = [x+y, x-y, x*y, -x, .Abs(x), y^3, z^(-2), x+1/3, (x+y)*y];
            {:
                values.Map((value) -> value.Record()),
                values.Map((value) -> value.Enclosure(6)),
                values.Map((value) -> value.Modulus(1/1000)),
                values.Map((value) -> .numerics.Refine(value, {=
                    absoluteWidth=1/1000,
                    maxWork=3
                }))
            };
        `, options);

        const expected = [
            new Rational(8n, 3n),
            new Rational(4n, 3n),
            new Rational(4n, 3n),
            new Rational(-2n),
            new Rational(2n),
            new Rational(8n, 27n),
            new Rational(25n, 16n),
            new Rational(7n, 3n),
            new Rational(16n, 9n),
        ];
        expect(result.values[0].values.map((record) => textValue(entry(record, "kind"))))
            .toEqual(Array(expected.length).fill("computed"));
        result.values[1].values.forEach((interval, index) => {
            expect(interval).toBeInstanceOf(RationalInterval);
            expect(interval.containsValue(expected[index])).toBe(true);
        });
        expect(result.values[2].values.every((index) => index.value >= 0n)).toBe(true);
        for (const refinement of result.values[3].values) {
            expect(textValue(entry(refinement, "status"))).toBe("enclosed");
            expect(entry(refinement, "certified").value).toBe(1n);
            expect(entry(refinement, "achievedWidth").lessThanOrEqual(new Rational(1n, 1000n))).toBe(true);
            expect(textValue(entry(refinement, "evidenceLevel"))).toBe("proof");
        }
    });

    test("uses native division only with visible nonzero separation", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("cauchy");
            .Plugin.Load("numerics");
            x = .cauchy.Geometric(1, 1/2);
            two = .cauchy.Certified((n)->2, (n)->0, (radius)->0, {= evidence=:exactTwo });
            native = x/two;
            fallback = x/x;
            {:
                native.Record(),
                native.Enclosure(5),
                fallback.Record(),
                .numerics.Refine(fallback, {= absoluteWidth=1/1000, maxWork=80 })
            };
        `, options);

        expect(textValue(entry(result.values[0], "kind"))).toBe("computed");
        expect(result.values[1].containsValue(new Rational(1n))).toBe(true);
        expect(textValue(entry(result.values[2], "valueKind"))).toBe("cauchyArithmeticReal");
        expect(textValue(entry(result.values[3], "status"))).toBe("enclosed");
        expect(entry(result.values[3], "interval").containsValue(new Rational(1n))).toBe(true);
    });

    test("exposes bounded cloneable lazy terms and a certified Oracle funnel", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("cauchy");
            g = .cauchy.Geometric(1, 1/2);
            terms := g.Terms(0, 5);
            third = terms.Get(3);
            copy := terms;
            fifth = copy.Get(5);
            funnel = g.Funnel({= name=:geometricFunnel });
            {:
                terms,
                third,
                fifth,
                funnel.Record(),
                funnel.Refine({= absoluteWidth=1/1000, maxCalls=20 }),
                funnel.ToOracle().Refine({= absoluteWidth=1/1000, maxCalls=20 })
            };
        `, options);

        expect(result.values[0].type).toBe("lazy_sequence");
        expect(options.context.get("terms")._lazy.cache).toHaveLength(3);
        expect(options.context.get("copy")._lazy.cache).toHaveLength(5);
        expect(result.values[1].toString()).toBe("7/4");
        expect(result.values[2].toString()).toBe("31/16");
        expect(textValue(entry(result.values[3], "kind"))).toBe("provider");
        expect(textValue(entry(result.values[4], "status"))).toBe("enclosed");
        expect(entry(result.values[4], "interval").containsValue(new Rational(2n))).toBe(true);
        expect(textValue(entry(result.values[5], "status"))).toBe("enclosed");
        expect(entry(result.values[5], "interval").containsValue(new Rational(2n))).toBe(true);

        expect(() => parseAndEvaluate("g.Terms(0, -1)", options)).toThrow("nonnegative Integer");
        expect(() => parseAndEvaluate(".cauchy.Sequence((n)->n).Funnel()", options))
            .toThrow("certified effective singleton");
    });

    test("Phase 3 constructs proof-carrying limits without treating assumptions as certificates", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("cauchy");
            proof := .cauchy.LimitProof((n)->0,(radius)->0,{=
                level=:proof,theorem=:constantSequenceLimit,witness=5
            });
            limit := .cauchy.Limit((n)->5,proof,{= name=:five });
            {: proof,limit.Record(),limit.Refine({= absoluteWidth=1/1000,maxCalls=2 }) };
        `, options);
        const [proof, record, refined] = result.values;
        expect(entry(proof, "schema").value).toBe("rix.cauchy.limit-proof@1");
        expect(entry(proof, "certified").value).toBe(1n);
        expect(textValue(entry(record, "kind"))).toBe("declared");
        expect(textValue(entry(entry(record, "evidence"), "kind"))).toBe("proofCarryingLimit");
        expect(textValue(entry(refined, "status"))).toBe("enclosed");
        expect(entry(refined, "interval").toString()).toBe("5:5");

        expect(() => parseAndEvaluate(`
            assumed := .cauchy.LimitProof((n)->0,(radius)->0,{= level=:assumed });
            .cauchy.Limit((n)->5,assumed);
        `, options)).toThrow("requires proof or constructor-guarantee");
    });

    test("Phase 3 applies an evidence-backed Aitken delta-squared transformation", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("cauchy");
            source := .cauchy.Geometric(1,1/2);
            exactProof := .cauchy.LimitProof((n)->0,(radius)->0,{=
                level=:proof,theorem=:geometricAitkenExact
            });
            accelerated := source.Aitken(exactProof);
            {: accelerated.Term(0),accelerated.Term(3),accelerated.Enclosure(0),
               accelerated[:provenance] };
        `, options);
        expect(result.values.slice(0, 3).map(String)).toEqual(["2", "2", "2:2"]);
        expect(textValue(entry(result.values[3], "source"))).toBe("aitkenDeltaSquared");

        expect(() => parseAndEvaluate(`
            flat := .cauchy.Sequence((n)->5);
            flat.Aitken(exactProof);
        `, options)).toThrow("nonzero second difference");
    });

    test("Phase 3 derives an effective same-limit subsequence with computed modulus", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("cauchy");
            source := .cauchy.Geometric(1,1/2);
            selected := .cauchy.Subsequence(source,2,1,{= name=:oddPartialSums });
            {: selected.Term(0),selected.Term(1),selected.TailBound(1),
               selected.Modulus(1/100),selected.Record(),
               selected.Refine({= absoluteWidth=1/100,maxCalls=10 }) };
        `, options);
        expect(result.values.slice(0, 4).map(String)).toEqual(["3/2", "15/8", "1/8", "3"]);
        const evidence = entry(result.values[4], "evidence");
        expect(textValue(entry(evidence, "kind"))).toBe("monotoneSubsequence");
        expect(entry(evidence, "stride").value).toBe(2n);
        expect(textValue(entry(result.values[5], "status"))).toBe("enclosed");
        expect(entry(result.values[5], "interval").containsValue(new Rational(2n))).toBe(true);
    });

    test("Phase 3 diagnoses missing effective tail information as observed, not proved", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("cauchy");
            bare := .cauchy.Sequence((n)->1/(n+1));
            effective := .cauchy.Geometric(1,1/2);
            {: .cauchy.Diagnose(bare,{= count=4 }),.cauchy.Diagnose(effective) };
        `, options);
        const [bare, effective] = result.values;
        expect(textValue(entry(bare, "status"))).toBe("missingEffectiveTailInformation");
        expect(entry(bare, "certified")).toBeNull();
        expect(entry(entry(bare, "observations"), "terms").values.map(String))
            .toEqual(["1", "1/2", "1/3", "1/4"]);
        expect(entry(bare, "diagnostics").values.map(textValue)).toContain("finiteTermsDoNotProveCauchy");
        expect(entry(bare, "required").values.map(textValue)).toEqual(["tailBound", "modulus"]);
        expect(textValue(entry(effective, "status"))).toBe("effective");
        expect(entry(effective, "certified").value).toBe(1n);
    });
});
