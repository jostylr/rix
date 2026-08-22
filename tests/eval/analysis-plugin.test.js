import { describe, expect, test } from "bun:test";
import {
    Context,
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

function entry(map, key) {
    return map.entries.get(String(key).toLowerCase());
}

function text(value) {
    return value?.value ?? null;
}

describe("pure RiX Analysis plugin", () => {
    test("is bundled over the abstract-function and effective-sequence contracts", () => {
        const info = parseAndEvaluate('.Plugin.Info("analysis")', runtime());
        expect(text(entry(info, "kind"))).toBe("rix");
        expect(entry(info, "requires").values.map(text)).toEqual(["rix.abstract-function@1"]);
        expect(entry(info, "provides").values.map(text)).toEqual([
            "rix.analysis@1",
            "rix.analysis@2",
            "rix.analysis.function-sequence@1",
            "rix.analysis.effective-limit@1",
            "rix.analysis.limit-exchange@1",
        ]);
        expect(entry(info, "schemas").values.map(text)).toEqual([
            "rix.analysis.function-sequence@1",
            "rix.analysis.function-term-stream@1",
            "rix.analysis.tail-evidence@1",
            "rix.analysis.convergence-claim@1",
            "rix.analysis.convergence-result@1",
            "rix.analysis.scalar-sequence@1",
            "rix.analysis.scalar-term-stream@1",
            "rix.analysis.scalar-tail-evidence@1",
            "rix.analysis.infinite-series@1",
            "rix.analysis.limit-claim@1",
            "rix.analysis.limit-result@1",
            "rix.analysis.extremal-limit-result@1",
            "rix.analysis.cauchy-result@1",
            "rix.analysis.exchange-claim@1",
            "rix.analysis.exchange-result@1",
            "rix.analysis.integral-exchange@1",
        ]);
    });

    test("builds first-class function sequences and bounded cloneable lazy term streams", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("analysis");
            make := (n)->.calculus.Function(@"example.analysis.term.@{n}@1", {=
                name=@"term @{n}",
                domain=:Rational,
                codomain=:Rational,
                implementation=(x)->x+@n,
                implementationEvidence=:definition
            });
            sequence := .analysis.FunctionSequence(make, {=
                start=1,
                name=:translatedIdentity,
                domain=:Rational,
                codomain=:Rational
            });
            terms := sequence.Terms(1,3);
            second := terms.Get(2);
            copy := terms;
            third := copy.Get(3);
            {:
                sequence.Record(),
                sequence.Term(4)(2),
                second.SemanticId(),
                third.SemanticId(),
                [terms.clonePolicy,terms.deepClonePolicy],
                terms
            };
        `, options);

        const record = result.values[0];
        expect(text(entry(record, "schema"))).toBe("rix.analysis.function-sequence@1");
        expect(text(entry(record, "name"))).toBe("translatedIdentity");
        expect(entry(entry(record, "indexDomain"), "lower").value).toBe(1n);
        expect(result.values[1].value).toBe(6n);
        expect(text(result.values[2])).toBe("example.analysis.term.2@1");
        expect(text(result.values[3])).toBe("example.analysis.term.3@1");
        expect(result.values[4].values.map(text)).toEqual(["cachedIndependent", "restart"]);
        expect(result.values[5].type).toBe("lazy_sequence");
        expect(options.context.get("terms")._lazy.cache).toHaveLength(2);
        expect(options.context.get("copy")._lazy.cache).toHaveLength(3);
    });

    test("certifies the geometric function series from an exact uniform remainder", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("analysis");
            series := .analysis.GeometricSeries(1/2);
            checked := series.Check(:uniform,{= epsilon=1/1000,maxWork=20 });
            {:
                series.Term(2)(1/2),
                series.Limit()(1/2),
                series.TailBound(3),
                series.Modulus(1/1000,{= maxWork=20 }),
                checked
            };
        `, runtime());

        expect(result.values[0].toString()).toBe("7/4");
        expect(result.values[1].toString()).toBe("2");
        expect(result.values[2].toString()).toBe("1/8");
        expect(text(entry(result.values[3], "status"))).toBe("complete");
        expect(entry(result.values[3], "index").value).toBe(10n);
        const checked = result.values[4];
        expect(text(entry(checked, "status"))).toBe("converged");
        expect(text(entry(checked, "conclusion"))).toBe("uniformConvergence");
        expect(entry(checked, "certified").value).toBe(1n);
        expect(entry(entry(checked, "witness"), "tailBound").toString()).toBe("1/1024");
        expect(text(entry(checked, "evidenceLevel"))).toBe("proof");
        expect(entry(entry(checked, "allows"), "evaluation").value).toBe(1n);
    });

    test("keeps convergence modes explicit and unsupported claims unknown", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("analysis");
            series := .analysis.GeometricSeries(1/2);
            modes := [:pointwise,:uniform,:almostEverywhere,:inMeasure,:norm];
            claims := modes.Map((mode)->series.Claim(mode));
            results := claims.Map((claim)->claim.Check({= epsilon=1/100 }));
            {:
                claims.Map((claim)->claim[:mode]),
                results.Map((value)->value[:status]),
                results.Map((value)->value[:reason])
            };
        `, runtime());

        expect(result.values[0].values.map(text)).toEqual([
            "pointwise", "uniform", "almostEverywhere", "inMeasure", "norm",
        ]);
        expect(result.values[1].values.map(text)).toEqual([
            "unknown", "converged", "unknown", "unknown", "unknown",
        ]);
        expect(result.values[2].values.map(text)).toEqual([
            "unsupportedConvergenceMode", "checkedGeometricTail", "unsupportedConvergenceMode",
            "unsupportedConvergenceMode", "unsupportedConvergenceMode",
        ]);
    });

    test("never promotes finite samples or caller-declared tails into a theorem", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("analysis");
            make := (n)->.calculus.Function(@"example.sampled.@{n}@1", {=
                implementation=(x)->x/(n+1),
                implementationEvidence=:definition
            });
            limit := .calculus.Function("example.zero@1", {=
                implementation=(x)->0,
                implementationEvidence=:definition
            });
            declared := .analysis.TailEvidence(
                :uniform,
                (n)->1/(n+1),
                (epsilon)->1000,
                {= limit=limit,property=:claimedUniformTail }
            );
            sequence := .analysis.FunctionSequence(make, {=
                limit=limit,
                tailEvidence=declared,
                domain=(-1):1,
                codomain=:Rational
            });
            claim := sequence.Claim(:uniform,_,{= samples=[-1,0,1] });
            claim.Check({= epsilon=1/100 });
        `, runtime());

        expect(text(entry(result, "status"))).toBe("unknown");
        expect(text(entry(result, "reason"))).toBe("unverifiedTailProperty");
        expect(entry(result, "certified")).toBeNull();
        expect(entry(result, "diagnostics").values.map((item) => text(entry(item, "code"))))
            .toEqual(["finiteSamplesIgnored", "unverifiedTailProperty"]);
        expect(entry(entry(result, "allows"), "evaluation")).toBeNull();
    });

    test("rejects a mismatched candidate limit without using samples", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("analysis");
            series := .analysis.GeometricSeries(1/2);
            wrong := .calculus.Function("example.wrong-limit@1", {=
                implementation=(x)->0,
                implementationEvidence=:definition
            });
            series.Claim(:uniform,wrong,{= samples=[-1/2,0,1/2] })
              .Check({= epsilon=1/100 });
        `, runtime());

        expect(text(entry(result, "status"))).toBe("unknown");
        expect(text(entry(result, "reason"))).toBe("limitIdentityMismatch");
        expect(entry(result, "diagnostics").values.map((item) => text(entry(item, "code"))))
            .toEqual(["finiteSamplesIgnored", "limitIdentityMismatch"]);
    });

    test("computes exact geometric scalar series, effective limits, limsup, liminf, and Cauchy witnesses", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("analysis");
            series := .analysis.GeometricScalarSeries(1,1/2);
            limit := series.Check({= epsilon=1/1000,maxWork=20 });
            modulus := series.Modulus(1/1000,{= maxWork=20 });
            cauchy := series.Cauchy({= epsilon=1/1000,maxWork=20 });
            enclosure := .analysis.RefineLimit(limit);
            {:
                series.Term(3),series.PartialSum(3),series.Sum(),series.TailBound(3),
                modulus,limit,series.Limsup({= epsilon=1/1000,maxWork=20 }),
                series.Liminf({= epsilon=1/1000,maxWork=20 }),cauchy,enclosure
            };
        `, runtime());

        expect(result.values[0].toString()).toBe("1/8");
        expect(result.values[1].toString()).toBe("15/8");
        expect(result.values[2].toString()).toBe("2");
        expect(result.values[3].toString()).toBe("1/8");
        expect(text(entry(result.values[4], "status"))).toBe("complete");
        expect(entry(result.values[4], "index").value).toBe(10n);
        expect(text(entry(result.values[5], "status"))).toBe("converged");
        expect(text(entry(result.values[5], "conclusion"))).toBe("seriesConverges");
        expect(text(entry(result.values[6], "status"))).toBe("determined");
        expect(entry(result.values[6], "value").toString()).toBe("2");
        expect(text(entry(result.values[7], "status"))).toBe("determined");
        expect(text(entry(result.values[8], "status"))).toBe("satisfied");
        expect(entry(entry(result.values[8], "witness"), "index").value).toBe(11n);
        expect(entry(entry(result.values[8], "witness"), "pairBound").toString()).toBe("1/1024");
        expect(entry(result.values[9], "interval").low.toString()).toBe("2");
        expect(entry(result.values[9], "interval").high.toString()).toBe("2");
    });

    test("keeps caller-declared scalar tails observational and never infers extrema", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("analysis");
            evidence := .analysis.ScalarTailEvidence(
                (n)->1/(n+1),(epsilon)->1000,{= limit=0,property=:claimedTail }
            );
            sequence := .analysis.ScalarSequence((n)->1/(n+1),{=
                limit=0,tailEvidence=evidence,name=:declaredSequence
            });
            {: sequence.Check(),sequence.Limsup(),sequence.Liminf(),sequence.Cauchy() };
        `, runtime());

        expect(result.values.map((value) => text(entry(value, "status"))))
            .toEqual(["unknown", "unknown", "unknown", "unknown"]);
        expect(text(entry(result.values[0], "reason"))).toBe("unverifiedTailProperty");
        expect(text(entry(result.values[3], "reason"))).toBe("unverifiedTailProperty");
    });

    test("adapts exact series to Cauchy reals and effective Cauchy reals back to scalar limits", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("cauchy");
            .Plugin.Load("analysis");
            .Plugin.Load("numerics");
            series := .analysis.GeometricScalarSeries(1,1/2);
            real := series.ToCauchy({= name=:binarySum });
            sequence := .analysis.FromCauchy(real);
            checked := sequence.Check({= epsilon=1/1000 });
            refined := .analysis.RefineLimit(checked,{= targetWidth=1/100 });
            {:
                .cauchy.Term(real,3),.cauchy.TailBound(real,3),
                sequence.Term(3),checked,refined
            };
        `, runtime());

        expect(result.values[0].toString()).toBe("15/8");
        expect(result.values[1].toString()).toBe("1/8");
        expect(result.values[2].toString()).toBe("15/8");
        expect(text(entry(result.values[3], "status"))).toBe("converged");
        expect(text(entry(result.values[3], "reason"))).toBe("effectiveCauchyAdapter");
        expect(text(entry(result.values[4], "status"))).toBe("enclosed");
        expect(entry(result.values[4], "interval").low.toString()).toBe("2047/1024");
        expect(entry(result.values[4], "interval").high.toString()).toBe("2");
    });

    test("wraps function convergence as a limit and exposes exchange obligations", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("analysis");
            series := .analysis.GeometricSeries(1/2);
            limit := .analysis.Limit(series,_,{= mode=:uniform })
              .Check({= epsilon=1/1000,maxWork=20 });
            continuity := .analysis.Exchange(:continuity,limit).Check();
            operations := [:evaluation,:integration,:differentiation,:summation,:expectation];
            unresolved := operations.Map((operation)->.analysis.Exchange(operation,limit).Check());
            forged := {= schema="rix.analysis.hypothesis@1",status=:proved,authority=:caller };
            attempted := .analysis.Exchange(:differentiation,limit,{=
                differentiableTerms=forged,
                uniformDerivativeConvergence=forged,
                anchorConvergence=forged
            }).Check();
            {: limit,continuity,unresolved,attempted };
        `, runtime());

        expect(text(entry(result.values[0], "status"))).toBe("converged");
        expect(text(entry(result.values[0], "conclusion"))).toBe("functionConvergence");
        expect(text(entry(result.values[1], "status"))).toBe("justified");
        expect(entry(entry(result.values[1], "allows"), "continuity").value).toBe(1n);
        expect(result.values[2].values.map((value) => text(entry(value, "status"))))
            .toEqual(["unknown", "unknown", "unknown", "unknown", "unknown"]);
        expect(entry(result.values[2].values[0], "obligations").values.map(text)).toEqual(["pointInDomain"]);
        expect(entry(result.values[2].values[2], "obligations").values.map(text)).toEqual([
            "differentiableTerms", "uniformDerivativeConvergence", "anchorConvergence",
        ]);
        expect(entry(result.values[2].values[4], "obligations").values.map(text)).toEqual([
            "almostEverywhereConvergence", "dominatingIntegrableBound",
        ]);
        expect(text(entry(result.values[3], "status"))).toBe("unknown");
        expect(entry(result.values[3], "hypotheses").values
            .map((hypothesis) => text(entry(hypothesis, "status"))))
            .toEqual(["assumed", "assumed", "assumed"]);
        expect(entry(result.values[3], "obligations").values.map(text)).toEqual([
            "differentiableTerms", "uniformDerivativeConvergence", "anchorConvergence",
        ]);
    });

    test("builds Calculus definite-integral exchange specs and delegates certified quadrature to Numerics", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("analysis");
            .Plugin.Load("numerics");
            series := .analysis.GeometricSeries(1/2);
            exchange := .analysis.IntegralExchange(series,-1/2,1/2,{= epsilon=1/1000 });
            approximation := exchange.Numerical({= secondDerivativeBound=16 })
              .Refine({= targetWidth=1/1000,maxIterations=10000 });
            {:
                exchange,exchange.TermIntegral(2),exchange.LimitIntegral(),approximation
            };
        `, runtime());

        expect(text(entry(result.values[0], "status"))).toBe("justified");
        expect(entry(result.values[0], "obligations").values).toHaveLength(0);
        expect(entry(entry(result.values[0], "allows"), "integration").value).toBe(1n);
        expect(text(entry(result.values[1], "schema"))).toBe("rix.calculus.integral@1");
        expect(text(entry(result.values[2], "schema"))).toBe("rix.calculus.integral@1");
        expect(text(entry(result.values[3], "status"))).toBe("enclosed");
        expect(entry(result.values[3], "goalMet").value).toBe(1n);
    });
});
