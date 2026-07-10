import { Integer, Rational } from "@ratmath/core";

export function rat(value) {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value.value, 1n);
    if (typeof value === "bigint") return new Rational(value, 1n);
    if (typeof value === "number") {
        if (!Number.isFinite(value)) throw new Error("Cannot convert non-finite number to Rational");
        if (Number.isInteger(value)) return new Rational(BigInt(value), 1n);
        return rat(String(value));
    }
    if (typeof value === "string") {
        const text = value.trim();
        if (text.includes("/")) {
            const [num, den] = text.split("/");
            return new Rational(BigInt(num), BigInt(den));
        }
        if (text.includes(".")) {
            const sign = text.startsWith("-") ? -1n : 1n;
            const body = text.replace(/^-/, "");
            const [whole, frac] = body.split(".");
            const den = 10n ** BigInt(frac.length);
            const num = BigInt(whole || "0") * den + BigInt(frac);
            return new Rational(sign * num, den);
        }
        return new Rational(BigInt(text), 1n);
    }
    throw new Error(`Cannot convert ${typeof value} to Rational`);
}

export function cmp(a, b) {
    const diff = rat(a).subtract(rat(b));
    if (diff.numerator < 0n) return -1;
    if (diff.numerator > 0n) return 1;
    return 0;
}

const add = (a, b) => rat(a).add(rat(b));
const sub = (a, b) => rat(a).subtract(rat(b));
const mul = (a, b) => rat(a).multiply(rat(b));
const div = (a, b) => rat(a).divide(rat(b));
const pow = (a, n) => rat(a).pow(BigInt(n));
const abs = (x) => cmp(x, 0) >= 0 ? rat(x) : rat(x).negate();
const min = (a, b) => cmp(a, b) <= 0 ? rat(a) : rat(b);
const max = (a, b) => cmp(a, b) <= 0 ? rat(b) : rat(a);

function floorDiv(d, n) {
    return d >= 0 ? Math.floor(d / n) : -Math.floor((-d + n - 1) / n);
}

export function nthLoopIterate(n, q, x) {
    q = rat(q);
    x = rat(x);
    const y = div(q, pow(x, n - 1));
    const z = div(add(mul(n - 1, x), y), n);
    return { z, x, y };
}

function scientific(q) {
    let m = rat(q);
    let d = 0;
    while (cmp(m, 10) >= 0) {
        m = div(m, 10);
        d += 1;
    }
    while (cmp(m, 1) < 0) {
        m = mul(m, 10);
        d -= 1;
    }
    return { m, d };
}

export function guessRootPartial(n, t) {
    t = rat(t);
    let found = 10;
    for (let i = 1; i <= 10; i += 1) {
        if (cmp(t, pow(i, n)) <= 0) {
            found = i;
            break;
        }
    }
    const lo = pow(found - 1, n);
    const hi = pow(found, n);
    return add(found - 1, div(sub(t, lo), sub(hi, lo)));
}

export function guessRoot(n, q) {
    q = rat(q);
    if (cmp(q, 0) <= 0) throw new Error("q must be positive");
    if (!Number.isInteger(n) || n < 2) throw new Error("n must be an integer >= 2");
    const { m, d } = scientific(q);
    const a = floorDiv(d, n);
    const r = d - a * n;
    const t = mul(m, pow(10, r));
    return mul(guessRootPartial(n, t), pow(10, a));
}

export function nthRoot(n, q, maxIter = 10, eps = rat("1/100000000000000000000")) {
    q = rat(q);
    eps = rat(eps);
    if (!Number.isInteger(n) || n < 2) throw new Error("n must be an integer >= 2");
    if (!Number.isInteger(maxIter) || maxIter < 1) throw new Error("maxIter must be an integer >= 1");
    if (cmp(q, 0) <= 0) throw new Error("q must be positive");
    if (cmp(eps, 0) <= 0) throw new Error("eps must be positive");

    let x = guessRoot(n, q);
    const steps = [];
    for (let i = 0; i < maxIter; i += 1) {
        const step = nthLoopIterate(n, q, x);
        steps.push(step);
        x = step.z;
        if (cmp(abs(sub(step.y, step.x)), eps) < 0) break;
    }
    const last = steps[steps.length - 1];
    return {
        interval: { lo: min(last.x, last.y), hi: max(last.x, last.y) },
        rawInterval: { x: last.x, y: last.y },
        steps,
    };
}

export function decimal(value, digits = 12) {
    const text = rat(value).toDecimal();
    const [head, tail = ""] = text.split(".");
    if (!tail || tail.length <= digits) return text;
    return `${head}.${tail.slice(0, digits)}...`;
}

export function widthPower10(width) {
    let w = abs(width);
    let p = 0;
    while (cmp(w, 0) > 0 && cmp(w, 1) < 0) {
        w = mul(w, 10);
        p -= 1;
    }
    while (cmp(w, 10) >= 0) {
        w = div(w, 10);
        p += 1;
    }
    return p;
}

function stepSummary(step, index) {
    const lo = min(step.x, step.y);
    const hi = max(step.x, step.y);
    const width = sub(hi, lo);
    const center = div(add(lo, hi), 2);
    return {
        step: index,
        guess: decimal(step.z),
        interval: `${decimal(lo)} .. ${decimal(hi)}`,
        center: decimal(center),
        width: decimal(width),
        widthPower10: widthPower10(width),
    };
}

export function prettyNthRoot(label, n, q, result) {
    const width = sub(result.interval.hi, result.interval.lo);
    const center = div(add(result.interval.lo, result.interval.hi), 2);
    return {
        label,
        n,
        q: String(q),
        interval: `${decimal(result.interval.lo)} .. ${decimal(result.interval.hi)}`,
        representative: decimal(center),
        width: decimal(width),
        widthPower10: widthPower10(width),
        iterations: result.steps.length,
        steps: result.steps.map((step, i) => stepSummary(step, i + 1)),
    };
}

export function print(value, io = console) {
    io.log(JSON.stringify(value, null, 2));
    return value;
}

if (import.meta.main) {
    print([
        prettyNthRoot("sqrt 2", 2, "2", nthRoot(2, "2", 5, "1/1000000000000")),
        prettyNthRoot("cuberoot 4567890", 3, "4567890", nthRoot(3, "4567890", 4, "1/100000000")),
        prettyNthRoot("10throot 3", 10, "3", nthRoot(10, "3", 3, "1/100000000")),
    ]);
}
