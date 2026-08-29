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
    return map.entries.get(String(key).toLowerCase());
}

function textValue(value) {
    return value?.value ?? null;
}

describe("pure RiX Oracle plugin", () => {
    test("is bundled as RiX source and mounts a callable namespace only when loaded", () => {
        const options = runtime();

        expect(parseAndEvaluate('.Plugin.Info("oracle")[:kind]', options).value).toBe("rix");
        expect(() => parseAndEvaluate(".oracle.Rational(1/3)", options)).toThrow("available but not loaded");

        const oracle = parseAndEvaluate('.Plugin.Load("oracle"); .oracle.Rational(1/3)', options);
        expect(textValue(entry(oracle, "valueKind"))).toBe("oracle");
        expect(textValue(entry(oracle, "constructor"))).toBe("rational");
        expect(entry(oracle, "parameters").entries.get("value").toString()).toBe("1/3");
        expect(options.systemContext.getCapabilityGroups().Numerics).toContain("oracle");
        expect(options.systemContext.getCapabilityGroups().Exact).toContain("oracle");
    });

    test("represents all Phase 1 rational procedures as distinct exact descriptors", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("oracle")', options);

        for (const procedure of ["singular", "reflexive", "halo", "randomHalo", "bisection"]) {
            const oracle = parseAndEvaluate(
                `.oracle.Rational(3/7, {= procedure=:${procedure}, seed=17 })`,
                options,
            );
            expect(textValue(entry(oracle, "procedure"))).toBe(procedure);
            expect(entry(oracle, "parameters").entries.get("value")).toBeInstanceOf(Rational);
        }
    });

    test("distinguishes singular/reflexive answers from fuzzy halo answers", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("oracle")', options);

        const statuses = parseAndEvaluate(`
            interval = (1/2):(3/5);
            delta = 1/10;
            {:
              .oracle.Ask(.oracle.Rational(3/7, {= procedure=:singular }), interval, delta)[:status],
              .oracle.Ask(.oracle.Rational(3/7, {= procedure=:reflexive }), interval, delta)[:status],
              .oracle.Ask(.oracle.Rational(3/7, {= procedure=:halo }), interval, delta)[:status],
              .oracle.Ask(.oracle.Rational(3/7, {= procedure=:bisection }), interval, delta)[:status]
            };
        `, options);

        expect(statuses.values.map(textValue)).toEqual(["no", "no", "yes", "yes"]);
    });

    test("seeded random-halo replay and AskAll expose bounded alternatives", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("oracle")', options);

        const result = parseAndEvaluate(`
            even = .oracle.Rational(3/7, {= procedure=:randomHalo, seed=2 });
            odd = .oracle.Rational(3/7, {= procedure=:randomHalo, seed=3 });
            interval = (1/2):(3/5);
            {:
              .oracle.Ask(even, interval, 1/10)[:status],
              .oracle.Ask(odd, interval, 1/10)[:status],
              .oracle.AskAll(odd, interval, 1/10).Map((answer) -> answer[:status])
            };
        `, options);

        expect(textValue(result.values[0])).toBe("no");
        expect(textValue(result.values[1])).toBe("yes");
        expect(result.values[2].values.map(textValue)).toEqual(["no", "yes"]);
    });

    test("CheckRange validates exact Yes/No/Unknown answer shapes", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("oracle")', options);

        const result = parseAndEvaluate(`
            real = .oracle.Rational(1/3);
            query = .oracle.Query(0:1, 1/10);
            valid = .oracle.Ask(real, 0:1, 1/10);
            invalidProphecy = .oracle.Prophecy(real, 2:3, query);
            invalid = .oracle.Answer(:yes, query, invalidProphecy);
            unknown = .oracle.Answer(:unknown, query);
            {:
              .oracle.CheckRange(valid)[:valid],
              .oracle.CheckRange(invalid)[:valid],
              .oracle.CheckRange(invalid)[:reason],
              .oracle.CheckRange(unknown)[:valid]
            };
        `, options);

        expect(result.values[0].value).toBe(1n);
        expect(result.values[1]).toBeNull();
        expect(textValue(result.values[2])).toBe("rangeViolation");
        expect(result.values[3].value).toBe(1n);
    });

    test("bounded bisection returns an exact enclosure and visible contraction trace", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("oracle")', options);

        const refined = parseAndEvaluate(
            '.oracle.Refine(.oracle.Rational(3/7), {= width=1/1000, maxCalls=20, trace=1 })',
            options,
        );
        expect(textValue(entry(refined, "status"))).toBe("enclosed");
        expect(entry(refined, "interval")).toBeInstanceOf(RationalInterval);
        expect(entry(refined, "achievedWidth").toString()).toBe("1/1024");
        expect(entry(entry(refined, "work"), "calls").value).toBe(11n);

        const widths = entry(refined, "trace").values.map((step) => entry(step, "width"));
        expect(widths).toHaveLength(11);
        for (let index = 1; index < widths.length; index += 1) {
            expect(widths[index].multiply(new Rational(2n)).equals(widths[index - 1])).toBe(true);
        }

        const exhausted = parseAndEvaluate(
            '.oracle.Refine(.oracle.Rational(3/7), {= width=1/1000, maxCalls=3 })',
            options,
        );
        expect(textValue(entry(exhausted, "status"))).toBe("budgetExhausted");
        expect(entry(exhausted, "achievedWidth").toString()).toBe("1/4");
        expect(entry(exhausted, "approximation")).toBeInstanceOf(CertifiedApproximation);
    });

    test("rejects nonpositive tolerances and invalid procedure names", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("oracle")', options);

        expect(() => parseAndEvaluate('.oracle.Query(0:1, 0)', options)).toThrow("delta must be a positive rational");
        expect(() => parseAndEvaluate('.oracle.Refine(.oracle.Rational(1/3), {= width=0 })', options))
            .toThrow("width must be a positive rational");
        expect(() => parseAndEvaluate('.oracle.Rational(1/3, {= procedure=:guess })', options))
            .toThrow("Unknown rational oracle procedure");
    });

    test("adapts procedural answers to logical decisions with unknown evidence", () => {
        const options = runtime();
        const decisions = parseAndEvaluate(`
            .Plugin.Load("oracle");
            query = .oracle.Query(0:1, 1/10);
            real = .oracle.Rational(1/3);
            {:
                .oracle.Decision(.oracle.Ask(real, 0:1, 1/10)),
                .oracle.Decision(.oracle.Ask(real, 2:3, 1/10)),
                .oracle.Decision(.oracle.Answer(:unknown, query, _, :procedureUnknown))
            }
        `, options);
        expect(decisions.values[0].value).toBe(1n);
        expect(decisions.values[1]).toBeNull();
        expect(undecidedReason(decisions.values[2])).toBe("oracleUnknown");
        expect(entry(decisions.values[2].details, "reason").value).toBe("procedureUnknown");
    });

    test("uses language Halo neighborhoods for certified comparison and membership", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("oracle");
            real = .oracle.Rational(3/7);
            {:
                real < {~ 1/2, 1/1000 },
                real > {~ 1/2, 1/1000 },
                real ? {~ 2/5:1/2, 1/1000 },
                real ? {~ 1/2:3/5, 1/1000 }
            }
        `, options);
        expect(result.values[0].value).toBe(1n);
        expect(result.values[1]).toBeNull();
        expect(result.values[2].value).toBe(1n);
        expect(result.values[3]).toBeNull();
    });

    test("preserves a best certified enclosure when a Halo budget is exhausted", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("oracle");
            real = .oracle.Rational(3/7);
            {:
                real < {~ 100, 1/1000, {= maxCalls=0 } },
                real < {~ 1/2, 1/1000, {= maxCalls=0 } }
            }
        `, options);
        expect(result.values[0].value).toBe(1n);
        expect(undecidedReason(result.values[1])).toBe("budgetExhausted");
        expect(entry(result.values[1].details, "backend").value).toBe("oracle");
        expect(entry(result.values[1].details, "achievedWidth").toString()).toBe("2");
    });

    test("builds exact Newton funnels whose every emitted interval brackets the root", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("oracle");
            funnel = .oracle.NthRootFunnel(2, 2, {= start=2 });
            refined = .oracle.FunnelRefine(funnel, {=
                absoluteWidth=1/1000,
                maxCalls=20,
                maxIterations=20,
                trace=1
            });
            oracle = .oracle.FromFunnel(funnel);
            adapted = .oracle.Refine(oracle, {= width=1/1000, maxCalls=20, trace=1 });
            {:
                funnel.Record(),
                funnel.NumericsCapabilities(),
                refined,
                adapted,
                refined[:trace].Map((step) ->
                    step[:interval].Low()^2 <= 2 && step[:interval].High()^2 >= 2
                ),
                .oracle.Ask(oracle, 1:(3/2), 1/1000)
            };
        `, options);

        const [record, capabilities, refined, adapted, bracketChecks, answer] = result.values;
        expect(textValue(entry(record, "constructor"))).toBe("rationalNewtonNthRoot");
        expect(textValue(entry(capabilities, "denotation"))).toBe("singleton");
        expect(entry(capabilities, "certified").value).toBe(1n);
        expect(textValue(entry(refined, "status"))).toBe("enclosed");
        expect(entry(refined, "certified").value).toBe(1n);
        expect(entry(refined, "achievedWidth").lessThan(new Rational(1n, 1000n))).toBe(true);
        expect(entry(refined, "interval")).toBeInstanceOf(RationalInterval);
        expect(bracketChecks.values.every((value) => value?.value === 1n)).toBe(true);
        expect(textValue(entry(adapted, "status"))).toBe("enclosed");
        expect(entry(adapted, "interval").toString()).toBe(entry(refined, "interval").toString());
        expect(textValue(entry(answer, "status"))).toBe("yes");

        const trace = entry(refined, "trace").values.map((step) => entry(step, "interval"));
        for (let index = 1; index < trace.length; index += 1) {
            expect(trace[index - 1].overlaps(trace[index])).toBe(true);
        }
    });

    test("keeps Newton exhaustion certified and distinct from reaching the target", () => {
        const options = runtime();
        const exhausted = parseAndEvaluate(`
            .Plugin.Load("oracle");
            .oracle.FunnelRefine(
                .oracle.NthRootFunnel(2, 2),
                {= absoluteWidth=1/1000, maxCalls=0, maxIterations=0, trace=1 }
            );
        `, options);

        expect(textValue(entry(exhausted, "status"))).toBe("budgetExhausted");
        expect(entry(exhausted, "goalMet")).toBeNull();
        expect(entry(exhausted, "certified").value).toBe(1n);
        expect(entry(exhausted, "interval").containsValue(new Rational(1n))).toBe(true);
        expect(entry(exhausted, "interval").containsValue(new Rational(2n))).toBe(true);
        expect(entry(exhausted, "approximation")).toBeInstanceOf(CertifiedApproximation);
    });

    test("adapts certified Cauchy refinement through the generic funnel protocol", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("cauchy");
            source = .cauchy.Geometric(1, 1/2);
            generic = .oracle.ToFunnel(source, {= name=:binaryGeometric });
            viaCauchy = .oracle.Cauchy(source);
            declared = .cauchy.Certified((n)->1, (n)->0, (radius)->0);
            {:
                .oracle.FunnelRefine(generic, {= absoluteWidth=1/1000, maxCalls=20 }),
                .oracle.Refine(viaCauchy, {= width=1/1000, maxCalls=20 }),
                generic.Record(),
                .oracle.ToFunnel(declared, {= evidenceLevel=:proof }).NumericsCapabilities(),
                .oracle.Ask(viaCauchy, 0:1, 1/(2^150))
            };
        `, options);

        const [generic, adapted, record, declaredCapabilities, unknown] = result.values;
        expect(textValue(entry(generic, "status"))).toBe("enclosed");
        expect(textValue(entry(generic, "backend"))).toBe("oracleFunnel");
        expect(entry(generic, "interval").containsValue(new Rational(2n))).toBe(true);
        expect(entry(generic, "achievedWidth").lessThan(new Rational(1n, 1000n))).toBe(true);
        expect(textValue(entry(adapted, "status"))).toBe("enclosed");
        expect(entry(adapted, "interval").containsValue(new Rational(2n))).toBe(true);
        expect(textValue(entry(record, "kind"))).toBe("provider");
        expect(textValue(entry(entry(record, "compatibilityEvidence"), "property")))
            .toBe("pairwiseIntersection");
        expect(entry(declaredCapabilities, "evidenceLevels").values.map(textValue))
            .toEqual(["constructorGuarantee"]);
        expect(textValue(entry(unknown, "status"))).toBe("unknown");
        expect(textValue(entry(unknown, "reason"))).toBe("budgetExhausted");
        expect(entry(entry(unknown, "evidence"), "interval").containsValue(new Rational(2n))).toBe(true);
    });

    test("reports coarse eta resolution independently of work exhaustion", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("oracle");
            .Plugin.Load("numerics");
            coarse = .oracle.Coarse((2/5):(3/5), 1/10);
            {:
                .oracle.Refine(coarse, {= width=1/4, maxCalls=0 }),
                .oracle.Refine(coarse, {= width=1/1000, maxCalls=0 }),
                .numerics.Refine(coarse, {= absoluteWidth=1/1000, maxWork=0 }),
                coarse.NumericsCapabilities(),
                .oracle.Ask(coarse, 0:1, 1/10),
                .oracle.Ask(coarse, (4/5):1, 1/100),
                .oracle.Ask(coarse, (1/2):(51/100), 1/100)
            };
        `, options);

        const [wide, fine, genericFine, capabilities, yes, no, unknown] = result.values;
        expect(textValue(entry(wide, "status"))).toBe("enclosed");
        expect(textValue(entry(fine, "status"))).toBe("resolutionFloor");
        expect(entry(fine, "certified").value).toBe(1n);
        expect(entry(entry(fine, "work"), "exhausted")).toBeNull();
        expect(entry(fine, "diagnostics").values.map(textValue)).toContain("etaResolutionFloor");
        expect(textValue(entry(genericFine, "status"))).toBe("resolutionFloor");
        expect(entry(genericFine, "interval").toString()).toBe("2/5:3/5");
        expect(textValue(entry(capabilities, "denotation"))).toBe("coarseCompatibilityClass");
        expect(entry(capabilities, "arbitraryRefinement")).toBeNull();
        expect(entry(capabilities, "minimumWidth").toString()).toBe("1/5");
        expect([yes, no, unknown].map((answer) => textValue(entry(answer, "status"))))
            .toEqual(["yes", "no", "unknown"]);
        expect(textValue(entry(unknown, "reason"))).toBe("etaResolution");

        expect(() => parseAndEvaluate('.oracle.Coarse(0:1, 1/10)', options))
            .toThrow("must not exceed 2*eta");
    });

    test("Phase 3 compares within epsilon without promoting compatibility to equality", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("oracle");
            third := .oracle.Rational(1/3);
            same := .oracle.Rational(1/3,{= procedure=:halo });
            root := .oracle.NthRoot(2,2);
            p := .oracle.Prophecy(third,(1/4):(1/2));
            q := .oracle.Prophecy(same,(1/3):(2/3));
            {:
                .oracle.CompareWithin(third,.oracle.Rational(2/3),1/100),
                .oracle.CompareWithin(root,root,1/100,{= maxCalls=40 }),
                .oracle.Equivalent(third,same),
                .oracle.Equivalent(third,.oracle.Rational(2/3)),
                .oracle.Equivalent(root,root,{= epsilon=1/100,maxCalls=40 }),
                .oracle.Compatible(p,q)
            };
        `, options);
        const [less, compatible, equal, different, undecided, prophecies] = result.values;
        expect(textValue(entry(less, "status"))).toBe("less");
        expect(entry(less, "certified").value).toBe(1n);
        expect(textValue(entry(compatible, "status"))).toBe("compatible");
        const common = entry(compatible, "commonInterval");
        expect(common.high.subtract(common.low).lessThanOrEqual(new Rational(1n, 100n))).toBe(true);
        expect(textValue(entry(equal, "status"))).toBe("equal");
        expect(textValue(entry(different, "status"))).toBe("different");
        expect(textValue(entry(undecided, "status"))).toBe("undecided");
        expect(entry(undecided, "certified")).toBeNull();
        expect(textValue(entry(prophecies, "status"))).toBe("yes");
        expect(entry(prophecies, "certified").value).toBe(1n);
    });

    test("Phase 3 exposes named arithmetic and certified arithmetic funnels", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("oracle");
            x := .oracle.Rational(2/3);
            y := .oracle.Rational(3/5);
            funnel := .oracle.FunnelOperation(:mul,x,y);
            {:
                .oracle.Refine(.oracle.Negate(x)),
                .oracle.Refine(.oracle.Add(x,y)),
                .oracle.Refine(.oracle.Subtract(x,y)),
                .oracle.Refine(.oracle.Multiply(x,y)),
                .oracle.Refine(.oracle.Reciprocal(x)),
                .oracle.Refine(.oracle.Divide(x,y)),
                .oracle.FunnelRefine(funnel,{= absoluteWidth=1/1000,maxCalls=20 })
            };
        `, options);
        const expected = ["-2/3:-2/3", "19/15:19/15", "1/15:1/15", "2/5:2/5", "3/2:3/2", "10/9:10/9", "2/5:2/5"];
        expect(result.values.map((value) => entry(value, "interval").toString())).toEqual(expected);
        expect(result.values.every((value) => entry(value, "certified")?.value === 1n)).toBe(true);
        const unresolved = parseAndEvaluate(
            ".oracle.Refine(.oracle.Reciprocal(.oracle.Rational(0)))",
            options,
        );
        expect(textValue(entry(unresolved, "status"))).toBe("unknown");
        expect(entry(unresolved, "diagnostics").values.map(textValue)).toContain("divisorNotSeparatedFromZero");
    });

    test("Phase 3 testing roots require explicit certified uniqueness evidence", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("oracle");
            evidence := .oracle.RootEvidence({=
                domain=1:2,
                rootExists=1,
                unique=1,
                continuous=1,
                endpointSigns=[:negative,:positive],
                level=:proof,
                source=:tutorialHypotheses
            });
            root := .oracle.Testing({= function=(x)->x^2-2,domain=1:2,rootEvidence=evidence });
            {:
                evidence,
                .oracle.Refine(root,{= width=1/1000,maxCalls=20,trace=1 }),
                .oracle.TruthEvidence(:undecided,:rootAt,root,_,:observed),
                .oracle.PropertyEvidence(:continuous,(x)->x^2-2,1:2,:proof)
            };
        `, options);
        const [evidence, refined, undecided, property] = result.values;
        expect(entry(evidence, "certified").value).toBe(1n);
        expect(textValue(entry(refined, "status"))).toBe("enclosed");
        expect(entry(refined, "interval").low.multiply(entry(refined, "interval").low).lessThanOrEqual(new Rational(2n))).toBe(true);
        expect(entry(refined, "interval").high.multiply(entry(refined, "interval").high).greaterThanOrEqual(new Rational(2n))).toBe(true);
        expect(entry(refined, "trace").values.length).toBeGreaterThan(0);
        expect(entry(undecided, "certified")).toBeNull();
        expect(entry(property, "certified").value).toBe(1n);

        expect(() => parseAndEvaluate(`
            assumed := .oracle.RootEvidence({=
                domain=1:2,rootExists=1,unique=1,continuous=1,
                endpointSigns=[:negative,:positive],level=:assumed
            });
            .oracle.Testing({= function=(x)->x^2-2,domain=1:2,rootEvidence=assumed });
        `, options)).toThrow("explicit proof or constructor-guarantee");
    });
});
