/** Canonical callable univariate rational functions over exact rationals. */

import { Integer, Rational } from "@ratmath/core";
import { parse } from "../../src/parser/parser.js";
import { lower } from "../../src/eval/lower.js";
import { callWithConcreteArgs } from "../../src/eval/functions/functions.js";
import {
    cloneSymbolicIr,
    createSymbolicSpec,
    exactToIr,
    expressionOf,
    getAttachedSpec,
    polyFromSpec,
    polynomialFromIr,
    symbolicIr,
    symbolicLiteral,
    symbolicRetrieve,
} from "../../src/eval/functions/symbolic.js";
import {
    parseStructuralArithmetic,
    sortedStructuralFreeSymbols,
    structuralValueToIr,
} from "../../src/runtime/structural-arithmetic.js";
import {
    createPolynomial,
    isPolynomial,
    polynomialCoefficients,
    requirePolynomial,
} from "../poly/polynomial.js";

export const RATIONAL_FUNCTION_SCHEMA = "rix.rational-function@1";

const int = (value) => new Integer(BigInt(value));
const str = (value) => ({ type: "string", value: String(value) });
const seq = (values) => ({ type: "sequence", values });
const rixMap = (entries) => ({ type: "map", entries: new Map(entries) });
const zero = () => new Rational(0n, 1n);
const one = () => new Rational(1n, 1n);

function text(value, fallback = null) {
    if (value?.type === "string") return value.value;
    return typeof value === "string" ? value : fallback;
}

function entries(value) {
    return value?.type === "map" && value.entries instanceof Map ? value.entries : null;
}

function field(map, name, fallback = null) {
    if (!(map instanceof Map)) return fallback;
    if (map.has(name)) return map.get(name);
    const folded = name.toLowerCase();
    for (const [key, value] of map) if (String(key).toLowerCase() === folded) return value;
    return fallback;
}

function values(value, label) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.values)) return value.values;
    throw new Error(`${label} must be an array, tuple, or sequence`);
}

function variableName(value, fallback = null) {
    const result = text(value, fallback);
    if (result === null) return null;
    if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(result)) {
        throw new Error("Rational-function variable must be a simple identifier or colon-string");
    }
    return result;
}

function isExactScalar(value) {
    return value instanceof Integer || value instanceof Rational || typeof value === "bigint" || Number.isInteger(value);
}

function rational(value, label) {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value.value, 1n);
    if (typeof value === "bigint" || Number.isInteger(value)) return new Rational(BigInt(value), 1n);
    throw new Error(`${label} must have exact integer or rational coefficients`);
}

const isZero = (value) => value.numerator === 0n;

function normalize(valuesList, label = "Polynomial coefficients") {
    if (valuesList.length === 0) throw new Error(`${label} cannot be empty`);
    const exact = valuesList.map((value, index) => rational(value, `${label} ${index + 1}`));
    const first = exact.findIndex((value) => !isZero(value));
    return first < 0 ? [zero()] : exact.slice(first);
}

function coefficientsEqual(left, right) {
    return left.length === right.length && left.every((value, index) => value.equals(right[index]));
}

function add(left, right, subtract = false) {
    const length = Math.max(left.length, right.length);
    const a = [...Array(length - left.length).fill(null), ...left];
    const b = [...Array(length - right.length).fill(null), ...right];
    return normalize(Array.from({ length }, (_, index) => {
        const incoming = b[index] || zero();
        return subtract ? (a[index] || zero()).subtract(incoming) : (a[index] || zero()).add(incoming);
    }));
}

function multiply(left, right) {
    const result = Array.from({ length: left.length + right.length - 1 }, zero);
    for (let a = 0; a < left.length; a += 1) for (let b = 0; b < right.length; b += 1) {
        result[a + b] = result[a + b].add(left[a].multiply(right[b]));
    }
    return normalize(result);
}

function scale(valuesList, divisor) {
    return normalize(valuesList.map((value) => value.divide(divisor)));
}

function divideWithRemainder(dividend, divisor) {
    const a = normalize(dividend);
    const b = normalize(divisor);
    if (b.length === 1 && isZero(b[0])) throw new Error("Rational-function denominator cannot be the zero polynomial");
    if (a.length < b.length || (a.length === 1 && isZero(a[0]))) return { quotient: [zero()], remainder: a };
    const difference = a.length - b.length;
    const quotient = Array.from({ length: difference + 1 }, zero);
    const working = [...a];
    for (let index = 0; index <= difference; index += 1) {
        const factor = working[index].divide(b[0]);
        quotient[index] = factor;
        for (let j = 0; j < b.length; j += 1) {
            working[index + j] = working[index + j].subtract(factor.multiply(b[j]));
        }
    }
    const tail = working.slice(difference + 1);
    return { quotient: normalize(quotient), remainder: normalize(tail.length ? tail : [zero()]) };
}

function gcd(left, right) {
    let a = normalize(left);
    let b = normalize(right);
    while (!(b.length === 1 && isZero(b[0]))) {
        const remainder = divideWithRemainder(a, b).remainder;
        a = b;
        b = remainder;
    }
    return scale(a, a[0]);
}

function exactQuotient(dividend, divisor) {
    const result = divideWithRemainder(dividend, divisor);
    if (!(result.remainder.length === 1 && isZero(result.remainder[0]))) {
        throw new Error("Internal rational-function normalization produced a nonzero gcd remainder");
    }
    return result.quotient;
}

function canonicalPair(numerator, denominator) {
    let n = normalize(numerator, "Rational-function numerator coefficients");
    let d = normalize(denominator, "Rational-function denominator coefficients");
    if (d.length === 1 && isZero(d[0])) throw new Error("Rational-function denominator cannot be the zero polynomial");
    if (n.length === 1 && isZero(n[0])) return { numerator: [zero()], denominator: [one()], cancelledDegree: d.length - 1 };
    const common = gcd(n, d);
    n = exactQuotient(n, common);
    d = exactQuotient(d, common);
    const leading = d[0];
    return {
        numerator: scale(n, leading),
        denominator: scale(d, leading),
        cancelledDegree: common.length - 1,
    };
}

function polynomialValue(coefficients, variable, context) {
    return createPolynomial([seq(normalize(coefficients)), str(variable)], context);
}

function rationalFunctionMetadata(value) {
    return value?._rationalFunction?.schema === RATIONAL_FUNCTION_SCHEMA ? value._rationalFunction : null;
}

export function isRationalFunction(value) {
    return Boolean(rationalFunctionMetadata(value));
}

export function requireRationalFunction(value, label = "value") {
    if (!isRationalFunction(value)) throw new Error(`${label} must be a RationalFunction`);
    return value;
}

function polynomialExpression(polynomial) {
    return cloneSymbolicIr(expressionOf(getAttachedSpec(polynomial)));
}

function decorateRationalFunction(numerator, denominator, variable, normalization, context, provenance = []) {
    const expression = symbolicIr("DIV", polynomialExpression(numerator), polynomialExpression(denominator));
    const spec = createSymbolicSpec({
        inputs: [variable],
        outputMode: "expression",
        expression,
        origin: ".ratfun",
        transform: { operation: "RationalFunction" },
    }, context);
    const callable = polyFromSpec(spec);
    callable.__name = "RationalFunction";
    callable.schema = RATIONAL_FUNCTION_SCHEMA;
    callable.variable = variable;
    callable.canonical = true;
    callable.equalityPolicy = "canonical-reduced-fraction-field";
    callable.domainPolicy = "reduced-denominator-nonzero";
    callable.provenance = Object.freeze([...provenance]);
    callable._rationalFunction = Object.freeze({
        schema: RATIONAL_FUNCTION_SCHEMA,
        numerator,
        denominator,
        cancelledDegree: normalization.cancelledDegree,
    });
    if (!(callable._ext instanceof Map)) callable._ext = new Map();
    callable._ext.set("__type", str("RationalFunction"));
    callable._ext.set("_type", str("rational_function"));
    callable._ext.set("_symbolicKind", str("RationalFunction"));
    callable._ext.set("immutable", int(1));
    callable._ext.set("_spec", spec);
    callable._spec = spec;
    return callable;
}

function fromCoefficientPair(numerator, denominator, variable, context, provenance = []) {
    const canonical = canonicalPair(numerator, denominator);
    const n = polynomialValue(canonical.numerator, variable, context);
    const d = polynomialValue(canonical.denominator, variable, context);
    return decorateRationalFunction(n, d, variable, canonical, context, provenance);
}

function exactPolynomialCoefficients(polynomial, context, evaluate, label) {
    return normalize(polynomialCoefficients(requirePolynomial(polynomial, label), context, evaluate), `${label} coefficients`);
}

function polynomialFromValue(value, variable, context) {
    if (isPolynomial(value)) {
        if (variable && value.variable !== variable) {
            throw new Error(`Rational-function operands require the same variable, received '${variable}' and '${value.variable}'`);
        }
        return value;
    }
    if (isExactScalar(value)) return polynomialValue([rational(value, "Rational-function scalar")], variable || "x", context);
    throw new Error("RationalFunction operands must be Polynomials or exact integer/rational scalars");
}

function fromPolynomialPair(numeratorValue, denominatorValue, requestedVariable, context, evaluate, provenance = []) {
    const variable = requestedVariable
        || (isPolynomial(numeratorValue) ? numeratorValue.variable : null)
        || (isPolynomial(denominatorValue) ? denominatorValue.variable : null)
        || "x";
    const numerator = polynomialFromValue(numeratorValue, variable, context);
    const denominator = polynomialFromValue(denominatorValue, variable, context);
    return fromCoefficientPair(
        exactPolynomialCoefficients(numerator, context, evaluate, "Rational-function numerator"),
        exactPolynomialCoefficients(denominator, context, evaluate, "Rational-function denominator"),
        variable,
        context,
        provenance,
    );
}

function exactIntegerFromIr(node) {
    if (node?.fn === "LITERAL" && /^-?\d+$/.test(String(node.args[0]))) return BigInt(node.args[0]);
    if (node?.fn === "NEG") {
        const value = exactIntegerFromIr(node.args[0]);
        return value === null ? null : -value;
    }
    return null;
}

function rationalPartsFromIr(node, variable) {
    try {
        polynomialFromIr(node, variable);
        return { numerator: cloneSymbolicIr(node), denominator: symbolicLiteral(1) };
    } catch {
        // A rational expression may fail polynomial conversion at the first
        // quotient or negative power; recursively split those operations.
    }
    if (node?.fn === "NEG") {
        const value = rationalPartsFromIr(node.args[0], variable);
        return { numerator: symbolicIr("NEG", value.numerator), denominator: value.denominator };
    }
    if (["ADD", "SUB", "MUL", "DIV"].includes(node?.fn)) {
        const left = rationalPartsFromIr(node.args[0], variable);
        const right = rationalPartsFromIr(node.args[1], variable);
        if (node.fn === "ADD" || node.fn === "SUB") return {
            numerator: symbolicIr(node.fn,
                symbolicIr("MUL", left.numerator, right.denominator),
                symbolicIr("MUL", right.numerator, left.denominator)),
            denominator: symbolicIr("MUL", left.denominator, right.denominator),
        };
        if (node.fn === "MUL") return {
            numerator: symbolicIr("MUL", left.numerator, right.numerator),
            denominator: symbolicIr("MUL", left.denominator, right.denominator),
        };
        return {
            numerator: symbolicIr("MUL", left.numerator, right.denominator),
            denominator: symbolicIr("MUL", left.denominator, right.numerator),
        };
    }
    if (node?.fn === "POW") {
        const exponent = exactIntegerFromIr(node.args[1]);
        if (exponent !== null) {
            const base = rationalPartsFromIr(node.args[0], variable);
            const magnitude = exponent < 0n ? -exponent : exponent;
            const n = symbolicIr("POW", base.numerator, symbolicLiteral(magnitude));
            const d = symbolicIr("POW", base.denominator, symbolicLiteral(magnitude));
            return exponent < 0n ? { numerator: d, denominator: n } : { numerator: n, denominator: d };
        }
    }
    throw new Error(`RationalFunction conversion requires a rational expression in '${variable}'`);
}

function fromSpec(spec, requestedVariable, context, evaluate, provenance = []) {
    if (!spec || spec.type !== "symbolic_spec") throw new Error("RationalFunction conversion expects a symbolic specification");
    const variable = requestedVariable ?? (spec.inputs.length === 1 ? spec.inputs[0] : null);
    if (!variable) throw new Error("RationalFunction conversion needs one declared input or an explicit variable");
    if (spec.inputs.length > 1 || (spec.inputs.length === 1 && spec.inputs[0] !== variable)) {
        throw new Error(`RationalFunction input must be exactly '${variable}'; use a single-input symbolic spec`);
    }
    const parts = rationalPartsFromIr(expressionOf(spec), variable);
    const common = {
        inputs: [variable], outputMode: "expression", imports: spec.imports,
        __closureScopes: spec.__closureScopes, origin: spec.origin,
    };
    const numerator = createPolynomial([createSymbolicSpec({ ...common, expression: parts.numerator }, context)], context);
    const denominator = createPolynomial([createSymbolicSpec({ ...common, expression: parts.denominator }, context)], context);
    return fromPolynomialPair(numerator, denominator, variable, context, evaluate, provenance);
}

function structuralToRationalFunction(value, requestedVariable, context, evaluate, provenance = []) {
    const symbols = sortedStructuralFreeSymbols(value);
    const variable = requestedVariable ?? (symbols.length === 1 ? symbols[0] : symbols.length === 0 ? "x" : null);
    if (!variable) {
        throw new Error(`RationalFunction structural form has multiple symbols (${symbols.join(", ")}); select one with .R(:name)`);
    }
    const spec = createSymbolicSpec({
        inputs: [variable], outputMode: "expression", expression: structuralValueToIr(value), origin: ".ratfun structural form",
    }, context);
    return fromSpec(spec, variable, context, evaluate, provenance);
}

export function createRationalFunction(args, context = null, evaluate = null) {
    const [source, second = null] = args;
    if (isRationalFunction(source) && second === null) return source;
    const sourceEntries = entries(source);
    if (sourceEntries) {
        const variable = variableName(field(sourceEntries, "variable"), null);
        const numerator = field(sourceEntries, "numerator");
        const denominator = field(sourceEntries, "denominator");
        if (numerator === null || denominator === null) throw new Error("RationalFunction record requires numerator and denominator");
        const numeratorValue = Array.isArray(numerator) || Array.isArray(numerator?.values)
            ? createPolynomial([seq(values(numerator, "RationalFunction numerator")), str(variable || "x")], context)
            : numerator;
        const denominatorValue = Array.isArray(denominator) || Array.isArray(denominator?.values)
            ? createPolynomial([seq(values(denominator, "RationalFunction denominator")), str(variable || "x")], context)
            : denominator;
        return fromPolynomialPair(numeratorValue, denominatorValue, variable, context, evaluate, [{ operation: "Record" }]);
    }
    if (second !== null) return fromPolynomialPair(source, second, null, context, evaluate, [{ operation: "Pair" }]);
    if (isPolynomial(source) || isExactScalar(source)) {
        return fromPolynomialPair(source, one(), null, context, evaluate, [{ operation: "Lift" }]);
    }
    const spec = getAttachedSpec(source);
    if (spec) return fromSpec(spec, null, context, evaluate, [{ operation: "SymbolicSpec" }]);
    if (source?.type?.startsWith?.("structural_") || source?.constructor?.name === "Fraction") {
        return structuralToRationalFunction(source, null, context, evaluate, [{ operation: "StructuralForm" }]);
    }
    throw new Error("RationalFunction expects a numerator/denominator pair, record, structural form, symbolic spec, Polynomial, or exact scalar");
}

function metadataCoefficients(value, context, evaluate) {
    const metadata = rationalFunctionMetadata(requireRationalFunction(value));
    return {
        numerator: exactPolynomialCoefficients(metadata.numerator, context, evaluate, "Rational-function numerator"),
        denominator: exactPolynomialCoefficients(metadata.denominator, context, evaluate, "Rational-function denominator"),
    };
}

function operandParts(value, variable, context, evaluate) {
    if (isRationalFunction(value)) {
        if (value.variable !== variable) throw new Error(`Rational-function operands require the same variable, received '${variable}' and '${value.variable}'`);
        return metadataCoefficients(value, context, evaluate);
    }
    const polynomial = polynomialFromValue(value, variable, context);
    return { numerator: exactPolynomialCoefficients(polynomial, context, evaluate, "Rational-function operand"), denominator: [one()] };
}

function fieldVariable(left, right = null) {
    if (isRationalFunction(left) || isPolynomial(left)) return left.variable;
    if (isRationalFunction(right) || isPolynomial(right)) return right.variable;
    return "x";
}

function rationalOperation(operator, left, right, context, evaluate) {
    const variable = fieldVariable(left, right);
    const a = operandParts(left, variable, context, evaluate);
    const b = operandParts(right, variable, context, evaluate);
    let numerator;
    let denominator;
    if (operator === "ADD" || operator === "SUB") {
        numerator = add(multiply(a.numerator, b.denominator), multiply(b.numerator, a.denominator), operator === "SUB");
        denominator = multiply(a.denominator, b.denominator);
    } else if (operator === "MUL") {
        numerator = multiply(a.numerator, b.numerator);
        denominator = multiply(a.denominator, b.denominator);
    } else if (operator === "DIV") {
        numerator = multiply(a.numerator, b.denominator);
        denominator = multiply(a.denominator, b.numerator);
    } else {
        throw new Error(`Unsupported RationalFunction operation ${operator}`);
    }
    return fromCoefficientPair(numerator, denominator, variable, context, [{ operation: operator, inputs: [left, right] }]);
}

function integerExponent(value) {
    if (value instanceof Integer) return value.value;
    if (value instanceof Rational && value.denominator === 1n) return value.numerator;
    return null;
}

function coefficientPower(base, exponent) {
    let result = [one()];
    let factor = base;
    let remaining = exponent;
    while (remaining > 0n) {
        if (remaining % 2n === 1n) result = multiply(result, factor);
        remaining /= 2n;
        if (remaining > 0n) factor = multiply(factor, factor);
    }
    return result;
}

function rationalPower(value, exponentValue, context, evaluate) {
    const exponent = integerExponent(exponentValue);
    if (exponent === null) throw new Error("RationalFunction powers require an exact integer exponent");
    const parts = isRationalFunction(value)
        ? metadataCoefficients(value, context, evaluate)
        : { numerator: exactPolynomialCoefficients(value, context, evaluate, "Polynomial power"), denominator: [one()] };
    const magnitude = exponent < 0n ? -exponent : exponent;
    const numerator = coefficientPower(parts.numerator, magnitude);
    const denominator = coefficientPower(parts.denominator, magnitude);
    return fromCoefficientPair(
        exponent < 0n ? denominator : numerator,
        exponent < 0n ? numerator : denominator,
        value.variable,
        context,
        [{ operation: "POW", inputs: [value, exponentValue] }],
    );
}

function rationalFunctionsEqual(left, right, context, evaluate) {
    const variable = fieldVariable(left, right);
    try {
        const a = operandParts(left, variable, context, evaluate);
        const b = operandParts(right, variable, context, evaluate);
        const canonicalA = canonicalPair(a.numerator, a.denominator);
        const canonicalB = canonicalPair(b.numerator, b.denominator);
        return coefficientsEqual(canonicalA.numerator, canonicalB.numerator)
            && coefficientsEqual(canonicalA.denominator, canonicalB.denominator);
    } catch {
        return false;
    }
}

function isFieldOperand(value) {
    return isRationalFunction(value) || isPolynomial(value) || isExactScalar(value);
}

export function installRationalFunctionOperators(registry) {
    if (!registry) return;
    const installBinary = (name, prepare, impl) => registry.installVariant(name, {
        name: `RationalFunction.${name}`,
        priority: 270,
        prepare(args) { return args.length === 2 && prepare(args[0], args[1]) ? { args } : false; },
        impl,
    });
    for (const name of ["ADD", "SUB", "MUL"]) {
        installBinary(name,
            (left, right) => (isRationalFunction(left) || isRationalFunction(right)) && isFieldOperand(left) && isFieldOperand(right),
            ([left, right], context, evaluate) => rationalOperation(name, left, right, context, evaluate));
    }
    installBinary("DIV",
        (left, right) => isFieldOperand(left) && isFieldOperand(right)
            && (isRationalFunction(left) || isRationalFunction(right) || isPolynomial(right)),
        ([left, right], context, evaluate) => rationalOperation("DIV", left, right, context, evaluate));
    installBinary("POW",
        (left, right) => (isRationalFunction(left) || (isPolynomial(left) && (integerExponent(right) ?? 0n) < 0n))
            && integerExponent(right) !== null,
        ([left, right], context, evaluate) => rationalPower(left, right, context, evaluate));
    for (const name of ["EQ", "NEQ"]) {
        installBinary(name,
            (left, right) => (isRationalFunction(left) || isRationalFunction(right)) && isFieldOperand(left) && isFieldOperand(right),
            ([left, right], context, evaluate) => {
                const equal = rationalFunctionsEqual(left, right, context, evaluate);
                return (name === "EQ" ? equal : !equal) ? int(1) : null;
            });
    }
    registry.installVariant("NEG", {
        name: "RationalFunction.NEG",
        priority: 270,
        prepare(args) { return args.length === 1 && isRationalFunction(args[0]) ? { args } : false; },
        impl: ([value], context, evaluate) => rationalOperation("MUL", value, int(-1), context, evaluate),
    });
}

export function rationalFunctionRecord(value, context, evaluate) {
    const rationalFunction = requireRationalFunction(value);
    const coefficients = metadataCoefficients(rationalFunction, context, evaluate);
    return rixMap([
        ["schema", str(RATIONAL_FUNCTION_SCHEMA)],
        ["variable", str(rationalFunction.variable)],
        ["numerator", seq(coefficients.numerator)],
        ["denominator", seq(coefficients.denominator)],
        ["canonical", int(1)],
        ["equalityPolicy", str(rationalFunction.equalityPolicy)],
        ["domainPolicy", str(rationalFunction.domainPolicy)],
    ]);
}

function method(name, impl) {
    return { type: "method_builtin", name, impl };
}

function conversionMethod(args, context, evaluate) {
    if (args.length > 2) throw new Error(".R accepts only an optional variable name");
    const [source, requestedValue = null] = args;
    const requested = variableName(requestedValue, null);
    if (isRationalFunction(source)) {
        if (requested && requested !== source.variable) throw new Error(".R cannot rename an existing RationalFunction");
        return source;
    }
    if (isPolynomial(source)) {
        if (requested && requested !== source.variable) throw new Error(".R cannot rename an existing Polynomial");
        return fromPolynomialPair(source, one(), requested, context, evaluate, [{ operation: "Lift" }]);
    }
    const spec = getAttachedSpec(source);
    if (spec) return fromSpec(spec, requested, context, evaluate, [{ operation: "SymbolicSpec" }]);
    if (source?.type?.startsWith?.("structural_") || source?.constructor?.name === "Fraction") {
        return structuralToRationalFunction(source, requested, context, evaluate, [{ operation: "StructuralForm" }]);
    }
    return createRationalFunction([source], context, evaluate);
}

export function registerRationalFunctionMethods(systemContext, owner = {}) {
    const register = (typeName, name, impl) => systemContext.registerMethod(typeName, name, method(name, impl), owner);
    for (const typeName of ["symbolic_spec", "structural_form", "structural_symbol", "structural_literal", "Polynomial"]) {
        register(typeName, "R", conversionMethod);
        register(typeName, "RationalFunction", conversionMethod);
    }
    register("RationalFunction", "R", ([value]) => value);
    register("RationalFunction", "RationalFunction", ([value]) => value);
    register("RationalFunction", "Numerator", ([value]) => rationalFunctionMetadata(requireRationalFunction(value)).numerator);
    register("RationalFunction", "Denominator", ([value]) => rationalFunctionMetadata(requireRationalFunction(value)).denominator);
    register("RationalFunction", "Variable", ([value]) => str(requireRationalFunction(value).variable));
    register("RationalFunction", "Spec", ([value]) => getAttachedSpec(requireRationalFunction(value)));
    register("RationalFunction", "Record", ([value], context, evaluate) => rationalFunctionRecord(value, context, evaluate));
    register("RationalFunction", "Evaluate", ([value, argument], context, evaluate) => callWithConcreteArgs(value, [argument], context, evaluate));
    register("RationalFunction", "Canonical", ([value]) => value);
    register("RationalFunction", "Cancel", ([value]) => value);
    register("RationalFunction", "IsPolynomial", ([value], context, evaluate) => {
        const denominator = metadataCoefficients(value, context, evaluate).denominator;
        return denominator.length === 1 && denominator[0].equals(one()) ? int(1) : null;
    });
    register("RationalFunction", "ToPolynomial", ([value], context, evaluate) => {
        const rationalFunction = requireRationalFunction(value);
        const coefficients = metadataCoefficients(value, context, evaluate);
        if (!(coefficients.denominator.length === 1 && coefficients.denominator[0].equals(one()))) {
            throw new Error("RationalFunction.ToPolynomial requires denominator 1");
        }
        return rationalFunctionMetadata(rationalFunction).numerator;
    });
    register("RationalFunction", "Domain", ([value]) => {
        const rationalFunction = requireRationalFunction(value);
        return rixMap([
            ["policy", str(rationalFunction.domainPolicy)],
            ["denominator", rationalFunctionMetadata(rationalFunction).denominator],
            ["condition", str("reduced denominator != 0")],
            ["cancelledInputRestrictionsPreserved", int(0)],
        ]);
    });
    register("RationalFunction", "Compose", ([value, argument], context, evaluate) => callWithConcreteArgs(value, [argument], context, evaluate));
}

function modifierNames(value) {
    if (!value) return [];
    return values(value, "RationalFunction parser modifiers").map((item) => text(item));
}

function parseVariableModifier(modifiers) {
    const matches = modifiers.map((modifier) => String(modifier).match(/^VAR\(([^)]+)\)$/iu)).filter(Boolean);
    if (matches.length > 1) throw new Error(".ratfun accepts only one Var(name) modifier");
    const unsupported = modifiers.filter((modifier) => !/^VAR\([^)]+\)$/iu.test(String(modifier)) && !/^FUN$/iu.test(String(modifier)));
    if (unsupported.length) throw new Error(`Unknown .ratfun modifier${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}`);
    return matches.length ? variableName(matches[0][1]) : null;
}

function parseRationalFunction(args, context, evaluate) {
    const body = text(args[1]);
    if (body === null) throw new Error(".ratfun.Parse body must be a string");
    const variable = parseVariableModifier(modifierNames(args[2]));
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
    return structuralToRationalFunction(structural, variable, context, evaluate, [{ operation: ".ratfun.Parse" }]);
}

export function createRatfunPluginValue() {
    const constructor = (args, context, evaluate) => createRationalFunction(args, context, evaluate);
    const parseMethod = method("Parse", parseRationalFunction);
    const modifier = (name) => method(name, () => {
        throw new Error(`.${name} is a backtick parser modifier, not a callable method`);
    });
    const entriesMap = new Map([
        ["RationalFunction", constructor],
        ["RATIONALFUNCTION", constructor],
    ]);
    return {
        type: "rational_function_plugin",
        entries: entriesMap,
        _ext: new Map([
            ["PARSE", parseMethod],
            ["Parse", parseMethod],
            ["VAR", modifier("Var")],
            ["Var", modifier("Var")],
            ["FUN", modifier("Fun")],
            ["Fun", modifier("Fun")],
            ["RATIONALFUNCTION", method("RationalFunction", ([, ...args], context, evaluate) => createRationalFunction(args, context, evaluate))],
            ["immutable", int(1)],
        ]),
    };
}
