import { describe, expect, test } from "bun:test";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/index.js";
import {
    decimalToRixRational,
    numericsReferenceCases,
} from "../../benchmarks/numerics-reference-corpus.js";

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

function asRational(value) {
    return typeof value.toRational === "function" ? value.toRational() : value;
}

function overlaps(interval, lower, upper) {
    return !interval.high.lessThan(asRational(lower))
        && !interval.low.greaterThan(asRational(upper));
}

describe("certified numerics reference corpus", () => {
    test("encloses published standard values at the requested widths", () => {
        for (const testCase of numericsReferenceCases) {
            const options = runtime();
            parseAndEvaluate(`
                .Plugin.Load("numerics");
                .Plugin.Load("bessel");
                .Plugin.Load("stats");
            `, options);
            const result = parseAndEvaluate(`
                .numerics.Refine(${testCase.expression}, {=
                    absoluteWidth=${testCase.width},
                    maxWork=${testCase.maxWork}
                })
            `, options);
            const interval = entry(result, "interval");
            const lower = parseAndEvaluate(decimalToRixRational(testCase.lower), options);
            const upper = parseAndEvaluate(decimalToRixRational(testCase.upper), options);

            expect(entry(result, "status").value, testCase.name).toBe("enclosed");
            expect(entry(result, "certified").value, testCase.name).toBe(1n);
            expect(overlaps(interval, lower, upper), `${testCase.name} reference interval`).toBe(true);
        }
    }, 15000);

    test("checks exact identities and integer-order Bessel parity", () => {
        const options = runtime();
        const result = parseAndEvaluate(`
            .Plugin.Load("stats");
            .Plugin.Load("bessel");
            {:
                .numerics.Refine(.stats.NormalCDF(0), {= absoluteWidth=1/1000, maxWork=800 })[:interval],
                .numerics.Refine(.stats.NormalQuantile(1/2), {= absoluteWidth=1/1000, maxWork=800 })[:interval],
                .numerics.Refine(.bessel.J(-2, 1)-.bessel.J(2, 1), {= absoluteWidth=1/100000, maxWork=3000 })[:interval],
                .numerics.Refine(.bessel.J(-3, 1)+.bessel.J(3, 1), {= absoluteWidth=1/100000, maxWork=4000 })[:interval],
                .numerics.Refine(.numerics.Gamma(5), {= absoluteWidth=1/1000, maxWork=100 })[:interval],
                .numerics.Refine(.numerics.Gamma(5/2)-3/4*.numerics.Gamma(1/2), {=
                    absoluteWidth=1/100000, maxWork=2000
                })[:interval],
                .numerics.Refine(.numerics.Gamma(-1/2)+2*.numerics.Gamma(1/2), {=
                    absoluteWidth=1/100000, maxWork=6000
                })[:interval],
                .numerics.Refine(.numerics.Gamma(-1/3), {=
                    absoluteWidth=1/1000, maxWork=3000
                })[:interval]
            }
        `, options);
        const half = asRational(parseAndEvaluate("1/2", options));
        const zero = asRational(parseAndEvaluate("0", options));
        expect(result.values[0].containsValue(half)).toBe(true);
        for (const interval of result.values.slice(1, 4)) {
            expect(interval.containsValue(zero)).toBe(true);
        }
        expect(result.values[4].containsValue(asRational(parseAndEvaluate("24", options)))).toBe(true);
        expect(result.values[5].containsValue(zero)).toBe(true);
        expect(result.values[6].containsValue(zero)).toBe(true);
        expect(result.values[7].containsValue(
            asRational(parseAndEvaluate("-40623538/10000000", options)),
        )).toBe(true);
        expect(parseAndEvaluate(`
            .numerics.Refine(.stats.NormalQuantile(0), {=
                absoluteWidth=1/1000, maxWork=100
            })[:status]
        `, options).value).toBe("unknown");
        expect(() => parseAndEvaluate(".bessel.J(1/2, 1)", options)).toThrow("Integer");
    }, 15000);

    test("certifies modified integer-order Bessel values and symmetries", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("bessel")', options);
        const result = parseAndEvaluate(`{:
            .numerics.Refine(.bessel.I(0,1), {= absoluteWidth=1/100000, maxWork=5000 }),
            .numerics.Refine(.bessel.I(1,1), {= absoluteWidth=1/100000, maxWork=5000 }),
            .numerics.Refine(.bessel.K(0,1), {= absoluteWidth=1/100000, maxWork=12000 }),
            .numerics.Refine(.bessel.K(1,1), {= absoluteWidth=1/100000, maxWork=12000 }),
            .numerics.Refine(.bessel.I(-3,1)-.bessel.I(3,1), {=
                absoluteWidth=1/100000, maxWork=8000
            }),
            .numerics.Refine(.bessel.I(3,-1)+.bessel.I(3,1), {=
                absoluteWidth=1/100000, maxWork=8000
            }),
            .numerics.Refine(.bessel.K(-2,1)-.bessel.K(2,1), {=
                absoluteWidth=1/100000, maxWork=20000
            })
        }`, options);
        const witnesses = [
            "126606587/100000000",
            "56515910/100000000",
            "42102444/100000000",
            "60190723/100000000",
        ].map((source) => asRational(parseAndEvaluate(source, options)));
        for (let index = 0; index < 4; index += 1) {
            expect(entry(result.values[index], "status").value).toBe("enclosed");
            expect(
                entry(result.values[index], "interval").containsValue(witnesses[index]),
                `modified Bessel reference ${index}`,
            ).toBe(true);
        }
        const zero = asRational(parseAndEvaluate("0", options));
        for (const enclosure of result.values.slice(4)) {
            expect(entry(enclosure, "status").value).toBe("enclosed");
            expect(entry(enclosure, "interval").containsValue(zero)).toBe(true);
        }
    }, 15000);

    test("certifies reusable midpoint quadrature with exact and refinable samples", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("numerics")', options);
        const result = parseAndEvaluate(`{:
            .numerics.Refine(.numerics.Quadrature(x->x^2, 0, 1, {=
                secondDerivativeBound=2
            }), {= absoluteWidth=1/1000, maxWork=5000 }),
            .numerics.Refine(.numerics.Quadrature(x->x^2, 1, 0, {=
                secondDerivativeBound=2
            }), {= absoluteWidth=1/1000, maxWork=5000 }),
            .numerics.Refine(.numerics.Quadrature(x->.numerics.Sin(x), 0, 1, {=
                secondDerivativeBound=1
            }), {= absoluteWidth=1/1000, maxWork=12000 })
        }`, options);
        const witnesses = ["1/3", "-1/3", "459697/1000000"]
            .map((source) => asRational(parseAndEvaluate(source, options)));
        for (let index = 0; index < result.values.length; index += 1) {
            const enclosure = result.values[index];
            expect(
                entry(enclosure, "status").value,
                `quadrature status ${index}`,
            ).toBe("enclosed");
            expect(entry(enclosure, "certified").value).toBe(1n);
            expect(entry(enclosure, "interval").containsValue(witnesses[index])).toBe(true);
        }
        expect(() => parseAndEvaluate(
            ".numerics.Quadrature(x->x,0,1)",
            options,
        )).toThrow("secondDerivativeBound");
    }, 15000);

    test("continues Zeta across the real line with explicit pole values", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("numerics")', options);
        const result = parseAndEvaluate(`{:
            .numerics.Refine(.numerics.Zeta(1/2), {=
                absoluteWidth=1/1000, maxWork=30000
            }),
            .numerics.Refine(.numerics.Zeta(-1), {=
                absoluteWidth=1/1000, maxWork=30000
            }),
            .numerics.Refine(.numerics.Zeta(-2), {=
                absoluteWidth=1/1000, maxWork=100
            }),
            .numerics.Refine(.numerics.Zeta(0), {=
                absoluteWidth=1/1000, maxWork=100
            }),
            .numerics.Refine(.numerics.Zeta(-1/2), {=
                absoluteWidth=1/1000, maxWork=30000
            }),
            .numerics.Refine(.numerics.Zeta(1), {=
                absoluteWidth=1/1000, maxWork=100
            })
        }`, options);
        const witnesses = [
            "-14603545/10000000", "-1/12", "0", "-1/2", "-2078862/10000000",
        ]
            .map((source) => asRational(parseAndEvaluate(source, options)));
        for (let index = 0; index < 5; index += 1) {
            const enclosure = result.values[index];
            expect(
                entry(enclosure, "status").value,
                `continued Zeta status ${index}`,
            ).toBe("enclosed");
            expect(
                entry(enclosure, "interval").containsValue(witnesses[index]),
                `continued Zeta reference ${index}`,
            ).toBe(true);
        }
        expect(entry(result.values[5], "status").value).toBe("unknown");
        expect(entry(result.values[5], "diagnostics").values[0].value).toBe(
            "zetaPoleOrContinuationRegionNotSeparated",
        );
    }, 30000);
});
