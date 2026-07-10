import { Rational, Integer } from "@ratmath/core";

export const Q = x => x instanceof Rational ? x : x instanceof Integer ? new Rational(x.value, 1n) :
    typeof x === "bigint" ? new Rational(x, 1n) :
    typeof x === "number" && Number.isInteger(x) ? new Rational(BigInt(x), 1n) :
    typeof x === "string" && x.includes("/") ? new Rational(...x.split("/").map(BigInt)) :
    new Rational(BigInt(x), 1n);
export const C = (a, b) => (a = Q(a).subtract(Q(b))).numerator < 0n ? -1 : a.numerator > 0n ? 1 : 0;
const A = (a, b) => Q(a).add(Q(b)), S = (a, b) => Q(a).subtract(Q(b)), M = (a, b) => Q(a).multiply(Q(b));
const D = (a, b) => Q(a).divide(Q(b)), P = (a, n) => Q(a).pow(BigInt(n));
const Min = (a, b) => C(a, b) <= 0 ? Q(a) : Q(b), Max = (a, b) => C(a, b) <= 0 ? Q(b) : Q(a);
const Abs = x => C(x, 0) >= 0 ? Q(x) : Q(x).negate();
const FD = (d, n) => d >= 0 ? Math.floor(d / n) : -Math.floor((-d + n - 1) / n);

export const step = (n, q, x) => {
    const y = D(q, P(x, n - 1)), z = D(A(M(n - 1, x), y), n);
    return { z, x: Q(x), y };
};

export const guess = (n, q) => {
    let m = Q(q), d = 0;
    for (; C(m, 10) >= 0; d++) m = D(m, 10);
    for (; C(m, 1) < 0; d--) m = M(m, 10);
    const a = FD(d, n), t = M(m, P(10, d - a * n));
    let i = 1; for (; i < 10 && C(t, P(i, n)) > 0; i++);
    return M(A(i - 1, D(S(t, P(i - 1, n)), S(P(i, n), P(i - 1, n)))), P(10, a));
};

export const nthRootCompact = (n, q, max = 10, eps = "1/100000000000000000000") => {
    q = Q(q); eps = Q(eps);
    let x = guess(n, q), steps = [];
    for (let i = 0; i < max; i++) {
        const s = step(n, q, x); steps.push(s); x = s.z;
        if (C(Abs(S(s.y, s.x)), eps) < 0) break;
    }
    const l = steps.at(-1);
    return { interval: { lo: Min(l.x, l.y), hi: Max(l.x, l.y) }, rawInterval: { x: l.x, y: l.y }, steps };
};

export const prettyCompact = r => ({
    interval: `${r.interval.lo.toDecimal()} .. ${r.interval.hi.toDecimal()}`,
    iterations: r.steps.length,
});

if (import.meta.main) console.log(prettyCompact(nthRootCompact(2, "2", 5)));
