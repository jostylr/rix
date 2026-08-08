/** Exact transformations for semantic callable Polynomials. */

import { Integer, Rational } from "@ratmath/core";
import { callWithConcreteArgs } from "../../src/eval/functions/functions.js";
import { createSyntheticDivision } from "../../src/runtime/output.js";
import {
    POLYNOMIAL_SCHEMA,
    createPolynomial as createSemanticPolynomial,
    isPolynomial,
    polynomialCoefficients as semanticCoefficients,
    polynomialRecord as semanticRecord,
    polynomialsEqual,
    requirePolynomial,
} from "../poly/polynomial.js";

export { POLYNOMIAL_SCHEMA };
export const DIVISION_SCHEMA = "rix.algebra.division@1";

const int = (value) => new Integer(BigInt(value));
const str = (value) => ({ type: "string", value: String(value) });
const seq = (values) => ({ type: "sequence", values });

function entriesFor(args, positional, name) {
    if (args.length === 1 && args[0]?.type === "map" && args[0].entries instanceof Map) return args[0].entries;
    if (args.length > positional.length) throw new Error(`${name} received too many arguments`);
    const entries = new Map(positional.slice(0, args.length).map((key, index) => [key, args[index]]));
    const options = entries.get("options");
    if (options?.type === "map" && options.entries instanceof Map) {
        for (const [key, value] of options.entries) if (!entries.has(key)) entries.set(key, value);
    }
    return entries;
}

function field(entries, name, fallback = null) {
    if (!(entries instanceof Map)) return fallback;
    if (entries.has(name)) return entries.get(name);
    const canonical = String(name).toLowerCase();
    for (const [key, value] of entries) if (String(key).toLowerCase() === canonical) return value;
    return fallback;
}

function rational(value, label) {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value.value, 1n);
    throw new Error(`${label} must be an exact integer or rational`);
}

const zero = () => new Rational(0n, 1n);
const one = () => new Rational(1n, 1n);
const isZero = (value) => value.numerator === 0n;

function normalizeCoefficients(values, label = "Polynomial coefficients") {
    if (values.length === 0) throw new Error(`${label} cannot be empty`);
    const exact = values.map((value, index) => rational(value, `${label} ${index + 1}`));
    const first = exact.findIndex((value) => !isZero(value));
    return first < 0 ? [zero()] : exact.slice(first);
}

function exactCoefficients(polynomial, context, evaluate, label) {
    requirePolynomial(polynomial, label);
    return normalizeCoefficients(semanticCoefficients(polynomial, context, evaluate), `${label} coefficients`);
}

function polynomialValue(coefficients, variable, context) {
    return createSemanticPolynomial([seq(normalizeCoefficients(coefficients)), str(variable)], context);
}

export function createPolynomial(args, context) {
    try {
        return createSemanticPolynomial(args, context);
    } catch (error) {
        throw new Error(`algebra.Polynomial: ${error.message}`);
    }
}

export function polynomialCoefficients(args, context, evaluate) {
    const entries = entriesFor(args, ["polynomial"], "algebra.Coefficients");
    const polynomial = requirePolynomial(field(entries, "polynomial"), "algebra.Coefficients value");
    return seq(semanticCoefficients(polynomial, context, evaluate));
}

export function polynomialRecord(args, context, evaluate) {
    const entries = entriesFor(args, ["polynomial"], "algebra.Record");
    return semanticRecord(requirePolynomial(field(entries, "polynomial"), "algebra.Record value"), context, evaluate);
}

export function evaluatePolynomial(args, context, evaluate) {
    const entries = entriesFor(args, ["polynomial", "value"], "algebra.Evaluate");
    const polynomial = requirePolynomial(field(entries, "polynomial"), "algebra.Evaluate polynomial");
    return callWithConcreteArgs(polynomial, [field(entries, "value")], context, evaluate);
}

export function equalPolynomials(args) {
    const entries = entriesFor(args, ["left", "right"], "algebra.Equal");
    return int(polynomialsEqual(
        requirePolynomial(field(entries, "left"), "algebra.Equal left value"),
        requirePolynomial(field(entries, "right"), "algebra.Equal right value"),
    ) ? 1 : 0);
}

function coefficientsEqual(left, right) {
    return left.length === right.length && left.every((value, index) => value.equals(right[index]));
}

function addCoefficients(left, right) {
    const length = Math.max(left.length, right.length);
    const a = [...Array(length - left.length).fill(null), ...left];
    const b = [...Array(length - right.length).fill(null), ...right];
    return normalizeCoefficients(Array.from({ length }, (_, index) => (a[index] || zero()).add(b[index] || zero())));
}

function multiplyCoefficients(left, right) {
    const result = Array.from({ length: left.length + right.length - 1 }, zero);
    for (let a = 0; a < left.length; a += 1) for (let b = 0; b < right.length; b += 1) {
        result[a + b] = result[a + b].add(left[a].multiply(right[b]));
    }
    return normalizeCoefficients(result);
}

function divisionValue(dividend, divisor, quotient, remainder, coefficients, method, extra = {}) {
    const reconstructed = addCoefficients(
        multiplyCoefficients(coefficients.divisor, coefficients.quotient),
        coefficients.remainder,
    );
    const identityVerified = coefficientsEqual(reconstructed, coefficients.dividend);
    const factor = coefficients.remainder.length === 1 && isZero(coefficients.remainder[0]);
    return Object.freeze({
        type: "algebra_division",
        kind: "polynomial_division",
        schema: DIVISION_SCHEMA,
        method,
        dividend,
        divisor,
        quotient,
        remainder,
        exact: true,
        identity: Object.freeze({ relation: "dividend = divisor * quotient + remainder", verified: identityVerified }),
        factor: Object.freeze({
            divisorIsFactor: factor,
            status: factor ? "exact-factor" : "nonzero-remainder",
            equalityPolicy: dividend.equalityPolicy,
        }),
        provenance: Object.freeze([{ operation: method === "synthetic" ? "SyntheticDivide" : "Divide", inputs: Object.freeze([dividend, divisor]) }]),
        ...extra,
        _ext: new Map([
            ["__type", str("PolynomialDivision")],
            ["_type", str("algebra_division")],
            ["kind", str("polynomial_division")],
            ["immutable", int(1)],
        ]),
    });
}

function divideValues(dividend, divisor, context, evaluate, method = "long") {
    requirePolynomial(dividend, "algebra.Divide dividend");
    requirePolynomial(divisor, "algebra.Divide divisor");
    if (dividend.variable !== divisor.variable) throw new Error("algebra.Divide polynomials must use the same variable");
    const dividendValues = exactCoefficients(dividend, context, evaluate, "algebra.Divide dividend");
    const divisorValues = exactCoefficients(divisor, context, evaluate, "algebra.Divide divisor");
    const dividendDegree = dividendValues.length === 1 && isZero(dividendValues[0]) ? -1 : dividendValues.length - 1;
    const divisorDegree = divisorValues.length === 1 && isZero(divisorValues[0]) ? -1 : divisorValues.length - 1;
    if (divisorDegree < 0) throw new Error("algebra.Divide divisor cannot be the zero polynomial");

    let quotientValues;
    let remainderValues;
    if (dividendDegree < divisorDegree) {
        quotientValues = [zero()];
        remainderValues = dividendValues;
    } else {
        const difference = dividendDegree - divisorDegree;
        quotientValues = Array.from({ length: difference + 1 }, zero);
        const working = [...dividendValues];
        for (let index = 0; index <= difference; index += 1) {
            const factor = working[index].divide(divisorValues[0]);
            quotientValues[index] = factor;
            for (let divisorIndex = 0; divisorIndex < divisorValues.length; divisorIndex += 1) {
                working[index + divisorIndex] = working[index + divisorIndex].subtract(factor.multiply(divisorValues[divisorIndex]));
            }
        }
        remainderValues = normalizeCoefficients(working.slice(difference + 1).length ? working.slice(difference + 1) : [zero()]);
    }

    const quotient = polynomialValue(quotientValues, dividend.variable, context);
    const remainder = polynomialValue(remainderValues, dividend.variable, context);
    return divisionValue(dividend, divisor, quotient, remainder, {
        dividend: dividendValues,
        divisor: divisorValues,
        quotient: quotientValues,
        remainder: remainderValues,
    }, method);
}

export function dividePolynomials(args, context, evaluate) {
    const entries = entriesFor(args, ["dividend", "divisor"], "algebra.Divide");
    return divideValues(field(entries, "dividend"), field(entries, "divisor"), context, evaluate);
}

export function syntheticDivide(args, context, evaluate) {
    const entries = entriesFor(args, ["polynomial", "root"], "algebra.SyntheticDivide");
    const polynomial = requirePolynomial(field(entries, "polynomial"), "algebra.SyntheticDivide polynomial");
    const root = rational(field(entries, "root"), "algebra.SyntheticDivide root");
    const coefficients = exactCoefficients(polynomial, context, evaluate, "algebra.SyntheticDivide polynomial");
    const divisor = polynomialValue([one(), root.negate()], polynomial.variable, context);
    const result = divideValues(polynomial, divisor, context, evaluate, "synthetic");
    return Object.freeze({
        ...result,
        root,
        grid: createSyntheticDivision(root, coefficients),
    });
}

function requireDivision(value, label) {
    if (value?.type !== "algebra_division" || value.schema !== DIVISION_SCHEMA) throw new Error(`${label} must be an algebra division result`);
    return value;
}

export function divisionQuotient(args) {
    const entries = entriesFor(args, ["division"], "algebra.Quotient");
    return requireDivision(field(entries, "division"), "algebra.Quotient value").quotient;
}

export function divisionRemainder(args) {
    const entries = entriesFor(args, ["division"], "algebra.Remainder");
    return requireDivision(field(entries, "division"), "algebra.Remainder value").remainder;
}

export function divisorIsFactor(args, context, evaluate) {
    const entries = entriesFor(args, ["polynomial", "candidate"], "algebra.IsFactor");
    return int(divideValues(field(entries, "polynomial"), field(entries, "candidate"), context, evaluate).factor.divisorIsFactor ? 1 : 0);
}

export function divisionGrid(args) {
    const entries = entriesFor(args, ["division"], "algebra.Grid");
    const division = requireDivision(field(entries, "division"), "algebra.Grid value");
    if (division.method !== "synthetic" || !division.grid) throw new Error("algebra.Grid requires a SyntheticDivide result");
    return division.grid;
}

function method(name, impl) {
    return { type: "method_builtin", name, impl };
}

export function registerAlgebraMethods(systemContext, owner = {}) {
    const register = (type, name, impl) => systemContext.registerMethod(type, name, method(name, impl), owner);
    register("Polynomial", "Divide", ([value, divisor], context, evaluate) => dividePolynomials([value, divisor], context, evaluate));
    register("Polynomial", "DivMod", ([value, divisor], context, evaluate) => dividePolynomials([value, divisor], context, evaluate));
    register("Polynomial", "SyntheticDiv", ([value, root], context, evaluate) => syntheticDivide([value, root], context, evaluate));
    register("Polynomial", "SyntheticDivide", ([value, root], context, evaluate) => syntheticDivide([value, root], context, evaluate));
    register("Polynomial", "IsFactor", ([value, candidate], context, evaluate) => divisorIsFactor([value, candidate], context, evaluate));
    register("PolynomialDivision", "Quotient", ([value]) => divisionQuotient([value]));
    register("PolynomialDivision", "Remainder", ([value]) => divisionRemainder([value]));
    register("PolynomialDivision", "Grid", ([value]) => divisionGrid([value]));
}

export function installPolynomialDivisionOperators(registry) {
    if (!registry) return;
    const install = (name, impl) => registry.installVariant(name, {
        name: `Polynomial.${name}`,
        priority: 260,
        prepare(args) { return args.length === 2 && isPolynomial(args[0]) && isPolynomial(args[1]) ? { args } : false; },
        impl,
    });
    install("INTDIV", ([left, right], context, evaluate) => divideValues(left, right, context, evaluate).quotient);
    install("MOD", ([left, right], context, evaluate) => divideValues(left, right, context, evaluate).remainder);
    install("DIVMOD", ([left, right], context, evaluate) => {
        const result = divideValues(left, right, context, evaluate);
        return { type: "tuple", values: [result.quotient, result.remainder] };
    });
}
