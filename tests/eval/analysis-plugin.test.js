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
            "rix.analysis.function-sequence@1",
        ]);
        expect(entry(info, "schemas").values.map(text)).toEqual([
            "rix.analysis.function-sequence@1",
            "rix.analysis.function-term-stream@1",
            "rix.analysis.tail-evidence@1",
            "rix.analysis.convergence-claim@1",
            "rix.analysis.convergence-result@1",
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
});
