import { describe, expect, test } from "bun:test";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    formatValue,
    parseAndEvaluate,
} from "../../src/index.js";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

describe("undergraduate statistics hypothesis tests", () => {
    test("builds one- and two-sample z tests and proportion score tests", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stats");
            mean := .stats.OneSampleZTest([48,49,50,51,52],50,2);
            twoMean := .stats.TwoSampleZTest([4,5,6],[1,2,3],2,3);
            proportion := .stats.OneProportionZTest(60,100,1/2,:greater);
            twoProportion := .stats.TwoProportionZTest(45,60,30,60);
            [
                mean[:schema],mean[:test],mean[:estimate],mean[:statistic],mean[:pValue],
                twoMean[:test],twoMean[:estimate],
                proportion[:test],proportion[:estimate],proportion[:alternative],
                twoProportion[:test],twoProportion[:estimate],twoProportion[:pooledEstimate]
            ]
        `, runtime());
        expect(formatValue(result)).toBe("[rix.stats.test@1, oneSampleZ, 50, 0, 1, twoSampleZ, 3, oneProportionZ, 3/5, greater, twoProportionZ, 1/4, 5/8]");
    });

    test("supports one-sample, paired, pooled, and Welch t procedures", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stats");
            one := .stats.OneSampleTTest([2,4,6,8,10]);
            paired := .stats.PairedTTest([10,12,13,15],[8,9,11,12]);
            pooled := .stats.TwoSampleTTest([8,9,10,11],[3,4,5,6],0,{= equalVariance=1 });
            welch := .stats.TwoSampleTTest([1,2,3,4],[6,8,10,12]);
            [
                one[:test],one[:estimate],one[:degreesOfFreedom],one.Decision(1/20,{= absoluteWidth=1/1000,maxWork=1000 })[:status],
                paired[:test],paired[:differences],
                pooled[:method],pooled[:degreesOfFreedom],
                welch[:method],welch[:degreesOfFreedom],welch[:referenceDegreesOfFreedom],welch[:pValueStatus]
            ]
        `, runtime());
        expect(formatValue(result)).toBe("[oneSampleT, 6, 4, reject, pairedT, [2, 3, 2, 3], pooledStudentT, 6, welchTWithIntegerReference, 4..7/17, 4, certifiedIntegerDfApproximation]");
    }, 10000);

    test("computes one-way ANOVA and Pearson chi-square tests", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stats");
            anova := .stats.OneWayANOVA([[1,2,3],[4,5,6]]);
            goodness := .stats.ChiSquareGoodnessOfFit([20,30,50],[25,25,50]);
            independent := .stats.ChiSquareIndependence([[10,10],[10,10]]);
            [
                anova[:test],anova[:statistic],anova[:degreesOfFreedom],anova.Decision()[:status],
                goodness[:test],goodness[:statistic],goodness[:degreesOfFreedom],goodness.Decision()[:status],
                independent[:test],independent[:statistic],independent[:pValue],independent.Decision()[:status],
                .stats.TestTable(anova)
            ]
        `, runtime());
        expect(formatValue({ type: "sequence", values: result.values.slice(0, 12) })).toBe("[oneWayANOVA, 13..1/2, [1, 4], reject, chiSquareGoodnessOfFit, 2, 2, failToReject, chiSquareIndependence, 0, 1, failToReject]");
        expect(result.values[12]).toMatchObject({ type: "output", kind: "table" });
    });

    test("certified tails enclose standard reference values", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stats");
            student := .stats.OneSampleTTest([2,4,6,8,10]);
            anova := .stats.OneWayANOVA([[1,2,3],[4,5,6]]);
            goodness := .stats.ChiSquareGoodnessOfFit([20,30,50],[25,25,50]);
            studentP := .numerics.Refine(student.PValue(),{= absoluteWidth=1/1000,maxWork=1600 })[:interval];
            anovaP := .numerics.Refine(anova.PValue(),{= absoluteWidth=1/1000,maxWork=1600 })[:interval];
            goodnessP := .numerics.Refine(goodness.PValue(),{= absoluteWidth=1/1000,maxWork=1600 })[:interval];
            [
                studentP.Low() < 14/1000,studentP.High() > 13/1000,
                anovaP.Low() < 22/1000,anovaP.High() > 21/1000,
                goodnessP.Low() < 369/1000,goodnessP.High() > 367/1000
            ]
        `, runtime());
        expect(formatValue(result)).toBe("[1, 1, 1, 1, 1, 1]");
    });

    test("rejects malformed samples and impossible reference scales", () => {
        expect(() => parseAndEvaluate('.Plugin.Load("stats"); .stats.OneSampleTTest([1,1])', runtime())).toThrow("standard error is zero");
        expect(() => parseAndEvaluate('.Plugin.Load("stats"); .stats.PairedTTest([1,2],[1])', runtime())).toThrow("same length");
        expect(() => parseAndEvaluate('.Plugin.Load("stats"); .stats.ChiSquareGoodnessOfFit([1,2],[1,3])', runtime())).toThrow("equal totals");
        expect(() => parseAndEvaluate('.Plugin.Load("stats"); .stats.ChiSquareIndependence([[1,2],[3]])', runtime())).toThrow("rectangular");
        expect(() => parseAndEvaluate('.Plugin.Load("stats"); .stats.OneSampleZTest([1,2],0,0)', runtime())).toThrow("positive exact Rational");
    });
});
