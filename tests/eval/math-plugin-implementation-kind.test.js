import { describe, expect, test } from "bun:test";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

const pluginKind = (id) => parseAndEvaluate(`.Plugin.Info("${id}").Get("kind")`).value;

describe("math plugin implementation boundary", () => {
    test("computational exact and certified plugins load from RiX source", () => {
        for (const id of [
            "algebra", "algebraic-real", "ball", "cauchy", "continued-fraction",
            "complex-viz", "exact-algebras", "fraction", "numerics", "oracle", "poly", "radix",
            "ratfun", "stats", "stern-brocot", "symbolic",
        ]) {
            expect(pluginKind(id), id).toBe("rix");
        }
    });

    test("documents the currently blocked bundled host exception", () => {
        expect(pluginKind("fracfun")).toBe("host");
    });
});
