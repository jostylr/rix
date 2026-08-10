import { describe, expect, test } from "bun:test";
import { Fraction, Integer, Rational } from "@ratmath/core";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

const strings = (value) => value.values.map(String);

describe("representation-sensitive Fraction plugin", () => {
    test("is opt-in and exposes constructor plus aliases", () => {
        expect(() => parseAndEvaluate(".frac(6, 8)")).toThrow("available but not loaded");
        const result = parseAndEvaluate(`
            .Plugin.Load("fraction");
            [.fraction(6,8), .frac(6,8), .f(6,8), .f\`6/8\`];
        `);
        expect(strings(result)).toEqual(["6/8", "6/8", "6/8", "6/8"]);
        for (const value of result.values) expect(value).toBeInstanceOf(Fraction);
    });

    test("distinguishes lifting a reduced Rational from preserving a structural pair", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("fraction");
            reduced := (6/8).F();
            written := (\`6/8\`).F();
            [reduced, written, reduced.Rational(), written.Rational()];
        `);
        expect(strings(result)).toEqual(["3/4", "6/8", "3/4", "3/4"]);
        expect(result.values[2]).toBeInstanceOf(Rational);
    });

    test("performs usual arithmetic without cancellation", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("fraction");
            a := \`1/2\`;
            b := \`1/3\`;
            c := \`2/4\`;
            d := \`3/6\`;
            [a+b, a-b, c*d, c/d, c^2, c^-2, -c, c+1, 1/c];
        `);
        expect(strings(result)).toEqual(["5/6", "1/6", "6/24", "12/12", "4/16", "16/4", "-2/4", "6/4", "4/2"]);
    });

    test("supports like-denominator and LCM-denominator classroom addition", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("fraction");
            a := \`1/4\`;
            b := \`2/4\`;
            c := \`1/6\`;
            [a.AddLikeDenominator(b), a.AddLCMDenominator(c), a+c];
        `);
        expect(strings(result)).toEqual(["3/4", "5/12", "10/24"]);
        expect(() => parseAndEvaluate(`
            .Plugin.Load("fraction");
            (\`1/2\`).AddLikeDenominator(\`1/3\`);
        `)).toThrow("equal denominators");
    });

    test("keeps pair equality separate from mathematical equivalence and ordering", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("fraction");
            a := \`1/2\`;
            b := \`2/4\`;
            c := \`1/3\`;
            [a==b, a.SamePair(b), a.Equivalent(b), c<a, .Min(c,a), .Max(c,a)];
        `);
        expect(result.values[0]).toBeNull();
        expect(result.values[1]).toBeNull();
        expect(result.values[2]).toBeInstanceOf(Integer);
        expect(strings({ values: result.values.slice(3) })).toEqual(["1", "1/3", "1/2"]);
    });

    test("mediants use the represented components and expose exact metadata", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("fraction");
            written := \`6/8\`;
            canonical := (6/8).F();
            other := \`1/2\`;
            parents := written.FareyParents();
            [written.Mediant(other), canonical.Mediant(other), written.Numerator(),
             written.Denominator(), written.Reduce(), written.Scale(2),
             written.Record().Get("schema"), parents[1].Mediant(parents[2])];
        `);
        expect(strings(result).slice(0, 6)).toEqual(["7/10", "4/6", "6", "8", "3/4", "12/16"]);
        expect(result.values[6].value).toBe("rix.fraction@1");
        expect(String(result.values[7])).toBe("6/8");
    });

    test("exposes complete Stern-Brocot navigation and path reconstruction", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("fraction");
            value := .frac(3, 5);
            path := value.SternBrocotPath();
            children := value.SternBrocotChildren();
            ancestors := value.SternBrocotAncestors();
            [path, .fraction.FromSternBrocotPath(path), value.SternBrocotParent(),
             children[1], children[2], value.SternBrocotDepth(), ancestors,
             value.IsSternBrocotValid(), value.IsInfinite()];
        `);
        expect(result.values[0].values.map((item) => item.value)).toEqual(["R", "L", "R", "L"]);
        expect(strings({ values: result.values.slice(1, 6) })).toEqual([
            "3/5", "2/3", "4/7", "5/8", "4",
        ]);
        expect(strings(result.values[6])).toEqual(["2/3", "1/2", "1", "0"]);
        expect(result.values[7]).toBeInstanceOf(Integer);
        expect(result.values[8]).toBeNull();
    });

    test("handles the generalized zero root and validates path inputs", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("fraction");
            root := .frac(0, 1);
            parents := root.FareyParents();
            [root.SternBrocotParent(), root.SternBrocotChildren(),
             parents[1].IsInfinite(), parents[2].IsInfinite(),
             .fraction.FromSternBrocotPath([])];
        `);
        expect(result.values[0]).toBeNull();
        expect(strings(result.values[1])).toEqual(["-1", "1"]);
        expect(result.values[2]).toBeInstanceOf(Integer);
        expect(result.values[3]).toBeInstanceOf(Integer);
        expect(String(result.values[4])).toBe("0");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("fraction");
            .fraction.FromSternBrocotPath(["left"]);
        `)).toThrow("directions must be L or R");

        const scaledParents = parseAndEvaluate('.Plugin.Load("fraction"); .frac(0,4).FareyParents()');
        expect(strings(scaledParents)).toEqual(["-1/2", "1/2"]);
    });
});
