import { describe, expect, test } from "bun:test";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

const run = (code) => parseAndEvaluate(code);
const text = (code) => String(run(code));

describe("Integer //, % and /% use Core floor operations", () => {
    test("agree with the Rational path across signs", () => {
        for (const a of [-17, -9, -1, 0, 1, 8, 23]) {
            for (const b of [-4, -1, 1, 3, 7]) {
                // a/1 is a Rational operand with integer value; it takes the general path.
                expect(text(`${a} // ${b}`)).toBe(text(`(${a}/2 * 2/1) // (${b}/3 * 3)`));
                expect(text(`${a} // ${b}`)).toBe(String(Math.floor(a / b)));
                if (b > 0) {
                    expect(text(`${a} % ${b}`)).toBe(String(a - b * Math.floor(a / b)));
                    const pair = run(`${a} /% ${b}`);
                    expect(pair.values.map(String)).toEqual([String(Math.floor(a / b)), String(a - b * Math.floor(a / b))]);
                }
            }
        }
    });

    test("large values match exact floor division", () => {
        expect(text("(-(10^40) - 7) // (10^17 + 3)")).toBe(text("(-(10^40) - 7) // ((10^17 + 3) * 1/1)"));
        expect(text("(10^50 + 1) % 97")).toBe(String((10n ** 50n + 1n) % 97n));
    });

    test("keep the existing divisor rules", () => {
        expect(() => run("5 // 0")).toThrow("Division by zero");
        expect(() => run("5 % 0")).toThrow("Modulo divisor must be positive");
        expect(() => run("5 % -3")).toThrow("Modulo divisor must be positive");
        expect(() => run("5 /% -3")).toThrow("Division with remainder divisor must be positive");
    });

    test("Rational operands keep exact remainders", () => {
        expect(text("7/2 % 2")).toBe("3/2");
        expect(run("7/2 /% 2").values.map(String)).toEqual(["1", "3/2"]);
    });
});
