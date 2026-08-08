/** Semantic callable univariate polynomials backed by exact symbolic IR. */

import { Integer, Rational } from "@ratmath/core";
import { parse } from "../../src/parser/parser.js";
import { lower } from "../../src/eval/lower.js";
import { callWithConcreteArgs } from "../../src/eval/functions/functions.js";
import {
    cloneSymbolicIr,
    combineSymbolic,
    createSymbolicSpec,
    exactToIr,
    expressionOf,
    getAttachedSpec,
    polyFromSpec,
    polynomialDegree,
    polynomialFromIr,
    polynomialToIr,
    sameIr,
    symbolicLiteral,
    symbolicRetrieve,
} from "../../src/eval/functions/symbolic.js";
import {
    parseStructuralArithmetic,
    sortedStructuralFreeSymbols,
    structuralValueToIr,
} from "../../src/runtime/structural-arithmetic.js";

export const POLYNOMIAL_SCHEMA = "rix.polynomial@1";

const int = (value) => new Integer(BigInt(value));
const str = (value) => ({ type: "string", value: String(value) });
const seq = (values) => ({ type: "sequence", values });
const rixMap = (entries) => ({ type: "map", entries: new Map(entries) });

function emptyParams() {
    return {
        positional: [], keyword: [], conditionals: [], prep: [], prepStrict: false, metadata: {},
    };
}

function text(value, fallback = null) {
    if (value?.type === "string") return value.value;
    return typeof value === "string" ? value : fallback;
}

function values(value, label) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.values)) return value.values;
    throw new Error(`${label} must be an array, tuple, or sequence`);
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

function variableName(value, fallback = null) {
    const result = text(value, fallback);
    if (result === null) return null;
    if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(result)) {
        throw new Error("Polynomial variable must be a simple identifier or colon-string");
    }
    return result;
}

function isExactScalar(value) {
    return value instanceof Integer || value instanceof Rational || typeof value === "bigint" || Number.isInteger(value);
}

function isExactZero(value) {
    if (value instanceof Integer) return value.value === 0n;
    if (value instanceof Rational) return value.numerator === 0n;
    if (typeof value === "bigint") return value === 0n;
    return value === 0;
}

function polynomialMetadata(value) {
    return value?._polynomial?.schema === POLYNOMIAL_SCHEMA ? value._polynomial : null;
}

export function isPolynomial(value) {
    return Boolean(polynomialMetadata(value));
}

export function requirePolynomial(value, label = "value") {
    if (!isPolynomial(value)) throw new Error(`${label} must be a Polynomial`);
    return value;
}

function canonicalSpec(source, variable, polynomial, context = null) {
    return createSymbolicSpec({
        inputs: [variable],
        outputMode: "expression",
        expression: polynomialToIr(polynomial, symbolicRetrieve(variable)),
        imports: source?.imports || [],
        // Structural/spec input deliberately retains its lexical cells. An
        // exact coefficient vector has no contextual reads and therefore
        // should not acquire unrelated cells from the caller's whole scope.
        __closureScopes: source?.__closureScopes || [],
        origin: source?.origin || ".poly",
        transform: source?.transform || { operation: "Polynomial" },
    }, context);
}

function decoratePolynomial(callable, spec, variable, polynomial, provenance = []) {
    const degree = polynomialDegree(polynomial);
    callable.__name = "Polynomial";
    callable.schema = POLYNOMIAL_SCHEMA;
    callable.variable = variable;
    callable.degree = degree === null ? -1 : Number(degree);
    callable.canonical = true;
    callable.equalityPolicy = "canonical-symbolic-coefficients";
    callable.provenance = Object.freeze([...provenance]);
    callable._polynomial = Object.freeze({
        schema: POLYNOMIAL_SCHEMA,
        variable,
        coefficients: new Map(Array.from(polynomial, ([power, coefficient]) => [power, cloneSymbolicIr(coefficient)])),
    });
    if (!(callable._ext instanceof Map)) callable._ext = new Map();
    callable._ext.set("__type", str("Polynomial"));
    callable._ext.set("_type", str("polynomial"));
    callable._ext.set("_symbolicKind", str("Polynomial"));
    callable._ext.set("immutable", int(1));
    callable._ext.set("_spec", spec);
    callable._spec = spec;
    return callable;
}

function fromSpec(spec, requestedVariable, context, provenance = []) {
    if (!spec || spec.type !== "symbolic_spec") throw new Error("Polynomial conversion expects a symbolic specification");
    const variable = requestedVariable ?? (spec.inputs.length === 1 ? spec.inputs[0] : null);
    if (!variable) throw new Error("Polynomial conversion needs one declared input or an explicit variable");
    if (spec.inputs.length > 1 || (spec.inputs.length === 1 && spec.inputs[0] !== variable)) {
        throw new Error(`Polynomial input must be exactly '${variable}'; use a single-input symbolic spec`);
    }
    const polynomial = polynomialFromIr(expressionOf(spec), variable);
    const normalized = canonicalSpec(spec, variable, polynomial, context);
    return decoratePolynomial(polyFromSpec(normalized), normalized, variable, polynomial, provenance);
}

function coefficientsToPolynomial(coefficients, variable, context, provenance = []) {
    if (coefficients.length === 0) throw new Error("Polynomial coefficients cannot be empty");
    const polynomial = new Map();
    const degree = coefficients.length - 1;
    coefficients.forEach((coefficient, index) => {
        if (!isExactScalar(coefficient)) {
            throw new Error(`Polynomial coefficient ${index + 1} must be an exact integer or rational; use a symbolic spec for contextual coefficients`);
        }
        if (!isExactZero(coefficient)) polynomial.set(BigInt(degree - index), exactToIr(coefficient));
    });
    const spec = canonicalSpec(null, variable, polynomial, context);
    return decoratePolynomial(polyFromSpec(spec), spec, variable, polynomial, provenance);
}

function structuralToPolynomial(value, requestedVariable, context, provenance = []) {
    const symbols = sortedStructuralFreeSymbols(value);
    const variable = requestedVariable ?? (symbols.length === 1 ? symbols[0] : symbols.length === 0 ? "x" : null);
    if (!variable) {
        throw new Error(`Polynomial structural form has multiple symbols (${symbols.join(", ")}); select one with .P(:name)`);
    }
    const expression = structuralValueToIr(value);
    const source = createSymbolicSpec({
        inputs: [variable], outputMode: "expression", expression, origin: ".poly structural form",
    }, context);
    return fromSpec(source, variable, context, provenance);
}

export function createPolynomial(args, context = null) {
    const [source, second = null] = args;
    if (isPolynomial(source)) return source;
    const sourceEntries = entries(source);
    const optionEntries = entries(second);
    const requested = variableName(
        field(optionEntries, "variable", sourceEntries ? field(sourceEntries, "variable") : second),
        null,
    );
    const coefficientSource = sourceEntries ? field(sourceEntries, "coefficients") : source;
    if (sourceEntries && coefficientSource === null) {
        throw new Error("Polynomial record requires coefficients");
    }
    if (Array.isArray(coefficientSource) || Array.isArray(coefficientSource?.values)) {
        const coefficients = values(coefficientSource, "Polynomial coefficients");
        return coefficientsToPolynomial(coefficients, requested ?? "x", context, [{ operation: "Coefficients" }]);
    }
    const spec = getAttachedSpec(source);
    if (spec) return fromSpec(spec, requested, context, [{ operation: "SymbolicSpec" }]);
    if (source?.type?.startsWith?.("structural_") || source?.constructor?.name === "Fraction") {
        return structuralToPolynomial(source, requested, context, [{ operation: "StructuralForm" }]);
    }
    throw new Error("Polynomial expects coefficients, a structural form, a symbolic spec, or a spec-backed function");
}

function evaluateCoefficient(polynomial, coefficient, context, evaluate) {
    const spec = getAttachedSpec(polynomial);
    return callWithConcreteArgs({
        type: "lambda",
        params: emptyParams(),
        body: cloneSymbolicIr(coefficient),
        __closureScopes: spec?.__closureScopes || [],
    }, [], context, evaluate);
}

export function polynomialCoefficients(polynomial, context, evaluate, { trim = true } = {}) {
    requirePolynomial(polynomial);
    const metadata = polynomialMetadata(polynomial);
    const declaredDegree = polynomialDegree(metadata.coefficients);
    const result = [];
    if (declaredDegree === null) return [new Rational(0n, 1n)];
    for (let power = declaredDegree; power >= 0n; power--) {
        const coefficient = metadata.coefficients.get(power) || symbolicLiteral(0);
        result.push(evaluateCoefficient(polynomial, coefficient, context, evaluate));
    }
    if (trim) while (result.length > 1 && isExactZero(result[0])) result.shift();
    return result;
}

export function polynomialRecord(polynomial, context, evaluate) {
    return rixMap([
        ["schema", str(POLYNOMIAL_SCHEMA)],
        ["variable", str(requirePolynomial(polynomial).variable)],
        ["coefficients", seq(polynomialCoefficients(polynomial, context, evaluate))],
        ["canonical", int(1)],
        ["equalityPolicy", str(polynomial.equalityPolicy)],
    ]);
}

export function polynomialDegreeValue(polynomial, context, evaluate) {
    const coefficients = polynomialCoefficients(polynomial, context, evaluate);
    return new Integer(coefficients.length === 1 && isExactZero(coefficients[0]) ? -1n : BigInt(coefficients.length - 1));
}

function closureCells(spec) {
    const result = new Map();
    for (const scope of spec?.__closureScopes || []) {
        const bindings = scope?.bindings || scope;
        if (bindings instanceof Map) for (const [name, cell] of bindings) result.set(name, cell);
    }
    return result;
}

export function polynomialsEqual(left, right) {
    if (!isPolynomial(left) || !isPolynomial(right) || left.variable !== right.variable) return false;
    const a = polynomialMetadata(left).coefficients;
    const b = polynomialMetadata(right).coefficients;
    if (a.size !== b.size) return false;
    for (const [power, coefficient] of a) if (!b.has(power) || !sameIr(coefficient, b.get(power))) return false;
    const leftCells = closureCells(getAttachedSpec(left));
    const rightCells = closureCells(getAttachedSpec(right));
    const names = new Set([...leftCells.keys(), ...rightCells.keys()]);
    for (const name of names) if (leftCells.get(name) !== rightCells.get(name)) return false;
    return true;
}

function polynomialVariable(left, right = null) {
    if (isPolynomial(left)) return left.variable;
    if (isPolynomial(right)) return right.variable;
    return null;
}

function symbolicPolynomial(operator, left, right, context) {
    if (isPolynomial(left) && isPolynomial(right) && left.variable !== right.variable) {
        throw new Error(`Polynomial operators require the same variable, received '${left.variable}' and '${right.variable}'`);
    }
    const combined = combineSymbolic(operator, left, right);
    return fromSpec(getAttachedSpec(combined), polynomialVariable(left, right), context, [{ operation: operator, inputs: [left, right] }]);
}

function nonnegativeExponent(value) {
    if (value instanceof Integer) return value.value >= 0n;
    return value instanceof Rational && value.denominator === 1n && value.numerator >= 0n;
}

export function installPolynomialOperators(registry) {
    if (!registry) return;
    const binary = (name, prepare, impl) => registry.installVariant(name, {
        name: `Polynomial.${name}`,
        priority: 250,
        prepare(args) { return args.length === 2 && prepare(args[0], args[1]) ? { args } : false; },
        impl,
    });
    for (const name of ["ADD", "SUB", "MUL"]) {
        binary(name,
            (left, right) => (isPolynomial(left) || isPolynomial(right))
                && (isPolynomial(left) || isExactScalar(left))
                && (isPolynomial(right) || isExactScalar(right)),
            (args, context) => symbolicPolynomial(name, args[0], args[1], context));
    }
    binary("DIV", (left, right) => isPolynomial(left) && isExactScalar(right),
        (args, context) => symbolicPolynomial("DIV", args[0], args[1], context));
    binary("POW", (left, right) => isPolynomial(left) && nonnegativeExponent(right),
        (args, context) => symbolicPolynomial("POW", args[0], args[1], context));
    binary("EQ", (left, right) => isPolynomial(left) && isPolynomial(right),
        ([left, right]) => polynomialsEqual(left, right) ? int(1) : null);
    binary("NEQ", (left, right) => isPolynomial(left) && isPolynomial(right),
        ([left, right]) => polynomialsEqual(left, right) ? null : int(1));
    registry.installVariant("DIV", {
        name: "Polynomial.DIV.RationalFunction",
        priority: 249,
        prepare(args) { return args.length === 2 && isPolynomial(args[1]) ? { args } : false; },
        impl() {
            throw new Error("Division by a Polynomial is a rational-function operation; load .ratfun (or .algebra), or use //, %, or /% for quotient/remainder");
        },
    });
    registry.installVariant("POW", {
        name: "Polynomial.POW.Unsupported",
        priority: 249,
        prepare(args) { return args.length === 2 && isPolynomial(args[0]) && !nonnegativeExponent(args[1]) ? { args } : false; },
        impl() {
            throw new Error("Polynomial powers require a nonnegative exact integer exponent");
        },
    });
    registry.installVariant("NEG", {
        name: "Polynomial.NEG",
        priority: 250,
        prepare(args) { return args.length === 1 && isPolynomial(args[0]) ? { args } : false; },
        impl: ([value], context) => symbolicPolynomial("NEG", value, null, context),
    });
}

function method(name, impl) {
    return { type: "method_builtin", name, impl };
}

function conversionMethod(args, context) {
    return createPolynomial(args, context);
}

export function registerPolynomialMethods(systemContext, owner = {}) {
    const register = (typeName, name, impl) => systemContext.registerMethod(typeName, name, method(name, impl), owner);
    for (const typeName of ["symbolic_spec", "structural_form", "structural_symbol", "structural_literal"]) {
        register(typeName, "P", conversionMethod);
        register(typeName, "Polynomial", conversionMethod);
    }
    register("Polynomial", "P", ([value]) => value);
    register("Polynomial", "Polynomial", ([value]) => value);
    register("Polynomial", "Coefficients", ([value], context, evaluate) => seq(polynomialCoefficients(value, context, evaluate)));
    register("Polynomial", "Record", ([value], context, evaluate) => polynomialRecord(value, context, evaluate));
    register("Polynomial", "Degree", ([value], context, evaluate) => polynomialDegreeValue(value, context, evaluate));
    register("Polynomial", "Variable", ([value]) => str(requirePolynomial(value).variable));
    register("Polynomial", "Spec", ([value]) => getAttachedSpec(requirePolynomial(value)));
    register("Polynomial", "Evaluate", ([value, argument], context, evaluate) => callWithConcreteArgs(value, [argument], context, evaluate));
}

function modifierNames(value) {
    if (!value) return [];
    return values(value, "Polynomial parser modifiers").map((item) => text(item));
}

function parseVariableModifier(modifiers) {
    const matches = modifiers.map((modifier) => String(modifier).match(/^VAR\(([^)]+)\)$/iu)).filter(Boolean);
    if (matches.length > 1) throw new Error(".poly accepts only one Var(name) modifier");
    const unsupported = modifiers.filter((modifier) => !/^VAR\([^)]+\)$/iu.test(String(modifier)) && !/^FUN$/iu.test(String(modifier)));
    if (unsupported.length) throw new Error(`Unknown .poly modifier${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}`);
    return matches.length ? variableName(matches[0][1]) : null;
}

function parsePolynomial(args, context, evaluate) {
    const body = text(args[1]);
    if (body === null) throw new Error(".poly.Parse body must be a string");
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
    return structuralToPolynomial(structural, variable, context, [{ operation: ".poly.Parse" }]);
}

export function createPolyPluginValue() {
    const constructor = (args, context) => createPolynomial(args, context);
    const parse = method("Parse", parsePolynomial);
    const modifier = (name) => method(name, () => {
        throw new Error(`.${name} is a backtick parser modifier, not a callable method`);
    });
    const entriesMap = new Map([
        ["Polynomial", constructor],
        ["POLYNOMIAL", constructor],
    ]);
    return {
        type: "polynomial_plugin",
        entries: entriesMap,
        _ext: new Map([
            ["PARSE", parse],
            ["Parse", parse],
            ["VAR", modifier("Var")],
            ["Var", modifier("Var")],
            ["FUN", modifier("Fun")],
            ["Fun", modifier("Fun")],
            ["POLYNOMIAL", method("Polynomial", ([, ...args], context) => createPolynomial(args, context))],
            ["immutable", int(1)],
        ]),
    };
}
