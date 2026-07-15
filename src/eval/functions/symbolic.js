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

const DIRECTION_ALIASES = new Map([
    ["identity", "identities"], ["identities", "identities"],
    ["constant", "constants"], ["constants", "constants"],
    ["power", "powers"], ["powers", "powers"],
    ["expand", "expand"],
    ["center", "center"],
    ["decompose", "decompose"],
    ["gadic", "gadic"],
    ["distribute", "distribute"],
]);

function normalizeDirection(value) {
    const raw = value?.value ?? value;
    if (typeof raw !== "string") throw new Error("Transform directions must be colon-strings or strings");
    const normalized = raw.trim().toLowerCase().replaceAll(/[-_\s]/g, "");
    const direction = DIRECTION_ALIASES.get(normalized);
    if (!direction) throw new Error(`Unknown Transform direction '${raw}'`);
    return direction;
}

function operationDescriptor(value, inlineArgs = []) {
    if (value?.type === "sequence" || value?.type === "array") {
        if (!value.values.length) throw new Error("Transform operation arrays cannot be empty");
        return { direction: normalizeDirection(value.values[0]), args: value.values.slice(1) };
    }
    return { direction: normalizeDirection(value), args: inlineArgs };
}

function transformPlan(directionValue, inlineArgs) {
    if (directionValue === null || directionValue === undefined) {
        if (inlineArgs.length) throw new Error("Transform arguments require a direction");
        return [{ direction: "identities", args: [] }];
    }
    if (directionValue?.type === "tuple") {
        if (inlineArgs.length) throw new Error("A Transform tuple carries each operation's arguments inside its operation array");
        return directionValue.values.map((value) => operationDescriptor(value));
    }
    return [operationDescriptor(directionValue, inlineArgs)];
}

function polynomialAdd(left, right, subtract = false) {
    const result = new Map(Array.from(left, ([power, coefficient]) => [power, cloneIr(coefficient)]));
    for (const [power, coefficient] of right) {
        const incoming = subtract ? neg(cloneIr(coefficient)) : cloneIr(coefficient);
        result.set(power, result.has(power) ? binary("ADD", result.get(power), incoming) : incoming);
        if (isZero(result.get(power))) result.delete(power);
    }
    return result;
}

function polynomialMultiply(left, right) {
    const result = new Map();
    for (const [leftPower, leftCoefficient] of left) {
        for (const [rightPower, rightCoefficient] of right) {
            const power = leftPower + rightPower;
            const coefficient = binary("MUL", cloneIr(leftCoefficient), cloneIr(rightCoefficient));
            result.set(power, result.has(power) ? binary("ADD", result.get(power), coefficient) : coefficient);
            if (isZero(result.get(power))) result.delete(power);
        }
    }
    return result;
}

function polynomialPower(base, exponent) {
    let result = new Map([[0n, literal(1)]]);
    let factor = base;
    let remaining = exponent;
    while (remaining > 0n) {
        if (remaining % 2n === 1n) result = polynomialMultiply(result, factor);
        remaining /= 2n;
        if (remaining > 0n) factor = polynomialMultiply(factor, factor);
    }
    return result;
}

function polynomialFromIr(node, variable, variablePolynomial) {
    if (node.fn === "RETRIEVE" && node.args[0] === variable) {
        return new Map(Array.from(variablePolynomial, ([power, coefficient]) => [power, cloneIr(coefficient)]));
    }
    if (independentOf(node, variable)) return new Map([[0n, cloneIr(node)]]);
    if (node.fn === "NEG") {
        return new Map(Array.from(polynomialFromIr(node.args[0], variable, variablePolynomial), ([power, coefficient]) => [power, neg(coefficient)]));
    }
    if (node.fn === "ADD" || node.fn === "SUB") {
        return polynomialAdd(
            polynomialFromIr(node.args[0], variable, variablePolynomial),
            polynomialFromIr(node.args[1], variable, variablePolynomial),
            node.fn === "SUB",
        );
    }
    if (node.fn === "MUL") {
        return polynomialMultiply(
            polynomialFromIr(node.args[0], variable, variablePolynomial),
            polynomialFromIr(node.args[1], variable, variablePolynomial),
        );
    }
    if (node.fn === "DIV" && independentOf(node.args[1], variable)) {
        return new Map(Array.from(
            polynomialFromIr(node.args[0], variable, variablePolynomial),
            ([power, coefficient]) => [power, binary("DIV", coefficient, cloneIr(node.args[1]))],
        ));
    }
    if (node.fn === "POW") {
        const exponent = rationalFromIr(node.args[1]);
        if (exponent?.denominator === 1n && exponent.numerator >= 0n) {
            return polynomialPower(polynomialFromIr(node.args[0], variable, variablePolynomial), exponent.numerator);
        }
    }
    throw new Error(`Polynomial transformation requires a polynomial in '${variable}'; unsupported term '${renderSymbolicIr(node)}'`);
}

function signedTerm(coefficient, basis, power) {
    const exact = rationalFromIr(coefficient);
    const structuralNegative = coefficient?.fn === "NEG";
    const negative = structuralNegative || Boolean(exact && exact.numerator < 0n);
    const magnitude = exact && exact.numerator < 0n
        ? rationalToIr(new Rational(-exact.numerator, exact.denominator))
        : structuralNegative
            ? cloneIr(coefficient.args[0])
            : coefficient;
    if (power === 0n) return { negative, expression: magnitude };
    const powered = power === 1n ? cloneIr(basis) : ir("POW", cloneIr(basis), literal(power));
    return { negative, expression: isOne(magnitude) ? powered : ir("MUL", magnitude, powered) };
}

function polynomialToIr(polynomial, basis) {
    const powers = Array.from(polynomial.keys()).sort((a, b) => a > b ? -1 : a < b ? 1 : 0);
    if (!powers.length) return literal(0);
    let result = null;
    for (const power of powers) {
        const term = signedTerm(polynomial.get(power), basis, power);
        if (result === null) result = term.negative ? neg(term.expression) : term.expression;
        else result = ir(term.negative ? "SUB" : "ADD", result, term.expression);
    }
    return result;
}

function exactCenter(value) {
    if (value === null || value === undefined) return new Rational(0n, 1n);
    if (!isExactScalar(value)) throw new Error("Center transformation requires an exact integer or rational center");
    return rationalFromIr(exactToIr(value));
}

function centerBasis(variable, center) {
    return center.numerator === 0n
        ? retrieve(variable)
        : center.numerator < 0n
            ? ir("ADD", retrieve(variable), rationalToIr(new Rational(-center.numerator, center.denominator)))
            : ir("SUB", retrieve(variable), rationalToIr(center));
}

function centerIr(node, variable, centerValue) {
    const center = exactCenter(centerValue);
    const variablePolynomial = new Map([[1n, literal(1)]]);
    if (center.numerator !== 0n) variablePolynomial.set(0n, rationalToIr(center));
    const polynomial = polynomialFromIr(node, variable, variablePolynomial);
    const basis = centerBasis(variable, center);
    return polynomialToIr(polynomial, basis);
}

function polynomialDegree(polynomial) {
    let degree = null;
    for (const power of polynomial.keys()) if (degree === null || power > degree) degree = power;
    return degree;
}

function polynomialDivide(dividend, divisor) {
    const divisorDegree = polynomialDegree(divisor);
    if (divisorDegree === null) throw new Error("Polynomial decomposition cannot divide by the zero polynomial");
    const divisorLead = divisor.get(divisorDegree);
    const remainder = new Map(Array.from(dividend, ([power, coefficient]) => [power, cloneIr(coefficient)]));
    const quotient = new Map();
    while (true) {
        const remainderDegree = polynomialDegree(remainder);
        if (remainderDegree === null || remainderDegree < divisorDegree) break;
        const power = remainderDegree - divisorDegree;
        const coefficient = binary("DIV", cloneIr(remainder.get(remainderDegree)), cloneIr(divisorLead));
        quotient.set(power, quotient.has(power) ? binary("ADD", quotient.get(power), coefficient) : coefficient);
        for (const [divisorPower, divisorCoefficient] of divisor) {
            const targetPower = divisorPower + power;
            if (targetPower === remainderDegree) {
                remainder.delete(targetPower);
                continue;
            }
            const existing = remainder.get(targetPower) || literal(0);
            const next = binary("SUB", existing, binary("MUL", cloneIr(coefficient), cloneIr(divisorCoefficient)));
            if (isZero(next)) remainder.delete(targetPower);
            else remainder.set(targetPower, next);
        }
    }
    return { quotient, remainder };
}

function decompositionOperand(value, variable) {
    if (isExactScalar(value)) {
        const expression = centerBasis(variable, exactCenter(value));
        return {
            expression,
            polynomial: polynomialFromIr(expression, variable, new Map([[1n, literal(1)]])),
            closureScopes: [],
        };
    }
    const spec = getAttachedSpec(value);
    if (!spec) throw new Error("Polynomial decomposition operands must be exact roots, symbolic specs, or spec-backed functions");
    if (spec.inputs.length !== 1) throw new Error("Polynomial decomposition specs must have exactly one symbolic input");
    const sourceExpression = expressionOf(spec);
    if (spec.inputs[0] !== variable && retrieveNames(sourceExpression).has(variable)) {
        throw new Error(`Polynomial decomposition cannot rename '${spec.inputs[0]}' to '${variable}' because the operand already uses '${variable}' as a coefficient`);
    }
    const expression = substituteIr(sourceExpression, new Map([[spec.inputs[0], retrieve(variable)]]));
    return {
        expression,
        polynomial: polynomialFromIr(expression, variable, new Map([[1n, literal(1)]])),
        closureScopes: spec.__closureScopes || [],
    };
}

function decomposeIr(node, variable, factors) {
    if (!factors.length) throw new Error("Decompose transformation requires at least one root or polynomial factor");
    let quotient = polynomialFromIr(node, variable, new Map([[1n, literal(1)]]));
    const steps = [];
    const closureScopes = [];
    for (const value of factors) {
        const factor = decompositionOperand(value, variable);
        const division = polynomialDivide(quotient, factor.polynomial);
        steps.push({ expression: factor.expression, remainder: division.remainder });
        closureScopes.push(factor.closureScopes);
        quotient = division.quotient;
    }
    let expression = polynomialToIr(quotient, retrieve(variable));
    for (let index = steps.length - 1; index >= 0; index--) {
        expression = binary(
            "ADD",
            binary("MUL", cloneIr(steps[index].expression), expression),
            polynomialToIr(steps[index].remainder, retrieve(variable)),
        );
    }
    return { expression, closureScopes };
}

function gadicIr(node, variable, args) {
    if (args.length !== 1) throw new Error("G-adic transformation requires exactly one polynomial base");
    const base = decompositionOperand(args[0], variable);
    const baseDegree = polynomialDegree(base.polynomial);
    if (baseDegree === null || baseDegree === 0n) throw new Error("G-adic transformation base must have positive degree");
    let quotient = polynomialFromIr(node, variable, new Map([[1n, literal(1)]]));
    const remainders = [];
    while (polynomialDegree(quotient) !== null) {
        const division = polynomialDivide(quotient, base.polynomial);
        remainders.push(division.remainder);
        quotient = division.quotient;
    }
    let expression = null;
    for (let index = 0; index < remainders.length; index++) {
        const remainder = polynomialToIr(remainders[index], retrieve(variable));
        if (isZero(remainder)) continue;
        const term = signedTerm(remainder, base.expression, BigInt(index));
        if (expression === null) expression = term.negative ? neg(term.expression) : term.expression;
        else expression = ir(term.negative ? "SUB" : "ADD", expression, term.expression);
    }
    return { expression: expression || literal(0), closureScopes: [base.closureScopes] };
}

function sameIr(left, right) {
    if (left === right) return true;
    if (!left || !right || left.fn !== right.fn) return false;
    const leftArgs = left.args || [], rightArgs = right.args || [];
    if (leftArgs.length !== rightArgs.length) return false;
    return leftArgs.every((arg, index) => {
        const other = rightArgs[index];
        return arg?.fn || other?.fn ? sameIr(arg, other) : arg === other;
    });
}

function distributeProduct(factor, sum, factorOnLeft) {
    if (sameIr(sum, factor)) {
        return factorOnLeft ? ir("MUL", cloneIr(factor), cloneIr(sum)) : ir("MUL", cloneIr(sum), cloneIr(factor));
    }
    if (sum.fn === "ADD" || sum.fn === "SUB") {
        return ir(
            sum.fn,
            distributeProduct(factor, sum.args[0], factorOnLeft),
            distributeProduct(factor, sum.args[1], factorOnLeft),
        );
    }
    return factorOnLeft ? ir("MUL", cloneIr(factor), cloneIr(sum)) : ir("MUL", cloneIr(sum), cloneIr(factor));
}

function exactCount(value) {
    if (value === null || value === undefined) return null;
    const rational = isExactScalar(value) ? rationalFromIr(exactToIr(value)) : null;
    if (!rational || rational.denominator !== 1n || rational.numerator < 0n) {
        throw new Error("Distribute transformation count must be a nonnegative exact integer");
    }
    return rational.numerator;
}

function distributeTargetIr(node, target, maxCount = null) {
    let remaining = maxCount;
    let applied = 0n;
    const distributeMatch = (current) => {
        if (current.fn !== "MUL" || (remaining !== null && remaining === 0n)) return null;
        const [left, right] = current.args;
        if (sameIr(left, target) && !sameIr(right, target) && (right.fn === "ADD" || right.fn === "SUB")) {
            if (remaining !== null) remaining--;
            applied++;
            return distributeProduct(left, right, true);
        }
        if (sameIr(right, target) && !sameIr(left, target) && (left.fn === "ADD" || left.fn === "SUB")) {
            if (remaining !== null) remaining--;
            applied++;
            return distributeProduct(right, left, false);
        }
        return null;
    };
    const visit = (current) => {
        if (!current?.fn) return cloneIr(current);
        const before = distributeMatch(current);
        if (before) return visit(before);
        const rebuilt = { ...current, args: (current.args || []).map((arg) => arg?.fn ? visit(arg) : cloneIr(arg)) };
        const after = distributeMatch(rebuilt);
        return after ? visit(after) : rebuilt;
    };
    return { expression: visit(node), applied };
}

function distributeIr(node, variable, args) {
    if (args.length < 1 || args.length > 2) {
        throw new Error("Distribute transformation requires a target root or polynomial and an optional count");
    }
    const target = decompositionOperand(args[0], variable);
    const distributed = distributeTargetIr(node, target.expression, exactCount(args[1]));
    return { ...distributed, closureScopes: [target.closureScopes] };
}

function transformValue(args) {
    const [value, directionValue, ...inlineArgs] = args;
    const source = getAttachedSpec(value);
    if (!source) throw new Error("Transform expects a symbolic spec or function with an attached spec");
    const plan = transformPlan(directionValue, inlineArgs);
    let expression = expressionOf(source);
    const addedScopeGroups = [];
    for (const operation of plan) {
        if (["identities", "constants", "powers", "expand"].includes(operation.direction)) {
            if (operation.args.length) throw new Error(`Transform direction '${operation.direction}' does not accept arguments`);
            const directions = new Set(["identities", "constants", "powers"]);
            if (operation.direction === "expand") directions.add("expand");
            expression = simplifyIr(expression, directions);
            continue;
        }
        const operationName = {
            center: "Center", decompose: "Decompose", gadic: "G-adic", distribute: "Distribute",
        }[operation.direction];
        if (source.inputs.length !== 1) throw new Error(`${operationName} transformation currently requires exactly one symbolic input`);
        if (operation.direction === "center") {
            if (operation.args.length > 1) throw new Error("Center transformation accepts at most one center");
            expression = centerIr(expression, source.inputs[0], operation.args[0]);
            continue;
        }
        const transformed = operation.direction === "decompose"
            ? decomposeIr(expression, source.inputs[0], operation.args)
            : operation.direction === "gadic"
                ? gadicIr(expression, source.inputs[0], operation.args)
                : distributeIr(expression, source.inputs[0], operation.args);
        expression = transformed.expression;
        addedScopeGroups.push(...transformed.closureScopes);
    }
    const referencedNames = retrieveNames(expression);
    for (const input of source.inputs) referencedNames.delete(input);
    const spec = specWithExpression(source, expression, {
        __closureScopes: unionScopes([source.__closureScopes, ...addedScopeGroups], referencedNames),
        transform: { operation: "Transform", plan: plan.map(({ direction }) => direction) },
    });
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
    TRANSFORM: { impl: (args) => transformValue(args), pure: true, doc: "Apply ordered exact symbolic transformations" },
    SIMPLIFY: { impl: (args) => transformValue(args), pure: true, doc: "Compatibility alias for Transform" },
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
