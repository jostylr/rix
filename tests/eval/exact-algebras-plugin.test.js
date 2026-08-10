import { describe, expect, test } from "bun:test";
import { Rational } from "@ratmath/core";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

describe("exact-algebras plugin", () => {
    test("is opt-in and constructs rational quaternions", () => {
        expect(() => parseAndEvaluate(".exactAlgebras.Quaternion(1, 2)"))
            .toThrow("available but not loaded");

        const value = parseAndEvaluate(`
            .Plugin.Load("exact-algebras");
            .exactAlgebras.Quaternion(1/2, 2);
        `);
        expect(value.type).toBe("map");
        expect(value.entries.get("type").value).toBe("exact_quaternion");
        expect(value.entries.get("components").values.map(String)).toEqual(["1/2", "2", "0", "0"]);
    });

    test("quaternion basis multiplication is exact", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("exact-algebras");
            i := .exactAlgebras.Quaternion(0, 1, 0, 0);
            j := .exactAlgebras.Quaternion(0, 0, 1, 0);
            .exactAlgebras.Components(i * j);
        `);
        expect(result.values.map(String)).toEqual(["0", "0", "0", "1"]);
    });

    test("octonion inverse satisfies the norm identity", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("exact-algebras");
            o := .exactAlgebras.Octonion(1, 2, 3, 4, 5, 6, 7, 8);
            .exactAlgebras.Components(o * .exactAlgebras.Inverse(o));
        `);
        expect(result.values.every((value) => value instanceof Rational)).toBe(true);
        expect(result.values.map(String)).toEqual(["1", "0", "0", "0", "0", "0", "0", "0"]);
    });

    test("octonion multiplication composes the rational norm", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("exact-algebras");
            a := .exactAlgebras.Octonion(1, 2, 3, 4, 5, 6, 7, 8);
            b := .exactAlgebras.Octonion(2, -1, 4, 0, 3, -2, 1, 5);
            .exactAlgebras.NormSquared(a * b)
                == .exactAlgebras.NormSquared(a) * .exactAlgebras.NormSquared(b);
        `);
        expect(result.value).toBe(1n);
    });

    test("rational scalars interoperate and mixed dimensions are rejected", () => {
        expect(parseAndEvaluate(`
            .Plugin.Load("exact-algebras");
            q := .exactAlgebras.Quaternion(1, 2);
            q + 1/2 == .exactAlgebras.Quaternion(3/2, 2);
        `).value).toBe(1n);

        expect(() => parseAndEvaluate(`
            .Plugin.Load("exact-algebras");
            .exactAlgebras.Quaternion(1) + .exactAlgebras.Octonion(1);
        `)).toThrow("same dimension");
    });
});
