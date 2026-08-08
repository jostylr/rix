/** Canonical exact univariate polynomials and transformation evidence. */

import { Integer, Rational } from "@ratmath/core";
import { createSyntheticDivision } from "../../src/runtime/output.js";

export const POLYNOMIAL_SCHEMA = "rix.algebra.polynomial@1";
export const DIVISION_SCHEMA = "rix.algebra.division@1";

const int = (value) => new Integer(BigInt(value));
const str = (value) => ({ type: "string", value: String(value) });
const seq = (values) => ({ type: "sequence", values });
const rixMap = (entries) => ({ type: "map", entries: new Map(entries) });

function sequence(value, label) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.values)) return value.values;
    if (Array.isArray(value?.elements)) return value.elements;
    throw new Error(`${label} must be a sequence`);
}

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

function text(value, fallback = null) {
    if (value?.type === "string") return value.value;
    return typeof value === "string" ? value : fallback;
}

function rational(value, label) {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value.value, 1n);
    throw new Error(`${label} must be an exact integer or rational`);
}

function zero() {
    return new Rational(0n, 1n);
}

function one() {
    return new Rational(1n, 1n);
}

function isZero(value) {
    return value.numerator === 0n;
}

function normalizeCoefficients(values, label = "Polynomial coefficients") {
    if (values.length === 0) throw new Error(`${label} cannot be empty`);
    const exact = values.map((value, index) => rational(value, `${label} ${index + 1}`));
    const first = exact.findIndex((value) => !isZero(value));
    return Object.freeze(first < 0 ? [zero()] : exact.slice(first));
}

function polynomialValue(coefficients, variable, operation, inputs) {
    const normalized = normalizeCoefficients(coefficients);
    const zeroPolynomial = normalized.length === 1 && isZero(normalized[0]);
    return Object.freeze({
        type: "algebra_polynomial",
        kind: "polynomial",
        schema: POLYNOMIAL_SCHEMA,
        variable,
        coefficients: normalized,
        degree: zeroPolynomial ? -1 : normalized.length - 1,
        leadingCoefficient: normalized[0],
        canonical: true,
        equalityPolicy: "canonical-coefficients",
        factorStatus: zeroPolynomial ? "zero" : normalized.length === 1 ? "constant" : "unknown",
        provenance: Object.freeze([{ operation, inputs: Object.freeze([...inputs]) }]),
        _ext: new Map([
            ["_type", str("algebra_polynomial")],
            ["kind", str("polynomial")],
            ["immutable", int(1)],
        ]),
    });
}

export function isPolynomial(value) {
    return Boolean(value?.type === "algebra_polynomial" && value.schema === POLYNOMIAL_SCHEMA && Array.isArray(value.coefficients));
}

function requirePolynomial(value, label) {
    if (!isPolynomial(value)) throw new Error(`${label} must be an algebra Polynomial`);
    return value;
}

export function createPolynomial(args) {
    if (args.length === 1 && isPolynomial(args[0])) return args[0];
    const entries = entriesFor(args, ["coefficients", "options"], "algebra.Polynomial");
    const coefficients = sequence(field(entries, "coefficients"), "algebra.Polynomial coefficients");
    const variable = text(field(entries, "variable"), "x");
    if (!variable || !/^[A-Za-z][A-Za-z0-9_]*$/.test(variable)) {
        throw new Error("algebra.Polynomial variable must be a simple identifier string");
    }
    return polynomialValue(coefficients, variable, "Polynomial", [seq(coefficients), str(variable)]);
}

export function polynomialCoefficients(args) {
    const entries = entriesFor(args, ["polynomial"], "algebra.Coefficients");
    const polynomial = requirePolynomial(field(entries, "polynomial"), "algebra.Coefficients value");
    return seq([...polynomial.coefficients]);
}

export function polynomialRecord(args) {
    const entries = entriesFor(args, ["polynomial"], "algebra.Record");
    const polynomial = requirePolynomial(field(entries, "polynomial"), "algebra.Record value");
    return rixMap([
        ["schema", str(POLYNOMIAL_SCHEMA)],
        ["variable", str(polynomial.variable)],
        ["coefficients", seq([...polynomial.coefficients])],
        ["canonical", int(1)],
        ["equalityPolicy", str(polynomial.equalityPolicy)],
    ]);
}

export function evaluatePolynomial(args) {
    const entries = entriesFor(args, ["polynomial", "value"], "algebra.Evaluate");
    const polynomial = requirePolynomial(field(entries, "polynomial"), "algebra.Evaluate polynomial");
    const value = rational(field(entries, "value"), "algebra.Evaluate value");
    return polynomial.coefficients.reduce((result, coefficient) => result.multiply(value).add(coefficient), zero());
}

function coefficientsEqual(left, right) {
    return left.length === right.length && left.every((value, index) => value.equals(right[index]));
}

export function equalPolynomials(args) {
    const entries = entriesFor(args, ["left", "right"], "algebra.Equal");
    const left = requirePolynomial(field(entries, "left"), "algebra.Equal left value");
    const right = requirePolynomial(field(entries, "right"), "algebra.Equal right value");
    return int(left.variable === right.variable && coefficientsEqual(left.coefficients, right.coefficients) ? 1 : 0);
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

function divisionValue(dividend, divisor, quotient, remainder, method, extra = {}) {
    const reconstructed = addCoefficients(multiplyCoefficients(divisor.coefficients, quotient.coefficients), remainder.coefficients);
    const identityVerified = coefficientsEqual(reconstructed, dividend.coefficients);
    const divisorIsFactor = remainder.coefficients.length === 1 && isZero(remainder.coefficients[0]);
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
        identity: Object.freeze({
            relation: "dividend = divisor * quotient + remainder",
            verified: identityVerified,
        }),
        factor: Object.freeze({
            divisorIsFactor,
            status: divisorIsFactor ? "exact-factor" : "nonzero-remainder",
            equalityPolicy: dividend.equalityPolicy,
        }),
        provenance: Object.freeze([{ operation: method === "synthetic" ? "SyntheticDivide" : "Divide", inputs: Object.freeze([dividend, divisor]) }]),
        ...extra,
        _ext: new Map([
            ["_type", str("algebra_division")],
            ["kind", str("polynomial_division")],
            ["immutable", int(1)],
        ]),
    });
}

function divideValues(dividend, divisor, method = "long") {
    if (divisor.degree < 0) throw new Error("algebra.Divide divisor cannot be the zero polynomial");
    if (dividend.degree < divisor.degree) {
        return divisionValue(
            dividend,
            divisor,
            polynomialValue([zero()], dividend.variable, "DivisionQuotient", [dividend, divisor]),
            polynomialValue(dividend.coefficients, dividend.variable, "DivisionRemainder", [dividend, divisor]),
            method,
        );
    }
    const difference = dividend.degree - divisor.degree;
    const quotient = Array.from({ length: difference + 1 }, zero);
    const working = [...dividend.coefficients];
    for (let index = 0; index <= difference; index += 1) {
        const factor = working[index].divide(divisor.leadingCoefficient);
        quotient[index] = factor;
        for (let divisorIndex = 0; divisorIndex < divisor.coefficients.length; divisorIndex += 1) {
            working[index + divisorIndex] = working[index + divisorIndex].subtract(factor.multiply(divisor.coefficients[divisorIndex]));
        }
    }
    const remainderValues = working.slice(difference + 1);
    return divisionValue(
        dividend,
        divisor,
        polynomialValue(quotient, dividend.variable, "DivisionQuotient", [dividend, divisor]),
        polynomialValue(remainderValues.length ? remainderValues : [zero()], dividend.variable, "DivisionRemainder", [dividend, divisor]),
        method,
    );
}

export function dividePolynomials(args) {
    const entries = entriesFor(args, ["dividend", "divisor"], "algebra.Divide");
    const dividend = requirePolynomial(field(entries, "dividend"), "algebra.Divide dividend");
    const divisor = requirePolynomial(field(entries, "divisor"), "algebra.Divide divisor");
    if (dividend.variable !== divisor.variable) throw new Error("algebra.Divide polynomials must use the same variable");
    return divideValues(dividend, divisor);
}

export function syntheticDivide(args) {
    const entries = entriesFor(args, ["polynomial", "root"], "algebra.SyntheticDivide");
    const polynomial = requirePolynomial(field(entries, "polynomial"), "algebra.SyntheticDivide polynomial");
    const root = rational(field(entries, "root"), "algebra.SyntheticDivide root");
    const divisor = polynomialValue([one(), root.negate()], polynomial.variable, "LinearFactor", [root]);
    const result = divideValues(polynomial, divisor, "synthetic");
    return divisionValue(result.dividend, result.divisor, result.quotient, result.remainder, "synthetic", {
        root,
        grid: createSyntheticDivision(root, polynomial.coefficients),
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

export function divisorIsFactor(args) {
    const entries = entriesFor(args, ["polynomial", "candidate"], "algebra.IsFactor");
    const polynomial = requirePolynomial(field(entries, "polynomial"), "algebra.IsFactor polynomial");
    const candidate = requirePolynomial(field(entries, "candidate"), "algebra.IsFactor candidate");
    if (polynomial.variable !== candidate.variable) throw new Error("algebra.IsFactor polynomials must use the same variable");
    return int(divideValues(polynomial, candidate).factor.divisorIsFactor ? 1 : 0);
}

export function divisionGrid(args) {
    const entries = entriesFor(args, ["division"], "algebra.Grid");
    const division = requireDivision(field(entries, "division"), "algebra.Grid value");
    if (division.method !== "synthetic" || !division.grid) throw new Error("algebra.Grid requires a SyntheticDivide result");
    return division.grid;
}
