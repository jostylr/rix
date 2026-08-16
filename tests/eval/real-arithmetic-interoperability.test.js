import { describe, expect, test } from "bun:test";
import { Integer, RationalInterval } from "@ratmath/core";
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
    const wanted = String(key).toLowerCase();
    for (const [name, value] of map.entries) {
        if (String(name).toLowerCase() === wanted) return value;
    }
    return null;
}

function text(value) {
    return value?.value ?? null;
}

function contains(interval, value) {
    return interval.containsValue(value instanceof Integer ? value.toRational() : value);
}

describe("certified real arithmetic interoperability", () => {
    test("distinguishes refinable singleton reals from finite set enclosures", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("ball");
            {:
                .ball(1, 1/10).NumericsCapabilities()[:denotation],
                .ball.Sqrt(2).NumericsCapabilities()[:denotation],
                .ball(1, 1/10).NumericsCapabilities()[:arbitraryRefinement],
                .ball.Sqrt(2).NumericsCapabilities()[:arbitraryRefinement]
            }
        `, options);
        expect(result.values.slice(0, 2).map(text)).toEqual(["set", "singleton"]);
        expect(result.values[2]).toBeNull();
        expect(result.values[3].value).toBe(1n);
        expect(() => parseAndEvaluate(".oracle.From(.ball(1, 1/10))", options))
            .toThrow(/singleton|finite set/);
    });

    test("Rationals embed into each real family without changing the family result", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .Plugin.Load("ball");
            .Plugin.Load("cauchy");
            .Plugin.Load("continued-fraction");
            .Plugin.Load("algebraic-real");
            b = .ball.Sqrt(2) + 1/3;
            c = .cauchy.Geometric(1, 1/2) + 1/3;
            f = .cf.Sqrt2() + 1/3;
            a = .ar.Sqrt2() + 1/3;
            o = .oracle.Rational(2/3) + 1/3;
            {:
                b.__type, c.__type, f.__type, a.__type, o.__type,
                .numerics.Refine(b, {= absoluteWidth=1/100, maxWork=100 })[:interval],
                .numerics.Refine(c, {= absoluteWidth=1/100, maxWork=100 })[:interval]
            }
        `, options);
        expect(result.values.slice(0, 5).map(text)).toEqual([
            "NestedBallReal", "CauchyReal", "ContinuedFractionReal", "AlgebraicReal", "Oracle",
        ]);
        expect(result.values[5]).toBeInstanceOf(RationalInterval);
        expect(result.values[6]).toBeInstanceOf(RationalInterval);
        expect(contains(result.values[6], parseAndEvaluate("7/3", options))).toBe(true);
    });

    test("each refinable real family supports the main field operations with itself", () => {
        const cases = [
            ["oracle", ".oracle.Rational(3/2)", "Oracle"],
            ["ball", ".ball.Sqrt(2)", "NestedBallReal"],
            ["cauchy", ".cauchy.Geometric(1, 1/2)", "CauchyReal"],
            ["continued-fraction", ".cf.Sqrt2()", "ContinuedFractionReal"],
            ["algebraic-real", ".ar.Sqrt2()", "AlgebraicReal"],
        ];
        for (const [plugin, constructor, semanticType] of cases) {
            const options = runtime();
            const result = parseAndEvaluate(`
                .Plugin.Load("numerics");
                .Plugin.Load("${plugin}");
                x = ${constructor};
                values = [x+x, x-x, x*x, x/x, -x, .Abs(x), x^2];
                {:
                    values.Map((value) -> value.__type),
                    values.Map((value) -> .numerics.Refine(value, {= absoluteWidth=1/100, maxWork=200 })[:interval])
                }
            `, options);
            expect(result.values[0].values.map(text)).toEqual(Array(7).fill(semanticType));
            expect(result.values[1].values.every((interval) => interval instanceof RationalInterval)).toBe(true);
            expect(contains(result.values[1].values[1], parseAndEvaluate("0", options))).toBe(true);
            expect(contains(result.values[1].values[3], parseAndEvaluate("1", options))).toBe(true);
        }
    });

    test("different certified real families automatically meet at Oracle", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .Plugin.Load("cauchy");
            .Plugin.Load("algebraic-real");
            x = .cauchy.Geometric(1, 1/2) + .ar.Sqrt2();
            refined = .numerics.Refine(x, {= absoluteWidth=1/1000, maxWork=160, trace=1 });
            {: x.__type, x[:kind], refined }
        `, options);
        expect(text(result.values[0])).toBe("Oracle");
        expect(text(result.values[1])).toBe("arithmetic");
        const refined = result.values[2];
        expect(text(entry(refined, "status"))).toBe("enclosed");
        expect(text(entry(refined, "backend"))).toBe("oracle");
        expect(entry(refined, "work").entries.get("calls").value <= 160n).toBe(true);
        expect(entry(refined, "trace").values.every((step) => entry(step, "actualized")?.value === 1n)).toBe(true);
    });

    test("Float never participates in implicit mixed arithmetic", () => {
        const options = runtime();
        loadFloatPlugin(options.systemContext, options.registry);
        parseAndEvaluate('.Plugin.Load("cauchy")', options);
        expect(() => parseAndEvaluate("1/2 + .float(1/2)", options)).toThrow();
        expect(() => parseAndEvaluate(".cauchy.Geometric(1,1/2) + .float(1/2)", options)).toThrow();
        expect(() => parseAndEvaluate(".oracle.From(.float(1/2))", options)).toThrow(/Float/);
        expect(parseAndEvaluate("(.float(1/2) + .float(1/2)).Value()", options).value).toBe("1");
    });

    test("division preserves unresolved zero separation as a structured result", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .Plugin.Load("continued-fraction");
            x = .cf.Sqrt2();
            .numerics.Refine(x / (x-x), {= absoluteWidth=1/1000, maxWork=40 })
        `, options);
        expect(text(entry(result, "status"))).toBe("unknown");
        expect(entry(result, "certified")).toBeNull();
        expect(entry(result, "diagnostics").values.map(text)).toContain("divisorNotSeparatedFromZero");
    });
});

describe("universal Numerics algorithm reals", () => {
    test("weighted roots produce nested actualized enclosures", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            square = .numerics.Refine(.numerics.Sqrt(2), {= absoluteWidth=1/1000, maxWork=30, trace=1 });
            cube = .numerics.Refine(.numerics.NthRoot(27, 3), {= absoluteWidth=1/1000, maxWork=30, trace=1 });
            negative = .numerics.Refine(.numerics.NthRoot(-8, 3), {= absoluteWidth=1/1000, maxWork=30 });
            {: square, cube, negative }
        `, options);
        const [square, cube, negative] = result.values;
        expect(text(entry(square, "status"))).toBe("enclosed");
        expect(entry(square, "interval").low.pow(2).lessThanOrEqual(parseAndEvaluate("2", options).toRational())).toBe(true);
        expect(entry(square, "interval").high.pow(2).greaterThanOrEqual(parseAndEvaluate("2", options).toRational())).toBe(true);
        expect(contains(entry(cube, "interval"), parseAndEvaluate("3", options))).toBe(true);
        expect(contains(entry(negative, "interval"), parseAndEvaluate("-2", options))).toBe(true);
        const trace = entry(square, "trace").values;
        expect(trace.length).toBeGreaterThan(1);
        for (let index = 1; index < trace.length; index += 1) {
            expect(entry(trace[index - 1], "interval").contains(entry(trace[index], "interval"))).toBe(true);
            expect(entry(trace[index], "actualized").value).toBe(1n);
        }
    });

    test("root algorithms consume other certified real providers and compose through Oracle", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .Plugin.Load("algebraic-real");
            .Plugin.Load("cauchy");
            fourthRoot = .numerics.Sqrt(.ar.Sqrt2());
            shifted = fourthRoot + .cauchy.Geometric(0, 1/2);
            {: shifted.__type, .numerics.Refine(shifted, {= absoluteWidth=1/1000, maxWork=180 }) }
        `, options);
        expect(text(result.values[0])).toBe("Oracle");
        expect(text(entry(result.values[1], "status"))).toBe("enclosed");
        const interval = entry(result.values[1], "interval");
        expect(interval.low.greaterThan(parseAndEvaluate("1", options).toRational())).toBe(true);
        expect(interval.high.lessThan(parseAndEvaluate("3/2", options))).toBe(true);
    });

    test("rational powers use universal roots and integer powers", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            twoThirds = .numerics.Refine(.numerics.Pow(27/8, 2/3), {=
                absoluteWidth=1/1000, maxWork=120
            });
            reciprocalRoot = .numerics.Refine(.numerics.Pow(4, -1/2), {=
                absoluteWidth=1/1000, maxWork=120
            });
            exact = .numerics.Pow(4, 3);
            {: twoThirds, reciprocalRoot, exact }
        `, options);
        expect(contains(entry(result.values[0], "interval"), parseAndEvaluate("9/4", options))).toBe(true);
        expect(contains(entry(result.values[1], "interval"), parseAndEvaluate("1/2", options))).toBe(true);
        expect(result.values[2].value).toBe(64n);
    });

    test("certified exp and logarithms support natural and changed bases", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            naturalExp = .numerics.Refine(.numerics.Exp(1), {=
                absoluteWidth=1/10000, maxWork=160
            });
            naturalLog = .numerics.Refine(.numerics.Ln(2), {=
                absoluteWidth=1/10000, maxWork=160
            });
            binary = .numerics.Refine(.numerics.Log2(8), {=
                absoluteWidth=1/10000, maxWork=320
            });
            decimal = .numerics.Refine(.numerics.Log10(1000), {=
                absoluteWidth=1/10000, maxWork=320
            });
            changed = .numerics.Refine(.numerics.Log(3, 4), {=
                absoluteWidth=1/10000, maxWork=320
            });
            {: naturalExp, naturalLog, binary, decimal, changed, .numerics.Exp(3, 4) }
        `, options);
        expect(contains(entry(result.values[0], "interval"), parseAndEvaluate("271828/100000", options))).toBe(true);
        expect(contains(entry(result.values[1], "interval"), parseAndEvaluate("693147/1000000", options))).toBe(true);
        expect(contains(entry(result.values[2], "interval"), parseAndEvaluate("3", options))).toBe(true);
        expect(contains(entry(result.values[3], "interval"), parseAndEvaluate("3", options))).toBe(true);
        expect(entry(result.values[4], "interval").low.greaterThan(parseAndEvaluate("79/100", options))).toBe(true);
        expect(entry(result.values[4], "interval").high.lessThan(parseAndEvaluate("4/5", options))).toBe(true);
        expect(result.values[5].value).toBe(64n);
        for (const enclosure of result.values.slice(0, 5)) {
            expect(text(entry(enclosure, "status"))).toBe("enclosed");
            expect(entry(enclosure, "certified").value).toBe(1n);
        }
    });

    test("Numerics exports can be opened lexically without entering the system namespace", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .numerics[:Pow, :Exp, :Log2];
            {: Pow(4, 3), Exp(3, 4), Log2(8) }
        `, options);
        expect(result.values[0].value).toBe(64n);
        expect(result.values[1].value).toBe(64n);
        expect(entry(result.values[2], "kind").value).toBe("arithmetic");
        expect(options.systemContext.has("Exp")).toBe(false);
    });

    test("elementary algorithms consume unrelated certified real providers", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .Plugin.Load("algebraic-real");
            .numerics.Refine(.numerics.Exp(.ar.Sqrt2()), {=
                absoluteWidth=1/1000, maxWork=300
            })
        `, options);
        expect(text(entry(result, "status"))).toBe("enclosed");
        expect(entry(result, "interval").low.greaterThan(parseAndEvaluate("4", options).toRational())).toBe(true);
        expect(entry(result, "interval").high.lessThan(parseAndEvaluate("5", options).toRational())).toBe(true);
    });

    test("logarithms preserve an unresolved domain as structured evidence", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .numerics.Refine(.numerics.Log(-1), {= absoluteWidth=1/1000, maxWork=40 })
        `, options);
        expect(text(entry(result, "status"))).toBe("unknown");
        expect(entry(result, "certified")).toBeNull();
        expect(entry(result, "diagnostics").values.map(text)).toContain("logDomainNotCertified");
    });

    test("even roots do not guess when the radicand sign is invalid", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            .numerics.Refine(.numerics.Sqrt(-2), {= absoluteWidth=1/1000, maxWork=10 })
        `, options);
        expect(text(entry(result, "status"))).toBe("unknown");
        expect(entry(result, "certified")).toBeNull();
        expect(entry(result, "diagnostics").values.map(text)).toContain("radicandSignNotCertified");
    });

    test("Kantorovich certifies the initial ball and interval Newton materializes each step", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("numerics");
            root = .numerics.Kantorovich(
                (x) -> x^2-2,
                (x) -> 2*x,
                {=
                    interval=1:2,
                    initial=3/2,
                    derivativeLower=2,
                    secondDerivativeUpper=2,
                    secondDerivative=(x)->2
                }
            );
            .numerics.Refine(root, {= absoluteWidth=1/100000, maxWork=30, trace=1 })
        `, options);
        expect(text(entry(result, "status"))).toBe("enclosed");
        expect(text(entry(result, "evidenceLevel"))).toBe("constructorGuarantee");
        expect(entry(result, "work").entries.get("calls").value).toBeLessThanOrEqual(30n);
        const trace = entry(result, "trace").values;
        expect(trace.length).toBeGreaterThan(1);
        for (let index = 1; index < trace.length; index += 1) {
            expect(entry(trace[index - 1], "interval").contains(entry(trace[index], "interval"))).toBe(true);
            expect(entry(trace[index], "actualized").value).toBe(1n);
        }
    });

    test("Kantorovich rejects failed conditions and unverified derivative bounds", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("numerics")', options);
        expect(() => parseAndEvaluate(`
            .numerics.Kantorovich((x)->x^2+10, (x)->2*x, {=
                interval=1:2, initial=3/2, derivativeLower=2,
                secondDerivativeUpper=2, secondDerivative=(x)->2
            })
        `, options)).toThrow(/condition/);
        expect(() => parseAndEvaluate(`
            .numerics.Kantorovich((x)->x^2-2, (x)->2*x, {=
                interval=1:2, initial=3/2, derivativeLower=4,
                secondDerivativeUpper=2, secondDerivative=(x)->2
            })
        `, options)).toThrow(/derivativeLower/);
    });
});
