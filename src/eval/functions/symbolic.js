import { Integer, Rational } from "@ratmath/core";
import { runtimeDefaults } from "../../runtime/runtime-config.js";

const BINARY_TEXT = new Map([
    ["ADD", "+"], ["SUB", "-"], ["MUL", "*"], ["DIV", "/"],
    ["POW", "^"], ["INTDIV", "//"], ["MOD", "%"],
]);
const TEXT_BINARY = new Map(Array.from(BINARY_TEXT, ([name, text]) => [text, name]));

const ir = (fn, ...args) => ({ fn, args });
const literal = (value) => ir("LITERAL", String(value));
const retrieve = (name) => ir("RETRIEVE", name);
const cloneIr = (node) => {
    if (Array.isArray(node)) return node.map(cloneIr);
    if (!node || typeof node !== "object") return node;
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, cloneIr(value)]));
};

function rixString(value) { return { type: "string", value: String(value) }; }
function rixTuple(values) { return { type: "tuple", values }; }
function rixMap(entries) { return { type: "map", entries: new Map(entries) }; }

export function isSymbolicSpec(value) {
    return value?.type === "symbolic_spec";
}

export function getAttachedSpec(value) {
    if (isSymbolicSpec(value)) return value;
    return value?._spec || value?._ext?.get?.("_spec") || null;
}

function attachSpec(value, spec, kind = null) {
    value._spec = spec;
    if (!(value._ext instanceof Map)) value._ext = new Map();
    value._ext.set("_spec", spec);
    if (kind) value._ext.set("_symbolicKind", rixString(kind));
    return value;
}

function expressionOf(spec) {
    if (!isSymbolicSpec(spec)) throw new Error("Expected a symbolic specification");
    if (spec.expression) return spec.expression;
    if (spec.outputs.length !== 1 || spec.statements.length !== 1) {
        throw new Error("Symbolic operations currently require a single explicitly solved output");
    }
    return spec.statements[0].expr;
}

function outputModeOf(spec) {
    return spec.outputMode || (spec.expression ? "expression" : "named");
}

function createSpec(meta, context = null) {
    const outputMode = meta.outputMode || (meta.expression ? "expression" : "named");
    const inputs = [...(meta.inputs || [])];
    let outputs = [...(meta.outputs || [])];
    let expression = meta.expression ? cloneIr(meta.expression) : null;
    let statements = (meta.statements || []).map((statement) => ({
        kind: "assign",
        target: statement.target,
        expr: cloneIr(statement.expr),
    }));
    if (outputMode === "identity") {
        expression = expression || retrieve(inputs[0]);
        outputs = [];
        statements = [];
    } else if (outputMode === "expression") {
        outputs = [];
        statements = [];
    }
    return {
        type: "symbolic_spec",
        syntax: "#",
        inputs,
        outputs,
        outputsDeclared: meta.outputsDeclared === true,
        outputMode,
        expression,
        statements,
        imports: cloneIr(meta.imports || []),
        __closureScopes: meta.__closureScopes || context?.captureClosureScopes?.() || [],
        origin: meta.origin || null,
        transform: meta.transform || null,
    };
}

function specWithExpression(source, expression, options = {}) {
    const outputMode = options.outputMode || outputModeOf(source);
    const common = {
        inputs: options.inputs || source.inputs,
        imports: source.imports,
        __closureScopes: options.__closureScopes || source.__closureScopes,
        origin: options.origin || source.origin,
        transform: options.transform || source.transform,
    };
    if (outputMode === "named") {
        const target = source.outputs[0];
        return createSpec({
            ...common,
            outputMode: "named",
            outputs: [target],
            outputsDeclared: source.outputsDeclared,
            statements: [{ target, expr: expression }],
        });
    }
    return createSpec({ ...common, outputMode: "expression", expression });
}

function precedence(node) {
    if (!node?.fn) return 100;
    if (node.fn === "ADD" || node.fn === "SUB") return 10;
    if (node.fn === "MUL" || node.fn === "DIV" || node.fn === "INTDIV" || node.fn === "MOD") return 20;
    if (node.fn === "NEG") return 30;
    if (node.fn === "POW") return 40;
    return 100;
}

export function renderSymbolicIr(node, parentPrecedence = 0, side = null) {
    if (!node || typeof node !== "object" || !node.fn) return String(node);
    if (node.fn === "LITERAL") return String(node.args[0]);
    if (node.fn === "STRING") return JSON.stringify(node.args[0]);
    if (node.fn === "NULL") return "_";
    if (node.fn === "RETRIEVE") return node.args[0];
    if (node.fn === "OUTER_RETRIEVE") return `@${node.args[0]}`;
    if (node.fn === "SYSREF") return `.${node.args[0]}`;
    if (node.fn === "NEG") {
        const text = `-${renderSymbolicIr(node.args[0], precedence(node))}`;
        return precedence(node) < parentPrecedence ? `(${text})` : text;
    }
    if (node.fn === "CALL") {
        return `${node.args[0]}(${node.args.slice(1).map((arg) => renderSymbolicIr(arg)).join(", ")})`;
    }
    if (node.fn === "CALL_EXPR") {
        return `${renderSymbolicIr(node.args[0])}(${node.args.slice(1).map((arg) => renderSymbolicIr(arg)).join(", ")})`;
    }
    if (node.fn === "SYS_CALL") {
        return `.${node.args[0]}(${node.args.slice(1).map((arg) => renderSymbolicIr(arg)).join(", ")})`;
    }
    const op = BINARY_TEXT.get(node.fn);
    if (op) {
        const own = precedence(node);
        const left = renderSymbolicIr(node.args[0], own, "left");
        const rightNeedsTighter = node.fn === "SUB" || node.fn === "DIV" || node.fn === "POW";
        const right = renderSymbolicIr(node.args[1], own + (rightNeedsTighter ? 1 : 0), "right");
        const text = `${left} ${op} ${right}`;
        const parens = own < parentPrecedence || (side === "left" && node.fn === "POW" && own === parentPrecedence);
        return parens ? `(${text})` : text;
    }
    throw new Error(`Cannot render unsupported symbolic IR '${node.fn}'`);
}

export function formatSymbolicSpec(spec) {
    const inputs = spec.inputs.join(",");
    if (spec.outputMode === "identity" && spec.inputs.length === 1) return `{#${spec.inputs[0]}}`;
    const imports = spec.imports?.length
        ? `<${spec.imports.map((item) => {
            if (item.mode === "copy" && item.local === item.source) return item.local;
            return `${item.local}${item.mode === "alias" ? "=" : "~"}${item.source}`;
        }).join(",")}> `
        : "";
    if (outputModeOf(spec) === "named") {
        const header = spec.outputsDeclared
            ? `${inputs}:${spec.outputs.join(",")}# `
            : inputs
                ? `${inputs}# `
                : " ";
        return `{#${header}${imports}${spec.statements.map((s) => `${s.target} = ${renderSymbolicIr(s.expr)}`).join("; ")} }`;
    }
    const header = inputs ? `${inputs}# ` : " ";
    return `{#${header}${imports}${renderSymbolicIr(expressionOf(spec))} }`;
}

function serializeIr(node) {
    if (!node?.fn) return rixString(String(node));
    if (node.fn === "LITERAL") return rixMap([["kind", rixString("number")], ["value", rixString(node.args[0])]]);
    if (node.fn === "RETRIEVE") return rixMap([["kind", rixString("identifier")], ["name", rixString(node.args[0])]]);
    if (node.fn === "OUTER_RETRIEVE") return rixMap([["kind", rixString("outer")], ["name", rixString(node.args[0])]]);
    if (node.fn === "NEG") return rixMap([["kind", rixString("unary")], ["op", rixString("-")], ["expr", serializeIr(node.args[0])]]);
    const op = BINARY_TEXT.get(node.fn);
    if (op) return rixMap([["kind", rixString("binary")], ["op", rixString(op)], ["left", serializeIr(node.args[0])], ["right", serializeIr(node.args[1])]]);
    return rixMap([["kind", rixString("ir")], ["fn", rixString(node.fn)], ["args", rixTuple(node.args.map(serializeIr))]]);
}

export function inspectSymbolicSpec(spec) {
    const inspectExpression = spec.expression
        ? serializeIr(spec.expression)
        : spec.statements.length === 1
            ? serializeIr(spec.statements[0].expr)
            : null;
    return rixMap([
        ["kind", rixString("systemSpec")],
        ["syntax", rixString("#")],
        ["form", rixString(outputModeOf(spec))],
        ["source", rixString(formatSymbolicSpec(spec))],
        ["inputs", rixTuple(spec.inputs.map(rixString))],
        ["outputs", rixTuple(spec.outputs.map(rixString))],
        ["statements", rixTuple(spec.statements.map((statement) => rixMap([
            ["kind", rixString("assign")], ["target", rixString(statement.target)], ["expr", serializeIr(statement.expr)],
        ])))],
        ["expression", inspectExpression],
    ]);
}

function supportedExpression(node) {
    if (!node?.fn) return false;
    if (["LITERAL", "RETRIEVE", "OUTER_RETRIEVE"].includes(node.fn)) return true;
    if (node.fn === "NEG") return supportedExpression(node.args[0]);
    if (["ADD", "SUB", "MUL", "DIV", "POW"].includes(node.fn)) {
        return supportedExpression(node.args[0]) && supportedExpression(node.args[1]);
    }
    return false;
}

export function analyzeCallable(value) {
    if (!value || !["lambda", "function"].includes(value.type)) {
        return { speccable: false, reason: "value is not a RiX function" };
    }
    const positional = value.params?.positional || [];
    if (positional.some((param) => param.isRest || param.holeDefault) || (value.params?.keyword || []).length) {
        return { speccable: false, reason: "only ordinary positional parameters are supported" };
    }
    if ((value.params?.conditionals || []).length || (value.params?.prep || []).length) {
        return { speccable: false, reason: "prepared functions are not automatically speccable" };
    }
    if (!supportedExpression(value.body)) {
        return { speccable: false, reason: `unsupported or effectful IR '${value.body?.fn || "value"}'` };
    }
    return {
        speccable: true,
        profile: "exact-arithmetic",
        spec: createSpec({
            inputs: positional.map((param) => param.name),
            outputMode: "expression",
            expression: value.body,
            __closureScopes: value.__closureScopes || [],
            origin: value.name || value.__name || null,
        }),
    };
}

export function attachAutoSpec(value, context) {
    if (getAttachedSpec(value)) return value;
    const mode = context?.getEnv?.("symbolicAutoSpec", runtimeDefaults.symbolicAutoSpec) ?? runtimeDefaults.symbolicAutoSpec;
    if (mode === false || mode === "off" || mode === "none") return value;
    const analysis = analyzeCallable(value);
    if (analysis.speccable) attachSpec(value, analysis.spec);
    return value;
}

function polyFromSpec(spec) {
    const expression = expressionOf(spec);
    if (!supportedExpression(expression)) {
        throw new Error(`Poly cannot compile unsupported or effectful symbolic IR '${expression?.fn || "value"}'`);
    }
    return attachSpec({
        type: "lambda",
        params: {
            positional: spec.inputs.map((name) => ({ name, holeDefault: null })),
            keyword: [], conditionals: [], prep: [], prepStrict: false, metadata: {},
        },
        body: cloneIr(expression),
        __closureScopes: spec.__closureScopes || [],
        __name: "Poly",
    }, spec, "Poly");
}

function isExactScalar(value) {
    return value instanceof Integer || value instanceof Rational || typeof value === "bigint" || Number.isInteger(value);
}

function exactToIr(value) {
    if (value instanceof Integer) return literal(value.value);
    if (value instanceof Rational) {
        return value.denominator === 1n ? literal(value.numerator) : ir("DIV", literal(value.numerator), literal(value.denominator));
    }
    if (typeof value === "bigint" || Number.isInteger(value)) return literal(value);
    throw new Error("Symbolic operations only lift exact integer and rational scalars");
}

function rationalFromIr(node) {
    if (node?.fn === "LITERAL" && /^-?\d+$/.test(String(node.args[0]))) return new Rational(BigInt(node.args[0]), 1n);
    if (node?.fn === "DIV") {
        const a = rationalFromIr(node.args[0]);
        const b = rationalFromIr(node.args[1]);
        if (a && b) return a.divide(b);
    }
    if (node?.fn === "NEG") {
        const value = rationalFromIr(node.args[0]);
        if (value) return new Rational(-value.numerator, value.denominator);
    }
    return null;
}

function rationalToIr(value) {
    return value.denominator === 1n ? literal(value.numerator) : ir("DIV", literal(value.numerator), literal(value.denominator));
}

function isZero(node) { const value = rationalFromIr(node); return Boolean(value && value.numerator === 0n); }
function isOne(node) { const value = rationalFromIr(node); return Boolean(value && value.numerator === value.denominator); }
function neg(node) {
    const value = rationalFromIr(node);
    return value ? rationalToIr(new Rational(-value.numerator, value.denominator)) : ir("NEG", node);
}
function binary(fn, left, right) {
    if (fn === "ADD") { if (isZero(left)) return right; if (isZero(right)) return left; }
    if (fn === "SUB") { if (isZero(right)) return left; if (isZero(left)) return neg(right); }
    if (fn === "MUL") { if (isZero(left) || isZero(right)) return literal(0); if (isOne(left)) return right; if (isOne(right)) return left; }
    if (fn === "DIV") { if (isZero(left)) return literal(0); if (isOne(right)) return left; }
    if (fn === "POW") { if (isZero(right)) return literal(1); if (isOne(right)) return left; }
    const a = rationalFromIr(left), b = rationalFromIr(right);
    if (a && b) {
        if (fn === "ADD") return rationalToIr(a.add(b));
        if (fn === "SUB") return rationalToIr(a.subtract(b));
        if (fn === "MUL") return rationalToIr(a.multiply(b));
        if (fn === "DIV") return rationalToIr(a.divide(b));
    }
    return ir(fn, left, right);
}

function derivative(node, variable) {
    if (["LITERAL", "STRING", "NULL"].includes(node.fn)) return literal(0);
    if (node.fn === "RETRIEVE") return literal(node.args[0] === variable ? 1 : 0);
    if (node.fn === "OUTER_RETRIEVE") return literal(0);
    if (node.fn === "NEG") return neg(derivative(node.args[0], variable));
    const [left, right] = node.args;
    if (node.fn === "ADD" || node.fn === "SUB") return binary(node.fn, derivative(left, variable), derivative(right, variable));
    if (node.fn === "MUL") {
        return binary("ADD", binary("MUL", derivative(left, variable), cloneIr(right)), binary("MUL", cloneIr(left), derivative(right, variable)));
    }
    if (node.fn === "DIV") {
        const numerator = binary("SUB", binary("MUL", derivative(left, variable), cloneIr(right)), binary("MUL", cloneIr(left), derivative(right, variable)));
        return binary("DIV", numerator, binary("POW", cloneIr(right), literal(2)));
    }
    if (node.fn === "POW") {
        const exponent = rationalFromIr(right);
        if (!exponent || exponent.denominator !== 1n) throw new Error("Deriv supports only exact integer literal powers");
        return binary("MUL", binary("MUL", literal(exponent.numerator), binary("POW", cloneIr(left), literal(exponent.numerator - 1n))), derivative(left, variable));
    }
    throw new Error(`Deriv does not support symbolic IR '${node.fn}'`);
}

function independentOf(node, variable) {
    if (node.fn === "RETRIEVE") return node.args[0] !== variable;
    if (node.fn === "OUTER_RETRIEVE" || node.fn === "LITERAL") return true;
    return (node.args || []).filter((arg) => arg?.fn).every((arg) => independentOf(arg, variable));
}

function monomial(node, variable) {
    if (node.fn === "RETRIEVE" && node.args[0] === variable) return { coefficient: new Rational(1n), power: 1n };
    if (node.fn === "POW" && node.args[0]?.fn === "RETRIEVE" && node.args[0].args[0] === variable) {
        const power = rationalFromIr(node.args[1]);
        if (power?.denominator === 1n && power.numerator >= 0n) return { coefficient: new Rational(1n), power: power.numerator };
    }
    const constant = rationalFromIr(node);
    if (constant) return { coefficient: constant, power: 0n };
    if (node.fn === "MUL") {
        const leftMono = monomial(node.args[0], variable);
        const rightMono = monomial(node.args[1], variable);
        if (leftMono && rightMono) {
            return {
                coefficient: leftMono.coefficient.multiply(rightMono.coefficient),
                power: leftMono.power + rightMono.power,
            };
        }
        const a = rationalFromIr(node.args[0]);
        const b = monomial(node.args[1], variable);
        if (a && b) return { coefficient: a.multiply(b.coefficient), power: b.power };
        const c = monomial(node.args[0], variable);
        const d = rationalFromIr(node.args[1]);
        if (c && d) return { coefficient: c.coefficient.multiply(d), power: c.power };
    }
    if (node.fn === "DIV") {
        const numerator = monomial(node.args[0], variable);
        const denominator = rationalFromIr(node.args[1]);
        if (numerator && denominator) {
            return { coefficient: numerator.coefficient.divide(denominator), power: numerator.power };
        }
    }
    return null;
}

function integrate(node, variable) {
    if (node.fn === "ADD" || node.fn === "SUB") return binary(node.fn, integrate(node.args[0], variable), integrate(node.args[1], variable));
    if (node.fn === "NEG") return neg(integrate(node.args[0], variable));
    const mono = monomial(node, variable);
    if (mono) {
        const next = mono.power + 1n;
        const coefficient = mono.coefficient.divide(new Rational(next, 1n));
        const power = next === 1n ? retrieve(variable) : ir("POW", retrieve(variable), literal(next));
        return binary("MUL", rationalToIr(coefficient), power);
    }
    if (node.fn === "MUL" && independentOf(node.args[0], variable)) return binary("MUL", cloneIr(node.args[0]), integrate(node.args[1], variable));
    if (node.fn === "MUL" && independentOf(node.args[1], variable)) return binary("MUL", integrate(node.args[0], variable), cloneIr(node.args[1]));
    if (node.fn === "DIV" && independentOf(node.args[1], variable)) return binary("DIV", integrate(node.args[0], variable), cloneIr(node.args[1]));
    if (independentOf(node, variable)) return binary("MUL", cloneIr(node), retrieve(variable));
    throw new Error(`Integrate cannot integrate '${renderSymbolicIr(node)}' in its current form; simplify or rewrite it first`);
}

function variableName(value, spec, operation) {
    if (value === null || value === undefined) {
        if (spec.inputs.length === 1) return spec.inputs[0];
        throw new Error(`${operation} needs an explicit variable for a multi-input spec`);
    }
    if (typeof value === "string") return value;
    if (value?.type === "string") return value.value;
    const selector = getAttachedSpec(value);
    if (selector && selector.inputs.length === 1 && renderSymbolicIr(expressionOf(selector)) === selector.inputs[0]) return selector.inputs[0];
    throw new Error(`${operation} variable must be an identity spec such as {#x} or a string`);
}

function calculus(value, variableValue, operation) {
    const source = getAttachedSpec(value);
    if (!source) throw new Error(`${operation} expects a symbolic spec or a function with an attached spec`);
    const variable = variableName(variableValue, source, operation);
    const transformed = operation === "Deriv" ? derivative(expressionOf(source), variable) : integrate(expressionOf(source), variable);
    const spec = specWithExpression(source, transformed, { transform: { operation, variable } });
    return isSymbolicSpec(value) ? spec : polyFromSpec(spec);
}

function substituteIr(node, substitutions) {
    if (node.fn === "RETRIEVE" && substitutions.has(node.args[0])) return cloneIr(substitutions.get(node.args[0]));
    return { ...node, args: (node.args || []).map((arg) => arg?.fn ? substituteIr(arg, substitutions) : cloneIr(arg)) };
}

function unionNames(groups) {
    const result = [];
    for (const group of groups) for (const name of group) if (!result.includes(name)) result.push(name);
    return result;
}

function retrieveNames(node, names = new Set()) {
    if (node?.fn === "RETRIEVE") names.add(node.args[0]);
    for (const arg of node?.args || []) if (arg?.fn) retrieveNames(arg, names);
    return names;
}

function unionScopes(groups, referencedNames = null) {
    const result = [];
    const seen = new Set();
    const captured = new Map();
    for (const group of groups) {
        const effective = new Map();
        for (const scope of group || []) {
            const bindings = scope?.bindings || scope;
            if (bindings instanceof Map) for (const [name, cell] of bindings) effective.set(name, cell);
        }
        for (const [name, cell] of effective) {
            if (referencedNames && !referencedNames.has(name)) continue;
            if (captured.has(name) && captured.get(name) !== cell) {
                throw new Error(`Cannot combine symbolic closures with different captured cells named '${name}'; substitute or rename explicitly`);
            }
            captured.set(name, cell);
        }
        for (const scope of group || []) {
            const identity = scope?.bindings || scope;
            if (!seen.has(identity)) { seen.add(identity); result.push(scope); }
        }
    }
    return result;
}

export function applySymbolicSpec(spec, args) {
    if (args.length > spec.inputs.length) throw new Error(`Symbolic spec expected at most ${spec.inputs.length} argument(s), received ${args.length}`);
    const substitutions = new Map();
    const argumentSpecs = [];
    for (let index = 0; index < args.length; index++) {
        const argSpec = getAttachedSpec(args[index]);
        if (argSpec) {
            substitutions.set(spec.inputs[index], expressionOf(argSpec));
            argumentSpecs.push(argSpec);
        } else if (isExactScalar(args[index])) {
            substitutions.set(spec.inputs[index], exactToIr(args[index]));
        } else {
            throw new Error("Symbolic substitution arguments must be specs, spec-backed functions, or exact scalars");
        }
    }
    const remaining = spec.inputs.slice(args.length);
    const expression = substituteIr(expressionOf(spec), substitutions);
    const inputs = unionNames([...argumentSpecs.map((item) => item.inputs), remaining]);
    const capturedNames = retrieveNames(expression);
    for (const input of inputs) capturedNames.delete(input);
    return specWithExpression(spec, expression, {
        inputs,
        __closureScopes: unionScopes([spec.__closureScopes, ...argumentSpecs.map((item) => item.__closureScopes)], capturedNames),
        outputMode: outputModeOf(spec) === "named" ? "named" : "expression",
        transform: { operation: "substitute" },
    });
}

function symbolicOperand(value) {
    const spec = getAttachedSpec(value);
    if (spec) return { spec, expression: expressionOf(spec), callable: !isSymbolicSpec(value) };
    if (isExactScalar(value)) return { spec: null, expression: exactToIr(value), callable: false };
    return null;
}

function combineSymbolic(operator, leftValue, rightValue = null) {
    const left = symbolicOperand(leftValue);
    const right = rightValue === null ? null : symbolicOperand(rightValue);
    if (!left || (rightValue !== null && !right)) throw new Error("Unsupported symbolic arithmetic operand");
    const template = left.spec || right?.spec;
    const expression = right ? ir(operator, cloneIr(left.expression), cloneIr(right.expression)) : ir(operator, cloneIr(left.expression));
    const inputs = unionNames([left.spec?.inputs || [], right?.spec?.inputs || []]);
    const capturedNames = retrieveNames(expression);
    for (const input of inputs) capturedNames.delete(input);
    const spec = specWithExpression(template, expression, {
        inputs,
        __closureScopes: unionScopes([left.spec?.__closureScopes, right?.spec?.__closureScopes], capturedNames),
        outputMode: outputModeOf(template) === "named" ? "named" : "expression",
        transform: { operation: BINARY_TEXT.get(operator) || operator },
    });
    return left.callable || right?.callable ? polyFromSpec(spec) : spec;
}

function simplifyIr(node, directions) {
    if (!node?.fn || ["LITERAL", "RETRIEVE", "OUTER_RETRIEVE"].includes(node.fn)) return cloneIr(node);
    if (node.fn === "NEG") return directions.has("identities") || directions.has("constants") ? neg(simplifyIr(node.args[0], directions)) : ir("NEG", simplifyIr(node.args[0], directions));
    if (!BINARY_TEXT.has(node.fn)) return cloneIr(node);
    let left = simplifyIr(node.args[0], directions), right = simplifyIr(node.args[1], directions);
    if (directions.has("expand") && node.fn === "MUL") {
        if (left.fn === "ADD" || left.fn === "SUB") return simplifyIr(ir(left.fn, ir("MUL", left.args[0], right), ir("MUL", left.args[1], right)), directions);
        if (right.fn === "ADD" || right.fn === "SUB") return simplifyIr(ir(right.fn, ir("MUL", left, right.args[0]), ir("MUL", left, right.args[1])), directions);
    }
    return directions.has("identities") || directions.has("constants") || directions.has("powers") ? binary(node.fn, left, right) : ir(node.fn, left, right);
}

function directionSet(value) {
    if (value === null || value === undefined) return new Set(["identities", "constants", "powers"]);
    const values = value?.values || [value];
    return new Set([
        "identities", "constants", "powers",
        ...values.map((item) => (item?.value ?? item).toString().toLowerCase().replaceAll("-", "")),
    ]);
}

function simplifyValue(value, directionsValue) {
    const source = getAttachedSpec(value);
    if (!source) throw new Error("Simplify expects a symbolic spec or function with an attached spec");
    const spec = specWithExpression(source, simplifyIr(expressionOf(source), directionSet(directionsValue)), { transform: { operation: "Simplify" } });
    return isSymbolicSpec(value) ? spec : polyFromSpec(spec);
}

function speccabilityValue(value) {
    const attached = getAttachedSpec(value);
    const result = attached ? { speccable: true, profile: "attached", spec: attached } : analyzeCallable(value);
    const entries = [["speccable", result.speccable ? new Integer(1n) : null]];
    if (result.profile) entries.push(["profile", rixString(result.profile)]);
    if (result.reason) entries.push(["reason", rixString(result.reason)]);
    if (result.spec) entries.push(["spec", result.spec]);
    return rixMap(entries);
}

function explicitSpec(value) {
    const attached = getAttachedSpec(value);
    if (attached) return attached;
    const analysis = analyzeCallable(value);
    if (!analysis.speccable) throw new Error(`Function is not speccable: ${analysis.reason}`);
    attachSpec(value, analysis.spec, "Function");
    return analysis.spec;
}

export function installSymbolicVariants(registry) {
    for (const [name, operator] of [["ADD", "ADD"], ["SUB", "SUB"], ["MUL", "MUL"], ["DIV", "DIV"], ["POW", "POW"]]) {
        registry.installVariant(name, {
            name: `Symbolic_${name}`,
            prep: (args) => {
                if (args.length !== 2 || !args.some((value) => Boolean(getAttachedSpec(value))) || !args.every((value) => Boolean(symbolicOperand(value)))) return false;
                const callableCount = args.filter((value) => getAttachedSpec(value) && !isSymbolicSpec(value)).length;
                return callableCount === 0 || args.every((value) => Boolean(getAttachedSpec(value)));
            },
            impl: ([left, right]) => combineSymbolic(operator, left, right),
        });
    }
    registry.installVariant("NEG", {
        name: "Symbolic_NEG",
        prep: (args) => args.length === 1 && Boolean(getAttachedSpec(args[0])),
        impl: ([value]) => combineSymbolic("NEG", value),
    });
}

export const symbolicCapabilities = {
    POLY: { impl: ([value]) => polyFromSpec(getAttachedSpec(value) || value), pure: true, doc: "Compile a single-output symbolic spec into an exact callable" },
    DERIV: { impl: ([value, variable]) => calculus(value, variable, "Deriv"), pure: true, doc: "Differentiate a symbolic spec or spec-backed function exactly" },
    INTEGRATE: { impl: ([value, variable]) => calculus(value, variable, "Integrate"), pure: true, doc: "Integrate a supported symbolic spec or spec-backed function exactly" },
    SIMPLIFY: { impl: ([value, directions]) => simplifyValue(value, directions), pure: true, doc: "Return an explicitly simplified symbolic value" },
    SPEC: { impl: ([value]) => explicitSpec(value), doc: "Analyze a pure function and attach/return its symbolic spec" },
    SPECCABILITY: { impl: ([value]) => speccabilityValue(value), pure: true, doc: "Report whether a pure function can be represented by the exact symbolic subset" },
    INSPECTSPEC: { impl: ([value]) => inspectSymbolicSpec(getAttachedSpec(value) || value), pure: true, doc: "Return the structural inspection map for a symbolic spec" },
};

export const symbolicFunctions = {
    SYSTEM_SPEC: {
        lazy: true,
        impl(args, context) { return createSpec(args[0] || {}, context); },
        pure: true,
        doc: "Create a first-class symbolic system specification",
    },
    DERIVATIVE: {
        impl: ([value, order = 1, variable = null]) => {
            let result = value;
            const count = order instanceof Integer ? Number(order.value) : Number(order || 1);
            for (let index = 0; index < count; index++) result = calculus(result, variable, "Deriv");
            return result;
        },
        pure: true,
        doc: "Postfix exact symbolic derivative",
    },
    INTEGRAL: {
        impl: ([value, order = 1, variable = null]) => {
            let result = value;
            const count = order instanceof Integer ? Number(order.value) : Number(order || 1);
            for (let index = 0; index < count; index++) result = calculus(result, variable, "Integrate");
            return result;
        },
        pure: true,
        doc: "Prefix exact symbolic integral",
    },
};
