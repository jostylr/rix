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

describe("certified inference over interval measurements", () => {
    test("point boxes collapse to the ordinary exact test statistics", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stats");
            one := .stats.IntervalOneSampleTTest([1,2,4],0);
            paired := .stats.IntervalPairedTTest([3,5,8],[1,2,4]);
            pooled := .stats.IntervalTwoSampleTTest([1,2,3],[5,7,9],0,{= equalVariance=1 });
            anova := .stats.IntervalOneWayANOVA([[1,2],[4,5]]);
            correlation := .stats.IntervalCorrelationTest([1,2,3,4],[1,2,4,3]);
            slope := .stats.IntervalRegressionSlopeTest([1,2,3,4],[1,2,4,3]);
            [
                one[:statisticEndpoints][1][:squared],one[:statisticEndpoints][2][:squared],
                paired[:statisticEndpoints][1][:squared],pooled[:statisticEndpoints][1][:sign],
                pooled[:statisticEndpoints][1][:squared],anova[:statisticEndpoints],
                correlation[:statisticEndpoints][1][:squared],slope[:statisticEndpoints][1][:squared],
                slope[:estimateRange],one[:certified],anova[:certified]
            ]
        `, runtime());

        expect(formatValue(result)).toBe("[7, 7, 27, -1, 15, [18, 18], 3..5/9, 3..5/9, 4/5:4/5, 1, 1]");
    });

    test("subdivision tightens while retaining the full measurement box", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stats");
            broad := .stats.IntervalOneSampleTTest([9:10,11:12,13:14],10,:greater,{= maxBoxes=1 });
            tight := .stats.IntervalOneSampleTTest([9:10,11:12,13:14],10,:greater,{= maxBoxes=16 });
            [
                broad[:effectRange],tight[:effectRange],
                tight[:statisticEndpoints][1][:squared] >= broad[:statisticEndpoints][1][:squared],
                tight[:statisticEndpoints][2][:squared] <= broad[:statisticEndpoints][2][:squared],
                broad[:subdivision][:boxesEvaluated],tight[:subdivision][:boxesEvaluated],
                tight[:interpretation],tight[:pValueStatus]
            ]
        `, runtime());

        expect(formatValue(result)).toBe("[1:2, 1:2, 1, 1, 1, 16, allPointDatasetsConsistentWithMeasurementIntervals, certifiedOuterBoundsByIntervalSubdivision]");
    });

    test("covers paired, Welch, ANOVA, correlation, slope, and zero-variance edges", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stats");
            paired := .stats.IntervalPairedTTest([10:11,12:13,14:15],[8:9,9:10,11:12],0,:greater,{= maxBoxes=4 });
            welch := .stats.IntervalTwoSampleTTest([9:10,10:11,11:12],[5:6,6:7,7:8],0,{= maxBoxes=4 });
            anova := .stats.IntervalOneWayANOVA([[1:2,2:3],[5:6,6:7]],{= maxBoxes=4 });
            correlation := .stats.IntervalCorrelationTest([1:2,2:3,3:4],[2:3,4:5,6:7],:twoSided,{= maxBoxes=4 });
            slope := .stats.IntervalRegressionSlopeTest([1:2,2:3,3:4],[2:3,4:5,6:7],0,:twoSided,{= maxBoxes=4 });
            infinite := .stats.IntervalOneSampleTTest([2,2,2],0,:greater);
            dependent := .stats.IntervalOneSampleTTest([0:1,0:1,0:1],0,:greater,{= maxBoxes=1 });
            [
                paired[:test],welch[:pValueQualification],anova[:test],correlation[:test],slope[:test],
                infinite[:statisticEndpoints][1][:infinite],infinite[:statisticEndpoints][1][:sign],
                infinite[:pValueLower],infinite[:pValueUpper],infinite.Decision()[:status],dependent.Decision()[:status]
            ]
        `, runtime());

        expect(formatValue(result)).toBe("[intervalPairedT, containsEveryWelchIntegerReferenceDegree, intervalOneWayANOVA, intervalPearsonCorrelation, intervalRegressionSlopeT, 1, 1, 0, 0, rejectForAllMeasurements, measurementDependent]");
    });
});
