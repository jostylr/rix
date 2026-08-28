import { describe, expect, test } from "bun:test";
import { formatValue, parseAndEvaluate } from "../../src/index.js";

describe("combinatorics plugin", () => {
    test("builds indexable lazy Cartesian powers", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("combinatorics");
            product := .combinatorics.CartesianPower([0,1],3);
            {: product,product.Len(),product[1],product[8] };
        `);
        expect(result.values[0].type).toBe("lazy_sequence");
        expect(formatValue(result.values[1])).toBe("8");
        expect(formatValue(result.values[2])).toBe("[0, 0, 0]");
        expect(formatValue(result.values[3])).toBe("[1, 1, 1]");
    });

    test("enumerates permutations and combinations with exact counts", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("combinatorics");
            permutations := .comb.Permutations([:a,:b,:c],2).Materialize();
            combinations := .comb.Combinations([:a,:b,:c,:d],2).Materialize();
            {: permutations,combinations,.comb.CountPermutations(3,2),.comb.CountCombinations(4,2) };
        `);
        expect(formatValue(result)).toBe("( [[a, b], [a, c], [b, a], [b, c], [c, a], [c, b]], [[a, b], [a, c], [a, d], [b, c], [b, d], [c, d]], 6, 6 )");
    });

    test("rejects invalid counts and bounded product explosions", () => {
        expect(() => parseAndEvaluate(`.Plugin.Load("combinatorics");.comb.Permutations([1,2],3)`)).toThrow(/cannot exceed/i);
        expect(() => parseAndEvaluate(`.Plugin.Load("combinatorics");.comb.CartesianPower([0,1],20,{= maxOutcomes=1000})`)).toThrow(/exceeding/i);
    });
});
