import { describe, expect, test } from "bun:test";
import {
    CertifiedApproximation,
    Rational,
    RationalInterval,
    RationalIntervalSet,
} from "@ratmath/core";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    formatValue,
    formatValueSource,
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
        expect(formatValue(result)).toBe("2:2");
        expect(formatValueSource(result)).toContain("schema=rix.numerics.enclosure@1");
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

    test("publishes backend-neutral exact sign and root-count witnesses", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .Plugin.Load("algebraic-real");
            polynomial := .p\`x^2-2\`;
            rationalSign := .numerics.Sign(-3/5);
            polynomialSign := .numerics.Sign(polynomial, {= at=2 });
            algebraicSign := .numerics.Sign(.ar.Sqrt2());
            refinedSign := .numerics.Sign(.numerics.Sqrt(2), {= absoluteWidth=1/100, maxWork=30 });
            rootCount := .numerics.RootCount(polynomial, -2:2);
            [
                rationalSign[:schema], rationalSign[:sign], rationalSign[:certified],
                polynomialSign[:sign], polynomialSign[:method],
                algebraicSign[:sign], algebraicSign[:method],
                refinedSign[:sign], refinedSign[:method], refinedSign[:certified],
                rootCount[:schema], rootCount[:count], rootCount[:endpointPolicy]
            ];
        `, runtime());
        const values = result.values;
        expect(textValue(values[0])).toBe("rix.exact.sign-witness@1");
        expect([textValue(values[1]), String(values[2])]).toEqual(["negative", "1"]);
        expect([textValue(values[3]), textValue(values[4])]).toEqual(["positive", "exactPolynomialEvaluation"]);
        expect([textValue(values[5]), textValue(values[6])]).toEqual(["positive", "certifiedEnclosure"]);
        expect([textValue(values[7]), textValue(values[8]), String(values[9])])
            .toEqual(["positive", "certifiedEnclosure", "1"]);
        expect([textValue(values[10]), String(values[11]), textValue(values[12])])
            .toEqual(["rix.exact.root-count@1", "2", "leftOpenRightClosed"]);

        expect(() => parseAndEvaluate(`
            .Plugin.Load("numerics"); .Plugin.Load("poly");
            .numerics.Sign(.p\`x+1\`);
        `, runtime())).toThrow("needs an exact 'at' point");
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
        expect(formatValue(result)).toContain("schema=rix.numerics.enclosure@1");

        const nonfinite = parseAndEvaluate(`
            .numerics.Sample(.float.Binary32(1) / .float.Binary32(0), {= maxWork=20 })
        `, options);
        expect(textValue(entry(nonfinite, "status"))).toBe("unknown");
        expect(entry(nonfinite, "certified")).toBeNull();
        expect(entry(nonfinite, "diagnostics").values.map(textValue))
            .toEqual(["storedValueNonFinite", "noFiniteRationalInterval", "divisionByZero", "infinity"]);
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

    test("transcendental multifunctions create certified set-valued interval images", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            expImage = .numerics.Exp(1:2);
            logImage = .numerics.Log(1:2);
            rootImage = .numerics.Sqrt(1:2);
            {:
                expImage.NumericsCapabilities()[:denotation],
                expImage.NumericsCapabilities()[:boundaryRefinement],
                .numerics.Range(expImage, {= endpointTolerance=1/10000, maxWork=100 }),
                .numerics.Range(logImage, {= endpointTolerance=1/10000, maxWork=100 }),
                rootImage.Range({= endpointTolerance=1/10000, maxWork=100 })
            }
        `, runtime());

        expect(textValue(result.values[0])).toBe("set");
        expect(result.values[1].value).toBe(1n);
        for (const range of result.values.slice(2)) {
            expect(textValue(entry(range, "schema"))).toBe("rix.numerics.range-enclosure@1");
            expect(textValue(entry(range, "status"))).toBe("enclosed");
            expect(entry(range, "certified").value).toBe(1n);
            expect(entry(range, "interval")).toBeInstanceOf(RationalInterval);
        }

        const expInterval = entry(result.values[2], "interval");
        expect(expInterval.low.toNumber()).toBeLessThanOrEqual(Math.exp(1));
        expect(expInterval.high.toNumber()).toBeGreaterThanOrEqual(Math.exp(2));
        const logInterval = entry(result.values[3], "interval");
        expect(logInterval.low.toNumber()).toBeLessThanOrEqual(0);
        expect(logInterval.high.toNumber()).toBeGreaterThanOrEqual(Math.log(2));
        const rootInterval = entry(result.values[4], "interval");
        expect(rootInterval.containsValue(new Rational(1n))).toBe(true);
        expect(rootInterval.high.toNumber()).toBeGreaterThanOrEqual(Math.sqrt(2));
    });

    test("unary Numerics methods publish trusted RangeProvider identities", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            {:
                .Host.FindRangeProvider(.numerics.Exp)[:functionId],
                .Host.FindRangeProvider(.numerics.Expm1)[:functionId],
                .Host.FindRangeProvider(.numerics.Log)[:functionId],
                .Host.FindRangeProvider(.numerics.Ln)[:functionId],
                .Host.FindRangeProvider(.numerics.Log1p)[:functionId],
                .Host.FindRangeProvider(.numerics.Log2)[:functionId],
                .Host.FindRangeProvider(.numerics.Log10)[:functionId],
                .Host.FindRangeProvider(.numerics.Sqrt)[:functionId],
                .Host.FindRangeProvider(.numerics.Cbrt)[:functionId],
                .Host.FindRangeProvider(.numerics.Sin)[:functionId],
                .Host.FindRangeProvider(.numerics.Cos)[:functionId],
                .Host.FindRangeProvider(.numerics.Tan)[:functionId],
                .Host.FindRangeProvider(.numerics.Sec)[:functionId],
                .Host.FindRangeProvider(.numerics.Csc)[:functionId],
                .Host.FindRangeProvider(.numerics.Cot)[:functionId],
                .Host.FindRangeProvider(.numerics.Asin)[:functionId],
                .Host.FindRangeProvider(.numerics.Acos)[:functionId],
                .Host.FindRangeProvider(.numerics.Atan)[:functionId],
                .Host.FindRangeProvider(.numerics.Sinh)[:functionId],
                .Host.FindRangeProvider(.numerics.Cosh)[:functionId],
                .Host.FindRangeProvider(.numerics.Tanh)[:functionId],
                .Host.FindRangeProvider(.numerics.Sech)[:functionId],
                .Host.FindRangeProvider(.numerics.Csch)[:functionId],
                .Host.FindRangeProvider(.numerics.Coth)[:functionId],
                .Host.FindRangeProvider(.numerics.Asinh)[:functionId],
                .Host.FindRangeProvider(.numerics.Acosh)[:functionId],
                .Host.FindRangeProvider(.numerics.Atanh)[:functionId],
                .Host.FindRangeProvider(.numerics.Erf)[:functionId],
                .Host.FindRangeProvider(.numerics.Erfc)[:functionId],
                .Host.FindRangeProvider(.numerics.NormalPDF)[:functionId],
                .Host.FindRangeProvider(.numerics.NormalCDF)[:functionId],
                .Host.FindRangeProvider(.numerics.Arcsin)[:functionId],
                .Host.FindRangeProvider(.numerics.Arccos)[:functionId],
                .Host.FindRangeProvider(.numerics.Arctan)[:functionId],
                .Host.FindRangeProvider(.numerics.Arsinh)[:functionId],
                .Host.FindRangeProvider(.numerics.Arcosh)[:functionId],
                .Host.FindRangeProvider(.numerics.Artanh)[:functionId]
            }
        `, runtime());

        expect(result.values).toHaveLength(37);
        expect(result.values.every((value) => textValue(value)?.startsWith("rix.numerics.unary.")))
            .toBe(true);
        expect(textValue(result.values[31])).toBe("rix.numerics.unary.asin@1");
        expect(textValue(result.values[36])).toBe("rix.numerics.unary.atanh@1");
    });

    test("unary providers preserve legacy ranges and handle sets, domains, aliases, and budgets", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .numerics[:Sin];
            sine = .numerics.Sin;
            legacy = .numerics.Range(.numerics.Sin(0:1), {=
                endpointTolerance=1/1000, maxWork=120
            });
            protocol = .numerics.Range(sine, 0:1, {=
                endpointTolerance=1/1000, maxWork=120
            });
            selected = .numerics.Range(Sin, 0:1, {=
                endpointTolerance=1/1000, maxWork=120
            });
            disconnected = .numerics.Range(
                .numerics.Exp, (0:1) \\/ (3:4),
                {= endpointTolerance=1/1000, maxWork=200 }
            );
            partialDomain = .numerics.Range(
                .numerics.Log, ((-1):0) \\/ (1:2), {= maxWork=100 }
            );
            alias = .numerics.Range(.numerics.Arcsin, 0:1/2, {= maxWork=100 });
            exhausted = .numerics.Range(.numerics.Exp, 0:1, {= maxWork=0 });
            {: legacy, protocol, selected, disconnected, partialDomain, alias, exhausted }
        `, runtime());

        const [legacy, protocol, selected, disconnected, partialDomain, alias, exhausted] = result.values;
        expect(entry(protocol, "interval").toString()).toBe(entry(legacy, "interval").toString());
        expect(entry(selected, "interval").toString()).toBe(entry(legacy, "interval").toString());
        expect(textValue(entry(selected, "function"))).toBe("rix.numerics.unary.sin@1");
        expect(entry(protocol, "certified").value).toBe(1n);
        expect(textValue(entry(protocol, "evidenceLevel"))).toBe("trustedCapability");
        expect(textValue(entry(protocol, "function"))).toBe("rix.numerics.unary.sin@1");

        const disconnectedRange = entry(disconnected, "range");
        expect(disconnectedRange).toBeInstanceOf(RationalIntervalSet);
        expect(disconnectedRange.components).toHaveLength(2);
        expect(entry(disconnected, "interval")).toBeNull();
        expect(entry(disconnected, "certified").value).toBe(1n);
        expect(entry(entry(disconnected, "evidence"), "components").value).toBe(2n);

        expect(textValue(entry(partialDomain, "status"))).toBe("enclosed");
        expect(entry(partialDomain, "certified").value).toBe(1n);
        expect(textValue(entry(partialDomain, "domainStatus")))
            .toBe("partiallyDefined");
        expect(entry(partialDomain, "range")).toBeInstanceOf(RationalIntervalSet);
        expect(entry(partialDomain, "diagnostics").values.map(textValue))
            .toContain("logDomainViolation");

        expect(textValue(entry(alias, "function"))).toBe("rix.numerics.unary.asin@1");
        expect(entry(alias, "certified").value).toBe(1n);
        expect(textValue(entry(exhausted, "status"))).toBe("unknown");
        expect(entry(exhausted, "certified")).toBeNull();
        expect(entry(exhausted, "diagnostics").values.map(textValue))
            .toContain("rangeReductionBudgetExhausted");
    });

    test("circular ranges use bounded subdivision and reject unexcluded poles", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            sine = .numerics.Range(.numerics.Sin(1:2), {=
                endpointTolerance=1/1000, maxWork=160, maxSubintervals=8
            });
            cosine = .numerics.Range(.numerics.Cos(1:2), {=
                endpointTolerance=1/1000, maxWork=160, maxSubintervals=8
            });
            safeTan = .numerics.Range(.numerics.Tan(0:1), {=
                endpointTolerance=1/1000, maxWork=160, maxSubintervals=8
            });
            crossingTan = .numerics.Range(.numerics.Tan(1:2), {=
                endpointTolerance=1/1000, maxWork=160, maxSubintervals=8
            });
            {: sine, cosine, safeTan, crossingTan }
        `, runtime());

        for (const range of result.values.slice(0, 3)) {
            expect(entry(range, "certified").value).toBe(1n);
            expect(entry(range, "work").entries.get("calls").value).toBeLessThanOrEqual(160n);
        }
        const sine = entry(result.values[0], "interval");
        expect(sine.low.toNumber()).toBeLessThanOrEqual(Math.sin(1));
        expect(sine.high.toString()).toBe("1");
        const cosine = entry(result.values[1], "interval");
        expect(cosine.low.toNumber()).toBeLessThanOrEqual(Math.cos(2));
        expect(cosine.high.toNumber()).toBeGreaterThanOrEqual(Math.cos(1));
        const tangent = entry(result.values[2], "interval");
        expect(tangent.low.toNumber()).toBeLessThanOrEqual(0);
        expect(tangent.high.toNumber()).toBeGreaterThanOrEqual(Math.tan(1));
        expect(textValue(entry(result.values[3], "status"))).toBe("unknown");
        expect(textValue(entry(result.values[3], "domainStatus")))
            .toBe("partiallyDefined");
        expect(entry(result.values[3], "certified")).toBeNull();
        expect(entry(result.values[3], "diagnostics").values.map(textValue)).toContain("poleInInput");
    });

    test("publishes reusable trusted circular-function fact families", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            {: .numerics.FunctionFacts(.numerics.Sin),
               .numerics.FunctionFacts(.numerics.Cos),
               .numerics.FunctionFacts(.numerics.Tan),
               .numerics.FunctionFacts(.numerics.Csc) };
        `, runtime());
        const [sin, cos, tan, csc] = result.values;
        for (const facts of result.values) {
            expect(textValue(entry(facts, "schema"))).toBe("rix.numerics.function-facts@1");
            expect(entry(facts, "certified").value).toBe(1n);
            expect(textValue(entry(facts, "evidenceLevel"))).toBe("trustedCapability");
            expect(entry(facts, "operations").values.map(textValue))
                .toContain("singularities");
        }
        expect(entry(entry(sin, "globalRange"), "range").toString()).toBe("[-1,1]");
        expect(textValue(entry(entry(sin, "symmetry"), "kind"))).toBe("odd");
        expect(textValue(entry(entry(cos, "symmetry"), "kind"))).toBe("even");
        expect(entry(entry(tan, "period"), "multiplier").value).toBe(1n);
        expect(textValue(entry(entry(tan, "singularities"), "kind")))
            .toBe("simplePoleLattice");
        expect(textValue(entry(entry(csc, "domain"), "kind")))
            .toBe("realExceptLattice");
    });

    test("publishes elementary monotonicity, domain boundaries, and poles", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            {: .numerics.FunctionFacts(.numerics.Exp),
               .numerics.FunctionFacts(.numerics.Ln),
               .numerics.FunctionFacts(.numerics.Sqrt),
               .numerics.FunctionFacts(.numerics.Cosh),
               .numerics.FunctionFacts(.numerics.Csch),
               .numerics.FunctionFacts(.numerics.Atanh),
               .numerics.FunctionFacts(.numerics.Log) };
        `, runtime());
        const [exp, ln, sqrt, cosh, csch, atanh, log] = result.values;
        expect(textValue(entry(entry(exp, "monotonicity"), "kind")))
            .toBe("increasingOnDomain");
        expect(textValue(entry(entry(ln, "domain"), "kind"))).toBe("positiveReal");
        expect(textValue(entry(entry(ln, "singularities"), "kind")))
            .toBe("domainBoundary");
        expect(entry(entry(sqrt, "domain"), "boundaryIncluded").value).toBe(1n);
        expect(textValue(entry(entry(cosh, "symmetry"), "kind"))).toBe("even");
        expect(textValue(entry(entry(csch, "singularities"), "kind"))).toBe("simplePole");
        expect(textValue(entry(entry(atanh, "domain"), "kind"))).toBe("openUnitInterval");
        expect(textValue(entry(entry(log, "monotonicity"), "kind"))).toBe("baseDependent");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("numerics");
            .numerics.FunctionFacts((x)->x)
        `, runtime())).toThrow("no trusted published function facts");
    });

    test("trigonometric landmarks distinguish proven poles from unresolved ones", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            extremum = .numerics.Range(.numerics.Cos((-1):1), {=
                endpointTolerance=1/1000, maxWork=80, maxSubintervals=2
            });
            proven = .numerics.Range(.numerics.Tan(1:2), {=
                endpointTolerance=1/100, maxWork=20, maxSubintervals=2
            });
            unresolved = .numerics.Range(.numerics.Tan(15707/10000:15708/10000), {=
                endpointTolerance=1/100, maxWork=20, maxSubintervals=2
            });
            farExtremum = .numerics.Range(.numerics.Sin(102:103), {=
                endpointTolerance=1/1000, maxWork=80, maxSubintervals=2
            });
            {: extremum, proven, unresolved, farExtremum }
        `, runtime());

        expect(entry(result.values[0], "interval").high.toString()).toBe("1");
        expect(entry(entry(result.values[0], "evidence"), "landmarks").entries
            .get("hasmaximum").value).toBe(1n);
        expect(textValue(entry(result.values[1], "status"))).toBe("unknown");
        expect(textValue(entry(result.values[1], "domainStatus")))
            .toBe("partiallyDefined");
        expect(entry(result.values[1], "diagnostics").values.map(textValue)).toEqual(["poleInInput"]);
        expect(textValue(entry(result.values[2], "status"))).toBe("unknown");
        expect(entry(result.values[2], "diagnostics").values.map(textValue)).toEqual(["poleNotExcluded"]);
        expect(entry(result.values[3], "interval").high.toString()).toBe("1");
    });

    test("range evaluation separates partial domains from wholly empty defined images", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            {:
                .numerics.Range(.numerics.Log((-1):2)),
                .numerics.Range(.numerics.Sqrt((-1):2)),
                .numerics.Range(.numerics.Asin(0:2)),
                .numerics.Range(.numerics.Log((-2):(-1)))
            }
        `, runtime());

        expect(result.values.slice(0, 3).map((range) => textValue(entry(range, "status"))))
            .toEqual(["unknown", "unknown", "unknown"]);
        expect(result.values.slice(0, 3).map((range) => textValue(entry(range, "domainStatus"))))
            .toEqual(["partiallyDefined", "partiallyDefined", "partiallyDefined"]);
        expect(result.values.slice(0, 3)
            .every((range) => entry(range, "certified") === null)).toBe(true);
        expect(textValue(entry(result.values[3], "status"))).toBe("enclosed");
        expect(textValue(entry(result.values[3], "domainStatus"))).toBe("noDefinedInputs");
        expect(entry(result.values[3], "certified").value).toBe(1n);
        expect(entry(result.values[3], "range").isEmpty).toBe(true);
        expect(() => parseAndEvaluate(`
            .Plugin.Load("numerics"); .numerics.Range(1:2)
        `, runtime())).toThrow("expects an interval image");
    });

    test("generic Range preserves repeated-input correlation through subdivision", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            coarse = .numerics.Range((x)->x-x, 1:2, {= maxSubintervals=1, maxWork=20 });
            subdivided = .numerics.Range((x)->x-x, 1:2, {= maxSubintervals=8, maxWork=80 });
            nested = .numerics.Range((x)->.numerics.Sin(x), 1:2, {=
                endpointTolerance=1/1000, maxSubintervals=4, maxWork=160
            });
            {: coarse, subdivided, nested }
        `, runtime());
        const coarse = entry(result.values[0], "interval");
        const subdivided = entry(result.values[1], "interval");
        expect(coarse.toString()).toBe("-1:1");
        expect(subdivided.toString()).toBe("-1/8:1/8");
        expect(subdivided.containsValue(new Rational(0n))).toBe(true);
        expect(subdivided.high.subtract(subdivided.low)
            .lessThan(coarse.high.subtract(coarse.low))).toBe(true);
        const nested = entry(result.values[2], "interval");
        expect(entry(result.values[2], "certified").value).toBe(1n);
        expect(nested.low.toNumber()).toBeLessThanOrEqual(Math.sin(1));
        expect(nested.high.toString()).toBe("1");
    });

    test("scoped direct range knowledge remains heuristic and rejects self-certification", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            HeuristicResult = (input, request) -> {=
                valueKind=:rangeProviderResult,
                schema="rix.numerics.range-provider-result@1",
                functionId=:calibration,
                input=input,
                status=:approximate,
                range=input,
                certified=_,
                domainStatus=:allDefined,
                goalMet=_,
                achievedEndpointTolerance=0,
                evidenceLevel=:heuristic,
                work={= calls=1, iterations=1 },
                evidence={= kind=:userSuppliedRangeHint }
            };
            Calibration = (x)->x;
            hinted = .numerics.WithRangeKnowledge(Calibration, {=
                functionId=:calibration,
                directRange=HeuristicResult,
                evidenceLevel=:trusted,
                provenance={= provider=:tutorialCalibration }
            });
            rangeInput = (0:1) \\/ (3:4);
            candidate = .numerics.Range(hinted, rangeInput);
            checked = .numerics.CheckRangeResult(
                HeuristicResult(rangeInput, {= }), hinted, rangeInput
            );

            FalseClaim = (input, request) -> {=
                valueKind=:rangeProviderResult,
                schema="rix.numerics.range-provider-result@1",
                functionId=:falseClaim,
                input=input,
                status=:enclosed,
                range=0:4,
                certified=1,
                domainStatus=:allDefined,
                goalMet=1,
                achievedEndpointTolerance=0,
                evidenceLevel=:proof,
                work={= calls=0, iterations=0 }
            };
            Square = (x)->x;
            untrusted = .numerics.WithRangeKnowledge(Square, {=
                functionId=:falseClaim,
                directRange=FalseClaim
            });
            rejected = .numerics.Range(untrusted, 1:2);
            rejection = .numerics.CheckRangeResult(
                FalseClaim((1:2) ~!: :RangeSet, {= }), untrusted, 1:2
            );
            {: candidate, checked, rejected, rejection }
        `, runtime());

        const candidate = result.values[0];
        expect(entry(candidate, "range")).toBeInstanceOf(RationalIntervalSet);
        expect(entry(candidate, "range").toString()).toBe("[0,1] U [3,4]");
        expect(entry(candidate, "interval")).toBeNull();
        expect(entry(candidate, "certified")).toBeNull();
        expect(textValue(entry(candidate, "status"))).toBe("approximate");
        expect(entry(result.values[1], "valid").value).toBe(1n);
        expect(entry(result.values[1], "certifying")).toBeNull();

        expect(textValue(entry(result.values[2], "status"))).toBe("unknown");
        expect(entry(result.values[2], "certified")).toBeNull();
        expect(entry(result.values[3], "valid")).toBeNull();
        expect(textValue(entry(result.values[3], "reason")))
            .toBe("untrustedCertificationClaim");
    });

    test("capability-registered direct providers certify through multifunction dispatch", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            TrustedIdentityRange = {>
                (input, request) ?- [input ? :RationalIntervalSet] /RangeSet/ -> {=
                    valueKind=:rangeProviderResult,
                    schema="rix.numerics.range-provider-result@1",
                    functionId=:trustedIdentity,
                    input=input,
                    status=:enclosed,
                    range=input,
                    certified=1,
                    domainStatus=:allDefined,
                    goalMet=1,
                    achievedEndpointTolerance=0,
                    evidenceLevel=:trustedCapability,
                    work={= calls=1, iterations=0 },
                    evidence={= kind=:trustedIdentityInvariant }
                },
                (input, request) /Unsupported/ -> .Error("unexpected range-provider input")
            };
            Identity = (x)->x;
            registered = .numerics.RegisterRangeProvider(Identity, {=
                functionId=:trustedIdentity,
                directRange=TrustedIdentityRange,
                provenance={= plugin=:testTrustedProvider, invariant=:identityImage }
            });
            rangeInput = (0:1) \\/ (3:4);
            answer = .numerics.Range(Identity, rangeInput);
            raw = TrustedIdentityRange(rangeInput, {= });
            checked = .numerics.CheckRangeResult(raw, Identity, rangeInput);

            Other = (x)->x*x;
            Other.rangeknowledge = .Host.FindRangeProvider(Identity);
            forged = .numerics.Range(Other, 1:2);
            {: registered == Identity, TrustedIdentityRange ? :Multifunction,
               answer, checked, forged }
        `, runtime());

        expect(result.values[0].value).toBe(1n);
        expect(result.values[1].value).toBe(1n);
        const answer = result.values[2];
        expect(entry(answer, "range")).toBeInstanceOf(RationalIntervalSet);
        expect(entry(answer, "range").toString()).toBe("[0,1] U [3,4]");
        expect(entry(answer, "interval")).toBeNull();
        expect(entry(answer, "certified").value).toBe(1n);
        expect(textValue(entry(answer, "evidenceLevel"))).toBe("trustedCapability");
        expect(entry(result.values[3], "valid").value).toBe(1n);
        expect(entry(result.values[3], "certifying").value).toBe(1n);
        expect(textValue(entry(result.values[4], "status"))).toBe("unknown");
        expect(entry(result.values[4], "certified")).toBeNull();
        expect(entry(result.values[4], "diagnostics").values.map(textValue))
            .toContain("untrustedCertificationClaim");
    });

    test("trusted range registrations reject duplicate callable and identity bindings", () => {
        const duplicateIdentity = runtime();
        expect(() => parseAndEvaluate(`
            .Plugin.Load("numerics");
            Provider = (input, request)->_;
            F = (x)->x;
            G = (x)->x+1;
            .numerics.RegisterRangeProvider(F, {=
                functionId=:oneIdentity,
                directRange=Provider,
                provenance={= plugin=:test }
            });
            .numerics.RegisterRangeProvider(G, {=
                functionId=:oneIdentity,
                directRange=Provider,
                provenance={= plugin=:test }
            });
        `, duplicateIdentity)).toThrow("already registered");

        const duplicateCallable = runtime();
        expect(() => parseAndEvaluate(`
            .Plugin.Load("numerics");
            Provider = (input, request)->_;
            F = (x)->x;
            .numerics.RegisterRangeProvider(F, {=
                functionId=:firstIdentity,
                directRange=Provider,
                provenance={= plugin=:test }
            });
            .numerics.RegisterRangeProvider(F, {=
                functionId=:secondIdentity,
                directRange=Provider,
                provenance={= plugin=:test }
            });
        `, duplicateCallable)).toThrow("already registered for this callable");
    });

    test("base changes, stable forms, and inverse trig preserve range semantics", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            {:
                .numerics.Range(.numerics.Exp(1:2, 10), {= endpointTolerance=1/1000, maxWork=200 }),
                .numerics.Range(.numerics.Log(1:100, 10), {= endpointTolerance=1/1000, maxWork=200 }),
                .numerics.Range(.numerics.Expm1(0:1), {= endpointTolerance=1/1000, maxWork=100 }),
                .numerics.Range(.numerics.Log1p(0:1), {= endpointTolerance=1/1000, maxWork=100 }),
                .numerics.Range(.numerics.Acos((-1/2):(1/2)), {= endpointTolerance=1/1000, maxWork=160 })
            }
        `, runtime());

        expect(result.values.every((range) => entry(range, "certified")?.value === 1n)).toBe(true);
        const power = entry(result.values[0], "interval");
        expect(power.low.lessThanOrEqual(new Rational(10n))).toBe(true);
        expect(power.high.greaterThanOrEqual(new Rational(100n))).toBe(true);
        const logarithm = entry(result.values[1], "interval");
        expect(logarithm.low.toNumber()).toBeLessThanOrEqual(0);
        expect(logarithm.high.toNumber()).toBeGreaterThanOrEqual(2);
        const acoshaped = entry(result.values[4], "interval");
        expect(acoshaped.low.toNumber()).toBeLessThanOrEqual(Math.acos(0.5));
        expect(acoshaped.high.toNumber()).toBeGreaterThanOrEqual(Math.acos(-0.5));
    });

    test("hyperbolic interval variants use monotonicity, symmetry, and strict poles", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            {:
                .numerics.Range(.numerics.Sinh((-1):1), {= endpointTolerance=1/1000, maxWork=300 }),
                .numerics.Range(.numerics.Cosh((-1):1), {= endpointTolerance=1/1000, maxWork=300 }),
                .numerics.Range(.numerics.Tanh((-1):1), {= endpointTolerance=1/1000, maxWork=300 }),
                .numerics.Range(.numerics.Sech((-1):1), {= endpointTolerance=1/1000, maxWork=300 }),
                .numerics.Range(.numerics.Csch((-1):1)),
                .numerics.Range(.numerics.Asinh((-1):1), {= endpointTolerance=1/1000, maxWork=300 }),
                .numerics.Range(.numerics.Acosh(1:2), {= endpointTolerance=1/1000, maxWork=300 }),
                .numerics.Range(.numerics.Atanh((-1/2):(1/2)), {= endpointTolerance=1/1000, maxWork=300 })
            }
        `, runtime());

        for (const range of [...result.values.slice(0, 4), ...result.values.slice(5)]) {
            expect(entry(range, "certified").value).toBe(1n);
        }
        expect(entry(result.values[0], "interval").low.toNumber()).toBeLessThanOrEqual(Math.sinh(-1));
        expect(entry(result.values[0], "interval").high.toNumber()).toBeGreaterThanOrEqual(Math.sinh(1));
        expect(entry(result.values[1], "interval").low.lessThanOrEqual(new Rational(1n))).toBe(true);
        expect(entry(result.values[1], "interval").high.toNumber()).toBeGreaterThanOrEqual(Math.cosh(1));
        expect(entry(result.values[3], "interval").high.greaterThanOrEqual(new Rational(1n))).toBe(true);
        expect(textValue(entry(result.values[4], "status"))).toBe("unknown");
        expect(textValue(entry(result.values[4], "domainStatus")))
            .toBe("partiallyDefined");
        expect(entry(result.values[4], "diagnostics").values.map(textValue)).toEqual(["poleInInput"]);
    });

    test("monotone and even statistical functions have certified interval variants", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            {:
                .numerics.Range(.numerics.Erf((-1):1), {= endpointTolerance=1/1000, maxWork=400 }),
                .numerics.Range(.numerics.Erfc((-1):1), {= endpointTolerance=1/1000, maxWork=400 }),
                .numerics.Range(.numerics.NormalPDF((-1):1), {= endpointTolerance=1/1000, maxWork=400 }),
                .numerics.Range(.numerics.NormalCDF((-1):1), {= endpointTolerance=1/1000, maxWork=400 })
            }
        `, runtime());

        expect(result.values.every((range) => entry(range, "certified")?.value === 1n)).toBe(true);
        const erf = entry(result.values[0], "interval");
        expect(erf.low.lessThanOrEqual(new Rational(-84n, 100n))).toBe(true);
        expect(erf.high.greaterThanOrEqual(new Rational(84n, 100n))).toBe(true);
        const density = entry(result.values[2], "interval");
        expect(density.high.greaterThanOrEqual(new Rational(39n, 100n))).toBe(true);
        const distribution = entry(result.values[3], "interval");
        expect(distribution.low.lessThanOrEqual(new Rational(16n, 100n))).toBe(true);
        expect(distribution.high.greaterThanOrEqual(new Rational(84n, 100n))).toBe(true);
    });

    test("composite range endpoints never certify before minimum refinement work", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            {:
                .numerics.Range(.numerics.Exp(1:2), {= maxWork=0 }),
                .numerics.Range(.numerics.Log(1:2), {= maxWork=0 }),
                .numerics.Range(.numerics.Sinh((-1):1), {= maxWork=0 }),
                .numerics.Range(.numerics.Cosh((-1):1), {= maxWork=0 }),
                .numerics.Range(.numerics.Erf((-1):1), {= maxWork=0 }),
                .numerics.Range(.numerics.NormalCDF((-1):1), {= maxWork=0 })
            }
        `, runtime());

        for (const range of result.values) {
            expect(textValue(entry(range, "status"))).toBe("unknown");
            expect(entry(range, "certified")).toBeNull();
            expect(entry(range, "interval")).toBeNull();
            expect(entry(range, "diagnostics").values.map(textValue))
                .toEqual(["rangeReductionBudgetExhausted"]);
        }
    });
});
