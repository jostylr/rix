import { describe, expect, test } from "bun:test";
import { Integer } from "@ratmath/core";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";
import { resolveMethod } from "../../src/runtime/methods.js";

describe("decimal Integer literal path", () => {
    test("plain digits become fresh Integers with the general grammar's values", () => {
        expect(String(parseAndEvaluate("007"))).toBe("7");
        expect(parseAndEvaluate("123456789012345678901234567890").value).toBe(123456789012345678901234567890n);
        expect(String(parseAndEvaluate("1_000"))).toBe("1000");
        expect(String(parseAndEvaluate("0.5"))).toBe("1/2");
        const values = parseAndEvaluate("[{; x := 5; x }, {; y := 5; y }]").values;
        expect(values[0]).toBeInstanceOf(Integer);
        expect(values[0]).not.toBe(values[1]);
    });
});

describe("method spelling cache", () => {
    test("resolution stays live after names are cached", () => {
        const target = new Integer(3);
        const builtin = resolveMethod(target, "Abs");
        const own = { type: "lambda", params: [], body: null, marker: "own" };
        target._ext = new Map([["_Abs", own]]);
        const resolved = resolveMethod(target, "Abs");
        expect(resolved).not.toBe(builtin);
        target._ext = new Map();
        expect(resolveMethod(target, "Abs")).toBe(builtin);
    });

    test("many distinct names neither grow without bound nor break lookups", () => {
        for (let i = 0; i < 300; i++) {
            expect(() => resolveMethod(new Integer(1), `NoSuchMethod${i}`)).toThrow("Method not found");
        }
        expect(String(parseAndEvaluate("(-4).Abs()"))).toBe("4");
    });
});
