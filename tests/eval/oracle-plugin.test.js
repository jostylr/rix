import { describe, expect, test } from "bun:test";
import { Rational, RationalInterval } from "@ratmath/core";
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

function textValue(value) {
    return value?.value ?? null;
}

describe("pure RiX Oracle plugin", () => {
    test("is bundled as RiX source and mounts a callable namespace only when loaded", () => {
        const options = runtime();

        expect(parseAndEvaluate('.Plugin.Info("oracle")[:kind]', options).value).toBe("rix");
        expect(() => parseAndEvaluate(".oracle.Rational(1/3)", options)).toThrow("available but not loaded");

        const oracle = parseAndEvaluate('.Plugin.Load("oracle"); .oracle.Rational(1/3)', options);
        expect(textValue(entry(oracle, "valueKind"))).toBe("oracle");
        expect(textValue(entry(oracle, "constructor"))).toBe("rational");
        expect(entry(oracle, "parameters").entries.get("value").toString()).toBe("1/3");
        expect(options.systemContext.getCapabilityGroups().Numerics).toContain("oracle");
        expect(options.systemContext.getCapabilityGroups().Exact).toContain("oracle");
    });

    test("represents all Phase 1 rational procedures as distinct exact descriptors", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("oracle")', options);

        for (const procedure of ["singular", "reflexive", "halo", "randomHalo", "bisection"]) {
            const oracle = parseAndEvaluate(
                `.oracle.Rational(3/7, {= procedure=:${procedure}, seed=17 })`,
                options,
            );
            expect(textValue(entry(oracle, "procedure"))).toBe(procedure);
            expect(entry(oracle, "parameters").entries.get("value")).toBeInstanceOf(Rational);
        }
    });

    test("distinguishes singular/reflexive answers from fuzzy halo answers", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("oracle")', options);

        const statuses = parseAndEvaluate(`
            interval = (1/2):(3/5);
            delta = 1/10;
            {:
              .oracle.Ask(.oracle.Rational(3/7, {= procedure=:singular }), interval, delta)[:status],
              .oracle.Ask(.oracle.Rational(3/7, {= procedure=:reflexive }), interval, delta)[:status],
              .oracle.Ask(.oracle.Rational(3/7, {= procedure=:halo }), interval, delta)[:status],
              .oracle.Ask(.oracle.Rational(3/7, {= procedure=:bisection }), interval, delta)[:status]
            };
        `, options);

        expect(statuses.values.map(textValue)).toEqual(["no", "no", "yes", "yes"]);
    });

    test("seeded random-halo replay and AskAll expose bounded alternatives", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("oracle")', options);

        const result = parseAndEvaluate(`
            even = .oracle.Rational(3/7, {= procedure=:randomHalo, seed=2 });
            odd = .oracle.Rational(3/7, {= procedure=:randomHalo, seed=3 });
            interval = (1/2):(3/5);
            {:
              .oracle.Ask(even, interval, 1/10)[:status],
              .oracle.Ask(odd, interval, 1/10)[:status],
              .oracle.AskAll(odd, interval, 1/10).Map((answer) -> answer[:status])
            };
        `, options);

        expect(textValue(result.values[0])).toBe("no");
        expect(textValue(result.values[1])).toBe("yes");
        expect(result.values[2].values.map(textValue)).toEqual(["no", "yes"]);
    });

    test("CheckRange validates exact Yes/No/Unknown answer shapes", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("oracle")', options);

        const result = parseAndEvaluate(`
            real = .oracle.Rational(1/3);
            query = .oracle.Query(0:1, 1/10);
            valid = .oracle.Ask(real, 0:1, 1/10);
            invalidProphecy = .oracle.Prophecy(real, 2:3, query);
            invalid = .oracle.Answer(:yes, query, invalidProphecy);
            unknown = .oracle.Answer(:unknown, query);
            {:
              .oracle.CheckRange(valid)[:valid],
              .oracle.CheckRange(invalid)[:valid],
              .oracle.CheckRange(invalid)[:reason],
              .oracle.CheckRange(unknown)[:valid]
            };
        `, options);

        expect(result.values[0].value).toBe(1n);
        expect(result.values[1]).toBeNull();
        expect(textValue(result.values[2])).toBe("rangeViolation");
        expect(result.values[3].value).toBe(1n);
    });

    test("bounded bisection returns an exact enclosure and visible contraction trace", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("oracle")', options);

        const refined = parseAndEvaluate(
            '.oracle.Refine(.oracle.Rational(3/7), {= width=1/1000, maxCalls=20, trace=1 })',
            options,
        );
        expect(textValue(entry(refined, "status"))).toBe("enclosed");
        expect(entry(refined, "interval")).toBeInstanceOf(RationalInterval);
        expect(entry(refined, "achievedWidth").toString()).toBe("1/1024");
        expect(entry(entry(refined, "work"), "calls").value).toBe(11n);

        const widths = entry(refined, "trace").values.map((step) => entry(step, "width"));
        expect(widths).toHaveLength(11);
        for (let index = 1; index < widths.length; index += 1) {
            expect(widths[index].multiply(new Rational(2n)).equals(widths[index - 1])).toBe(true);
        }

        const exhausted = parseAndEvaluate(
            '.oracle.Refine(.oracle.Rational(3/7), {= width=1/1000, maxCalls=3 })',
            options,
        );
        expect(textValue(entry(exhausted, "status"))).toBe("budgetExhausted");
        expect(entry(exhausted, "achievedWidth").toString()).toBe("1/4");
    });

    test("rejects nonpositive tolerances and invalid procedure names", () => {
        const options = runtime();
        parseAndEvaluate('.Plugin.Load("oracle")', options);

        expect(() => parseAndEvaluate('.oracle.Query(0:1, 0)', options)).toThrow("delta must be a positive rational");
        expect(() => parseAndEvaluate('.oracle.Refine(.oracle.Rational(1/3), {= width=0 })', options))
            .toThrow("width must be a positive rational");
        expect(() => parseAndEvaluate('.oracle.Rational(1/3, {= procedure=:guess })', options))
            .toThrow("Unknown rational oracle procedure");
    });
});
