import { afterEach, describe, expect, test } from "bun:test";
import { BaseSystem, Integer, Rational, RationalInterval } from "@ratmath/core";
import {
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/eval/evaluator.js";
import { formatValue, formatValueSource } from "../../src/eval/format.js";
import { Context } from "../../src/runtime/context.js";

function session() {
    return { context: new Context(), systemContext: createDefaultSystemContext() };
}

afterEach(() => {
    for (const prefix of ["T", "N", "K", "P"]) BaseSystem.unregisterPrefix(prefix);
});

describe("session number notation", () => {
    test("changes only # literals and can change base mid-script", () => {
        const result = parseAndEvaluate(`
            <* "b";
            first := #101;
            ordinary := 101;
            <* "x";
            {: first, ordinary, #face }
        `, session());
        expect(result.values.map((value) => value.value)).toEqual([5n, 101n, 0xFACEn]);
    });

    test("keeps repeating and mixed active-base forms in one strict token", () => {
        const state = session();
        const repeating = parseAndEvaluate(`<* "b"; #101.1#10`, state);
        expect(repeating).toEqual(new Rational(35n, 6n));
        const mixed = parseAndEvaluate(`#101..11/1100`, state);
        expect(mixed).toEqual(new Rational(21n, 4n));
        expect(parseAndEvaluate(`#101.~11~10`, state)).toEqual(new Rational(37n, 7n));
        expect(parseAndEvaluate(`#~-1.~10`, state)).toEqual(new Rational(-1n, 2n));
        expect(parseAndEvaluate(`<* "x"; #b.d#face`, state))
            .toEqual(parseAndEvaluate(`0xb.d#face`, state));
    });

    test("requires parentheses before a method on an active-base literal", () => {
        expect(() => parseAndEvaluate(`<* "x"; #face.ToString()`, session()))
            .toThrow("Invalid # numeral");
        expect(parseAndEvaluate(`<* "x"; (#face).ToString()`, session()).value).toBe("64206");
        expect(() => parseAndEvaluate(`<* "b"; #101..1/10.ToString()`, session()))
            .toThrow("Invalid # numeral");
        expect(() => parseAndEvaluate(`0P = {: 2, "0+", 0 }; <* "P"; #\`++\`.ToString()`, session()))
            .toThrow("Invalid # numeral");
    });

    test("supports compact, long, and map configuration forms", () => {
        const state = session();
        parseAndEvaluate(`*> ".[12],b,.."`, state);
        expect(formatValue(parseAndEvaluate(`7/4`, state), { context: state.context }))
            .toBe("1.75 · 1.11 · 1..3/4");
        parseAndEvaluate(`.Config.NumInput("b")`, state);
        expect(parseAndEvaluate(`#111`, state).value).toBe(7n);
        parseAndEvaluate(`.Config.Number({= input="x", display="x/" })`, state);
        expect(formatValue(parseAndEvaluate(`31/2`, state), { context: state.context })).toBe("1f/2");
    });

    test("accepts host JSON-style numberConfig without source directives", () => {
        const state = session();
        const result = parseAndEvaluate(`#101`, {
            ...state,
            numberConfig: { input: "b", display: ".[4],b" },
        });
        expect(result).toEqual(new Integer(5n));
        expect(formatValue(result, { context: state.context })).toBe("5 · 101");
        expect(() => parseAndEvaluate("1", { ...state, numberConfig: { display: "not-a-profile" } }))
            .toThrow("Unknown number display token");
    });

    test("formats continued fractions and scientific views from session profiles", () => {
        const state = session();
        parseAndEvaluate(`*> "cf,sci[6]"`, state);
        expect(formatValue(parseAndEvaluate(`7/4`, state), { context: state.context }))
            .toBe("1.~1~3 · 1.75E0");
        expect(formatValue(new RationalInterval(new Rational(7n, 4n), new Rational(1n, 3n)), {
            context: state.context,
        })).toBe("1.~1~3:0.~3 · 1.75E0:3.#3E-1");
    });

    test("validates scientific display precision", () => {
        expect(() => parseAndEvaluate(`*> "sci[0]"`, session()))
            .toThrow("precision must be a positive safe integer");
    });

    test("_>! returns lossless, explicitly based RiX source", () => {
        const exact = parseAndEvaluate(`(7/4) _>! 0b`, session());
        expect(exact.value).toBe("0b111/0b100");
        expect(parseAndEvaluate(exact.value, session())).toEqual(new Rational(7n, 4n));
        const repeat = parseAndEvaluate(`(1/3) _>! (0b, ".")`, session());
        expect(repeat.value).toBe("0b0.#01");
        expect(parseAndEvaluate(repeat.value, session())).toEqual(new Rational(1n, 3n));
        expect(parseAndEvaluate(`(-7/4) _>! 0b`, session()).value).toBe("-0b111/0b100");
        expect(() => parseAndEvaluate(`(1/3) _>! (0b, ".[4]")`, session())).toThrow();
        expect(formatValueSource(new Rational(7n, 4n))).toBe("7/4");
    });
});

describe("generalized positional systems", () => {
    test("defines balanced, negative-radix, and bijective systems", () => {
        const state = session();
        expect(parseAndEvaluate(`0T = {: 3, "T01", -1 }; <* "T"; #1T`, state).value).toBe(2n);
        expect(parseAndEvaluate(`0N = {: -2, "01", 0 }; <* "N"; #1111`, state).value).toBe(-5n);
        expect(parseAndEvaluate(`0K = {: 26, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", 1 }; <* "K"; #AA`, state).value).toBe(27n);
        expect(parseAndEvaluate(`(5/2) _> (0T, "/")`, state).value).toBe("1TT/1T");
        parseAndEvaluate(`<* "T"`, state);
        expect(formatValue(parseAndEvaluate(`5/2`, state), { context: state.context })).toBe("1TT/1T");
    });

    test("the BaseSystem codec round-trips signed integer representations", () => {
        const balanced = new BaseSystem("T01", "Balanced ternary", { radix: 3, digitOffset: -1 });
        const negabinary = new BaseSystem("01", "Negabinary", { radix: -2 });
        const bijective = new BaseSystem("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "Bijective 26", { radix: 26, digitOffset: 1 });
        for (const system of [balanced, negabinary, bijective]) {
            for (const value of [-27n, -5n, -1n, 1n, 5n, 27n]) {
                expect(system.toDecimal(system.fromDecimal(value))).toBe(value);
            }
        }
        expect(() => bijective.fromDecimal(0n)).toThrow("no representation for zero");
    });

    test("quoted # streams safely support punctuation digits", () => {
        const state = session();
        expect(parseAndEvaluate(`0P = {: 2, "0+", 0 }; <* "P"; #\`++\``, state).value).toBe(3n);
        expect(parseAndEvaluate("#`++`..#`+`/#`+0`", state)).toEqual(new Rational(7n, 2n));
        expect(parseAndEvaluate("#`++`.~#`+0`", state)).toEqual(new Rational(7n, 2n));
        const source = parseAndEvaluate(`(3/2) _>! 0P`, state);
        expect(source.value).toBe(`0P"++"/0P"+0"`);
        expect(parseAndEvaluate(source.value, state)).toEqual(new Rational(3n, 2n));
    });
});
