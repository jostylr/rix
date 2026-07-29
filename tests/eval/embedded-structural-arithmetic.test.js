import { describe, expect, test } from "bun:test";
import { Fraction, Integer, Rational, RationalInterval } from "@ratmath/core";
import {
    createDefaultSystemContext,
    formatValue,
    parseAndEvaluate,
} from "../../src/eval/index.js";
import {
    createStructuralOperatorTable,
    isStructuralAlgebra,
    isStructuralForm,
    isStructuralLiteral,
    isStructuralSymbol,
    parseStructuralArithmetic,
    structuralSourceSpan,
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

    test("unequal denominators use the least common denominator without reducing the Fraction type", () => {
        const value = parseAndEvaluate("`1/2 + 1/3`");
        expect(value).toBeInstanceOf(Fraction);
        expect(value.numerator).toBe(5n);
        expect(value.denominator).toBe(6n);
    });

    test("mixed numbers, continued fractions, bases, and intervals use RiX notation", () => {
        for (const [source, kind] of [
            ["`1..3/4`", "MixedNumber"],
            ["`1.~2~3`", "ContinuedFraction"],
            ["`~1.~2~3`", "ContinuedFraction"],
            ["`0xFF`", "BasedNumber"],
            ["`0z[7]123`", "BasedNumber"],
        ]) {
            const value = parseAndEvaluate(source);
            expect(isStructuralLiteral(value)).toBe(true);
            expect(value.kind).toBe(kind);
        }

        const structural = parseAndEvaluate("`1:3`");
        expect(isStructuralForm(structural)).toBe(true);
        expect(structural.head).toBe("Interval");

        const applied = parseAndEvaluate("`1 : 3`");
        expect(applied).toBeInstanceOf(RationalInterval);
        expect(formatValue(applied)).toBe("1:3");
    });

    test("comments are trivia and preserve attachment rules", () => {
        expect(formatValue(parseAndEvaluate("`x+1 ## note`"))).toBe("Sum(x, 1)");
        expect(formatValue(parseAndEvaluate("`x + /* note */ 0`"))).toBe("x");
        expect(() => parseAndEvaluate("`x/* note */+1`"))
            .toThrow(/must either touch both operands or be separated from both/);
        expect(() => parseAndEvaluate("`x + /* unclosed`"))
            .toThrow(/unclosed block comment/);
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

    test("Difference is the default tight subtraction presentation", () => {
        const value = parseAndEvaluate("`1-x`");
        expect(isStructuralForm(value)).toBe(true);
        expect(value.head).toBe("Difference");
        expect(value.mode).toBe("construct");
        expect(formatValue(value)).toBe("Difference(1, x)");
        expect(formatValue(parseAndEvaluate("`.SArith.Difference:1-x`")))
            .toBe("Difference(1, x)");
    });

    test("Complex scope recognizes Cartesian presentations without claiming i globally", () => {
        expect(formatValue(parseAndEvaluate("`.SArith:3+4i`")))
            .toBe("Sum(3, Product(4, i))");

        const positive = parseAndEvaluate("`.SArith.Complex:3+4i`");
        expect(isStructuralAlgebra(positive)).toBe(true);
        expect(positive.profile).toBe("Complex");
        expect(formatValue(positive)).toBe("Complex(3, 4)");
        expect(formatValue(parseAndEvaluate("`.SArith.Complex:3-4i`")))
            .toBe("Complex(3, -4)");

        expect(formatValue(parseAndEvaluate("`.SArith.Complex:i*i`")))
            .toBe("Product(i, i)");
        expect(formatValue(parseAndEvaluate("`.SArith.Complex:i * i`"))).toBe("-1");
        expect(formatValue(parseAndEvaluate("(`.SArith.Complex:3-4i`).ToExact()")))
            .toBe("3 - 4~{i}");
    });

    test("algebra basis names are units rather than inferred function parameters", () => {
        const value = parseAndEvaluate(`
            F := \`.SArith.Complex.Fun:x+2i\`;
            F(5);
        `);
        expect(formatValue(value)).toBe("Complex(5, 2)");
    });

    test("Quaternion and octonion profiles are explicit and respect their multiplication laws", () => {
        expect(formatValue(parseAndEvaluate("`.SArith.Quaternion:1+2i+3j+4k`")))
            .toBe("Quaternion(1, 2, 3, 4)");
        expect(formatValue(parseAndEvaluate("`.SArith.Quaternion:i * j`")))
            .toBe("Quaternion(0, 0, 0, 1)");
        expect(formatValue(parseAndEvaluate("`.SArith.Quaternion:j * i`")))
            .toBe("Quaternion(0, 0, 0, -1)");

        expect(formatValue(parseAndEvaluate("`.SArith.Octonion:(e1 * e2) * e4`")))
            .toBe("Octonion(0, 0, 0, 0, 0, 0, 0, 1)");
        expect(formatValue(parseAndEvaluate("`.SArith.Octonion:e1 * (e2 * e4)`")))
            .toBe("Octonion(0, 0, 0, 0, 0, 0, 0, -1)");
    });

    test("reusable and arbitrary-basis algebra scopes are available", () => {
        expect(formatValue(parseAndEvaluate(
            '.SArith.Scope(:Quaternion).Parse("i * j", [], {= })',
        ))).toBe("Quaternion(0, 0, 0, 1)");

        expect(formatValue(parseAndEvaluate("`.SArith.Algebra(u,v):3+4u+x v`")))
            .toBe("Algebra[u,v](3, 4, x)");
        expect(formatValue(parseAndEvaluate(
            "u := .Exact[:i]; (`.SArith.Algebra(u):3+4u`).ToExact()",
        ))).toBe("3 + 4~{i}");
    });

    test("exact quaternion conversion remains gated by the opt-in plugin", () => {
        expect(() => parseAndEvaluate("(`.SArith.Quaternion:1+2i`).ToExact()"))
            .toThrow(/available but not loaded|must be loaded/);
        const value = parseAndEvaluate(`
            .Plugin.Load("exact-algebras");
            (\`.SArith.Quaternion:1+2i+3j+4k\`).ToExact();
        `);
        expect(value.type).toBe("exact_quaternion");
        expect(value.components.map(String)).toEqual(["1", "2", "3", "4"]);
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

    test("@(RiX expression) evaluates in the surrounding scope and lifts the result", () => {
        const value = parseAndEvaluate("x := 3; `@(x^2 + 1)/4`");
        expect(value).toBeInstanceOf(Fraction);
        expect(value.numerator).toBe(10n);
        expect(value.denominator).toBe(4n);
    });

    test("@(RiX expression) handles nested parentheses and system calls", () => {
        const value = parseAndEvaluate("x := 2; `@(.Add((x + 1), 4)) + y`");
        expect(isStructuralForm(value)).toBe(true);
        expect(value.head).toBe("Sum");
        expect(value.args[0]).toBeInstanceOf(Integer);
        expect(value.args[0].value).toBe(7n);
        expect(value.args[1].name).toBe("y");
    });

    test("@(RiX expression) captures do not become inferred function parameters", () => {
        const fn = parseAndEvaluate("a := 5; F := `y + @(a^2)`; F");
        expect(fn.params.positional.map((parameter) => parameter.name)).toEqual(["y"]);
        const value = parseAndEvaluate("a := 5; F := `y + @(a^2)`; F(3)");
        expect(value).toBeInstanceOf(Integer);
        expect(value.value).toBe(28n);
    });

    test("@(RiX expression) reports an unclosed splice", () => {
        expect(() => parseAndEvaluate("`@(1 + 2`"))
            .toThrow(/unclosed '@\('/);
    });

    test("explicit Fun orders free symbols alphabetically", () => {
        const fn = parseAndEvaluate("`.SArith.Fun:y - x`");
        expect(fn.type).toBe("lambda");
        expect(fn.params.positional.map((parameter) => parameter.name)).toEqual(["x", "y"]);

        const result = parseAndEvaluate("F := `.SArith.Fun:y - x`; F(2, 5)");
        expect(result).toBeInstanceOf(Integer);
        expect(result.value).toBe(3n);
    });

    test("explicit Fun parameters preserve the requested order and allow unused names", () => {
        const fn = parseAndEvaluate("`.SArith.Fun(y,x,unused):y - x`");
        expect(fn.params.positional.map((parameter) => parameter.name))
            .toEqual(["y", "x", "unused"]);
        expect(formatValue(parseAndEvaluate(
            "F := `.SArith.Fun(y,x,unused):y - x`; F(5, 2, 99)",
        ))).toBe("3");
        expect(() => parseAndEvaluate("`.SArith.Fun(y):y-x`"))
            .toThrow(/missing free symbol: x/);
        expect(() => parseAndEvaluate("`.SArith.Fun():x`"))
            .toThrow(/missing free symbol: x/);
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

    test("secondary-language nodes retain source spans", () => {
        const value = parseAndEvaluate("`alpha+(beta*2)`");
        expect(structuralSourceSpan(value)).toEqual({ start: 0, end: 14 });
        expect(structuralSourceSpan(value.args[0])).toEqual({ start: 0, end: 5 });
        expect(structuralSourceSpan(value.args[1])).toEqual({ start: 6, end: 14 });
    });

    test("structural values expose inspection, rendering, collapse, and assumed simplification", () => {
        expect(formatValue(parseAndEvaluate("(`x+1`).Head()"))).toBe("Sum");
        expect(formatValue(parseAndEvaluate("(`x+1`).Render()"))).toBe("Sum(x, 1)");
        expect(formatValue(parseAndEvaluate("(`6/4`).Collapse()"))).toBe("1..1/2");
        expect(formatValue(parseAndEvaluate("(`x*2/x`).Simplify(:x)"))).toBe("2");
        expect(formatValue(parseAndEvaluate("(`x*2/x`).Simplify()")))
            .toBe("Fraction(Product(x, 2), x)");
    });

    test("custom operator tables support glyph, fixity, precedence, and associativity", () => {
        const operators = createStructuralOperatorTable([
            { symbol: "⊗", fixity: "infix", head: "Tensor", precedence: 90, associativity: "left" },
            { symbol: "¬", fixity: "prefix", head: "Not", precedence: 110 },
            { symbol: "°", fixity: "postfix", head: "Degrees", precedence: 120 },
        ]);
        expect(formatValue(parseStructuralArithmetic("¬x⊗y°", null, { operators })))
            .toBe("Tensor(Not(x), Degrees(y))");
        expect(formatValue(parseStructuralArithmetic("a⊗b⊗c", null, { operators })))
            .toBe("Tensor(Tensor(a, b), c)");

        expect(formatValue(parseAndEvaluate(
            '.SArith.Configure({= symbol="⊗", head=:Tensor, fixity=:infix, precedence=90 }).Parse("a⊗b", [], {= })',
        ))).toBe("Tensor(a, b)");
    });

    test("NotationParser constructs a parser protocol object in RiX", () => {
        const value = parseAndEvaluate(".NotationParser((body, modifiers, info) -> body)");
        expect(value.type).toBe("notation_parser");
        expect(value._ext.get("Parse").type).toBe("method_builtin");
    });
});
