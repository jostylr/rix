import { describe, expect, test } from "bun:test";
import { rewriteRixCelReferences } from "../../src/index.js";

describe("RiXCel structural reference rewriting", () => {
    test("moves literal absolute grid coordinates on the inserted axis", () => {
        const result = rewriteRixCelReferences(
            "grid[2, 3] + grid[3,3] + grid[10, 4]",
            { axis: 1, coordinate: 3, count: 2 },
        );
        expect(result.source).toBe("grid[2, 3] + grid[5,3] + grid[12, 4]");
        expect(result.rewrites).toBe(2);
        expect(result.dynamic).toEqual([]);
    });

    test("adjusts near offsets only when insertion separates origin and target", () => {
        expect(rewriteRixCelReferences("near[2,0]", {
            axis: 1, coordinate: 3, originIndex: [2, 4],
        }).source).toBe("near[3,0]");
        expect(rewriteRixCelReferences("near[-2,0]", {
            axis: 1, coordinate: 3, originIndex: [4, 4],
        }).source).toBe("near[-3,0]");
        expect(rewriteRixCelReferences("near[1,0]", {
            axis: 1, coordinate: 3, originIndex: [4, 4],
        }).source).toBe("near[1,0]");
    });

    test("preserves strings, comments, method names, and unrelated formatting", () => {
        const result = rewriteRixCelReferences(
            '"grid[9,9]" + thing.grid[4,4] + grid [ 4 , 2 ] ## grid[8,8]',
            { axis: 1, coordinate: 4 },
        );
        expect(result.source).toBe(
            '"grid[9,9]" + thing.grid[4,4] + grid [ 5 , 2 ] ## grid[8,8]',
        );
        expect(result.rewrites).toBe(1);
    });

    test("reports dynamic and originless relative references without guessing", () => {
        const result = rewriteRixCelReferences(
            "grid[row,2] + near[-1,0] + grid[4,2]",
            { axis: 1, coordinate: 3 },
        );
        expect(result.source).toBe("grid[row,2] + near[-1,0] + grid[5,2]");
        expect(result.dynamic).toEqual([
            { kind: "grid", position: 0 },
            { kind: "near", position: 14 },
        ]);
    });

    test("rewrites the selected axis in rank-N references", () => {
        expect(rewriteRixCelReferences("grid[2,3,4] + near[0,0,-2]", {
            axis: 3,
            coordinate: 4,
            count: 2,
            originIndex: [2, 3, 5],
        }).source).toBe("grid[2,3,6] + near[0,0,-4]");
    });
});
