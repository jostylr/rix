/**
id: radix
description: Bounded exact positional expansions and repeating-period analysis for rational values.
kind: host
mount: radix
exports: [Expansion, Digits, PeriodLength, PeriodInfo, ToString]
groups: [Exact, Radix]
permissions: []
defaultEnabled: false
**/

import { Integer, Rational } from "@ratmath/core";

function int(value) {
    return new Integer(BigInt(value));
}

function text(value) {
    return { type: "string", value: String(value) };
}

function bool(value) {
    return value ? int(1) : null;
}

function sequence(values) {
    return { type: "sequence", values };
}

function map(entries) {
    return { type: "map", entries: new Map(entries) };
}

function mapEntry(value, key, fallback = undefined) {
    if (!(value?.entries instanceof Map)) return fallback;
    if (value.entries.has(key)) return value.entries.get(key);
    const wanted = String(key).toLowerCase();
    for (const [candidate, item] of value.entries) {
        if (String(candidate).toLowerCase() === wanted) return item;
    }
    return fallback;
}

function exactBigInt(value, label) {
    if (value instanceof Integer) return value.value;
    if (value instanceof Rational && value.denominator === 1n) return value.numerator;
    if (typeof value === "bigint") return value;
    throw new Error(`${label} must be an exact integer`);
}

function boundedCount(value, label, fallback, maximum = 1_000_000) {
    if (value === undefined || value === null) return fallback;
    const bigint = exactBigInt(value, label);
    if (bigint < 0n || bigint > BigInt(maximum)) {
        throw new Error(`${label} must be between 0 and ${maximum}`);
    }
    return Number(bigint);
}

function exactRational(value) {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value.value, 1n);
    throw new Error("Radix operations require an exact Integer or Rational");
}

function radix(value) {
    const base = exactBigInt(value ?? int(10), "Radix base");
    if (base < 2n || base > 65536n) {
        throw new Error("Radix base must be between 2 and 65536");
    }
    return base;
}

function unsignedParts(value) {
    const rational = exactRational(value);
    const negative = rational.numerator < 0n;
    return {
        sign: negative ? -1n : 1n,
        numerator: negative ? -rational.numerator : rational.numerator,
        denominator: rational.denominator,
    };
}

function integerDigits(value, base) {
    if (value === 0n) return [int(0)];
    const result = [];
    let remaining = value;
    while (remaining > 0n) {
        result.push(int(remaining % base));
        remaining /= base;
    }
    return result.reverse();
}

export function expandRadix(value, baseValue = int(10), options = null) {
    const base = radix(baseValue);
    const maxDigits = boundedCount(mapEntry(options, "maxDigits"), "maxDigits", 1024);
    const { sign, numerator, denominator } = unsignedParts(value);
    const whole = numerator / denominator;
    let remainder = numerator % denominator;
    const fractional = [];
    const seen = new Map();
    let repeatStart = null;

    while (remainder !== 0n && fractional.length < maxDigits) {
        const known = seen.get(remainder);
        if (known !== undefined) {
            repeatStart = known;
            break;
        }
        seen.set(remainder, fractional.length);
        remainder *= base;
        fractional.push(int(remainder / denominator));
        remainder %= denominator;
    }
    if (remainder !== 0n && repeatStart === null && seen.has(remainder)) {
        repeatStart = seen.get(remainder);
    }

    const complete = remainder === 0n || repeatStart !== null;
    const prefix = repeatStart === null ? fractional : fractional.slice(0, repeatStart);
    const repeating = repeatStart === null ? null : fractional.slice(repeatStart);
    return map([
        ["valueKind", text("radixExpansion")],
        ["schema", text("rix.radix.expansion@1")],
        ["status", text(complete ? "complete" : "budgetExhausted")],
        ["base", int(base)],
        ["sign", int(numerator === 0n ? 0n : sign)],
        ["integerDigits", sequence(integerDigits(whole, base))],
        ["nonRepeatingDigits", sequence(prefix)],
        ["repeatingDigits", repeating === null ? null : sequence(repeating)],
        ["terminating", bool(remainder === 0n)],
        ["repeating", bool(repeatStart !== null)],
        ["complete", bool(complete)],
        ["truncated", bool(!complete)],
        ["producedDigits", int(fractional.length)],
        ["maxDigits", int(maxDigits)],
        ["remainingRemainder", int(remainder)],
    ]);
}

export function radixDigits(value, baseValue = int(10), countValue = int(1)) {
    const base = radix(baseValue);
    const optionsCount = mapEntry(countValue, "count", undefined);
    const count = boundedCount(countValue?.type === "map" ? optionsCount : countValue, "Digit count", 1);
    const { numerator, denominator } = unsignedParts(value);
    let remainder = numerator % denominator;
    const digits = [];
    for (let index = 0; index < count; index++) {
        remainder *= base;
        digits.push(int(remainder / denominator));
        remainder %= denominator;
    }
    return sequence(digits);
}

function gcd(left, right) {
    let a = left < 0n ? -left : left;
    let b = right < 0n ? -right : right;
    while (b !== 0n) [a, b] = [b, a % b];
    return a;
}

export function radixPeriodInfo(value, baseValue = int(10), options = null) {
    const base = radix(baseValue);
    const maxWork = boundedCount(mapEntry(options, "maxWork"), "maxWork", 100000);
    let denominator = unsignedParts(value).denominator;
    while (true) {
        const common = gcd(denominator, base);
        if (common === 1n) break;
        denominator /= common;
    }
    if (denominator === 1n) {
        return map([
            ["status", text("complete")],
            ["base", int(base)],
            ["periodLength", int(0)],
            ["work", int(0)],
            ["maxWork", int(maxWork)],
        ]);
    }
    if (maxWork === 0) {
        return map([
            ["status", text("budgetExhausted")],
            ["base", int(base)],
            ["periodLength", null],
            ["work", int(0)],
            ["maxWork", int(0)],
            ["reducedDenominator", int(denominator)],
        ]);
    }

    let power = base % denominator;
    let length = 1;
    while (power !== 1n && length < maxWork) {
        power = (power * base) % denominator;
        length++;
    }
    const complete = power === 1n;
    return map([
        ["status", text(complete ? "complete" : "budgetExhausted")],
        ["base", int(base)],
        ["periodLength", complete ? int(length) : null],
        ["work", int(length)],
        ["maxWork", int(maxWork)],
        ["reducedDenominator", int(denominator)],
    ]);
}

export function radixPeriodLength(value, baseValue = int(10), options = null) {
    const info = radixPeriodInfo(value, baseValue, options);
    const length = info.entries.get("periodLength");
    if (length === null) {
        const maxWork = info.entries.get("maxWork").value;
        throw new Error(`PeriodLength exceeded maxWork=${maxWork}; use PeriodInfo for a structured result`);
    }
    return length;
}

const DIGIT_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function digitText(values) {
    return values.map((value) => DIGIT_ALPHABET[Number(value.value)]).join("");
}

export function radixString(value, baseValue = int(10), options = null) {
    const base = radix(baseValue);
    if (base > 36n) throw new Error("Radix ToString supports bases through 36; use Expansion for larger bases");
    const expansion = expandRadix(value, int(base), options);
    const entries = expansion.entries;
    const negative = entries.get("sign").value < 0n ? "-" : "";
    const whole = digitText(entries.get("integerDigits").values);
    const prefix = digitText(entries.get("nonRepeatingDigits").values);
    const repeating = entries.get("repeatingDigits");
    if (repeating) return text(`${negative}${whole}.${prefix}(${digitText(repeating.values)})`);
    if (entries.get("terminating")) return text(prefix ? `${negative}${whole}.${prefix}` : `${negative}${whole}`);
    return text(`${negative}${whole}.${prefix}…`);
}

function builtinMethod(name, fn) {
    return {
        type: "method_builtin",
        name,
        impl(args) { return fn(...args); },
    };
}

function collection() {
    const definitions = [
        ["Expansion", expandRadix],
        ["Digits", radixDigits],
        ["PeriodLength", radixPeriodLength],
        ["PeriodInfo", radixPeriodInfo],
        ["ToString", radixString],
    ];
    const entries = new Map();
    const extension = new Map([["immutable", int(1)]]);
    for (const [name, fn] of definitions) {
        const method = {
            type: "method_builtin",
            name,
            impl(args) { return fn(...args.slice(1)); },
        };
        entries.set(name, method);
        extension.set(name.toUpperCase(), method);
    }
    return { type: "map", entries, _ext: extension };
}

export function install({ systemContext, metadata = {}, options = {} }) {
    const value = collection();
    systemContext.registerHostValue("radix", value, {
        doc: "Bounded exact positional expansions and period analysis",
        groups: ["Exact", "Radix"],
    });
    const owner = {
        pluginId: metadata.id || "radix",
        mount: options.as || metadata.mount || "radix",
    };
    for (const typeName of ["Integer", "Rational"]) {
        systemContext.registerMethod(typeName, "Expansion", builtinMethod("Expansion", expandRadix), owner);
        systemContext.registerMethod(typeName, "Digits", builtinMethod("Digits", radixDigits), owner);
        systemContext.registerMethod(typeName, "PeriodLength", builtinMethod("PeriodLength", radixPeriodLength), owner);
        systemContext.registerMethod(typeName, "PeriodInfo", builtinMethod("PeriodInfo", radixPeriodInfo), owner);
        systemContext.registerMethod(typeName, "RadixString", builtinMethod("RadixString", radixString), owner);
    }
    return value;
}
