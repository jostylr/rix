/** Form-preserving callable polynomial and rational expressions. */

import { Fraction, Integer, Rational } from "@ratmath/core";
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
    sameIr,
    symbolicCapabilities,
    symbolicIr,
    symbolicLiteral,
} from "../../src/eval/functions/symbolic.js";
import {
    parseStructuralArithmetic,
    sortedStructuralFreeSymbols,
    structuralValueToIr,
} from "../../src/runtime/structural-arithmetic.js";
import { createPolynomial, isPolynomial } from "../poly/polynomial.js";
import {
    createRationalFunction,
    isRationalFunction,
    rationalFunctionsEqual,
} from "../ratfun/rational-function.js";

export const FRACTION_FUNCTION_SCHEMA = "rix.fraction-function@1";

const int = (value) => new Integer(BigInt(value));
const str = (value) => ({ type: "string", value: String(value) });
const seq = (values) => ({ type: "sequence", values });
const rixMap = (entries) => ({ type: "map", entries: new Map(entries) });

function text(value, fallback = null) {
    if (value?.type === "string") return value.value;
    return typeof value === "string" ? value : fallback;
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
        throw new Error("FractionFunction variable must be a simple identifier or colon-string");
    }
    return result;
}

function metadata(value) {
    return value?._fractionFunction?.schema === FRACTION_FUNCTION_SCHEMA ? value._fractionFunction : null;
}

export function isFractionFunction(value) {
    return Boolean(metadata(value));
}

export function requireFractionFunction(value, label = "value") {
    if (!isFractionFunction(value)) throw new Error(`${label} must be a FractionFunction`);
    return value;
}

function isExactScalar(value) {
    return value instanceof Integer || value instanceof Rational || value instanceof Fraction
        || typeof value === "bigint" || Number.isInteger(value);
}

function formalExactIr(value) {
    if (value instanceof Fraction) {
        return symbolicIr("DIV", symbolicLiteral(value.numerator), symbolicLiteral(value.denominator));
    }
    return exactToIr(value);
}

function exactInteger(value) {
    if (value instanceof Integer) return value.value;
    if (value instanceof Rational && value.denominator === 1n) return value.numerator;
    return null;
}

function cloneSpec(source, expression = expressionOf(source), options = {}) {
    return createSymbolicSpec({
        inputs: options.inputs || source.inputs,
        outputMode: "expression",
        expression,
        imports: source.imports || [],
        __closureScopes: options.__closureScopes || source.__closureScopes || [],
        origin: options.origin || source.origin || ".fracfun",
        transform: options.transform || source.transform || null,
    });
}

function scalarSpec(value, variable = null) {
    return createSymbolicSpec({
        inputs: variable ? [variable] : [],
        outputMode: "expression",
        expression: formalExactIr(value),
        origin: ".fracfun exact scalar",
        __closureScopes: [],
    });
}

function operandSpecs(value, context) {
    if (isFractionFunction(value)) {
        const info = metadata(value);
        return { display: info.displaySpec, evaluation: info.evaluationSpec, variable: value.variable };
    }
    const attached = getAttachedSpec(value);
    if (attached) {
        return { display: attached, evaluation: attached, variable: attached.inputs.length === 1 ? attached.inputs[0] : null };
    }
    if (isExactScalar(value)) {
        const spec = scalarSpec(value);
        return { display: spec, evaluation: spec, variable: null };
    }
    throw new Error("FractionFunction arithmetic accepts form functions, symbolic specs, Polynomials, RationalFunctions, and exact scalars");
}

function combinedSpec(operator, left, right = null, kind = "display") {
    const leftSpec = left[kind];
    const rightSpec = right ? right[kind] : null;
    return combineSymbolic(operator, leftSpec, rightSpec);
}

function exactIntegerFromIr(node) {
    if (node?.fn === "LITERAL" && /^-?\d+$/.test(String(node.args[0]))) return BigInt(node.args[0]);
    if (node?.fn === "NEG") {
        const value = exactIntegerFromIr(node.args[0]);
        return value === null ? null : -value;
    }
    return null;
}

function isLiteral(node, value) {
    return node?.fn === "LITERAL" && String(node.args[0]) === String(value);
}

function formalMultiply(left, right) {
    if (isLiteral(left, 0) || isLiteral(right, 0)) return symbolicLiteral(0);
    if (isLiteral(left, 1)) return right;
    if (isLiteral(right, 1)) return left;
    return symbolicIr("MUL", left, right);
}

function formalPower(base, exponent) {
    if (exponent === 0n) return symbolicLiteral(1);
    if (exponent === 1n) return base;
    return symbolicIr("POW", base, symbolicLiteral(exponent));
}

function rationalParts(node) {
    if (node?.fn === "NEG") {
        const value = rationalParts(node.args[0]);
        return { numerator: symbolicIr("NEG", value.numerator), denominator: value.denominator };
    }
    if (["ADD", "SUB", "MUL", "DIV"].includes(node?.fn)) {
        const left = rationalParts(node.args[0]);
        const right = rationalParts(node.args[1]);
        if (node.fn === "ADD" || node.fn === "SUB") return {
            numerator: symbolicIr(node.fn,
                formalMultiply(left.numerator, right.denominator),
                formalMultiply(right.numerator, left.denominator)),
            denominator: formalMultiply(left.denominator, right.denominator),
        };
        if (node.fn === "MUL") return {
            numerator: formalMultiply(left.numerator, right.numerator),
            denominator: formalMultiply(left.denominator, right.denominator),
        };
        return {
            numerator: formalMultiply(left.numerator, right.denominator),
            denominator: formalMultiply(left.denominator, right.numerator),
        };
    }
    if (node?.fn === "POW") {
        const exponent = exactIntegerFromIr(node.args[1]);
        if (exponent !== null) {
            const base = rationalParts(node.args[0]);
            const magnitude = exponent < 0n ? -exponent : exponent;
            const numerator = formalPower(base.numerator, magnitude);
            const denominator = formalPower(base.denominator, magnitude);
            return exponent < 0n
                ? { numerator: denominator, denominator: numerator }
                : { numerator, denominator };
        }
    }
    return { numerator: cloneSymbolicIr(node), denominator: symbolicLiteral(1) };
}

function restrictionsFromIr(node, result = []) {
    if (!node?.fn) return result;
    if (node.fn === "DIV") result.push(cloneSymbolicIr(node.args[1]));
    if (node.fn === "POW") {
        const exponent = exactIntegerFromIr(node.args[1]);
        if (exponent !== null && exponent < 0n) result.push(cloneSymbolicIr(node.args[0]));
    }
    for (const arg of node.args || []) if (arg?.fn) restrictionsFromIr(arg, result);
    return result.filter((candidate, index) => !result.slice(0, index).some((prior) => sameIr(prior, candidate)));
}

function inferVariable(displaySpec, evaluationSpec, requested = null) {
    const names = [...new Set([...(displaySpec.inputs || []), ...(evaluationSpec.inputs || [])])];
    if (requested) {
        if (names.some((name) => name !== requested)) {
            throw new Error(`FractionFunction input must be exactly '${requested}'`);
        }
        return requested;
    }
    if (names.length > 1) throw new Error(`FractionFunction operands use different variables (${names.join(", ")})`);
    return names[0] || "x";
}

function hasContextualReads(node, inputs) {
    if (!node?.fn) return false;
    if ((node.fn === "RETRIEVE" && !inputs.has(node.args[0])) || node.fn === "OUTER_RETRIEVE") return true;
    return (node.args || []).some((arg) => arg?.fn && hasContextualReads(arg, inputs));
}

function canonicalCaches(displaySpec, context, evaluate) {
    let rationalFunction = null;
    let polynomial = null;
    let error = null;
    if (hasContextualReads(expressionOf(displaySpec), new Set(displaySpec.inputs || []))) {
        return {
            rationalFunction: null,
            polynomial: null,
            error: "Contextual coefficients are projected on demand to avoid stale canonical caches",
        };
    }
    try {
        rationalFunction = createRationalFunction([displaySpec], context, evaluate);
        try {
            polynomial = createPolynomial([displaySpec], context, evaluate);
        } catch {
            // A proper fraction has no Polynomial projection.
        }
    } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
    }
    return { rationalFunction, polynomial, error };
}

function decorate(displaySpec, evaluationSpec, context, evaluate, provenance = []) {
    const variable = inferVariable(displaySpec, evaluationSpec);
    const normalizedDisplay = cloneSpec(displaySpec, expressionOf(displaySpec), { inputs: [variable] });
    const normalizedEvaluation = cloneSpec(evaluationSpec, expressionOf(evaluationSpec), { inputs: [variable] });
    const callable = polyFromSpec(normalizedDisplay);
    // The attached spec is the visible form; the lambda body and closure are
    // the source-domain-preserving evaluation form.
    callable.body = cloneSymbolicIr(expressionOf(normalizedEvaluation));
    callable.__closureScopes = normalizedEvaluation.__closureScopes || [];
    callable.__name = "FractionFunction";
    callable.schema = FRACTION_FUNCTION_SCHEMA;
    callable.variable = variable;
    callable.canonical = false;
    callable.equalityPolicy = "structural-form";
    callable.domainPolicy = "original-denominators-nonzero";
    callable.provenance = Object.freeze([...provenance]);
    const caches = canonicalCaches(normalizedDisplay, context, evaluate);
    callable._fractionFunction = Object.freeze({
        schema: FRACTION_FUNCTION_SCHEMA,
        displaySpec: normalizedDisplay,
        evaluationSpec: normalizedEvaluation,
        restrictions: Object.freeze(restrictionsFromIr(expressionOf(normalizedEvaluation))),
        canonicalRationalFunction: caches.rationalFunction,
        canonicalPolynomial: caches.polynomial,
        canonicalError: caches.error,
    });
    if (!(callable._ext instanceof Map)) callable._ext = new Map();
    callable._ext.set("__type", str("FractionFunction"));
    callable._ext.set("_type", str("fraction_function"));
    callable._ext.set("_symbolicKind", str("FractionFunction"));
    callable._ext.set("immutable", int(1));
    callable._ext.set("_spec", normalizedDisplay);
    callable._spec = normalizedDisplay;
    return callable;
}

function fromSpec(spec, requestedVariable, context, evaluate, provenance = []) {
    if (!spec || spec.type !== "symbolic_spec") throw new Error("FractionFunction conversion expects a symbolic specification");
    const variable = requestedVariable ?? (spec.inputs.length === 1 ? spec.inputs[0] : spec.inputs.length === 0 ? "x" : null);
    if (!variable) throw new Error("FractionFunction conversion needs one declared input or an explicit variable");
    if (spec.inputs.length > 1 || (spec.inputs.length === 1 && spec.inputs[0] !== variable)) {
        throw new Error(`FractionFunction input must be exactly '${variable}'`);
    }
    const normalized = cloneSpec(spec, expressionOf(spec), { inputs: [variable] });
    return decorate(normalized, normalized, context, evaluate, provenance);
}

function structuralToFractionFunction(value, requestedVariable, context, evaluate, provenance = []) {
    const symbols = sortedStructuralFreeSymbols(value);
    const variable = requestedVariable ?? (symbols.length === 1 ? symbols[0] : symbols.length === 0 ? "x" : null);
    if (!variable) {
        throw new Error(`FractionFunction form has multiple symbols (${symbols.join(", ")}); select one with .ff(:name)`);
    }
    const spec = createSymbolicSpec({
        inputs: [variable],
        outputMode: "expression",
        expression: structuralValueToIr(value),
        origin: ".fracfun structural form",
    }, context);
    return decorate(spec, spec, context, evaluate, provenance);
}

function pairToFractionFunction(numerator, denominator, context, evaluate, provenance = []) {
    const left = operandSpecs(numerator, context);
    const right = operandSpecs(denominator, context);
    const display = combinedSpec("DIV", left, right, "display");
    const evaluation = combinedSpec("DIV", left, right, "evaluation");
    return decorate(display, evaluation, context, evaluate, provenance);
}

export function createFractionFunction(args, context = null, evaluate = null) {
    const [source, second = null] = args;
    if (isFractionFunction(source) && second === null) return source;
    if (second !== null) return pairToFractionFunction(source, second, context, evaluate, [{ operation: "Pair" }]);
    const spec = getAttachedSpec(source);
    if (spec) return fromSpec(spec, null, context, evaluate, [{ operation: "SymbolicSpec" }]);
    if (isExactScalar(source)) return fromSpec(scalarSpec(source, "x"), "x", context, evaluate, [{ operation: "ExactScalar" }]);
    if (source?.type?.startsWith?.("structural_") || source?.constructor?.name === "Fraction") {
        return structuralToFractionFunction(source, null, context, evaluate, [{ operation: "StructuralForm" }]);
    }
    throw new Error("FractionFunction expects a form, symbolic spec, Polynomial, RationalFunction, exact scalar, or numerator/denominator pair");
}

function formalOperation(operator, leftValue, rightValue, context, evaluate) {
    const left = operandSpecs(leftValue, context);
    const right = rightValue === null ? null : operandSpecs(rightValue, context);
    const display = combinedSpec(operator, left, right, "display");
    const evaluation = combinedSpec(operator, left, right, "evaluation");
    return decorate(display, evaluation, context, evaluate, [{ operation: operator, inputs: right ? [leftValue, rightValue] : [leftValue] }]);
}

function isFormalOperand(value) {
    return isFractionFunction(value) || isExactScalar(value) || Boolean(getAttachedSpec(value));
}

export function installFractionFunctionOperators(registry) {
    if (!registry) return;
    const binary = (name, prepare, impl) => registry.installVariant(name, {
        name: `FractionFunction.${name}`,
        priority: 290,
        prepare(args) { return args.length === 2 && prepare(args[0], args[1]) ? { args } : false; },
        impl,
    });
    for (const name of ["ADD", "SUB", "MUL", "DIV"]) {
        binary(name,
            (left, right) => (isFractionFunction(left) || isFractionFunction(right)) && isFormalOperand(left) && isFormalOperand(right),
            ([left, right], context, evaluate) => formalOperation(name, left, right, context, evaluate));
    }
    binary("POW", (left, right) => isFractionFunction(left) && exactInteger(right) !== null,
        ([left, right], context, evaluate) => formalOperation("POW", left, right, context, evaluate));
    for (const name of ["EQ", "NEQ"]) {
        binary(name,
            (left, right) => isFractionFunction(left) && isFractionFunction(right),
            ([left, right]) => {
                const equal = left.variable === right.variable
                    && sameIr(expressionOf(metadata(left).displaySpec), expressionOf(metadata(right).displaySpec));
                return (name === "EQ" ? equal : !equal) ? int(1) : null;
            });
    }
    registry.installVariant("NEG", {
        name: "FractionFunction.NEG",
        priority: 290,
        prepare(args) { return args.length === 1 && isFractionFunction(args[0]) ? { args } : false; },
        impl: ([value], context, evaluate) => formalOperation("NEG", value, null, context, evaluate),
    });
}

function transformed(value, direction, args, context, evaluate) {
    const source = requireFractionFunction(value);
    const display = symbolicCapabilities.TRANSFORM.impl([
        metadata(source).displaySpec,
        str(direction),
        ...args,
    ]);
    return decorate(display, metadata(source).evaluationSpec, context, evaluate, [
        ...source.provenance,
        { operation: direction, inputs: args },
    ]);
}

function together(value, context, evaluate) {
    const source = requireFractionFunction(value);
    const displaySpec = metadata(source).displaySpec;
    const parts = rationalParts(expressionOf(displaySpec));
    const expression = symbolicIr("DIV", parts.numerator, parts.denominator);
    return decorate(
        cloneSpec(displaySpec, expression, { transform: { operation: "Together" } }),
        metadata(source).evaluationSpec,
        context,
        evaluate,
        [...source.provenance, { operation: "Together" }],
    );
}

function canonical(value, context, evaluate) {
    const source = requireFractionFunction(value);
    const cached = metadata(source).canonicalRationalFunction;
    if (cached) return cached;
    try {
        return createRationalFunction([metadata(source).displaySpec], context, evaluate);
    } catch (error) {
        throw new Error(`FractionFunction has no exact rational-function projection: ${metadata(source).canonicalError || error.message}`);
    }
}

function polynomial(value, context, evaluate) {
    const source = requireFractionFunction(value);
    const cached = metadata(source).canonicalPolynomial;
    if (cached) return cached;
    try {
        return createPolynomial([metadata(source).displaySpec], context, evaluate);
    } catch (error) {
        throw new Error(`FractionFunction form is not a Polynomial: ${error.message}`);
    }
}

function cancelled(value, context, evaluate) {
    const source = requireFractionFunction(value);
    const reduced = canonical(source, context, evaluate);
    return decorate(
        getAttachedSpec(reduced),
        metadata(source).evaluationSpec,
        context,
        evaluate,
        [...source.provenance, { operation: "Cancel", preservesSourceDomain: true }],
    );
}

function formPart(value, selected, context, evaluate) {
    const source = requireFractionFunction(value);
    const spec = metadata(source).displaySpec;
    const expression = expressionOf(spec);
    const numerator = expression.fn === "DIV" ? expression.args[0] : expression;
    const denominator = expression.fn === "DIV" ? expression.args[1] : symbolicLiteral(1);
    const selectedExpression = selected === "numerator" ? numerator : denominator;
    const part = cloneSpec(spec, selectedExpression, { transform: { operation: selected } });
    return decorate(part, part, context, evaluate, [{ operation: selected, inputs: [source] }]);
}

function restrictionsEqual(left, right) {
    const a = metadata(left).restrictions;
    const b = metadata(right).restrictions;
    return a.length === b.length && a.every((item, index) => sameIr(item, b[index]));
}

function restrictionSpecs(value) {
    const source = requireFractionFunction(value);
    const info = metadata(source);
    return info.restrictions.map((expression) => cloneSpec(info.evaluationSpec, expression, {
        transform: { operation: "DomainRestriction" },
    }));
}

function method(name, impl) {
    return { type: "method_builtin", name, impl };
}

function conversionMethod(args, context, evaluate) {
    if (args.length > 2) throw new Error(".ff accepts only an optional variable name");
    const [source, requestedValue = null] = args;
    const requested = variableName(requestedValue, null);
    if (isFractionFunction(source)) {
        if (requested && requested !== source.variable) throw new Error(".ff cannot rename an existing FractionFunction");
        return source;
    }
    const spec = getAttachedSpec(source);
    if (spec) return fromSpec(spec, requested, context, evaluate, [{ operation: "SymbolicSpec" }]);
    if (source?.type?.startsWith?.("structural_") || source?.constructor?.name === "Fraction") {
        return structuralToFractionFunction(source, requested, context, evaluate, [{ operation: "StructuralForm" }]);
    }
    return createFractionFunction([source], context, evaluate);
}

export function registerFractionFunctionMethods(systemContext, owner = {}) {
    const register = (type, name, impl) => systemContext.registerMethod(type, name, method(name, impl), owner);
    for (const type of [
        "symbolic_spec", "structural_form", "structural_symbol", "structural_literal",
        "Fraction", "Integer", "Rational", "Polynomial", "RationalFunction",
    ]) {
        for (const name of ["ff", "FracFun", "FractionFunction"]) register(type, name, conversionMethod);
    }
    for (const name of ["ff", "FracFun", "FractionFunction"]) register("FractionFunction", name, ([value]) => value);
    register("FractionFunction", "Form", ([value]) => metadata(requireFractionFunction(value)).displaySpec);
    register("FractionFunction", "Spec", ([value]) => metadata(requireFractionFunction(value)).displaySpec);
    register("FractionFunction", "EvaluationSpec", ([value]) => metadata(requireFractionFunction(value)).evaluationSpec);
    register("FractionFunction", "Variable", ([value]) => str(requireFractionFunction(value).variable));
    register("FractionFunction", "Evaluate", ([value, argument], context, evaluate) => callWithConcreteArgs(value, [argument], context, evaluate));
    register("FractionFunction", "Compose", ([value, argument], context, evaluate) => callWithConcreteArgs(value, [argument], context, evaluate));
    register("FractionFunction", "Numerator", ([value], context, evaluate) => formPart(value, "numerator", context, evaluate));
    register("FractionFunction", "Denominator", ([value], context, evaluate) => formPart(value, "denominator", context, evaluate));
    register("FractionFunction", "Together", ([value], context, evaluate) => together(value, context, evaluate));
    register("FractionFunction", "Expand", ([value], context, evaluate) => transformed(value, "expand", [], context, evaluate));
    register("FractionFunction", "Simplify", ([value], context, evaluate) => transformed(value, "identities", [], context, evaluate));
    register("FractionFunction", "Recenter", ([value, center], context, evaluate) => transformed(value, "center", [center], context, evaluate));
    register("FractionFunction", "Cancel", ([value], context, evaluate) => cancelled(value, context, evaluate));
    register("FractionFunction", "Canonical", ([value], context, evaluate) => canonical(value, context, evaluate));
    register("FractionFunction", "R", ([value], context, evaluate) => canonical(value, context, evaluate));
    register("FractionFunction", "Polynomial", ([value], context, evaluate) => polynomial(value, context, evaluate));
    register("FractionFunction", "P", ([value], context, evaluate) => polynomial(value, context, evaluate));
    register("FractionFunction", "CanonicalPolynomial", ([value], context, evaluate) => polynomial(value, context, evaluate));
    register("FractionFunction", "IsPolynomial", ([value]) => metadata(requireFractionFunction(value)).canonicalPolynomial ? int(1) : null);
    register("FractionFunction", "SameForm", ([value, other]) => {
        requireFractionFunction(other, "SameForm operand");
        return value.variable === other.variable
            && sameIr(expressionOf(metadata(value).displaySpec), expressionOf(metadata(other).displaySpec)) ? int(1) : null;
    });
    register("FractionFunction", "Equivalent", ([value, other], context, evaluate) => {
        requireFractionFunction(other, "Equivalent operand");
        return rationalFunctionsEqual(canonical(value, context, evaluate), canonical(other, context, evaluate), context, evaluate) ? int(1) : null;
    });
    register("FractionFunction", "SameFunction", ([value, other], context, evaluate) => {
        requireFractionFunction(other, "SameFunction operand");
        const equivalent = rationalFunctionsEqual(canonical(value, context, evaluate), canonical(other, context, evaluate), context, evaluate);
        return equivalent && restrictionsEqual(value, other) ? int(1) : null;
    });
    register("FractionFunction", "Domain", ([value]) => rixMap([
        ["policy", str("original denominators != 0")],
        ["restrictions", seq(restrictionSpecs(value))],
        ["cancelledRestrictionsPreserved", int(1)],
    ]));
    register("FractionFunction", "ForgetRestrictions", ([value], context, evaluate) => {
        const source = requireFractionFunction(value);
        return decorate(metadata(source).displaySpec, metadata(source).displaySpec, context, evaluate, [
            ...source.provenance, { operation: "ForgetRestrictions" },
        ]);
    });
    register("FractionFunction", "Record", ([value]) => {
        const source = requireFractionFunction(value);
        const info = metadata(source);
        return rixMap([
            ["schema", str(FRACTION_FUNCTION_SCHEMA)], ["variable", str(source.variable)],
            ["form", info.displaySpec], ["evaluation", info.evaluationSpec],
            ["canonicalAvailable", info.canonicalRationalFunction ? int(1) : null],
            ["polynomialAvailable", info.canonicalPolynomial ? int(1) : null],
            ["canonicalError", info.canonicalError ? str(info.canonicalError) : null],
        ]);
    });
}

function modifierNames(value) {
    if (!value) return [];
    return values(value, "FractionFunction parser modifiers").map((item) => text(item));
}

function parseVariableModifier(modifiers) {
    const matches = modifiers.map((modifier) => String(modifier).match(/^VAR\(([^)]+)\)$/iu)).filter(Boolean);
    if (matches.length > 1) throw new Error(".fracfun accepts only one Var(name) modifier");
    const unsupported = modifiers.filter((modifier) => !/^VAR\([^)]+\)$/iu.test(String(modifier)) && !/^FUN$/iu.test(String(modifier)));
    if (unsupported.length) throw new Error(`Unknown .fracfun modifier${unsupported.length === 1 ? "" : "s"}: ${unsupported.join(", ")}`);
    return matches.length ? variableName(matches[0][1]) : null;
}

function parseFractionFunction(args, context, evaluate) {
    const body = text(args[1]);
    if (body === null) throw new Error(".fracfun.Parse body must be a string");
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
    return structuralToFractionFunction(structural, variable, context, evaluate, [{ operation: ".fracfun.Parse" }]);
}

export function createFracfunPluginValue() {
    const constructor = (args, context, evaluate) => createFractionFunction(args, context, evaluate);
    const parseMethod = method("Parse", parseFractionFunction);
    const modifier = (name) => method(name, () => {
        throw new Error(`.${name} is a backtick parser modifier, not a callable method`);
    });
    return {
        type: "fraction_function_plugin",
        entries: new Map([["FractionFunction", constructor], ["FRACTIONFUNCTION", constructor]]),
        _ext: new Map([
            ["PARSE", parseMethod], ["Parse", parseMethod],
            ["VAR", modifier("Var")], ["Var", modifier("Var")],
            ["FUN", modifier("Fun")], ["Fun", modifier("Fun")],
            ["FRACTIONFUNCTION", method("FractionFunction", ([, ...args], context, evaluate) => createFractionFunction(args, context, evaluate))],
            ["immutable", int(1)],
        ]),
    };
}
