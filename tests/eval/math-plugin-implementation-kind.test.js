import { describe, expect, test } from "bun:test";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

const pluginKinds = (ids) => parseAndEvaluate(
    `[${ids.map((id) => `.Plugin.Info("${id}").Get("kind")`).join(",")}]`,
).values.map(({ value }) => value);

describe("math plugin implementation boundary", () => {
    test("computational exact and certified plugins load from RiX source", () => {
        const ids = [
            "algebra", "algebraic-real", "analysis", "ball", "cauchy", "continued-fraction",
            "combinatorics", "complex", "complex-viz", "exact-algebras", "fraction", "fractals", "geometry", "graph", "numerics", "oracle", "plot", "poly", "radix",
            "ratfun", "stats", "stern-brocot", "symbolic", "linalg", "optimize", "solve", "scene3d", "nd",
        ];
        expect(pluginKinds(ids)).toEqual(ids.map(() => "rix"));
    });

    test("documents the currently blocked bundled host exception", () => {
        expect(pluginKinds(["fracfun"])).toEqual(["host"]);
    });
});
