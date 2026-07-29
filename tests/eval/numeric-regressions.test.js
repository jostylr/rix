import { describe, expect, test } from "bun:test";
import { Integer, Rational, RationalInterval } from "@ratmath/core";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";

describe("numeric syntax regressions", () => {
    test("an adjacent minus after a value is subtraction", () => {
        expect(parseAndEvaluate("1-2").value).toBe(-1n);
        expect(parseAndEvaluate("1 -2").value).toBe(-1n);
        expect(parseAndEvaluate("x:=5; x-2").value).toBe(3n);
    });

    test("unary minus follows conventional operator precedence", () => {
        const result = parseAndEvaluate("1/-2");
        expect(result).toBeInstanceOf(Rational);
        expect(result.toString()).toBe("-1/2");
        const interval = parseAndEvaluate("-1:1");
        expect(interval).toBeInstanceOf(RationalInterval);
        expect(interval.toString()).toBe("-1:1");
        expect(parseAndEvaluate("-2^2").value).toBe(-4n);
        expect(parseAndEvaluate("(-2)^2").value).toBe(4n);
        expect(parseAndEvaluate("2^-2").toString()).toBe("1/4");
    });

    test("Core uncertainty interval forms evaluate in RiX", () => {
        const compactComma = parseAndEvaluate("1.23[56,67]");
        const compactColon = parseAndEvaluate("1.23[56:67]");
        expect(compactComma).toBeInstanceOf(RationalInterval);
        expect(compactColon.equals(compactComma)).toBe(true);
        expect(compactComma.low.toString()).toBe("3089/2500");
        expect(compactComma.high.toString()).toBe("12367/10000");

        expect(parseAndEvaluate("1234[+34]").toString()).toBe("1234:1268");
        expect(parseAndEvaluate("1234[-34]").toString()).toBe("1200:1234");
        expect(parseAndEvaluate("1234[+-34]").toString()).toBe("1200:1268");
        expect(parseAndEvaluate("1.3[+-1]").toString()).toBe(
            "129/100:131/100",
        );
    });

    test("integer division floors negative quotients", () => {
        for (const [source, expected] of [
            ["-7//3", -3n],
            ["7//-3", -3n],
            ["-7//-3", 2n],
            ["-3/2//1", -2n],
        ]) {
            const result = parseAndEvaluate(source);
            expect(result).toBeInstanceOf(Integer);
            expect(result.value).toBe(expected);
        }
    });

    test("factorial is postfix and binds before powers, signs, and division", () => {
        expect(parseAndEvaluate("5!").value).toBe(120n);
        expect(parseAndEvaluate("6!!").value).toBe(48n);
        expect(parseAndEvaluate("-3!").value).toBe(-6n);
        expect(parseAndEvaluate("1/3!").toString()).toBe("1/6");
        expect(parseAndEvaluate("3!^2").value).toBe(36n);
        expect(() => parseAndEvaluate("(-3)!")).toThrow("negative");
        expect(() => parseAndEvaluate("(3/2)!")).toThrow("requires an integer");
        expect(parseAndEvaluate("!!0").value).toBe(1n);
        expect(parseAndEvaluate("!!_")).toBe(null);
    });

    test("floor modulo supports exact rationals and matches floor division", () => {
        for (const [source, expected] of [
            ["-7%3", "2"],
            ["7%3", "1"],
            ["3/2%1", "1/2"],
            ["-3/2%1", "1/2"],
            ["5/2%(2/3)", "1/2"],
        ]) {
            expect(parseAndEvaluate(source).toString()).toBe(expected);
        }

        const divmod = parseAndEvaluate("-3/2/%1");
        expect(divmod.values.map(String)).toEqual(["-2", "1/2"]);
        expect(() => parseAndEvaluate("3%0")).toThrow("positive");
        expect(() => parseAndEvaluate("3%-2")).toThrow("positive");
    });
});
