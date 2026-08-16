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
        expect(parseAndEvaluate(`
            .numerics.Refine(.stats.NormalQuantile(0), {=
                absoluteWidth=1/1000, maxWork=100
            })[:status]
        `, options).value).toBe("unknown");
        expect(() => parseAndEvaluate(".bessel.J(1/2, 1)", options)).toThrow("Integer");
    });
});
