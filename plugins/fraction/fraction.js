/** RiX surface for representation-sensitive @ratmath/core Fraction values. */

import { Fraction, Integer, Rational } from "@ratmath/core";
import { parse } from "../../src/parser/parser.js";
import { lower } from "../../src/eval/lower.js";
import {
    isStructuralForm,
    isStructuralLiteral,
    parseStructuralArithmetic,
} from "../../src/runtime/structural-arithmetic.js";

export const FRACTION_SCHEMA = "rix.fraction@1";

const int = (value) => new Integer(BigInt(value));
const str = (value) => ({ type: "string", value: String(value) });
const seq = (values) => ({ type: "sequence", values });
const rixMap = (entries) => ({ type: "map", entries: new Map(entries) });

function text(value, fallback = null) {
    if (value?.type === "string") return value.value;
    return typeof value === "string" ? value : fallback;
}

function exactInteger(value, label) {
    if (value instanceof Integer) return value.value;
    if (value instanceof Rational && value.denominator === 1n) return value.numerator;
    if (typeof value === "bigint" || Number.isInteger(value)) return BigInt(value);
    throw new Error(`${label} must be an exact integer`);
}

function isExactScalar(value) {
    return value instanceof Integer || value instanceof Rational || value instanceof Fraction
        || typeof value === "bigint" || Number.isInteger(value);
}

function asFraction(value, label = "value") {
    if (value instanceof Fraction) return value;
    if (value instanceof Integer) return new Fraction(value.value, 1n);
    if (value instanceof Rational) return new Fraction(value.numerator, value.denominator);
    if (typeof value === "bigint" || Number.isInteger(value)) return new Fraction(BigInt(value), 1n);
    throw new Error(`${label} must be a Fraction, Rational, or exact integer`);
}

function finite(value, label) {
    const fraction = asFraction(value, label);
    if (fraction.isInfinite) throw new Error(`${label} must be finite`);
    return fraction;
}

function normalizedComponents(value) {
    const fraction = finite(value, "Fraction");
    return fraction.denominator < 0n
        ? { numerator: -fraction.numerator, denominator: -fraction.denominator }
        : { numerator: fraction.numerator, denominator: fraction.denominator };
}

function gcd(left, right) {
    let a = left < 0n ? -left : left;
    let b = right < 0n ? -right : right;
    while (b !== 0n) [a, b] = [b, a % b];
    return a;
}

function lcm(left, right) {
    if (left === 0n || right === 0n) return 0n;
    return (left / gcd(left, right)) * right;
}

function bool(value) {
    return value ? int(1) : null;
}

export function createFraction(args) {
    if (args.length === 1) return asFraction(args[0], "fraction value");
    if (args.length < 1 || args.length > 2) throw new Error("fraction expects a value or numerator and denominator");
    return new Fraction(
        exactInteger(args[0], "Fraction numerator"),
        exactInteger(args[1], "Fraction denominator"),
    );
}

function commonDenominator(leftValue, rightValue, policy) {
    const left = normalizedComponents(leftValue);
    const right = normalizedComponents(rightValue);
    if (policy === "like") {
        if (left.denominator !== right.denominator) {
            throw new Error("AddLikeDenominator requires equal denominators");
        }
        return new Fraction(left.numerator + right.numerator, left.denominator);
    }
    const denominator = lcm(left.denominator, right.denominator);
    return new Fraction(
        left.numerator * (denominator / left.denominator)
            + right.numerator * (denominator / right.denominator),
        denominator,
    );
}

function crossAdd(leftValue, rightValue, subtract = false) {
    const left = finite(leftValue, "left Fraction operand");
    const right = finite(rightValue, "right Fraction operand");
    const incoming = subtract ? -right.numerator : right.numerator;
    return new Fraction(
        left.numerator * right.denominator + incoming * left.denominator,
        left.denominator * right.denominator,
    );
}

function multiply(leftValue, rightValue) {
    const left = asFraction(leftValue, "left Fraction operand");
    const right = asFraction(rightValue, "right Fraction operand");
    return new Fraction(
        left.numerator * right.numerator,
        left.denominator * right.denominator,
        { allowInfinite: left.denominator * right.denominator === 0n },
    );
}

function divide(leftValue, rightValue) {
    const left = asFraction(leftValue, "left Fraction operand");
    const right = asFraction(rightValue, "right Fraction operand");
    if (right.numerator === 0n) throw new Error("Division by zero Fraction");
    const denominator = left.denominator * right.numerator;
    return new Fraction(left.numerator * right.denominator, denominator, { allowInfinite: denominator === 0n });
}

function compare(leftValue, rightValue) {
    const left = normalizedComponents(leftValue);
    const right = normalizedComponents(rightValue);
    const a = left.numerator * right.denominator;
    const b = right.numerator * left.denominator;
    return a < b ? -1 : a > b ? 1 : 0;
}

function integerExponent(value) {
    if (value instanceof Integer) return value.value;
    if (value instanceof Rational && value.denominator === 1n) return value.numerator;
    return null;
}

export function installFractionOperators(registry) {
    if (!registry) return;
    const binary = (name, prepare, impl) => registry.installVariant(name, {
        name: `Fraction.${name}`,
        priority: 280,
        prepare(args) { return args.length === 2 && prepare(args[0], args[1]) ? { args } : false; },
        impl,
    });
    const fractionPair = (left, right) => (left instanceof Fraction || right instanceof Fraction)
        && isExactScalar(left) && isExactScalar(right);
    binary("ADD", fractionPair, ([left, right]) => crossAdd(left, right));
    binary("SUB", fractionPair, ([left, right]) => crossAdd(left, right, true));
    binary("MUL", fractionPair, ([left, right]) => multiply(left, right));
    binary("DIV", fractionPair, ([left, right]) => divide(left, right));
    binary("POW", (left, right) => left instanceof Fraction && integerExponent(right) !== null,
        ([left, right]) => left.pow(integerExponent(right)));
    binary("EQ", fractionPair, ([left, right]) => bool(asFraction(left).equals(asFraction(right))));
    binary("NEQ", fractionPair, ([left, right]) => bool(!asFraction(left).equals(asFraction(right))));
    for (const [name, predicate] of [
        ["LT", (value) => value < 0], ["LTE", (value) => value <= 0],
        ["GT", (value) => value > 0], ["GTE", (value) => value >= 0],
    ]) binary(name, fractionPair, ([left, right]) => bool(predicate(compare(left, right))));
    binary("COMPARE", fractionPair, ([left, right]) => int(compare(left, right)));
    registry.installVariant("NEG", {
        name: "Fraction.NEG",
        priority: 280,
        prepare(args) { return args.length === 1 && args[0] instanceof Fraction ? { args } : false; },
        impl: ([value]) => new Fraction(-value.numerator, value.denominator, { allowInfinite: value.denominator === 0n }),
    });
}

function method(name, impl) {
    return { type: "method_builtin", name, impl };
}

function fareyParents(value) {
    const parents = finite(value, "Fraction").fareyParents();
    return { type: "tuple", values: [parents.left, parents.right] };
}

function sequenceValues(value, label) {
    if (!value || !Array.isArray(value.values)) {
        throw new Error(label + " must be a sequence");
    }
    return value.values;
}

function sternBrocotDirections(value) {
    return sequenceValues(value, "Stern-Brocot path").map((direction) => {
        const name = text(direction);
        if (name !== "L" && name !== "R") {
            throw new Error('Stern-Brocot path directions must be "L" or "R"');
        }
        return name;
    });
}

function sternBrocotPath(value, maxLength) {
    const limit = maxLength === undefined
        ? undefined
        : Number(exactInteger(maxLength, "Stern-Brocot path limit"));
    const path = limit === undefined
        ? finite(value, "Fraction").sternBrocotPath()
        : finite(value, "Fraction").sternBrocotPath(limit);
    return seq(path.map(str));
}

function sternBrocotChildren(value) {
    const children = finite(value, "Fraction").sternBrocotChildren();
    return { type: "tuple", values: [children.left, children.right] };
}

export function registerFractionMethods(systemContext, owner = {}) {
    const register = (type, name, impl) => systemContext.registerMethod(type, name, method(name, impl), owner);
    for (const type of ["Integer", "Rational", "Fraction"]) register(type, "F", ([value]) => asFraction(value));
    register("Fraction", "Fraction", ([value]) => value);
    register("Fraction", "Numerator", ([value]) => int(value.numerator));
    register("Fraction", "Denominator", ([value]) => int(value.denominator));
    register("Fraction", "Rational", ([value]) => value.toRational());
    register("Fraction", "Reduce", ([value]) => value.reduce());
    register("Fraction", "Scale", ([value, factor]) => value.scale(exactInteger(factor, "Fraction scale")));
    register("Fraction", "Negate", ([value]) => new Fraction(-value.numerator, value.denominator, { allowInfinite: value.denominator === 0n }));
    register("Fraction", "Reciprocal", ([value]) => {
        if (value.numerator === 0n) throw new Error("Zero Fraction has no reciprocal");
        return new Fraction(value.denominator, value.numerator, { allowInfinite: value.numerator === 0n });
    });
    register("Fraction", "Mediant", ([value, other]) => value.mediant(asFraction(other, "Mediant operand")));
    register("Fraction", "AddLikeDenominator", ([value, other]) => commonDenominator(value, other, "like"));
    register("Fraction", "AddLCMDenominator", ([value, other]) => commonDenominator(value, other, "lcm"));
    register("Fraction", "SamePair", ([value, other]) => bool(value.equals(asFraction(other))));
    register("Fraction", "Equivalent", ([value, other]) => bool(compare(value, other) === 0));
    register("Fraction", "FareyParents", ([value]) => fareyParents(value));
    register("Fraction", "SternBrocotPath", ([value, maxLength]) => sternBrocotPath(value, maxLength));
    register("Fraction", "SternBrocotParent", ([value]) => finite(value, "Fraction").sternBrocotParent());
    register("Fraction", "SternBrocotChildren", ([value]) => sternBrocotChildren(value));
    register("Fraction", "SternBrocotAncestors", ([value]) => seq(finite(value, "Fraction").sternBrocotAncestors()));
    register("Fraction", "SternBrocotDepth", ([value]) => int(finite(value, "Fraction").sternBrocotDepth()));
    register("Fraction", "IsSternBrocotValid", ([value]) => bool(value.isSternBrocotValid()));
    register("Fraction", "IsInfinite", ([value]) => bool(value.isInfinite));
    register("Fraction", "ToString", ([value]) => str(value.toString()));
    register("Fraction", "Record", ([value]) => rixMap([
        ["schema", str(FRACTION_SCHEMA)], ["numerator", int(value.numerator)],
        ["denominator", int(value.denominator)], ["reduced", bool(value.equals(value.reduce()))],
    ]));
}

function parseFraction(args, context, evaluate) {
    const body = text(args[1]);
    if (body === null) throw new Error(".fraction.Parse body must be a string");
    const structural = parseStructuralArithmetic(body, context, {
        evaluateRiX: (source) => {
            const runtime = context.getEnv("__script_runtime__", null);
            const nodes = lower(parse(source, runtime?.systemLookup));
            if (nodes.length === 0) throw new Error("'@(expression)' must contain a RiX expression");
            let result = null;
            for (const node of nodes) result = evaluate(node);
            return result;
        },
    });
    const value = isStructuralLiteral(structural) ? structural.value : structural;
    if (value instanceof Fraction) return value;
    if (value instanceof Integer || value instanceof Rational) return asFraction(value);
    if (isStructuralForm(value)) {
        throw new Error(".fraction backticks require one concrete fraction; use .fracfun for symbolic or compound forms");
    }
    throw new Error(".fraction backticks require an exact numeric fraction");
}

export function createFractionPluginValue() {
    const constructor = (args) => createFraction(args);
    const parseMethod = method("Parse", parseFraction);
    const fromSternBrocotPathMethod = method("FromSternBrocotPath", ([, path]) =>
        Fraction.fromSternBrocotPath(sternBrocotDirections(path)));
    return {
        type: "fraction_plugin",
        entries: new Map([["Fraction", constructor], ["FRACTION", constructor]]),
        _ext: new Map([
            ["PARSE", parseMethod], ["Parse", parseMethod],
            ["FROMSTERNBROCOTPATH", fromSternBrocotPathMethod],
            ["FromSternBrocotPath", fromSternBrocotPathMethod],
            ["FRACTION", method("Fraction", ([, ...args]) => createFraction(args))],
            ["immutable", int(1)],
        ]),
    };
}
