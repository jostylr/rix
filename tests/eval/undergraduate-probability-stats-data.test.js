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

describe("undergraduate probability, statistics, and data-analysis coverage", () => {
    test("supports finite conditioning, Bayes updates, random variables, and moments", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("probability");
            die := .probability.Finite([1,2,3,4,5,6],[1,1,1,1,1,1]);
            even := .probability.Conditional(die,(x)->x%2==0);
            joint := .probability.Joint(die,(x)->x%2,(x)->x>=4);
            [
                even.PMF(4),
                .probability.ConditionalProbability(die,(x)->x==6,(x)->x%2==0),
                .probability.ExpectedValue(die),
                .probability.VarianceOf(die),
                .probability.Covariance(die,(x)->x,(x)->2*x),
                .probability.Marginal(joint,1).PMF(0),
                .probability.Independent(joint,(x)->x[1]==0,(x)->x[2]==1),
                .probability.Bayes(1/100,99/100,1/100)[:posterior]
            ]
        `, runtime());
        expect(formatValue(result)).toBe("[1/3, 1/3, 3..1/2, 2..11/12, 5..5/6, 1/2, 0, 1/2]");
    });

    test("provides relation cleaning, frequency tables, and contingency tables", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("data");
            source := .data.Relation([
                {= id="group",type=:String,nullable=0 },
                {= id="result",type=:String,nullable=0 }
            ], [["a","yes"],["a","yes"],["a","no"],["b","no"],["b","no"],["b","yes"]]);
            renamed := .data.Rename(source,{= result="outcome" });
            unique := .data.Distinct(renamed,["group","outcome"]);
            frequencies := .data.Frequency(renamed,["group","outcome"]);
            table := .data.Contingency(renamed,"group","outcome");
            [.data.Rows(unique),.data.Rows(frequencies),table[:counts],table[:rowTotals],table[:columnTotals],table[:total]]
        `, runtime());
        expect(formatValue(result)).toBe("[[{= group=a, outcome=yes }, {= group=a, outcome=no }, {= group=b, outcome=no }, {= group=b, outcome=yes }], [{= group=a, outcome=yes, count=2, proportion=1/3 }, {= group=a, outcome=no, count=1, proportion=1/6 }, {= group=b, outcome=no, count=2, proportion=1/3 }, {= group=b, outcome=yes, count=1, proportion=1/6 }], [[2, 1], [1, 2]], [3, 3], [3, 3], 6]");
    });

    test("stores interval columns and aggregates every admissible measurement conservatively", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("data");
            measurements := .data.Relation([
                {= id="batch",type=:String,nullable=0 },
                {= id="distance",type=:Interval,nullable=0 }
            ], [["a",9:11],["a",23/2:25/2],["a",12:16]]);
            summary := .data.Aggregate(.data.Group(measurements,["batch"]),[
                {= id="sum",column="distance",op=:sum },
                {= id="mean",column="distance",op=:mean },
                {= id="minimum",column="distance",op=:min },
                {= id="maximum",column="distance",op=:max }
            ]);
            points := .data.Relation([{= id="value",type=:Interval }],[[4],[4:4]]);
            [.data.Schema(measurements),.data.Rows(summary),.data.Rows(.data.Distinct(points)).Len()]
        `, runtime());
        expect(formatValue(result)).toContain("type=Interval");
        expect(formatValue(result)).toContain("sum=32..1/2:39..1/2");
        expect(formatValue(result)).toContain("minimum=9:11");
        expect(formatValue(result)).toContain("maximum=12:16");
        expect(formatValue(result.values[2])).toBe("1");
    });

    test("summarizes and tests interval measurements without midpoint substitution", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stats");
            measurements := .stats.MeasurementIntervals([10,12,14],[1,1/2,2]);
            summary := .stats.IntervalSummary(measurements);
            dependent := .stats.IntervalOneSampleZTest(measurements,10,2,:greater);
            high := .stats.IntervalOneSampleZTest([11:56/5,56/5:57/5,57/5:58/5],10,1,:greater);
            low := .stats.IntervalOneSampleZTest([9:11,10:12,11:13],10,2,:greater);
            [
                measurements,summary[:meanRange],summary[:minimumRange],summary[:maximumRange],
                dependent.Decision(1/20,{= absoluteWidth=1/500,maxWork=400 })[:status],
                high.Decision(1/20,{= absoluteWidth=1/500,maxWork=400 })[:status],
                low.Decision(1/100,{= absoluteWidth=1/500,maxWork=400 })[:status]
            ]
        `, runtime());
        expect(formatValue(result)).toBe("[[9:11, 11..1/2:12..1/2, 12:16], 10..5/6:13..1/6, 9:11, 12:16, measurementDependent, rejectForAllMeasurements, failToRejectForAllMeasurements]");
    }, 20000);

    test("sorts unsorted exact samples and supplies correlation and t confidence procedures", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("stats");
            summary := .stats.Summary([3,1,2]);
            correlation := .stats.Correlation([1,2,3],[2,4,6]);
            correlationTest := .stats.CorrelationTest([1,2,3,4],[1,2,4,3]);
            confidence := .stats.MeanTConfidence([1,2,3,4,5],9/10,{= extent=10,criticalWidth=1/100,probabilityWidth=1/10000,maxWork=600,maxIterations=16 });
            pairedConfidence := .stats.PairedMeanDifferenceConfidence([10,12,13,15],[8,9,11,12],9/10,{= criticalWidth=1/10,probabilityWidth=1/1000,maxWork=200,maxIterations=8 });
            welchConfidence := .stats.MeanDifferenceConfidence([1,2,3,4],[6,8,10,12],9/10,{= extent=10,criticalWidth=1/20,probabilityWidth=1/10000,maxWork=500,maxIterations=12 });
            [summary[:minimum],summary[:median],summary[:maximum],correlation,correlationTest[:test],confidence[:parameter],confidence[:criticalPolicy],confidence[:certified],pairedConfidence[:parameter],welchConfidence[:method]]
        `, runtime());
        expect(formatValue(result)).toBe("[1, 2, 3, 1, pearsonCorrelation, mean, outwardUpper, 1, pairedMeanDifference, welchTOutwardIntegerReference]");
    }, 20000);
});
