import { describe, expect, test } from "bun:test";
import { Fraction, Integer, Rational } from "@ratmath/core";
import {
    createDefaultSystemContext,
    formatValue,
    parseAndEvaluate,
} from "../../src/eval/index.js";
import {
    isStructuralForm,
    isStructuralSymbol,
} from "../../src/runtime/structural-arithmetic.js";

describe("backtick parser dispatch and structural arithmetic", () => {
    test("unnamed backticks use SArith", () => {
        const value = parseAndEvaluate("`6/4+2/4`");
        expect(isStructuralForm(value)).toBe(true);
        expect(value.head).toBe("Sum");
        expect(value.mode).toBe("construct");
        expect(value.args[0]).toBeInstanceOf(Fraction);
        expect(formatValue(value)).toBe("Sum(6/4, 2/4)");
    });

    test("spaced structural addition combines equal-denominator fractions without reduction", () => {
        const value = parseAndEvaluate("`6/4 + 2/4`");
        expect(value).toBeInstanceOf(Fraction);
        expect(value.numerator).toBe(8n);
        expect(value.denominator).toBe(4n);
        expect(formatValue(value)).toBe("8/4");
    });

    test("spaced operations remain symbolic when no concrete combination applies", () => {
        const value = parseAndEvaluate("`3/4 + x`");
        expect(isStructuralForm(value)).toBe(true);
        expect(value.head).toBe("Sum");
        expect(value.mode).toBe("apply");
        expect(value.args[0]).toBeInstanceOf(Fraction);
        expect(isStructuralSymbol(value.args[1])).toBe(true);
        expect(formatValue(value)).toBe("Sum(3/4, x)");
    });

    test("one-sided operator spacing is rejected", () => {
        expect(() => parseAndEvaluate("`1+ 2`"))
            .toThrow(/must either touch both operands or be separated from both/);
        expect(() => parseAndEvaluate("`1 +2`"))
            .toThrow(/must either touch both operands or be separated from both/);
    });

    test("ambiguous tight prefix, power, fraction, and postfix compositions are rejected", () => {
        expect(() => parseAndEvaluate("`-x^2`"))
            .toThrow(/ambiguous tight prefix and power/);
        expect(() => parseAndEvaluate("`1/2!`"))
            .toThrow(/ambiguous tight fraction denominator/);
        expect(() => parseAndEvaluate("`1/2^3`"))
            .toThrow(/ambiguous tight fraction denominator/);
        expect(() => parseAndEvaluate("`-x!`"))
            .toThrow(/ambiguous tight prefix and postfix/);
    });

    test("spacing and parentheses resolve tight prefix and fraction collisions", () => {
        expect(formatValue(parseAndEvaluate("`- x^2`"))).toBe("Negative(Power(x, 2))");
        expect(formatValue(parseAndEvaluate("`-x ^ 2`"))).toBe("Power(Negative(x), 2)");
        expect(formatValue(parseAndEvaluate("`(-x)^2`"))).toBe("Power(Negative(x), 2)");
        expect(formatValue(parseAndEvaluate("`-(x^2)`"))).toBe("Negative(Power(x, 2))");
        expect(formatValue(parseAndEvaluate("`(1/2)!`"))).toBe("Factorial(1/2)");
        expect(formatValue(parseAndEvaluate("`1/(2!)`"))).toBe("Fraction(1, Factorial(2))");
    });

    test("@name captures and lifts a surrounding value", () => {
        const value = parseAndEvaluate("x := 6 / 4; `@x + 1`");
        expect(value).toBeInstanceOf(Fraction);
        expect(value.numerator).toBe(5n);
        expect(value.denominator).toBe(2n);
    });

    test("explicit Fun orders free symbols alphabetically", () => {
        const fn = parseAndEvaluate("`.SArith.Fun:y - x`");
        expect(fn.type).toBe("lambda");
        expect(fn.params.positional.map((parameter) => parameter.name)).toEqual(["x", "y"]);

        const result = parseAndEvaluate("F := `.SArith.Fun:y - x`; F(2, 5)");
        expect(result).toBeInstanceOf(Integer);
        expect(result.value).toBe(3n);
    });

    test("uppercase assignment infers a structural function", () => {
        const fn = parseAndEvaluate("F := `y - x`; F");
        expect(fn.type).toBe("lambda");
        expect(fn.name).toBe("F");
        expect(fn.params.positional.map((parameter) => parameter.name)).toEqual(["x", "y"]);
    });

    test("an inferred symbol-free function is a zero-argument constant function", () => {
        const result = parseAndEvaluate("Constant := `6/4 + 2/4`; Constant()");
        expect(result).toBeInstanceOf(Fraction);
        expect(result.numerator).toBe(8n);
        expect(result.denominator).toBe(4n);
    });

    test("explicit Fun also creates a zero-argument constant function", () => {
        const fn = parseAndEvaluate("`.SArith.Fun:6/4 + 2/4`");
        expect(fn.params.positional).toEqual([]);

        const result = parseAndEvaluate("Constant := `.SArith.Fun:6/4 + 2/4`; Constant()");
        expect(result).toBeInstanceOf(Fraction);
        expect(result.numerator).toBe(8n);
        expect(result.denominator).toBe(4n);
    });

    test("lowercase assignment retains a structural value", () => {
        const value = parseAndEvaluate("f := `x + 1`; f");
        expect(isStructuralForm(value)).toBe(true);
        expect(value.head).toBe("Sum");
    });

    test("Poly exposes the same Parse protocol", () => {
        const fn = parseAndEvaluate("`.Poly:x^2 + 3/4 x^5 - 7`");
        expect(fn.type).toBe("lambda");
        expect(fn.params.positional.map((parameter) => parameter.name)).toEqual(["x"]);

        const result = parseAndEvaluate("P := `.Poly:x^2 + 3/4 x^5 - 7`; P(2)");
        expect(result).toBeInstanceOf(Rational);
        expect(result.numerator).toBe(21n);
        expect(result.denominator).toBe(1n);
    });

    test("a lowercase host parser is resolved through the dot registry", () => {
        const systemContext = createDefaultSystemContext({ frozen: false });
        const parser = {
            type: "test_parser",
            _ext: new Map([
                ["Parse", {
                    type: "method_builtin",
                    name: "Parse",
                    impl: (args) => ({
                        type: "string",
                        value: `${args[1].value}|${args[2].values.map((item) => item.value).join(",")}`,
                    }),
                }],
            ]),
        };
        systemContext.registerHostValue("echoParser", parser, {
            groups: ["Notation"],
        });
        systemContext.freeze();

        const value = parseAndEvaluate("``.echoParser.One.Two:a `nested` body``", {
            systemContext,
        });
        expect(value).toEqual({
            type: "string",
            value: "a `nested` body|One,Two",
        });
    });

    test("a leading colon remains an explicit raw string escape", () => {
        expect(parseAndEvaluate("`:not structural`")).toEqual({
            type: "string",
            value: "not structural",
        });
    });
});
