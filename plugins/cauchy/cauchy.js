import { CertifiedApproximation, Integer, Rational, RationalInterval } from "@ratmath/core";
import {
    normalizeRefinementRequest,
    refinementEntry,
    unsupportedRefinementResult,
} from "../../src/runtime/refinement.js";

export const CAUCHY_SEQUENCE_SCHEMA = "rix.cauchy.sequence@1";
export const CAUCHY_REAL_SCHEMA = "rix.cauchy.real@1";

const ZERO = Rational.zero;
const ONE = Rational.one;
const TWO = new Rational(2n, 1n);
const PROVIDER_MAX_WORK = 100000n;

const int = (value) => new Integer(BigInt(value));
const text = (value) => ({ type: "string", value: String(value) });
const bool = (value) => value ? int(1) : null;
const sequence = (values = []) => ({ type: "sequence", values });
const map = (entries = []) => ({ type: "map", entries: new Map(entries) });

function exactRational(value, label) {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return value.toRational();
    throw new Error(`${label} must be an exact Integer or Rational`);
}

function nonnegativeInteger(value, label) {
    if (!(value instanceof Integer) || value.value < 0n) {
        throw new Error(`${label} must be a nonnegative Integer`);
    }
    return value.value;
}

function option(options, key, fallback = null) {
    if (!(options?.type === "map" && options.entries instanceof Map)) return fallback;
    const wanted = String(key).toLowerCase();
    for (const [candidate, value] of options.entries) {
        if (String(candidate).toLowerCase() === wanted) return value;
    }
    return fallback;
}

function nameOption(options, fallback) {
    const value = option(options, "name", null);
    return value?.type === "string" ? value.value : value === null ? fallback : String(value);
}

function invokeExact(callable, args, runtime, label) {
    if (typeof runtime?.invoke !== "function") throw new Error(`${label} requires an evaluator callback`);
    const result = runtime.invoke(callable, args, runtime.context, runtime.evaluate);
    if (result && typeof result.then === "function") {
        throw new Error(`${label} must be synchronous in Cauchy Phase 1`);
    }
    return result;
}

function exactTerm(value, index) {
    return exactRational(value, `Cauchy term ${index}`);
}

function exactTailBound(value, index) {
    const bound = exactRational(value, `Cauchy tail bound ${index}`);
    if (bound.lessThan(ZERO)) throw new Error(`Cauchy tail bound ${index} must be nonnegative`);
    return bound;
}

function witness(term, tailBound, index) {
    return Object.freeze({
        index,
        term,
        tailBound,
        interval: new RationalInterval(term.subtract(tailBound), term.add(tailBound)),
    });
}

function witnessRecord(value) {
    return map([
        ["index", int(value.index)],
        ["term", value.term],
        ["tailbound", value.tailBound],
        ["interval", value.interval],
        ["width", value.interval.high.subtract(value.interval.low)],
    ]);
}

export class CauchySequence {
    constructor(termCallable, { name = "sequence" } = {}) {
        if (termCallable === null || termCallable === undefined) throw new Error("Cauchy Sequence requires a term function");
        this.type = "CauchySequence";
        this.schema = CAUCHY_SEQUENCE_SCHEMA;
        this.termCallable = termCallable;
        this.name = String(name);
        Object.freeze(this);
    }

    toString() {
        return `CauchySequence(${this.name}, uncertified)`;
    }
}

export class CertifiedCauchyReal {
    constructor({ kind, name, termCallable = null, tailCallable = null, modulusCallable = null,
        first = null, ratio = null, evidence = null, initialWitness }) {
        this.type = "CauchyReal";
        this.schema = CAUCHY_REAL_SCHEMA;
        this.kind = String(kind);
        this.name = String(name);
        this.termCallable = termCallable;
        this.tailCallable = tailCallable;
        this.modulusCallable = modulusCallable;
        this.first = first;
        this.ratio = ratio;
        this.evidence = evidence;
        this.initialWitness = initialWitness;
        Object.freeze(this);
    }

    toString() {
        return `CauchyReal(${this.name}, ${this.kind}, ${this.initialWitness.interval})`;
    }
}

export const isCauchySequence = (value) => value instanceof CauchySequence;
export const isCertifiedCauchyReal = (value) => value instanceof CertifiedCauchyReal;

function requireSequence(value) {
    if (!isCauchySequence(value) && !isCertifiedCauchyReal(value)) throw new Error("Expected a Cauchy sequence value");
    return value;
}

function requireCertified(value) {
    if (!isCertifiedCauchyReal(value)) throw new Error("Expected a certified Cauchy real");
    return value;
}

function geometricTerm(real, index) {
    const power = real.ratio.pow(index + 1n);
    return real.first.multiply(ONE.subtract(power)).divide(ONE.subtract(real.ratio));
}

function geometricTailBound(real, index) {
    const magnitude = real.ratio.abs();
    return real.first.abs().multiply(magnitude.pow(index + 1n)).divide(ONE.subtract(magnitude));
}

function witnessAt(real, index, runtime) {
    if (real.kind === "geometric") {
        return witness(geometricTerm(real, index), geometricTailBound(real, index), index);
    }
    const indexValue = int(index);
    return witness(
        exactTerm(invokeExact(real.termCallable, [indexValue], runtime, "Cauchy term function"), index),
        exactTailBound(invokeExact(real.tailCallable, [indexValue], runtime, "Cauchy tail-bound function"), index),
        index,
    );
}

function constructSequence(args, runtime) {
    if (args.length === 1) return new CauchySequence(args[0]);
    if (args.length === 3 || args.length === 4) return constructCertified(args, runtime);
    throw new Error("cauchy.Sequence expects term, or term, tailBound, modulus, and optional options");
}

function constructCertified(args, runtime) {
    if (args.length < 3 || args.length > 4) {
        throw new Error("cauchy.Certified expects term, tailBound, modulus, and optional options");
    }
    const [termCallable, tailCallable, modulusCallable, options = null] = args;
    if (termCallable === null || tailCallable === null || modulusCallable === null) {
        throw new Error("Certified Cauchy construction requires term, tail-bound, and modulus functions");
    }
    const initialTerm = exactTerm(invokeExact(termCallable, [int(0)], runtime, "Cauchy term function"), 0n);
    const initialTail = exactTailBound(
        invokeExact(tailCallable, [int(0)], runtime, "Cauchy tail-bound function"),
        0n,
    );
    return new CertifiedCauchyReal({
        kind: "declared",
        name: nameOption(options, "certifiedSequence"),
        termCallable,
        tailCallable,
        modulusCallable,
        evidence: option(options, "evidence", text("declaredTailModulus")),
        initialWitness: witness(initialTerm, initialTail, 0n),
    });
}

function constructGeometric(args) {
    if (args.length < 2 || args.length > 3) {
        throw new Error("cauchy.Geometric expects first term, ratio, and optional options");
    }
    const first = exactRational(args[0], "Cauchy geometric first term");
    const ratio = exactRational(args[1], "Cauchy geometric ratio");
    if (!ratio.abs().lessThan(ONE)) throw new Error("Cauchy geometric ratio must have absolute value less than one");
    const shell = { first, ratio };
    const initial = witness(
        first,
        first.abs().multiply(ratio.abs()).divide(ONE.subtract(ratio.abs())),
        0n,
    );
    return new CertifiedCauchyReal({
        kind: "geometric",
        name: nameOption(args[2], "geometricSeries"),
        first,
        ratio,
        evidence: map([
            ["kind", text("geometricTail")],
            ["property", text("absoluteRemainderBound")],
            ["ratio", ratio],
        ]),
        initialWitness: initial,
    });
}

function termAt(value, indexValue, runtime) {
    const sequenceValue = requireSequence(value);
    const index = nonnegativeInteger(indexValue, "Cauchy term index");
    if (isCertifiedCauchyReal(sequenceValue)) return witnessAt(sequenceValue, index, runtime).term;
    return exactTerm(
        invokeExact(sequenceValue.termCallable, [int(index)], runtime, "Cauchy term function"),
        index,
    );
}

function tailBoundAt(value, indexValue, runtime) {
    const real = requireCertified(value);
    const index = nonnegativeInteger(indexValue, "Cauchy tail-bound index");
    return witnessAt(real, index, runtime).tailBound;
}

function enclosureAt(value, indexValue, runtime) {
    const real = requireCertified(value);
    const index = nonnegativeInteger(indexValue, "Cauchy enclosure index");
    return witnessAt(real, index, runtime).interval;
}

function modulusAt(value, radiusValue, runtime) {
    const real = requireCertified(value);
    const radius = exactRational(radiusValue, "Cauchy modulus radius");
    if (!radius.greaterThan(ZERO)) throw new Error("Cauchy modulus radius must be positive");
    if (real.kind === "geometric") {
        let index = 0n;
        while (geometricTailBound(real, index).greaterThan(radius)) {
            index += 1n;
            if (index > PROVIDER_MAX_WORK) throw new Error("Cauchy modulus exceeds the provider index limit");
        }
        return int(index);
    }
    const indexValue = invokeExact(real.modulusCallable, [radius], runtime, "Cauchy modulus function");
    const index = nonnegativeInteger(indexValue, "Cauchy modulus result");
    const bound = witnessAt(real, index, runtime).tailBound;
    if (bound.greaterThan(radius)) {
        throw new Error(`Cauchy modulus certificate failed at index ${index}: tail bound ${bound} exceeds ${radius}`);
    }
    return int(index);
}

function capabilities(kind) {
    const certified = kind !== "bare";
    const evidenceLevels = kind === "geometric"
        ? [text("proof")]
        : kind === "declared" ? [text("constructorGuarantee")] : [];
    return map([
        ["valuekind", text("numericsCapabilities")],
        ["schema", text("rix.numerics.capabilities@1")],
        ["backend", text("cauchy")],
        ["representation", text(certified ? "rationalSequenceWithTailModulus" : "bareRationalSequence")],
        ["operations", sequence(certified ? [text("enclose"), text("refine")] : [])],
        ["evidencelevels", sequence(evidenceLevels)],
        ["certified", bool(certified)],
        ["arbitraryrefinement", bool(certified)],
        ["deterministic", int(1)],
        ["minimumwidth", ZERO],
        ["maxcalls", int(certified ? PROVIDER_MAX_WORK : 0n)],
        ["maxiterations", int(certified ? PROVIDER_MAX_WORK : 0n)],
    ]);
}

function refinementResult(real, requestValue, runtime) {
    const providerCapabilities = capabilities(real.kind);
    const request = normalizeRefinementRequest(requestValue, { capabilities: providerCapabilities });
    const requestedWidth = refinementEntry(request, "absolutewidth");
    const work = refinementEntry(request, "work");
    const maxCalls = nonnegativeInteger(refinementEntry(work, "maxcalls", int(0)), "Cauchy maxCalls");
    const maxIterations = nonnegativeInteger(
        refinementEntry(work, "maxiterations", int(0)),
        "Cauchy maxIterations",
    );
    let selected = real.initialWitness;
    let calls = 0n;
    let iterations = 0n;
    let diagnostic = null;
    const initialWidth = selected.interval.high.subtract(selected.interval.low);

    if (initialWidth.greaterThan(requestedWidth)) {
        if (real.kind === "geometric") {
            const budget = maxCalls < maxIterations ? maxCalls : maxIterations;
            while (iterations < budget) {
                const nextIndex = selected.index + 1n;
                selected = witnessAt(real, nextIndex, runtime);
                calls += 1n;
                iterations += 1n;
                if (selected.interval.high.subtract(selected.interval.low).lessThanOrEqual(requestedWidth)) break;
            }
            if (selected.interval.high.subtract(selected.interval.low).greaterThan(requestedWidth)) {
                diagnostic = "workBudgetReached";
            }
        } else if (maxCalls < 3n || maxIterations < 1n) {
            diagnostic = "insufficientBudgetForModulusWitness";
        } else {
            const targetRadius = requestedWidth.divide(TWO);
            const indexValue = invokeExact(real.modulusCallable, [targetRadius], runtime, "Cauchy modulus function");
            calls += 1n;
            const index = nonnegativeInteger(indexValue, "Cauchy modulus result");
            const candidate = witnessAt(real, index, runtime);
            calls += 2n;
            iterations = 1n;
            if (candidate.tailBound.greaterThan(targetRadius)) {
                throw new Error(
                    `Cauchy modulus certificate failed at index ${index}: tail bound ${candidate.tailBound} exceeds ${targetRadius}`,
                );
            }
            if (!candidate.interval.overlaps(real.initialWitness.interval)) {
                throw new Error(`Cauchy certificate at index ${index} contradicts the initial certified enclosure`);
            }
            selected = candidate;
        }
    }

    const interval = selected.interval;
    const achievedWidth = interval.high.subtract(interval.low);
    const goalMet = achievedWidth.lessThanOrEqual(requestedWidth);
    const status = goalMet ? "enclosed" : "budgetExhausted";
    const approximation = new CertifiedApproximation(selected.term, interval, {
        representation: {
            kind: "derived",
            reason: status,
            original: null,
            requested: requestedWidth,
            achieved: achievedWidth,
            provider: "cauchy",
        },
    });
    return map([
        ["valuekind", text("enclosure")],
        ["schema", text("rix.numerics.enclosure@1")],
        ["status", text(status)],
        ["interval", interval],
        ["certified", int(1)],
        ["goalmet", bool(goalMet)],
        ["requestedwidth", requestedWidth],
        ["achievedwidth", achievedWidth],
        ["approximation", approximation],
        ["evidencelevel", text(real.kind === "geometric" ? "proof" : "constructorGuarantee")],
        ["backend", text("cauchy")],
        ["operation", refinementEntry(request, "operation")],
        ["trace", sequence([witnessRecord(selected)])],
        ["work", map([
            ["calls", int(calls)],
            ["iterations", int(iterations)],
            ["index", int(selected.index)],
            ["maxcalls", int(maxCalls)],
            ["maxiterations", int(maxIterations)],
            ["exhausted", bool(!goalMet)],
        ])],
        ["diagnostics", sequence(diagnostic ? [text(diagnostic)] : [])],
        ["evidence", map([
            ["kind", text(real.kind === "geometric" ? "geometricTail" : "declaredTailModulus")],
            ["property", text("limitWithinTermPlusOrMinusTailBound")],
            ["witness", witnessRecord(selected)],
            ["certificate", real.evidence],
        ])],
        ["source", map([
            ["plugin", text("cauchy")],
            ["schema", text(CAUCHY_REAL_SCHEMA)],
            ["recipe", text(real.kind)],
            ["name", text(real.name)],
        ])],
    ]);
}

function record(value) {
    const sequenceValue = requireSequence(value);
    if (isCauchySequence(sequenceValue)) {
        return map([
            ["valuekind", text("cauchySequence")],
            ["schema", text(CAUCHY_SEQUENCE_SCHEMA)],
            ["name", text(sequenceValue.name)],
            ["certified", null],
            ["tailmodulus", null],
        ]);
    }
    const entries = [
        ["valuekind", text("cauchyReal")],
        ["schema", text(CAUCHY_REAL_SCHEMA)],
        ["name", text(sequenceValue.name)],
        ["kind", text(sequenceValue.kind)],
        ["certified", int(1)],
        ["initialwitness", witnessRecord(sequenceValue.initialWitness)],
        ["evidence", sequenceValue.evidence],
    ];
    if (sequenceValue.kind === "geometric") {
        entries.push(["first", sequenceValue.first], ["ratio", sequenceValue.ratio]);
    }
    return map(entries);
}

function method(name, impl) {
    return { type: "method_builtin", name, impl };
}

export function registerCauchyMethods(systemContext, owner = {}) {
    const register = (typeName, name, impl) => systemContext.registerMethod(typeName, name, method(name, impl), owner);
    register("CauchySequence", "Term", ([value, index], context, evaluate, invoke) =>
        termAt(value, index, { context, evaluate, invoke }));
    register("CauchySequence", "Record", ([value]) => record(value));
    register("CauchySequence", "NumericsCapabilities", () => capabilities("bare"));
    register("CauchySequence", "Enclose", ([value, request]) =>
        unsupportedRefinementResult(request, capabilities("bare"), "missingCertifiedTailModulus"));
    register("CauchySequence", "Refine", ([value, request]) =>
        unsupportedRefinementResult(request, capabilities("bare"), "missingCertifiedTailModulus"));

    register("CauchyReal", "Term", ([value, index], context, evaluate, invoke) =>
        termAt(value, index, { context, evaluate, invoke }));
    register("CauchyReal", "TailBound", ([value, index], context, evaluate, invoke) =>
        tailBoundAt(value, index, { context, evaluate, invoke }));
    register("CauchyReal", "Modulus", ([value, radius], context, evaluate, invoke) =>
        modulusAt(value, radius, { context, evaluate, invoke }));
    register("CauchyReal", "Enclosure", ([value, index], context, evaluate, invoke) =>
        enclosureAt(value, index, { context, evaluate, invoke }));
    register("CauchyReal", "InitialEnclosure", ([value]) => requireCertified(value).initialWitness.interval);
    register("CauchyReal", "Record", ([value]) => record(value));
    register("CauchyReal", "NumericsCapabilities", ([value]) => capabilities(requireCertified(value).kind));
    register("CauchyReal", "Enclose", ([value, request], context, evaluate, invoke) =>
        refinementResult(requireCertified(value), request, { context, evaluate, invoke }));
    register("CauchyReal", "Refine", ([value, request], context, evaluate, invoke) =>
        refinementResult(requireCertified(value), request, { context, evaluate, invoke }));
}

export function createCauchyPluginValue() {
    const helpers = new Map([
        ["Sequence", (args, runtime) => constructSequence(args, runtime)],
        ["Certified", (args, runtime) => constructCertified(args, runtime)],
        ["Geometric", (args) => constructGeometric(args)],
        ["Term", (args, runtime) => termAt(args[0], args[1], runtime)],
        ["TailBound", (args, runtime) => tailBoundAt(args[0], args[1], runtime)],
        ["Modulus", (args, runtime) => modulusAt(args[0], args[1], runtime)],
        ["Enclosure", (args, runtime) => enclosureAt(args[0], args[1], runtime)],
        ["Record", (args) => record(args[0])],
    ]);
    const entries = new Map();
    const extension = new Map([["immutable", int(1)]]);
    for (const [name, helper] of helpers) {
        entries.set(name, helper);
        entries.set(name.toUpperCase(), helper);
        extension.set(name.toUpperCase(), method(name, (args, context, evaluate, invoke) =>
            helper(args.slice(1), { context, evaluate, invoke })));
    }
    return { type: "map", entries, _ext: extension };
}

export function installCauchyPlugin({ systemContext, metadata = {}, options = {} }) {
    const value = createCauchyPluginValue();
    const mount = options.as || metadata.mount || "cauchy";
    const owner = { pluginId: metadata.id || "cauchy", mount };
    systemContext.registerHostValue(mount, value, {
        doc: metadata.description || "Rational Cauchy sequences with certified tail moduli",
        groups: metadata.groups || ["Numerics", "Exact"],
        pluginId: metadata.id || "cauchy",
    });
    registerCauchyMethods(systemContext, owner);
    return value;
}
