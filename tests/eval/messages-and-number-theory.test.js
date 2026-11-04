import { describe, expect, test } from "bun:test";
import { parseAndEvaluate } from "../../src/eval/evaluator.js";
import { createDefaultSystemContext } from "../../src/index.js";
import { integerSqrt, primality } from "../../src/eval/functions/number-theory.js";

const text = (code) => String(parseAndEvaluate(code));

describe("number theory capabilities", () => {
    test("Gcd and Lcm over Integers", () => {
        expect(text(".Gcd(12, 18)")).toBe("6");
        expect(text(".Gcd(-12, 18, 8)")).toBe("2");
        expect(text(".Gcd(0, 0)")).toBe("0");
        expect(text(".Lcm(4, 6, 10)")).toBe("60");
        expect(text(".Lcm(4, 0)")).toBe("0");
        expect(() => parseAndEvaluate(".Gcd(1/2, 3)")).toThrow("Gcd requires Integer arguments");
    });

    test("Isqrt is the floor square root", () => {
        for (let n = 0n; n < 200n; n++) {
            const r = integerSqrt(n);
            expect(r * r <= n && (r + 1n) * (r + 1n) > n).toBe(true);
        }
        const big = 10n ** 60n + 12345n;
        const r = integerSqrt(big);
        expect(r * r <= big && (r + 1n) * (r + 1n) > big).toBe(true);
        expect(text(".Isqrt(17)")).toBe("4");
        expect(() => parseAndEvaluate(".Isqrt(-1)")).toThrow("nonnegative");
    });

    test("IsPrime is exact below the proven bound and undecided beyond it", () => {
        const sieve = [];
        for (let n = 0; n < 2000; n++) sieve.push(n >= 2 && [...Array(Math.floor(Math.sqrt(n)) - 1).keys()].every((k) => n % (k + 2) !== 0));
        for (let n = 0; n < 2000; n++) expect(primality(BigInt(n))).toBe(sieve[n]);
        expect(primality(3215031751n)).toBe(false); // strong pseudoprime to bases 2, 3, 5, 7
        expect(primality(2n ** 61n - 1n)).toBe(true);
        expect(primality(2n ** 127n - 1n)).toBe("undecided");
        expect(primality(2n ** 127n + 1n)).toBe(false);
        expect(text(".IsPrime(97)")).toBe("1");
        expect(parseAndEvaluate(".IsPrime(91)")).toBeNull();
    });
});

describe("error messages explain RiX rules", () => {
    test("deep non-tail recursion names the function and suggests $ tail calls", () => {
        expect(() => parseAndEvaluate("Depth(n) -> n <= 0 ?: 0 ?_ 1 + Depth(n - 1); Depth(100000)"))
            .toThrow(/Recursion too deep in DEPTH.*\$\(/i);
        expect(text("Count(n, acc) -> n <= 0 ?: acc ?_ $(n - 1, acc + 1); Count(100000, 0)")).toBe("100000");
    });

    test("fractional powers point to a real-number plugin", () => {
        expect(() => parseAndEvaluate("4^(1/2)")).toThrow(/not an integer.*algebraic-real/);
    });

    test("arithmetic names the RiX kind of a bad operand", () => {
        expect(() => parseAndEvaluate("x := {= a=1 }; x + 1")).toThrow("Cannot use a map in arithmetic");
        expect(() => parseAndEvaluate("[1, 2] + 1")).not.toThrow("Cannot use object");
    });

    test("e-notation hints at _^", () => {
        expect(() => parseAndEvaluate("1e3")).toThrow(/no e-notation.*1_\^3/);
    });

    test("unknown capabilities suggest near names and plugins", () => {
        expect(() => parseAndEvaluate(".Lenn([1])")).toThrow("Did you mean .LEN?");
        const systemContext = createDefaultSystemContext({ frozen: false });
        expect(systemContext.unknownCapabilityMessage("Nothing")).toContain("Plugin.Load");
    });
});
