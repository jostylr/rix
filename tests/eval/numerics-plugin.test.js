import { describe, expect, test } from "bun:test";
import { CertifiedApproximation, RationalInterval } from "@ratmath/core";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/index.js";
import { loadFloatPlugin } from "../../plugins/float/node-installer.js";

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

describe("pure RiX Numerics plugin", () => {
    test("intersects requester and provider time, memory, and depth limits", () => {
        const options = runtime();
        const limits = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .numerics.EffectiveLimits(
                .numerics.Request({= timeout=2, memory=100, maxDepth=8 }),
                {= timeout=1, memory=200, maxDepth=4 }
            )
        `, options);
        expect(entry(limits, "timeout").value).toBe(1n);
        expect(entry(limits, "memory").value).toBe(100n);
        expect(entry(limits, "maxDepth").value).toBe(4n);
    });

    test("is bundled as RiX and depends only on the universal Oracle target", () => {
        const options = runtime();
        const info = parseAndEvaluate('.Plugin.Info("numerics")', options);
        expect(textValue(entry(info, "kind"))).toBe("rix");
        expect(entry(info, "requires").values.map(textValue)).toEqual(["rix.oracle@1"]);

        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            provider = {= };
            provider._proto = {=
                NumericsCapabilities = (self) -> {=
                    schema="rix.numerics.capabilities@1",
                    backend=:testProvider,
                    operations=[:enclose],
                    certified=1
                },
                Enclose = (self, request) -> {=
                    valueKind=:enclosure,
                    schema="rix.numerics.enclosure@1",
                    status=:enclosed,
                    interval=2:2,
                    certified=1,
                    goalMet=1,
                    requestedWidth=request[:absoluteWidth],
                    achievedWidth=0,
                    approximation=.CertifiedApproximation(2, 2:2),
                    evidenceLevel=:proof,
                    backend=:testProvider,
                    operation=request[:operation],
                    work={= calls=0 },
                    diagnostics=[]
                }
            };
            .numerics.Enclose(provider, {= absoluteWidth=1/100 })
        `, options);
        expect(textValue(entry(result, "backend"))).toBe("testProvider");
        expect(entry(result, "interval")).toBeInstanceOf(RationalInterval);
    });

    test("refines an Oracle through only the value protocol", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .Plugin.Load("oracle");
            real = .oracle.Rational(3/7, {= procedure=:bisection });
            .numerics.Refine(real, {= absoluteWidth=1/1000, maxWork=20, trace=1 })
        `, options);

        expect(textValue(entry(result, "status"))).toBe("enclosed");
        expect(textValue(entry(result, "backend"))).toBe("oracle");
        expect(entry(result, "certified").value).toBe(1n);
        expect(entry(result, "goalMet").value).toBe(1n);
        expect(entry(result, "achievedWidth").toString()).toBe("1/1024");
        expect(entry(result, "interval")).toBeInstanceOf(RationalInterval);
        expect(entry(result, "approximation")).toBeInstanceOf(CertifiedApproximation);
    });

    test("reports Float sampling as approximate rather than certified", () => {
        const options = runtime();
        loadFloatPlugin(options.systemContext, options.registry);
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            x = .float(1/3);
            .numerics.Sample(x, {= absoluteWidth=1/1000, maxWork=20 })
        `, options);

        expect(textValue(entry(result, "status"))).toBe("approximate");
        expect(textValue(entry(result, "backend"))).toBe("float");
        expect(entry(result, "certified")).toBeNull();
        expect(entry(result, "goalMet")).toBeNull();
        expect(entry(result, "interval").low.equals(entry(result, "interval").high)).toBe(true);
        expect(entry(result, "diagnostics").values.map(textValue)).toContain("noErrorBoundForIntendedReal");
    });

    test("preserves bounded exhaustion as a normal structured result", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .Plugin.Load("oracle");
            result = .numerics.Refine(.oracle.Rational(3/7), {= absoluteWidth=1/1000, maxWork=3 });
            result
        `, options);
        expect(textValue(entry(result, "status"))).toBe("budgetExhausted");
        expect(entry(result, "certified").value).toBe(1n);
        expect(entry(result, "goalMet")).toBeNull();
        expect(entry(entry(result, "work"), "exhausted").value).toBe(1n);
        expect(entry(result, "approximation")).toBeInstanceOf(CertifiedApproximation);
        expect(parseAndEvaluate(".numerics.Approximation(result)", options)).toBeInstanceOf(CertifiedApproximation);
    });

    test("forces each public entry point's operation and reports unsupported Float refinement", () => {
        const options = runtime();
        loadFloatPlugin(options.systemContext, options.registry);
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .Plugin.Load("oracle");
            oracle = .oracle.Rational(3/7);
            float = .float(1/3);
            {:
                .numerics.Request({= operation=:refine })[:operation],
                .numerics.Enclose(oracle)[:operation],
                .numerics.Refine(oracle)[:operation],
                .numerics.Sample(float)[:operation],
                .numerics.Refine(float)[:status],
                float.Refine(.RefinementRequest({= }, :refine))[:status]
            }
        `, options);
        expect(result.values.map(textValue)).toEqual(["refine", "enclose", "refine", "sample", "unsupported", "unsupported"]);
    });

    test("rejects contradictory certified results and work-limit violations", () => {
        const options = runtime();
        const check = parseAndEvaluate(`
            .Plugin.Load("numerics");
            request = .numerics.Request({= absoluteWidth=1, maxCalls=1 });
            .numerics.CheckResult({=
                schema="rix.numerics.enclosure@1",
                status=:enclosed,
                interval=0:10,
                certified=1,
                goalMet=1,
                achievedWidth=10,
                evidenceLevel=:proof,
                backend=:bad,
                operation=:enclose,
                work={= calls=999 },
                diagnostics=[]
            }, request)
        `, options);
        expect(entry(check, "valid")).toBeNull();
        expect(entry(check, "approximationPresent")).toBeNull();
        expect(entry(check, "goalConsistent")).toBeNull();
        expect(entry(check, "workWithinLimits")).toBeNull();
    });

    test("Float Halo comparisons are undecided evidence questions, not Float conversions", () => {
        const options = runtime();
        loadFloatPlugin(options.systemContext, options.registry);
        const decision = parseAndEvaluate(".float(1/3) < {~ 1/2, 1/1000 }", options);
        expect(decision.__rix_undecided__).toBe(true);
        expect(decision.reason).toBe("providerUncertified");
    });
});
