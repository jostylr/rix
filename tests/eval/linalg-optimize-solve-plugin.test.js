import { describe, expect, test } from "bun:test";
import { Rational } from "@ratmath/core";
import { formatValue, parseAndEvaluate } from "../../src/index.js";
import { forEachTensorCell } from "../../src/runtime/tensor.js";

function flat(value) {
    const result = [];
    forEachTensorCell(value, (entry) => result.push(String(entry)));
    return result;
}

describe("linalg Phase 1 plugin", () => {
    test("solves exact dense systems and reports rank states", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            unique := .linalg.Solve([2, 1; 1, -1], [5, 1]);
            under := .linalg.Solve({:1x2: 1, 1}, [2]);
            inconsistent := .linalg.Solve([1, 1; 2, 2], [1, 3]);
            [unique, under, inconsistent, .linalg.Determinant([2, 1; 1, -1]), .linalg.Inverse([1, 2; 3, 5])];
        `);
        expect(result.values[0].status).toBe("unique");
        expect(flat(result.values[0].solution)).toEqual(["2", "1"]);
        expect(result.values[1].status).toBe("underdetermined");
        expect(result.values[1].nullspace.values).toHaveLength(1);
        expect(result.values[2].status).toBe("inconsistent");
        expect(String(result.values[3])).toBe("-3");
        expect(flat(result.values[4])).toEqual(["-5", "2", "3", "-1"]);
    });

    test("changes vector and tensor coordinates while retaining representation lineage", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("linalg");
            V := .linalg.VectorSpace("plane", 2);
            standard := .linalg.Coordinates(V, "standard");
            skew := .linalg.Coordinates(V, "skew", [1, 1; 0, 1]);
            vector := .linalg.Vector([2, 3], standard);
            covector := .linalg.CoordinateTensor({:2: 2, 3}, standard, [:down]);
            operator := .linalg.CoordinateTensor([1, 2; 3, 4], standard, [:up, :down]);
            vectorSkew := .linalg.Transform(vector, skew);
            covectorSkew := .linalg.Transform(covector, skew);
            operatorRoundTrip := .linalg.Transform(.linalg.Transform(operator, skew), standard);
            [vector, vectorSkew, covectorSkew, operatorRoundTrip];
        `);
        const [vector, vectorSkew, covectorSkew, operatorRoundTrip] = result.values;
        expect(flat(vectorSkew.components)).toEqual(["-1", "3"]);
        expect(flat(covectorSkew.components)).toEqual(["2", "5"]);
        expect(vectorSkew.equivalentTo).toBe(vector);
        expect(vectorSkew.identity).toBe(vector.identity);
        expect(flat(operatorRoundTrip.components)).toEqual(["1", "2", "3", "4"]);
        expect(formatValue(parseAndEvaluate(`
            .Plugin.Load("linalg");
            V := .linalg.VectorSpace("plane", 2);
            a := .linalg.Coordinates(V, "a");
            b := .linalg.Coordinates(V, "b", [1, 1; 0, 1]);
            v := .linalg.Vector([2, 3], a);
            .linalg.Transform!(v, b);
            [v.components, v.equivalentTo.components, .linalg.SameTensor(v, v.equivalentTo)];
        `))).toBe("[{:2: -1, 3 }, {:2: 2, 3 }, 1]");
    });
});

describe("optimize Phase 1 plugin", () => {
    test("solves exact standard-form linear programs", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("optimize");
            program := .optimize.LinearProgram([3, 2], [1, 1; 1, 0; 0, 1], [4, 2, 3]);
            solved := .optimize.Solve(program);
            unbounded := .optimize.Maximize([1], {:1x1: 0}, [1]);
            [solved, unbounded];
        `);
        expect(result.values[0].status).toBe("optimal");
        expect(flat(result.values[0].solution)).toEqual(["2", "2"]);
        expect(String(result.values[0].objectiveValue)).toBe("10");
        expect(result.values[0].feasible).toBe(true);
        expect(result.values[1].status).toBe("unbounded");
    });

    test("rejects Phase 1 models without an initial feasible origin", () => {
        expect(() => parseAndEvaluate(`
            .Plugin.Load("optimize");
            .optimize.Minimize([1], {:1x1: 1}, [-1]);
        `)).toThrow("nonnegative b");
    });
});

describe("solve Phase 1 plugin", () => {
    test("solves affine symbolic equality systems with named exact values", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("solve");
            system := {#a,b:x,y# x + y == a; x - y == b };
            .solve.System(system, {= values={= a=3, b=1 } });
        `);
        expect(result.status).toBe("unique");
        expect(result.classification).toBe("linearEqualities");
        expect(String(result.solution.entries.get("x"))).toBe("2");
        expect(String(result.solution.entries.get("y"))).toBe("1");
        expect(result.solution.entries.get("x")).toBeInstanceOf(Rational);
    });

    test("rejects nonlinear and inequality systems explicitly", () => {
        expect(() => parseAndEvaluate(`
            .Plugin.Load("solve");
            .solve.System({#:x# x^2 == 4 });
        `)).toThrow("Nonlinear power");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("solve");
            .solve.System({#:x# x >= 1 });
        `)).toThrow("supports exact equalities");
    });
});
