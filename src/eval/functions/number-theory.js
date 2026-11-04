/**
 * Basic exact number theory capabilities: .Gcd, .Lcm, .Isqrt, .IsPrime.
 */
import { Integer, Rational } from "@ratmath/core";
import { UNDECIDED } from "../../runtime/decision.js";

function integerArgument(value, name) {
    if (value instanceof Integer) return value.value;
    if (value instanceof Rational && value.denominator === 1n) return value.numerator;
    throw new Error(`${name} requires Integer arguments`);
}

const abs = (n) => (n < 0n ? -n : n);

function gcd(a, b) {
    a = abs(a);
    b = abs(b);
    while (b !== 0n) [a, b] = [b, a % b];
    return a;
}

/** floor(sqrt(n)) for n >= 0 by Newton's method on BigInt. */
export function integerSqrt(n) {
    if (n < 0n) throw new Error("Isqrt requires a nonnegative Integer");
    if (n < 2n) return n;
    let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
    for (;;) {
        const next = (x + n / x) >> 1n;
        if (next >= x) return x;
        x = next;
    }
}

function modPow(base, exponent, modulus) {
    let result = 1n;
    base %= modulus;
    while (exponent > 0n) {
        if (exponent & 1n) result = (result * base) % modulus;
        base = (base * base) % modulus;
        exponent >>= 1n;
    }
    return result;
}

const SMALL_PRIMES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];
// Miller-Rabin with the first 13 primes as bases is a proof below this bound
// (Sorenson and Webster, 2015).
const DETERMINISTIC_BOUND = 3317044064679887385961981n;
const EXTRA_BASES = [43n, 47n, 53n, 59n, 61n, 67n, 71n, 73n, 79n, 83n, 89n, 97n];

function strongProbablePrime(n, base) {
    let d = n - 1n;
    let s = 0;
    while ((d & 1n) === 0n) {
        d >>= 1n;
        s += 1;
    }
    let x = modPow(base, d, n);
    if (x === 1n || x === n - 1n) return true;
    for (let i = 1; i < s; i++) {
        x = (x * x) % n;
        if (x === n - 1n) return true;
    }
    return false;
}

/** true, false, or "undecided" for a probable prime beyond the proven bound. */
export function primality(n) {
    if (n < 2n) return false;
    for (const p of SMALL_PRIMES) {
        if (n === p) return true;
        if (n % p === 0n) return false;
    }
    for (const base of SMALL_PRIMES) if (!strongProbablePrime(n, base)) return false;
    if (n < DETERMINISTIC_BOUND) return true;
    for (const base of EXTRA_BASES) if (!strongProbablePrime(n, base)) return false;
    return "undecided";
}

export const numberTheoryFunctions = {
    GCD: {
        impl(args) {
            if (args.length === 0) throw new Error("Gcd requires at least one Integer");
            return new Integer(args.reduce((acc, value) => gcd(acc, integerArgument(value, "Gcd")), 0n));
        },
        pure: true,
        doc: "Greatest common divisor of one or more Integers (nonnegative)",
    },
    LCM: {
        impl(args) {
            if (args.length === 0) throw new Error("Lcm requires at least one Integer");
            return new Integer(args.reduce((acc, value) => {
                const n = abs(integerArgument(value, "Lcm"));
                return acc === 0n || n === 0n ? 0n : (acc / gcd(acc, n)) * n;
            }, 1n));
        },
        pure: true,
        doc: "Least common multiple of one or more Integers (nonnegative; 0 if any is 0)",
    },
    ISQRT: {
        impl(args) {
            return new Integer(integerSqrt(integerArgument(args[0], "Isqrt")));
        },
        pure: true,
        doc: "Integer square root: the largest Integer whose square is at most n",
    },
    ISPRIME: {
        impl(args) {
            const result = primality(integerArgument(args[0], "IsPrime"));
            if (result === "undecided") return UNDECIDED;
            return result ? new Integer(1n) : null;
        },
        pure: true,
        doc: "Primality: 1 if prime, _ if not; proven below 3.3e24, beyond which a strong probable prime gives ? (undecided)",
    },
};
