import { CertifiedApproximation, Integer, Rational, RationalInterval, RationalIntervalSet, parseCertifiedApproximation } from "@ratmath/core";
import {
    createShaped,
    forEachShapedCell,
    isShaped,
    shapedRank,
    shapedScalarDomain,
    valueBelongsToScalarDomain,
} from "./shaped.js";
import { callWithConcreteArgs } from "../eval/functions/functions.js";
import { UNDECIDED, UndecidedDiagnostic, isUndecided } from "./decision.js";

function int(value) {
    return new Integer(BigInt(value));
}

export function stringObj(value) {
    return { type: "string", value };
}

export function colonName(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") return value;
    if (value?.type === "string") return value.value;
    return String(value);
}

export function semanticNameKey(value) {
    const name = colonName(value);
    return name === null ? null : name.normalize("NFKC").toLocaleLowerCase("en-US");
}

export function makeProto(entries = []) {
    const entryMap = new Map(entries);
    for (const [key, value] of entries) {
        if (typeof key === "string") {
            entryMap.set(key.toUpperCase(), value);
        }
    }
    return {
        type: "map",
        entries: entryMap,
        _ext: new Map([["frozen", int(1)], ["immutable", int(1)], ...entryMap.entries()]),
    };
}

export function valueMethod(name, fn) {
    return {
        type: "method_builtin",
        name,
        impl(args, context, evaluate, callWithConcreteArgs) {
            const receiver = args[0]?.type === "map" && args.length > 1 ? args[1] : args[0];
            const rest = args[0]?.type === "map" && args.length > 1 ? args.slice(2) : args.slice(1);
            return fn(receiver, rest, context, evaluate, callWithConcreteArgs);
        },
    };
}

function immutableCloneSpec(spec) {
    const clone = { ...spec };
    if (Array.isArray(spec.defaultTraits)) clone.defaultTraits = Object.freeze([...spec.defaultTraits]);
    if (Array.isArray(spec.implies)) clone.implies = Object.freeze([...spec.implies]);
    if (Array.isArray(spec.aliases)) clone.aliases = Object.freeze([...spec.aliases]);
    if (spec.convertFrom instanceof Map) clone.convertFrom = new Map(spec.convertFrom);
    else if (spec.convertFrom && typeof spec.convertFrom === "object") clone.convertFrom = new Map(Object.entries(spec.convertFrom));
    else clone.convertFrom = new Map();
    if (spec.installs instanceof Map) clone.installs = new Map(spec.installs);
    else if (spec.installs && typeof spec.installs === "object") clone.installs = new Map(Object.entries(spec.installs));
    else clone.installs = new Map();
    return Object.freeze(clone);
}

function isCallable(value) {
    return value && typeof value === "object" && (
        value.type === "function" ||
        value.type === "lambda" ||
        value.type === "sysref" ||
        value.type === "partial" ||
        value.type === "bound_method"
    );
}

function invokeMaybeCallable(fn, args, context, evaluate) {
    if (!fn) return null;
    if (typeof fn === "function") return fn(...args);
    if (isCallable(fn)) {
        if (!fn.__rixCapturedEnv || !context?.setEnv) {
            return callWithConcreteArgs(fn, args, context, evaluate);
        }
        const restored = new Map();
        for (const [key, value] of fn.__rixCapturedEnv) {
            restored.set(key, {
                has: context.env?.has(key) === true,
                value: context.getEnv(key, undefined),
            });
            context.setEnv(key, value);
        }
        try {
            return callWithConcreteArgs(fn, args, context, evaluate);
        } finally {
            for (const [key, entry] of restored) {
                if (entry.has) context.setEnv(key, entry.value);
                else context.env?.delete(key);
            }
        }
    }
    throw new Error("Type/trait registry hook must be callable");
}

function truthy(value) {
    return value !== null && value !== undefined;
}

class ImmutableSemanticRegistry {
    constructor(kind) {
        this.kind = kind;
        this.entries = new Map();
        this.aliases = new Map();
    }

    register(spec) {
        const name = colonName(spec?.name);
        if (!name) throw new Error(`${this.kind} registration requires a name`);
        const key = semanticNameKey(name);
        if (this.entries.has(key) || this.aliases.has(key)) {
            throw new Error(`Duplicate ${this.kind} registration: ${name}`);
        }
        const entry = immutableCloneSpec({ ...spec, name });
        this.entries.set(key, entry);
        for (const alias of entry.aliases || []) {
            const aliasName = colonName(alias);
            if (!aliasName) continue;
            const aliasKey = semanticNameKey(aliasName);
            if (aliasKey === key) continue;
            if (this.aliases.get(aliasKey) === key) continue;
            if (this.entries.has(aliasKey) || this.aliases.has(aliasKey)) {
                throw new Error(`Duplicate ${this.kind} alias: ${aliasName}`);
            }
            this.aliases.set(aliasKey, key);
        }
        return entry;
    }

    replace(spec) {
        const name = colonName(spec?.name);
        if (!name) throw new Error(`${this.kind} registration requires a name`);
        const key = semanticNameKey(name);
        const previous = this.entries.get(key);
        if (!previous) return this.register(spec);
        for (const [alias, target] of this.aliases) {
            if (target === key) this.aliases.delete(alias);
        }
        this.entries.delete(key);
        return this.register(spec);
    }

    get(name) {
        const key = semanticNameKey(name);
        if (!key) return null;
        return this.entries.get(key) ?? this.entries.get(this.aliases.get(key)) ?? null;
    }

    has(name) {
        return Boolean(this.get(name));
    }

    list() {
        return Array.from(this.entries.values(), (entry) => entry.name);
    }
}

export const traitRegistry = new ImmutableSemanticRegistry("trait");
export const typeRegistry = new ImmutableSemanticRegistry("type");
const builtinTypeNames = new Set();

export function registerTrait(spec) {
    return traitRegistry.register(spec);
}

export function registerType(spec) {
    return typeRegistry.register(spec);
}

export function replaceRegisteredType(spec) {
    const name = colonName(spec?.name);
    if (builtinTypeNames.has(semanticNameKey(name))) throw new Error(`Cannot replace built-in type: ${name}`);
    return typeRegistry.replace(spec);
}

export function typeKnownInContext(name, context = null) {
    const entry = typeRegistry.get(name);
    if (!entry) return false;
    if (builtinTypeNames.has(semanticNameKey(entry.name))) return true;
    return context?.getEnv?.("__rix_registered_types__", null)?.has(entry.name) === true;
}

export function resolveTraitNames(names) {
    const result = [];
    const seen = new Set();
    const visiting = new Set();

    function visit(name) {
        const requestedName = colonName(name);
        const entry = traitRegistry.get(requestedName);
        if (!entry) throw new Error(`Unknown semantic trait: ${requestedName}`);
        const traitName = entry.name;
        const traitKey = semanticNameKey(traitName);
        if (seen.has(traitKey)) return;
        if (visiting.has(traitKey)) throw new Error(`Cyclic trait implication involving ${traitName}`);
        visiting.add(traitKey);
        for (const implied of entry.implies || []) {
            visit(implied);
        }
        visiting.delete(traitKey);
        seen.add(traitKey);
        result.push(traitName);
    }

    for (const name of names || []) visit(name);
    return result;
}

export function runtimeTypeName(value) {
    if (value === null) return "null";
    if (value instanceof Integer) return "Integer";
    if (value instanceof Rational) return "Rational";
    if (value instanceof RationalInterval) return "RationalInterval";
    if (value instanceof RationalIntervalSet) return "RationalIntervalSet";
    if (value instanceof CertifiedApproximation) return "CertifiedApproximation";
    if (isUndecided(value)) return "Undecided";
    if (isShaped(value)) return "shaped";
    if (value?.type === "sequence") return "array";
    if (value?.type) return value.type;
    if (value?.constructor?.name) return value.constructor.name;
    return typeof value;
}

function normalizeResult(entry, value) {
    return entry.normalize ? entry.normalize(value) : value;
}

export function convertToRegisteredType(value, requestedTypeName, context = null, evaluate = null) {
    const typeName = colonName(requestedTypeName);
    const entry = typeRegistry.get(typeName);
    if (!entry) throw new Error(`Unknown semantic type: ${typeName}`);

    const semanticSourceType = value?._ext?.get("__type")?.value ?? null;
    const runtimeSourceType = value?._ext?.get("_type")?.value ?? runtimeTypeName(value);
    const sourceType = semanticSourceType ?? runtimeSourceType;
    let next = value;
    const converter =
        entry.convertFrom?.get(runtimeSourceType) ??
        entry.convertFrom?.get(String(runtimeSourceType).toLowerCase()) ??
        entry.convertFrom?.get(sourceType) ??
        entry.convertFrom?.get(String(sourceType).toLowerCase());

    if (converter) {
        next = invokeMaybeCallable(converter, [value], context, evaluate);
    } else if (
        semanticNameKey(entry.name) === semanticNameKey(sourceType) ||
        semanticNameKey(typeName) === semanticNameKey(sourceType) ||
        semanticNameKey(entry.nativeType) === semanticNameKey(sourceType)
    ) {
        next = value;
    } else if (entry.convert) {
        next = invokeMaybeCallable(entry.convert, [value, stringObj(sourceType)], context, evaluate);
    }

    if (next === null || next === undefined) {
        return null;
    }
    next = entry.normalize ? invokeMaybeCallable(entry.normalize, [next], context, evaluate) : normalizeResult(entry, next);
    if (next === null || next === undefined) {
        return null;
    }
    if (entry.validate && !truthy(invokeMaybeCallable(entry.validate, [next], context, evaluate))) {
        return null;
    }
    return { value: next, entry, requestedTypeName: entry.name };
}

function isStringObject(value) {
    return value && typeof value === "object" && value.type === "string";
}

function rationalFromString(value) {
    if (!isStringObject(value)) return null;
    const text = value.value.trim();
    const ratio = text.match(/^(-?\d+)\/(\d+)$/);
    if (ratio) return new Rational(BigInt(ratio[1]), BigInt(ratio[2]));
    if (/^-?\d+$/.test(text)) return new Rational(BigInt(text), 1n);
    return null;
}

function rationalParts(value) {
    if (value instanceof Integer) return { numerator: value.value, denominator: 1n };
    if (value instanceof Rational) return { numerator: value.numerator, denominator: value.denominator };
    return null;
}

function boolResult(value) {
    return value ? new Integer(1n) : null;
}

function compareNumeric(a, b) {
    if (a && b && typeof a.subtract === "function" && typeof b.subtract === "function") {
        const diff = a.subtract(b);
        if (typeof diff.sign === "function") return Number(diff.sign().value ?? diff.sign());
        if (typeof diff.numerator === "bigint") {
            if (diff.numerator < 0n) return -1;
            if (diff.numerator > 0n) return 1;
            return 0;
        }
        if (typeof diff.value === "bigint") {
            if (diff.value < 0n) return -1;
            if (diff.value > 0n) return 1;
            return 0;
        }
    }
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
}

function isPlainShaped(value) {
    if (!isShaped(value)) return false;
    const semanticType = value?._ext instanceof Map ? value._ext.get("__type")?.value : null;
    return semanticType === null || semanticType === undefined || semanticNameKey(semanticType) === "shaped";
}

function shapedValues(value) {
    const result = [];
    forEachShapedCell(value, (entry) => result.push(entry));
    return result;
}

function shapesEqual(left, right) {
    return left.shape.length === right.shape.length &&
        left.shape.every((dimension, axis) => dimension === right.shape[axis]);
}

function invokeScalarOperator(name, args, context, evaluate) {
    const registry = context?.getEnv?.("__registry__", null);
    const operation = registry?.get?.(name);
    if (!operation) throw new Error(`Shaped arithmetic requires scalar operator ${name}`);
    return operation.impl(args, context, evaluate);
}

function shapedBinary(name, left, right, context, evaluate) {
    const leftShaped = isPlainShaped(left);
    const rightShaped = isPlainShaped(right);
    if (!leftShaped && !rightShaped) throw new Error(`${name} Shaped variant requires a Shaped operand`);

    const source = leftShaped ? left : right;
    const domain = shapedScalarDomain(source);
    if (leftShaped && rightShaped) {
        if (!shapesEqual(left, right)) {
            throw new Error(`Shaped ${name} requires identical shapes; received ${left.shape.join("x")} and ${right.shape.join("x")}`);
        }
        const rightDomain = shapedScalarDomain(right);
        if (semanticNameKey(domain) !== semanticNameKey(rightDomain)) {
            throw new Error(`Shaped ${name} requires one declared scalar domain; received ${domain} and ${rightDomain}`);
        }
        const leftValues = shapedValues(left);
        const rightValues = shapedValues(right);
        return createShaped(left.shape, leftValues.map((entry, index) =>
            invokeScalarOperator(name, [entry, rightValues[index]], context, evaluate)));
    }

    const scalar = leftShaped ? right : left;
    if (!valueBelongsToScalarDomain(scalar, domain)) {
        throw new Error(`Shaped ${name} scalar does not satisfy declared domain ${domain}; convert it explicitly`);
    }
    const values = shapedValues(source).map((entry) => invokeScalarOperator(
        name,
        leftShaped ? [entry, scalar] : [scalar, entry],
        context,
        evaluate,
    ));
    return createShaped(source.shape, values);
}

function shapedEquality(left, right, context, evaluate) {
    if (!isPlainShaped(left) || !isPlainShaped(right) || !shapesEqual(left, right)) return false;
    if (semanticNameKey(shapedScalarDomain(left)) !== semanticNameKey(shapedScalarDomain(right))) return false;
    const a = shapedValues(left);
    const b = shapedValues(right);
    return a.every((entry, index) => truthy(invokeScalarOperator("EQ", [entry, b[index]], context, evaluate)));
}

function isMatrixValue(value) {
    return isShaped(value) && semanticNameKey(value?._ext?.get("__type")?.value) === "matrix";
}

function requireSameMatrixDomain(left, right, operation) {
    const leftDomain = shapedScalarDomain(left);
    const rightDomain = shapedScalarDomain(right);
    if (semanticNameKey(leftDomain) !== semanticNameKey(rightDomain)) {
        throw new Error(`Matrix ${operation} requires one declared scalar domain; received ${leftDomain} and ${rightDomain}`);
    }
}

function matrixElementwise(name, left, right, context, evaluate) {
    if (!isMatrixValue(left) || !isMatrixValue(right)) {
        throw new Error(`Matrix ${name} requires two Matrix values`);
    }
    if (!shapesEqual(left, right)) {
        throw new Error(`Matrix ${name} requires identical shapes; received ${left.shape.join("x")} and ${right.shape.join("x")}`);
    }
    requireSameMatrixDomain(left, right, name);
    const rightValues = shapedValues(right);
    return createShaped(left.shape, shapedValues(left).map((entry, index) =>
        invokeScalarOperator(name, [entry, rightValues[index]], context, evaluate)));
}

function matrixScalar(name, matrix, scalar, scalarFirst, context, evaluate) {
    const domain = shapedScalarDomain(matrix);
    if (!valueBelongsToScalarDomain(scalar, domain)) {
        throw new Error(`Matrix ${name} scalar does not satisfy declared domain ${domain}; convert it explicitly`);
    }
    return createShaped(matrix.shape, shapedValues(matrix).map((entry) => invokeScalarOperator(
        name,
        scalarFirst ? [scalar, entry] : [entry, scalar],
        context,
        evaluate,
    )));
}

function matrixProduct(left, right, context, evaluate) {
    requireSameMatrixDomain(left, right, "multiplication");
    const [rows, inner] = left.shape;
    const [rightRows, columns] = right.shape;
    if (inner !== rightRows) {
        throw new Error(`Matrix multiplication dimensions must agree; received ${rows}x${inner} and ${rightRows}x${columns}`);
    }
    if (inner === 0) {
        throw new Error("Matrix multiplication with an empty contracted dimension requires an explicit scalar zero");
    }
    const a = shapedValues(left);
    const b = shapedValues(right);
    const values = [];
    for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
            let sum = null;
            for (let index = 0; index < inner; index++) {
                const product = invokeScalarOperator("MUL", [a[row * inner + index], b[index * columns + column]], context, evaluate);
                sum = sum === null ? product : invokeScalarOperator("ADD", [sum, product], context, evaluate);
            }
            values.push(sum);
        }
    }
    return createShaped([rows, columns], values);
}

function matrixMultiply(left, right, context, evaluate) {
    if (isMatrixValue(left) && isMatrixValue(right)) return matrixProduct(left, right, context, evaluate);
    if (isMatrixValue(left)) return matrixScalar("MUL", left, right, false, context, evaluate);
    if (isMatrixValue(right)) return matrixScalar("MUL", right, left, true, context, evaluate);
    throw new Error("Matrix multiplication requires a Matrix operand");
}

function matrixPower(matrix, exponent, context, evaluate) {
    if (!(exponent instanceof Integer) || exponent.value < 0n) {
        throw new Error("Matrix power requires a nonnegative Integer exponent");
    }
    if (matrix.shape[0] !== matrix.shape[1]) throw new Error("Matrix power requires a square Matrix");
    const entries = shapedValues(matrix);
    if (entries.length === 0) throw new Error("Matrix power requires a nonempty Matrix");
    const zeroValue = invokeScalarOperator("SUB", [entries[0], entries[0]], context, evaluate);
    const oneValue = invokeScalarOperator("POW", [entries[0], new Integer(0n)], context, evaluate);
    const size = matrix.shape[0];
    let result = createShaped([size, size], Array.from({ length: size * size }, (_, index) =>
        Math.floor(index / size) === index % size ? oneValue : zeroValue));
    let base = matrix;
    let remaining = exponent.value;
    while (remaining > 0n) {
        if ((remaining & 1n) === 1n) result = matrixProduct(result, base, context, evaluate);
        remaining >>= 1n;
        if (remaining > 0n) base = matrixProduct(base, base, context, evaluate);
    }
    return result;
}

function matrixEquality(left, right, context, evaluate) {
    if (!shapesEqual(left, right)) return false;
    if (semanticNameKey(shapedScalarDomain(left)) !== semanticNameKey(shapedScalarDomain(right))) return false;
    const a = shapedValues(left);
    const b = shapedValues(right);
    return a.every((entry, index) => truthy(invokeScalarOperator("EQ", [entry, b[index]], context, evaluate)));
}

export const TYPE_INSTALL_FUNCTIONS = [
    "ADD", "SUB", "MUL", "DIV", "INTDIV", "MOD", "POW", "POWPROD", "NEG",
    "COMPARE", "EQ", "NEQ", "LT", "GT", "LTE", "GTE", "MIN", "MAX",
    "ABS", "SQRT", "SIN", "COS", "TAN", "ASIN", "ACOS", "ATAN", "ATAN2",
    "LOG", "LN", "LOG10", "EXP",
];

let builtinsRegistered = false;

export function registerBuiltinSemanticTypes() {
    if (builtinsRegistered) return;

    const traits = [
        ["number"],
        ["ring", ["number"]],
        ["field", ["ring", "number"]],
        ["ordered", ["number"]],
        ["orderInquiry", ["number"]],
        ["approximate", ["number"]],
        ["enclosed", ["number"]],
        ["decision"],
        ["rational", ["field", "ordered"]],
        ["integer", ["rational"]],
        ["indexable"],
        ["shapeAware"],
        ["collection"],
        ["sequence", ["collection", "indexable"]],
        ["maplike", ["collection", "indexable"]],
        ["shaped", ["indexable", "shapeAware", "collection"]],
        ["meters"],
        ["cartesian"],
        ["square"],
        ["positive"],
        ["verify"],
    ];
    for (const [name, implies = []] of traits) {
        registerTrait({
            name,
            implies,
            proto: () => makeProto([
                ["Describe", valueMethod("Describe", () => stringObj(`trait:${name}`))],
                ["KIND", valueMethod("KIND", () => stringObj(`trait:${name}`))],
            ]),
            description: `${name} semantic trait`,
        });
    }

    const nativeOnly = [
        ["String", "string", [], (value) => isStringObject(value) ? value : null],
        ["Array", "array", ["sequence"], (value) =>
            value?.type === "sequence" || value?.type === "lazy_sequence" ? value : null],
        ["Tuple", "tuple", ["sequence"], (value) => value?.type === "tuple" ? value : null],
        ["Map", "map", ["maplike"], (value) => value?.type === "map" ? value : null],
        ["Set", "set", ["collection"], (value) => value?.type === "set" ? value : null],
        ["Iterator", "iterator", [], (value) => value?.type === "iterator" ? value : null],
        ["AsyncStream", "async_stream", [], (value) => value?.type === "async_stream" ? value : null],
        ["Function", "function", [], (value) => value?.type === "function" || value?.type === "lambda" ? value : null],
        ["Multifunction", "multifunction", [], (value) => value?._ext?.get("_type")?.value === "multifunction" ? value : null],
        ["Null", "null", [], (value) => value === null ? value : null],
        ["Hole", "hole", [], () => null],
    ];
    for (const [name, nativeType, defaultTraits, convert] of nativeOnly) {
        registerType({
            name,
            aliases: [nativeType],
            nativeType,
            defaultTraits,
            convert,
            proto: () => makeProto([["Describe", valueMethod("Describe", () => stringObj(`type:${name}`))]]),
        });
    }

    registerType({
        name: "Undecided",
        aliases: ["undecided"],
        nativeType: "undecided",
        defaultTraits: ["decision"],
        convert: (value) => isUndecided(value) ? value : null,
        validate: isUndecided,
        export(value) {
            return {
                type: "map",
                entries: new Map([
                    ["type", stringObj("Undecided")],
                    ["data", value instanceof UndecidedDiagnostic ? {
                        type: "map",
                        entries: new Map([
                            ["reason", stringObj(value.reason)],
                            ["details", value.details],
                        ]),
                    } : null],
                    ["cache", null],
                    ["version", new Integer(1n)],
                ]),
            };
        },
        import(value) {
            const data = value.entries.get("data");
            return data?.type === "map" && data.entries.get("reason")?.value
                ? new UndecidedDiagnostic(data.entries.get("reason").value, data.entries.get("details") ?? null)
                : UNDECIDED;
        },
        proto: () => makeProto([
            ["ToString", valueMethod("ToString", () => stringObj("?"))],
            ["Describe", valueMethod("Describe", () => stringObj("type:Undecided"))],
        ]),
        installs: {},
    });

    registerType({
        name: "Rational",
        aliases: ["rational"],
        nativeType: "rational",
        defaultTraits: ["rational", "number", "ordered", "field"],
        convertFrom: {
            Integer: (value) => new Rational(value.value, 1n),
            integer: (value) => new Rational(value.value, 1n),
            Rational: (value) => value,
            rational: (value) => value,
            string: rationalFromString,
        },
        convert(value) {
            if (value instanceof Integer) return new Rational(value.value, 1n);
            if (value instanceof Rational) return value;
            if (value instanceof RationalInterval && value.low.equals(value.high)) return value.low;
            return rationalFromString(value);
        },
        normalize: (value) => value,
        validate: (value) => value instanceof Rational,
        export(value) {
            const parts = rationalParts(value);
            return {
                type: "map",
                entries: new Map([
                    ["type", stringObj("Rational")],
                    ["data", { type: "map", entries: new Map([
                        ["num", new Integer(parts.numerator)],
                        ["den", new Integer(parts.denominator)],
                    ]) }],
                    ["cache", null],
                    ["version", new Integer(1n)],
                ]),
            };
        },
        import(value) {
            const data = value?.entries?.get("data");
            const num = data?.entries?.get("num");
            const den = data?.entries?.get("den");
            return new Rational(num.value, den.value);
        },
        proto: () => makeProto([
            ["Num", valueMethod("Num", (self) => new Integer(rationalParts(self).numerator))],
            ["Den", valueMethod("Den", (self) => new Integer(rationalParts(self).denominator))],
            ["ToString", valueMethod("ToString", (self) => stringObj(self.toString()))],
            ["Describe", valueMethod("Describe", () => stringObj("type:Rational"))],
            ["KIND", valueMethod("KIND", () => stringObj("type:Rational"))],
        ]),
        installs: {
            ADD: [{
                name: "RatRat",
                prep: (args) => args.length === 2 && rationalParts(args[0]) && rationalParts(args[1]),
                impl: ([a, b]) => a.add(b),
            }],
            SUB: [{
                name: "RatRat",
                prep: (args) => args.length === 2 && rationalParts(args[0]) && rationalParts(args[1]),
                impl: ([a, b]) => a.subtract(b),
            }],
            MUL: [{
                name: "RatRat",
                prep: (args) => args.length === 2 && rationalParts(args[0]) && rationalParts(args[1]),
                impl: ([a, b]) => a.multiply(b),
            }],
            DIV: [{
                name: "RatRat",
                prep: (args) => args.length === 2 && rationalParts(args[0]) && rationalParts(args[1]),
                impl: ([a, b]) => a.divide(b),
            }],
            EQ: [{
                name: "RatRat",
                prep: (args) => args.length === 2 && rationalParts(args[0]) && rationalParts(args[1]),
                impl: ([a, b]) => boolResult(a.equals(b)),
            }],
            LT: [{
                name: "RatRat",
                prep: (args) => args.length === 2 && rationalParts(args[0]) && rationalParts(args[1]),
                impl: ([a, b]) => boolResult(compareNumeric(a, b) < 0),
            }],
        },
    });

    registerType({
        name: "Integer",
        aliases: ["integer"],
        nativeType: "integer",
        defaultTraits: ["integer", "rational", "number", "ordered"],
        convertFrom: {
            Integer: (value) => value,
            integer: (value) => value,
        },
        convert(value) {
            if (value instanceof Integer) return value;
            return null;
        },
        validate: (value) => value instanceof Integer,
        export(value) {
            return {
                type: "map",
                entries: new Map([
                    ["type", stringObj("Integer")],
                    ["data", { type: "map", entries: new Map([["value", new Integer(value.value)]]) }],
                    ["cache", null],
                    ["version", new Integer(1n)],
                ]),
            };
        },
        import(value) {
            return new Integer(value?.entries?.get("data")?.entries?.get("value")?.value ?? 0n);
        },
        proto: () => makeProto([
            ["ToString", valueMethod("ToString", (self) => stringObj(self.toString()))],
            ["Describe", valueMethod("Describe", () => stringObj("type:Integer"))],
        ]),
        installs: {},
    });

    registerType({
        name: "CertifiedApproximation",
        aliases: ["approximation", "approximate"],
        nativeType: "approximation",
        defaultTraits: ["number", "approximate", "enclosed", "orderInquiry"],
        convertFrom: {
            CertifiedApproximation: (value) => value,
            approximation: (value) => value,
        },
        convert(value) {
            return value instanceof CertifiedApproximation ? value : null;
        },
        validate: (value) => value instanceof CertifiedApproximation,
        export(value) {
            return {
                type: "map",
                entries: new Map([
                    ["type", stringObj("CertifiedApproximation")],
                    ["data", { type: "map", entries: new Map([
                        ["candidate", value.candidate],
                        ["low", value.low],
                        ["high", value.high],
                        ["spelling", stringObj(value.toString())],
                    ]) }],
                    ["cache", null],
                    ["version", new Integer(1n)],
                ]),
            };
        },
        import(value) {
            const spelling = value?.entries?.get("data")?.entries?.get("spelling")?.value;
            if (!spelling) throw new Error("CertifiedApproximation interchange requires a spelling");
            return parseCertifiedApproximation(spelling);
        },
        proto: () => makeProto([
            ["Candidate", valueMethod("Candidate", (self) => self.candidate)],
            ["Enclosure", valueMethod("Enclosure", (self) => self.enclosure)],
            ["Low", valueMethod("Low", (self) => self.low)],
            ["High", valueMethod("High", (self) => self.high)],
            ["ToString", valueMethod("ToString", (self) => stringObj(self.toString()))],
            ["Describe", valueMethod("Describe", () => stringObj("type:CertifiedApproximation"))],
        ]),
        installs: {},
    });

    registerType({
        name: "RationalInterval",
        aliases: ["Interval", "interval"],
        nativeType: "interval",
        defaultTraits: ["ordered"],
        convertFrom: {
            RationalInterval: (value) => value,
            interval: (value) => value,
        },
        convert(value) {
            return value instanceof RationalInterval ? value : null;
        },
        validate: (value) => value instanceof RationalInterval,
        export(value) {
            return {
                type: "map",
                entries: new Map([
                    ["type", stringObj("RationalInterval")],
                    ["data", { type: "map", entries: new Map([
                        ["low", value.low],
                        ["high", value.high],
                    ]) }],
                    ["cache", null],
                    ["version", new Integer(1n)],
                ]),
            };
        },
        import(value) {
            const data = value?.entries?.get("data");
            return new RationalInterval(data?.entries?.get("low"), data?.entries?.get("high"));
        },
        proto: () => makeProto([
            ["Low", valueMethod("Low", (self) => self.low)],
            ["High", valueMethod("High", (self) => self.high)],
            ["ToString", valueMethod("ToString", (self) => stringObj(self.toString()))],
            ["Describe", valueMethod("Describe", () => stringObj("type:RationalInterval"))],
        ]),
        installs: {},
    });

    const rangeSetComponentMap = (component) => ({
        type: "map",
        entries: new Map([
            ["low", component.low],
            ["high", component.high],
            ["lowClosed", boolResult(component.lowClosed)],
            ["highClosed", boolResult(component.highClosed)],
        ]),
    });
    const rangeSetComponents = (value) => ({
        type: "sequence",
        values: value.components.map(rangeSetComponentMap),
    });
    const rangeSetResult = (source, result) => {
        if (source?._ext instanceof Map) result._ext = new Map(source._ext);
        return result;
    };
    const importRangeSetComponent = (value) => {
        if (!value || value.type !== "map" || !(value.entries instanceof Map)) {
            throw new Error("RationalIntervalSet components must be maps");
        }
        for (const key of ["low", "high", "lowClosed", "highClosed"]) {
            if (!value.entries.has(key)) {
                throw new Error(`RationalIntervalSet component requires ${key}`);
            }
        }
        const readClosure = (key) => {
            const flag = value.entries.get(key);
            if (flag === null) return false;
            if (flag instanceof Integer && flag.value === 1n) return true;
            throw new Error(`RationalIntervalSet ${key} must be a RiX boolean`);
        };
        return {
            low: value.entries.get("low"),
            high: value.entries.get("high"),
            lowClosed: readClosure("lowClosed"),
            highClosed: readClosure("highClosed"),
        };
    };

    registerType({
        name: "RationalIntervalSet",
        aliases: ["RangeSet", "rangeSet"],
        nativeType: "intervalSet",
        defaultTraits: ["collection"],
        convertFrom: {
            RationalIntervalSet: (value) => value,
            intervalSet: (value) => value,
            RationalInterval: (value) => RationalIntervalSet.fromInterval(value),
            interval: (value) => RationalIntervalSet.fromInterval(value),
        },
        convert(value) {
            if (value instanceof RationalIntervalSet) return value;
            if (value instanceof RationalInterval) return RationalIntervalSet.fromInterval(value);
            return null;
        },
        validate: (value) => value instanceof RationalIntervalSet,
        export(value) {
            return {
                type: "map",
                entries: new Map([
                    ["type", stringObj("RationalIntervalSet")],
                    ["data", { type: "map", entries: new Map([
                        ["components", rangeSetComponents(value)],
                    ]) }],
                    ["cache", null],
                    ["version", new Integer(1n)],
                ]),
            };
        },
        import(value) {
            const version = value?.entries?.get("version")?.value;
            if (version !== 1n) {
                throw new Error("Unsupported RationalIntervalSet interchange version");
            }
            const components = value?.entries?.get("data")?.entries?.get("components");
            if (!components || components.type !== "sequence") {
                throw new Error("RationalIntervalSet interchange requires components");
            }
            return new RationalIntervalSet(components.values.map(importRangeSetComponent));
        },
        proto: () => makeProto([
            ["Components", valueMethod("Components", (self) => rangeSetComponents(self))],
            ["Union", valueMethod("Union", (self, [other]) => rangeSetResult(self, self.union(other)))],
            ["Intersection", valueMethod("Intersection", (self, [other]) => rangeSetResult(self, self.intersection(other)))],
            ["Contains", valueMethod("Contains", (self, [other]) => boolResult(self.contains(other)))],
            ["ContainsValue", valueMethod("ContainsValue", (self, [value]) => boolResult(self.containsValue(value)))],
            ["Hull", valueMethod("Hull", (self) => rangeSetResult(self, self.hull()))],
            ["ToString", valueMethod("ToString", (self) => stringObj(self.toString()))],
            ["Describe", valueMethod("Describe", () => stringObj("type:RationalIntervalSet"))],
        ]),
        installs: {},
    });

    registerType({
        name: "Shaped",
        nativeType: "shaped",
        defaultTraits: ["shaped", "indexable", "shapeAware", "collection"],
        convertFrom: {
            shaped: (value) => value,
            array: (value) => createShaped([value.values.length], value.values),
            tuple: (value) => createShaped([value.values.length], value.values),
        },
        convert(value) {
            if (isShaped(value)) return value;
            if (value?.type === "sequence" || value?.type === "tuple") return createShaped([value.values.length], value.values);
            return null;
        },
        validate: isShaped,
        export(value) {
            return {
                type: "map",
                entries: new Map([
                    ["type", stringObj("Shaped")],
                    ["data", { type: "map", entries: new Map([
                        ["shape", { type: "sequence", values: value.shape.map((n) => new Integer(BigInt(n))) }],
                        ["elems", { type: "sequence", values: [...value.data] }],
                        ["scalarDomain", stringObj(shapedScalarDomain(value))],
                    ]) }],
                    ["cache", null],
                    ["version", new Integer(1n)],
                ]),
            };
        },
        import(value) {
            const data = value?.entries?.get("data");
            const shape = data?.entries?.get("shape")?.values.map((n) => Number(n.value)) || [];
            const elems = data?.entries?.get("elems")?.values || [];
            const scalarDomain = data?.entries?.get("scalarDomain")?.value ?? null;
            return createShaped(shape, elems, { scalarDomain });
        },
        proto: () => makeProto([
            ["Describe", valueMethod("Describe", () => stringObj("type:Shaped"))],
        ]),
        installs: {
            ADD: [{
                name: "ShapedElementwise",
                priority: 200,
                prep: (args) => args.length === 2 && (isPlainShaped(args[0]) || isPlainShaped(args[1])),
                impl: ([left, right], context, evaluate) => shapedBinary("ADD", left, right, context, evaluate),
            }],
            SUB: [{
                name: "ShapedElementwise",
                priority: 200,
                prep: (args) => args.length === 2 && (isPlainShaped(args[0]) || isPlainShaped(args[1])),
                impl: ([left, right], context, evaluate) => shapedBinary("SUB", left, right, context, evaluate),
            }],
            MUL: [{
                name: "ShapedElementwise",
                priority: 200,
                prep: (args) => args.length === 2 && (isPlainShaped(args[0]) || isPlainShaped(args[1])),
                impl: ([left, right], context, evaluate) => shapedBinary("MUL", left, right, context, evaluate),
            }],
            DIV: [{
                name: "ShapedElementwise",
                priority: 200,
                prep: (args) => args.length === 2 && (isPlainShaped(args[0]) || isPlainShaped(args[1])),
                impl: ([left, right], context, evaluate) => shapedBinary("DIV", left, right, context, evaluate),
            }],
            POW: [{
                name: "ShapedElementwise",
                priority: 200,
                prep: (args) => args.length === 2 && (isPlainShaped(args[0]) || isPlainShaped(args[1])),
                impl: ([left, right], context, evaluate) => shapedBinary("POW", left, right, context, evaluate),
            }],
            NEG: [{
                name: "ShapedElementwise",
                priority: 200,
                prep: (args) => args.length === 1 && isPlainShaped(args[0]),
                impl: ([value], context, evaluate) => createShaped(
                    value.shape,
                    shapedValues(value).map((entry) => invokeScalarOperator("NEG", [entry], context, evaluate)),
                ),
            }],
            EQ: [{
                name: "ShapedEquality",
                priority: 200,
                prep: (args) => args.length === 2 && isPlainShaped(args[0]) && isPlainShaped(args[1]),
                impl: ([left, right], context, evaluate) => boolResult(shapedEquality(left, right, context, evaluate)),
            }],
            NEQ: [{
                name: "ShapedInequality",
                priority: 200,
                prep: (args) => args.length === 2 && isPlainShaped(args[0]) && isPlainShaped(args[1]),
                impl: ([left, right], context, evaluate) => boolResult(!shapedEquality(left, right, context, evaluate)),
            }],
        },
    });

    registerType({
        name: "Length",
        nativeType: "Length",
        defaultTraits: [],
        convert: (value) => value,
        proto: () => makeProto([
            ["Describe", valueMethod("Describe", () => stringObj("type:length"))],
            ["KIND", valueMethod("KIND", () => stringObj("type:length"))],
        ]),
    });
    registerType({ name: "Point", nativeType: "Point", defaultTraits: [], convert: (value) => value, proto: () => makeProto([["Describe", valueMethod("Describe", () => stringObj("type:point"))]]) });
    registerType({
        name: "Matrix",
        nativeType: "shaped",
        defaultTraits: ["shaped", "indexable", "shapeAware", "collection"],
        convert: (value) => isShaped(value) && shapedRank(value) === 2 ? value : null,
        validate: (value) => isShaped(value) && shapedRank(value) === 2,
        export(value) {
            const exported = typeRegistry.get("Shaped").export(value);
            exported.entries.set("type", stringObj("Matrix"));
            return exported;
        },
        import(value) {
            return typeRegistry.get("Shaped").import(value);
        },
        proto: () => makeProto([
            ["Describe", valueMethod("Describe", () => stringObj("type:Matrix"))],
            ["Transpose", valueMethod("Transpose", (self) => finalizeImportedRegisteredValue(createShaped(
                [self.shape[1], self.shape[0]],
                Array.from({ length: self.shape[0] * self.shape[1] }, (_, index) => {
                    const row = Math.floor(index / self.shape[0]);
                    const column = index % self.shape[0];
                    return shapedValues(self)[column * self.shape[1] + row];
                }),
            ), "Matrix", typeRegistry.get("Matrix")))],
            ["Hadamard", valueMethod("Hadamard", (self, [other], context, evaluate) =>
                finalizeImportedRegisteredValue(matrixElementwise("MUL", self, other, context, evaluate), "Matrix", typeRegistry.get("Matrix")))],
        ]),
        installs: {
            ADD: [{
                name: "MatrixAddition", priority: 300,
                prep: (args) => args.length === 2 && isMatrixValue(args[0]) && isMatrixValue(args[1]),
                impl: ([left, right], context, evaluate) => matrixElementwise("ADD", left, right, context, evaluate),
            }],
            SUB: [{
                name: "MatrixSubtraction", priority: 300,
                prep: (args) => args.length === 2 && isMatrixValue(args[0]) && isMatrixValue(args[1]),
                impl: ([left, right], context, evaluate) => matrixElementwise("SUB", left, right, context, evaluate),
            }],
            MUL: [{
                name: "MatrixMultiplication", priority: 300,
                prep: (args) => args.length === 2 && (isMatrixValue(args[0]) || isMatrixValue(args[1])),
                impl: ([left, right], context, evaluate) => matrixMultiply(left, right, context, evaluate),
            }],
            DIV: [{
                name: "MatrixScalarDivision", priority: 300,
                prep: (args) => args.length === 2 && isMatrixValue(args[0]) && !isMatrixValue(args[1]),
                impl: ([matrix, scalar], context, evaluate) => matrixScalar("DIV", matrix, scalar, false, context, evaluate),
            }],
            POW: [{
                name: "MatrixPower", priority: 300,
                prep: (args) => args.length === 2 && isMatrixValue(args[0]),
                impl: ([matrix, exponent], context, evaluate) => matrixPower(matrix, exponent, context, evaluate),
            }],
            NEG: [{
                name: "MatrixNegation", priority: 300,
                prep: (args) => args.length === 1 && isMatrixValue(args[0]),
                impl: ([matrix], context, evaluate) => createShaped(
                    matrix.shape,
                    shapedValues(matrix).map((entry) => invokeScalarOperator("NEG", [entry], context, evaluate)),
                ),
            }],
            EQ: [{
                name: "MatrixEquality", priority: 300,
                prep: (args) => args.length === 2 && isMatrixValue(args[0]) && isMatrixValue(args[1]),
                impl: ([left, right], context, evaluate) => boolResult(matrixEquality(left, right, context, evaluate)),
            }],
            NEQ: [{
                name: "MatrixInequality", priority: 300,
                prep: (args) => args.length === 2 && isMatrixValue(args[0]) && isMatrixValue(args[1]),
                impl: ([left, right], context, evaluate) => boolResult(!matrixEquality(left, right, context, evaluate)),
            }],
        },
    });
    registerType({ name: "Vector", nativeType: "vector", defaultTraits: [], convert: (value) => value?.type === "vector" ? value : null, validate: (value) => value?.type === "vector", proto: () => makeProto([["Describe", valueMethod("Describe", () => stringObj("type:Vector"))]]) });
    registerType({ name: "Covector", nativeType: "covector", defaultTraits: [], convert: (value) => value?.type === "covector" ? value : null, validate: (value) => value?.type === "covector", proto: () => makeProto([["Describe", valueMethod("Describe", () => stringObj("type:Covector"))]]) });
    registerType({ name: "Tensor", nativeType: "tensor", defaultTraits: [], convert: (value) => value?.type === "tensor" ? value : null, validate: (value) => value?.type === "tensor", proto: () => makeProto([["Describe", valueMethod("Describe", () => stringObj("type:Tensor"))]]) });

    for (const name of typeRegistry.list()) builtinTypeNames.add(semanticNameKey(name));
    builtinsRegistered = true;
}

export function exportByRegisteredType(value) {
    const typeName = value?._ext?.get("__type")?.value ?? null;
    const entry = typeRegistry.get(typeName) ?? typeRegistry.get(runtimeTypeName(value));
    if (!entry?.export) throw new Error(`No type export registered for ${typeName || runtimeTypeName(value)}`);
    return entry.export(value);
}

export function exportByRegisteredTypeRuntime(value, context = null, evaluate = null) {
    const typeName = value?._ext?.get("__type")?.value ?? null;
    const entry = typeRegistry.get(typeName) ?? typeRegistry.get(runtimeTypeName(value));
    if (!entry?.export) throw new Error(`No type export registered for ${typeName || runtimeTypeName(value)}`);
    return invokeMaybeCallable(entry.export, [value], context, evaluate);
}

export function importByRegisteredType(value) {
    if (!value || value.type !== "map" || !(value.entries instanceof Map)) {
        throw new Error("TypeImport expects a tagged map export");
    }
    const typeName = value.entries.get("type")?.value;
    if (!typeName) throw new Error("TypeImport export map requires a type tag");
    const entry = typeRegistry.get(typeName);
    if (!entry?.import) throw new Error(`No type import registered for ${typeName}`);
    const imported = entry.import(value);
    return finalizeImportedRegisteredValue(imported, typeName, entry);
}

function finalizeImportedRegisteredValue(imported, typeName, entry) {
    if (isUndecided(imported)) return imported;
    if (imported && typeof imported === "object") {
        if (!(imported._ext instanceof Map)) imported._ext = new Map();
        imported._ext.set("__type", stringObj(entry?.name ?? typeName));
        const traits = resolveTraitNames(entry.defaultTraits || []);
        if (traits.length > 0) {
            imported._ext.set("__traits", {
                type: "set",
                values: traits.map(stringObj),
                _ext: new Map([["order", { type: "sequence", values: traits.map(stringObj) }]]),
            });
        }
        imported._ext.set("__proto", makeProto([
            ["type", entry.proto?.(imported) ?? makeProto()],
            ["traits", makeProto()],
        ]));
        imported._ext.set("_type", stringObj(runtimeTypeName(imported)));
    }
    return imported;
}

export function importByRegisteredTypeRuntime(value, context = null, evaluate = null) {
    if (!value || value.type !== "map" || !(value.entries instanceof Map)) {
        throw new Error("TypeImport expects a tagged map export");
    }
    const typeName = value.entries.get("type")?.value;
    if (!typeName) throw new Error("TypeImport export map requires a type tag");
    const entry = typeRegistry.get(typeName);
    if (!entry?.import) throw new Error(`No type import registered for ${typeName}`);
    return finalizeImportedRegisteredValue(invokeMaybeCallable(entry.import, [value], context, evaluate), typeName, entry);
}

export function installRegisteredTypes(registry, typeNames = ["Integer", "Rational", "CertifiedApproximation", "RationalInterval", "RationalIntervalSet", "Shaped", "Matrix"], options = {}) {
    let order = 0;
    for (const typeName of typeNames) {
        const entry = typeRegistry.get(typeName);
        if (!entry) throw new Error(`Unknown semantic type: ${typeName}`);
        for (const [targetFunction, variants] of entry.installs || []) {
            if (options.onlyFunctions && !options.onlyFunctions.has(targetFunction)) continue;
            if (options.skipMissing && !registry.get(targetFunction)) continue;
            for (const variant of variants || []) {
                if (
                    options.skipExisting &&
                    registry.get(targetFunction)?.variants?.some((existing) =>
                        existing.name === variant.name && existing.installedByType === entry.name,
                    )
                ) {
                    continue;
                }
                registry.installVariant(targetFunction, {
                    ...variant,
                    impl(args, context, evaluate) {
                        const result = variant.impl(args, context, evaluate);
                        if (
                            result &&
                            typeof result === "object" &&
                            entry.nativeType &&
                            runtimeTypeName(result) === entry.nativeType
                        ) {
                            return finalizeImportedRegisteredValue(result, entry.name, entry);
                        }
                        return result;
                    },
                    installedByType: entry.name,
                    targetFunction,
                    installOrder: order++,
                });
            }
        }
    }
}

function mapGet(mapValue, key) {
    if (mapValue?.type !== "map" || !(mapValue.entries instanceof Map)) return undefined;
    if (mapValue.entries.has(key)) return mapValue.entries.get(key);
    const lowerKey = key.toLowerCase();
    for (const [entryKey, value] of mapValue.entries) {
        if (String(entryKey).toLowerCase() === lowerKey) return value;
    }
    return undefined;
}

function listNames(value) {
    if (!value) return [];
    if (value.type === "set" || value.type === "sequence" || value.type === "tuple") {
        return value.values.map(colonName).filter(Boolean);
    }
    if (value.type === "map" && value.entries instanceof Map) {
        return Array.from(value.entries.keys());
    }
    return [];
}

function protoFromRixMap(value, context = null) {
    if (!value || value.type !== "map" || !(value.entries instanceof Map)) return value;
    return makeProto(Array.from(value.entries.entries()).map(([key, entry]) => [key, captureHook(entry, context)]));
}

function captureHook(value, context) {
    if (isCallable(value) && context?.getEnv) {
        const captured = new Map();
        for (const key of ["jsImportBaseDir", "scriptBaseDir"]) {
            if (context.env?.has(key)) captured.set(key, context.getEnv(key, undefined));
        }
        Object.defineProperty(value, "__rixCapturedEnv", {
            value: captured,
            configurable: true,
        });
    }
    return value;
}

function hooksFromRixMap(value, context = null) {
    if (!value || value.type !== "map" || !(value.entries instanceof Map)) return {};
    return Object.fromEntries(Array.from(value.entries.entries()).map(([key, entry]) => [key, captureHook(entry, context)]));
}

function isRixList(value) {
    return value?.type === "sequence" || value?.type === "tuple" || value?.type === "set";
}

function callableVariantHook(fn, mode) {
    if (!fn) return mode === "prep" ? null : () => null;
    return (args, context, evaluate) => invokeMaybeCallable(fn, args, context, evaluate);
}

function variantsFromRixList(value, context = null) {
    if (!value) return [];
    const items = isRixList(value) ? value.values : [value];
    return items.map((item, index) => {
        if (!item || item.type !== "map" || !(item.entries instanceof Map)) {
            throw new Error("Type install variants must be map specs");
        }
        const name = colonName(mapGet(item, "name")) || `Variant${index + 1}`;
        const priorityValue = mapGet(item, "priority");
        const priority = priorityValue instanceof Integer
            ? Number(priorityValue.value)
            : priorityValue instanceof Rational && priorityValue.denominator === 1n
                ? Number(priorityValue.numerator)
                : undefined;
        return {
            name,
            prep: callableVariantHook(captureHook(mapGet(item, "prep"), context), "prep"),
            impl: callableVariantHook(captureHook(mapGet(item, "impl"), context), "impl"),
            ...(Number.isFinite(priority) ? { priority } : {}),
        };
    });
}

function installsFromRixMap(value, context = null) {
    if (!value || value.type !== "map" || !(value.entries instanceof Map)) return new Map();
    return new Map(Array.from(value.entries.entries()).map(([targetFunction, variants]) => [
        targetFunction,
        variantsFromRixList(variants, context),
    ]));
}

export function registerTraitFromRixSpec(spec, context = null) {
    if (!spec || spec.type !== "map" || !(spec.entries instanceof Map)) {
        throw new Error("TraitRegister expects a map spec");
    }
    const proto = protoFromRixMap(mapGet(spec, "proto"), context) || makeProto();
    return registerTrait({
        name: colonName(mapGet(spec, "name")),
        implies: listNames(mapGet(spec, "implies")),
        verify: captureHook(mapGet(spec, "verify") || null, context),
        proto: () => proto,
        description: mapGet(spec, "description")?.value ?? "",
    });
}

export function registerTypeFromRixSpec(spec, context = null) {
    if (!spec || spec.type !== "map" || !(spec.entries instanceof Map)) {
        throw new Error("TypeRegister expects a map spec");
    }
    const proto = protoFromRixMap(mapGet(spec, "proto"), context) || makeProto();
    const registration = {
        name: colonName(mapGet(spec, "name")),
        aliases: listNames(mapGet(spec, "aliases")),
        nativeType: colonName(mapGet(spec, "nativeType")),
        parent: colonName(mapGet(spec, "parent")),
        defaultTraits: listNames(mapGet(spec, "defaultTraits")),
        construct: captureHook(mapGet(spec, "construct") || null, context),
        convert: captureHook(mapGet(spec, "convert") || null, context),
        convertFrom: hooksFromRixMap(mapGet(spec, "convertFrom"), context),
        normalize: captureHook(mapGet(spec, "normalize") || null, context),
        validate: captureHook(mapGet(spec, "validate") || null, context),
        export: captureHook(mapGet(spec, "export") || null, context),
        import: captureHook(mapGet(spec, "import") || null, context),
        proto: () => proto,
        installs: installsFromRixMap(mapGet(spec, "installs"), context),
        display: captureHook(mapGet(spec, "display") || null, context),
    };
    const entry = typeRegistry.has(registration.name)
        ? replaceRegisteredType(registration)
        : registerType(registration);
    if (context?.getEnv && context?.setEnv) {
        const registered = context.getEnv("__rix_registered_types__", new Set());
        registered.add(entry.name);
        context.setEnv("__rix_registered_types__", registered);
    }
    return entry;
}

registerBuiltinSemanticTypes();
