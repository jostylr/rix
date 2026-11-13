import { describe, expect, test } from "bun:test";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

const text = (code) => String(parseAndEvaluate(code));

describe("0^0 is undefined, as in Core", () => {
    test("Integer, Rational and interval bases throw", () => {
        expect(() => parseAndEvaluate("0^0")).toThrow("Zero cannot be raised to the power of zero");
        expect(() => parseAndEvaluate("(0/3)^0")).toThrow("Zero cannot be raised to the power of zero");
        expect(() => parseAndEvaluate("x := 0; n := 0; x^n")).toThrow("Zero cannot be raised to the power of zero");
        expect(() => parseAndEvaluate("(0:1)^0")).toThrow("power of zero");
    });

    test("neighbouring powers are unchanged", () => {
        expect(text("0^1")).toBe("0");
        expect(text("0^5")).toBe("0");
        expect(text("1^0")).toBe("1");
        expect(text("(-3)^0")).toBe("1");
        expect(text("(2/3)^0")).toBe("1");
        expect(text("(1:2)^0")).toBe("1:1");
        expect(() => parseAndEvaluate("0^-1")).toThrow("negative power");
    });
});
