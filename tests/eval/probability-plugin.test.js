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

describe("probability plugin", () => {
    test("is opt-in and remains separate from stats and data", () => {
        expect(() => parseAndEvaluate(".probability.Binomial(2,1/2)", runtime())).toThrow();
        expect(() => parseAndEvaluate('.Plugin.Load("stats"); .probability.Binomial(2,1/2)', runtime())).toThrow();

        const result = parseAndEvaluate(`
            .Plugin.Load("probability");
            d := .probability.Binomial(2,1/2);
            {: d[:schema], d.Family(), d[:exactProbability] }
        `, runtime());
        expect(formatValue(result)).toBe("( rix.probability.distribution@1, binomial, 1 )");
    });

    test("computes exact combinatorics and finite uniform events", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("probability");
            outcomes := .probability.CartesianPower([1,2,3,4,5,6],2);
            seven := .probability.Event(outcomes,(roll)->roll[1]+roll[2]==7);
            finite := .probability.Finite([1,2,3],[1,2,1]);
            [
                .probability.Choose(52,5),
                .probability.Permutations(5,2),
                .probability.MultinomialCoefficient([2,1,1]),
                seven[:favorableCount],
                seven[:probability],
                finite.PMF(2),
                finite.CDF(2),
                finite.Probability((x)->x>=2)
            ]
        `, runtime());
        expect(formatValue(result)).toBe("[2598960, 20, 12, 6, 1/6, 1/2, 3/4, 3/4]");
    });

    test("provides exact binomial and multinomial laws", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("probability");
            binomial := .probability.Binomial(4,1/2);
            multinomial := .probability.Multinomial(3,[1/2,1/3,1/6]);
            [
                binomial.PMF(2), binomial.CDF(2),
                binomial.Mean(), binomial.Variance(),
                multinomial.PMF([1,1,1]),
                multinomial.PMF([1,1,0]),
                multinomial.CDF([1,1,3]),
                multinomial.Mean()
            ]
        `, runtime());
        expect(formatValue(result)).toBe("[3/8, 11/16, 2, 1, 1/6, 0, 13/54, [1..1/2, 1, 1/2]]");
    });

    test("keeps dice and card probabilities exact without CDF state leakage", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("probability");
            dice := .probability.Dice(2,6);
            beforeDice := dice.PMF(7);
            diceCDF := dice.CDF(6);
            cards := .probability.CardDraw(52,4,5);
            beforeCards := cards.PMF(0);
            cardsCDF := cards.CDF(1);
            [
                beforeDice, diceCDF, dice.PMF(7), dice.Mean(), dice.Variance(),
                beforeCards, cardsCDF, cards.PMF(0), cards.Mean()
            ]
        `, runtime());
        expect(formatValue(result)).toBe("[1/6, 5/12, 1/6, 7, 5..5/6, 35673/54145, 51888/54145, 35673/54145, 5/13]");
    });

    test("uses replayable scoped RNGs and labels sampling policies", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("probability");
            dice := .probability.Dice(2,6);
            first := dice.Simulate(12,{= seed=42});
            second := .probability.Simulate(dice,12,{= seed=42});
            certainZero := .probability.Binomial(5,0).Simulate(3,{= seed=9});
            certainFive := .probability.Binomial(5,1).Simulate(3,{= seed=9});
            [
                first[:values], second[:values],
                first[:replayable], first[:exactSampling], first[:samplingPolicy],
                certainZero[:values], certainFive[:values]
            ]
        `, runtime());
        expect(formatValue(result)).toBe("[[8, 7, 7, 7, 4, 10, 8, 8, 10, 2, 7, 12], [8, 7, 7, 7, 4, 10, 8, 8, 10, 2, 7, 12], 1, 1, exactUniformDice, [0, 0, 0], [5, 5, 5]]");
    });

    test("builds a standard deck and samples without replacement", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("probability");
            deck := .probability.StandardDeck();
            .RNG(:default,{= seed=314159});
            hand := .probability.DrawCards(deck,5);
            [deck.Len(), deck[1][:suit], deck[1][:rank], deck[52][:suit], deck[52][:rank], hand.Len()]
        `, runtime());
        expect(formatValue(result)).toBe("[52, clubs, A, spades, K, 5]");
    });

    test("returns certified normal functions and discloses grid simulation", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("probability");
            normal := .probability.Normal(0,1);
            cdf := .numerics.Refine(normal.CDF(0),{= absoluteWidth=1/1000,maxWork=20000});
            run := normal.Simulate(2,{= seed=7,grid=64});
            [
                cdf[:status], cdf[:interval], normal.Quantile(1/2),
                normal.Mean(), normal.Variance(),
                run[:samplingPolicy], run[:exactSampling], run[:count]
            ]
        `, runtime());
        expect(formatValue(result)).toBe("[enclosed, 1/2:1/2, 0, 0, 1, finiteQuantileGrid, 0, 2]");
        expect(() => parseAndEvaluate('.Plugin.Load("probability"); .probability.Normal().Quantile(0)', runtime())).toThrow("strictly between 0 and 1");
    });

    test("rejects invalid parameters and excessive finite enumeration", () => {
        expect(() => parseAndEvaluate('.Plugin.Load("probability"); .probability.Binomial(-1,1/2)', runtime())).toThrow("nonnegative");
        expect(() => parseAndEvaluate('.Plugin.Load("probability"); .probability.Multinomial(2,[1/2,1/4])', runtime())).toThrow("sum exactly to 1");
        expect(() => parseAndEvaluate('.Plugin.Load("probability"); .probability.CardDraw(10,11,2)', runtime())).toThrow("cannot exceed population");
        expect(() => parseAndEvaluate('.Plugin.Load("probability"); .probability.CartesianPower([0,1],20,1000)', runtime())).toThrow("exceeding maxOutcomes");
    });

    test("covers the Phase 2 discrete distribution family", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("probability");
            bernoulli := .probability.Bernoulli(1/4);
            categorical := .probability.Categorical([1/2,1/3,1/6],["a","b","c"]);
            geometric := .probability.Geometric(1/2);
            negative := .probability.NegativeBinomial(2,1/2);
            hyper := .probability.Hypergeometric(12,4,3);
            poisson := .probability.Poisson(2);
            poissonCDF := .numerics.Refine(poisson.CDF(2),{= absoluteWidth=1/1000,maxWork=20000 });
            [
                bernoulli.PMF(1), bernoulli.Quantile(3/4),
                categorical.PMF("b"), categorical.CDF("b"), categorical.Quantile(0),
                geometric.PMF(2), geometric.CDF(2), geometric.Mean(),
                negative.PMF(1), negative.CDF(1),
                hyper.PMF(1), hyper.Family(),
                poisson.Mean(), poisson.Variance(), poissonCDF[:status]
            ]
        `, runtime());
        expect(formatValue(result)).toBe("[1/4, 1, 1/3, 5/6, a, 1/8, 7/8, 1, 1/4, 1/2, 28/55, hypergeometric, 2, 2, enclosed]");
    });

    test("provides certified continuous laws and enclosing inverse brackets", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("probability");
            gamma := .probability.Gamma(2);
            beta := .probability.Beta(2,3);
            student := .probability.StudentT(2);
            f := .probability.F(4,6);
            gammaCDF := .numerics.Refine(gamma.CDF(1),{= absoluteWidth=1/1000,maxWork=20000 });
            studentCDF := .numerics.Refine(student.CDF(1),{= absoluteWidth=1/100,maxWork=20000 });
            betaMedian := .probability.Beta(2,2).Quantile(1/2,{= width=1/1000,probabilityWidth=1/1000000 });
            [
                .probability.Uniform(-1,3).CDF(1),
                .probability.Exponential(2).CDF(0),
                beta.CDF(1/2), beta.PDF(0), .probability.Beta(1,3).PDF(0),
                .probability.ChiSquare(4).Mean(),
                student.CDF(0), student.Mean(), student.Variance(),
                f.CDF(1), gammaCDF[:status], studentCDF[:status],
                betaMedian.Low() <= 1/2, betaMedian.High() >= 1/2,
                .probability.Cauchy().MomentsExist(), .probability.LogNormal().CDF(0)
            ]
        `, runtime());
        expect(formatValue(result)).toBe("[1/2, 0, 11/16, 0, 3, 4, 1/2, 0, _, 328/625, enclosed, enclosed, 1, 1, 0, 0]");
    });

    test("discloses Phase 2 simulation approximations and unsupported certified domains", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("probability");
            poisson := .probability.Poisson(1).Simulate(2,{= seed=19,approximationTrials=32 });
            exponential := .probability.Exponential().Simulate(2,{= seed=19,grid=32 });
            [poisson[:samplingPolicy],poisson[:exactSampling],exponential[:samplingPolicy],exponential[:exactSampling]]
        `, runtime());
        expect(formatValue(result)).toBe("[binomialLimitApproximation, 0, finiteInverseCDFGrid, 0]");
        expect(() => parseAndEvaluate('.Plugin.Load("probability"); .probability.Gamma(1/3).CDF(1)', runtime()))
            .toThrow("Integer or half-Integer shape");
        expect(() => parseAndEvaluate('.Plugin.Load("probability"); .probability.Beta(1/2,2).CDF(1/2)', runtime()))
            .toThrow("positive Integer parameters");
        expect(() => parseAndEvaluate('.Plugin.Load("probability"); .probability.F(3,5).CDF(1)', runtime()))
            .toThrow("positive Integer parameters");
        expect(formatValue(parseAndEvaluate('.Plugin.Load("probability"); .probability.F(2,6).PDF(0)', runtime()))).toBe("1");
        expect(() => parseAndEvaluate('.Plugin.Load("probability"); .probability.F(1,6).PDF(0)', runtime()))
            .toThrow("unbounded at zero");
        expect(() => parseAndEvaluate('.Plugin.Load("probability"); .probability.Beta(1/2,2).PDF(0)', runtime()))
            .toThrow("unbounded at zero");
        expect(formatValue(parseAndEvaluate(`
            .Plugin.Load("probability");
            [.probability.Exponential().Quantile(0),.probability.LogNormal().Quantile(0),.probability.Gamma(2).Quantile(0),.probability.Beta(2,3).Quantile(1),.probability.F(2,6).Quantile(0)]
        `, runtime()))).toBe("[0, 0, 0, 1, 0]");
        expect(() => parseAndEvaluate('.Plugin.Load("probability"); .probability.Geometric(1/2).Quantile(1)', runtime()))
            .toThrow("unbounded");
        expect(() => parseAndEvaluate('.Plugin.Load("probability"); .probability.Poisson(2).Quantile(1)', runtime()))
            .toThrow("unbounded");
    });
});
