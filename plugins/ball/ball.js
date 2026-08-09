import { CertifiedApproximation, Integer, Rational, RationalInterval } from "@ratmath/core";
import {
    normalizeRefinementRequest,
    refinementEntry,
} from "../../src/runtime/refinement.js";

export const BALL_SCHEMA = "rix.ball@1";
export const NESTED_BALL_SCHEMA = "rix.ball.nested-real@1";

const ZERO = Rational.zero;
const ONE = Rational.one;
const PROVIDER_MAX_CALLS = 100000n;

const int = (value) => new Integer(BigInt(value));
const text = (value) => ({ type: "string", value: String(value) });
const bool = (value) => value ? int(1) : null;
const sequence = (values = []) => ({ type: "sequence", values });
const map = (entries = []) => ({ type: "map", entries: new Map(entries) });

function exactRational(value, label = "Ball value") {
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

function intervalWidth(interval) {
    return interval.high.subtract(interval.low);
}

function ballFromInterval(interval) {
    if (!(interval instanceof RationalInterval)) throw new Error("Ball interval must be a RationalInterval");
    const midpoint = interval.low.add(interval.high).divide(new Rational(2n, 1n));
    const radius = interval.high.subtract(interval.low).divide(new Rational(2n, 1n));
    return new ExactBall(midpoint, radius);
}

function floorDiv(numerator, denominator) {
    return numerator >= 0n
        ? numerator / denominator
        : -((-numerator + denominator - 1n) / denominator);
}

function ceilDiv(numerator, denominator) {
    return -floorDiv(-numerator, denominator);
}

function roundOutBall(value, bitsValue = int(53)) {
    const ball = requireBall(value);
    const bits = nonnegativeInteger(bitsValue, "Ball dyadic precision");
    if (bits > 100000n) throw new Error("Ball dyadic precision must not exceed 100000 bits");
    const scale = 1n << bits;
    const low = ball.interval.low;
    const high = ball.interval.high;
    const roundedLow = new Rational(floorDiv(low.numerator * scale, low.denominator), scale);
    const roundedHigh = new Rational(ceilDiv(high.numerator * scale, high.denominator), scale);
    return ballFromInterval(new RationalInterval(roundedLow, roundedHigh));
}

export class ExactBall {
    constructor(midpoint, radius = ZERO) {
        this.type = "Ball";
        this.schema = BALL_SCHEMA;
        this.midpoint = exactRational(midpoint, "Ball midpoint");
        this.radius = exactRational(radius, "Ball radius");
        if (this.radius.lessThan(ZERO)) throw new Error("Ball radius must be nonnegative");
        this.interval = new RationalInterval(
            this.midpoint.subtract(this.radius),
            this.midpoint.add(this.radius),
        );
        Object.freeze(this);
    }

    toString() {
        return `Ball(${this.midpoint}, ${this.radius})`;
    }
}

export class NestedBallReal {
    constructor(kind, parameter, initialBall) {
        this.type = "NestedBallReal";
        this.schema = NESTED_BALL_SCHEMA;
        this.kind = String(kind);
        this.parameter = exactRational(parameter, "Nested Ball parameter");
        this.initialBall = requireBall(initialBall);
        Object.freeze(this);
    }

    toString() {
        return `NestedBall(${this.kind}(${this.parameter}), ${this.initialBall.interval})`;
    }
}

export const isBall = (value) => value instanceof ExactBall;
export const isNestedBallReal = (value) => value instanceof NestedBallReal;

function requireBall(value) {
    if (!isBall(value)) throw new Error("Expected a Ball value");
    return value;
}

function promoteBall(value, label = "Ball operand") {
    return isBall(value) ? value : new ExactBall(exactRational(value, label), ZERO);
}

function hasBall(left, right = null) {
    return isBall(left) || isBall(right);
}

function binaryBall(left, right, operation) {
    const a = promoteBall(left);
    const b = promoteBall(right);
    return ballFromInterval(operation(a.interval, b.interval));
}

function divideBalls(left, right) {
    const divisor = promoteBall(right);
    if (divisor.interval.containsZero()) throw new Error("Cannot divide by a Ball containing zero");
    return binaryBall(left, divisor, (a, b) => a.divide(b));
}

function integerSqrtFloor(value) {
    if (value < 0n) throw new Error("Integer square root requires a nonnegative value");
    if (value < 2n) return value;
    let x = 1n << BigInt(Math.ceil(value.toString(2).length / 2));
    while (true) {
        const next = (x + value / x) >> 1n;
        if (next >= x) return x;
        x = next;
    }
}

function exactRationalSqrt(value) {
    const numerator = integerSqrtFloor(value.numerator);
    const denominator = integerSqrtFloor(value.denominator);
    return numerator * numerator === value.numerator && denominator * denominator === value.denominator
        ? new Rational(numerator, denominator)
        : null;
}

function initialSqrtBall(value) {
    if (value.lessThan(ZERO)) throw new Error("Ball square root requires a nonnegative exact value");
    const exact = exactRationalSqrt(value);
    if (exact) return new ExactBall(exact, ZERO);
    const high = value.greaterThan(ONE) ? value : ONE;
    return ballFromInterval(new RationalInterval(ZERO, high));
}

export function nestedSqrt(value) {
    const radicand = exactRational(value, "Ball square-root argument");
    return new NestedBallReal("sqrt", radicand, initialSqrtBall(radicand));
}

function sqrtBallAt(real, callLimit, requestedWidth = null) {
    if (!isNestedBallReal(real) || real.kind !== "sqrt") throw new Error("Unsupported nested Ball recipe");
    let low = real.initialBall.interval.low;
    let high = real.initialBall.interval.high;
    let calls = 0n;
    while (calls < callLimit) {
        const width = high.subtract(low);
        if (requestedWidth && width.lessThanOrEqual(requestedWidth)) break;
        if (width.equals(ZERO)) break;
        const midpoint = low.add(high).divide(new Rational(2n, 1n));
        if (midpoint.multiply(midpoint).lessThanOrEqual(real.parameter)) low = midpoint;
        else high = midpoint;
        calls += 1n;
    }
    return {
        ball: ballFromInterval(new RationalInterval(low, high)),
        calls,
    };
}

function capabilities(kind) {
    const nested = kind === "nested";
    return map([
        ["valuekind", text("numericsCapabilities")],
        ["schema", text("rix.numerics.capabilities@1")],
        ["backend", text("ball")],
        ["representation", text(nested ? "nestedRationalBalls" : "rationalMidpointRadius")],
        ["operations", sequence([text("enclose"), text("refine")])],
        ["evidencelevels", sequence([text("proof")])],
        ["certified", int(1)],
        ["arbitraryrefinement", bool(nested)],
        ["deterministic", int(1)],
        ["minimumwidth", ZERO],
        ["maxcalls", int(nested ? PROVIDER_MAX_CALLS : 0n)],
        ["maxiterations", int(nested ? PROVIDER_MAX_CALLS : 0n)],
    ]);
}

function resultRecord(subject, requestValue) {
    const nested = isNestedBallReal(subject);
    const providerCapabilities = capabilities(nested ? "nested" : "finite");
    const request = normalizeRefinementRequest(requestValue, { capabilities: providerCapabilities });
    const requestedWidth = refinementEntry(request, "absolutewidth");
    const maxCalls = nonnegativeInteger(
        refinementEntry(refinementEntry(request, "work"), "maxcalls", int(0)),
        "Ball maxCalls",
    );
    const refined = nested
        ? sqrtBallAt(subject, maxCalls, requestedWidth)
        : { ball: requireBall(subject), calls: 0n };
    const interval = refined.ball.interval;
    const achievedWidth = intervalWidth(interval);
    const goalMet = achievedWidth.lessThanOrEqual(requestedWidth);
    const status = goalMet ? "enclosed" : nested ? "budgetExhausted" : "resolutionFloor";
    const approximation = new CertifiedApproximation(refined.ball.midpoint, interval, {
        representation: {
            kind: "derived",
            reason: status,
            original: null,
            requested: requestedWidth,
            achieved: achievedWidth,
            provider: "ball",
        },
    });
    const diagnostics = status === "budgetExhausted"
        ? [text("maxCallsReached")]
        : status === "resolutionFloor"
            ? [text("finiteBallCannotRefine")]
            : [];
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
        ["evidencelevel", text("proof")],
        ["backend", text("ball")],
        ["operation", refinementEntry(request, "operation")],
        ["trace", sequence()],
        ["work", map([
            ["calls", int(refined.calls)],
            ["iterations", int(refined.calls)],
            ["maxcalls", int(maxCalls)],
            ["exhausted", bool(!goalMet && nested)],
        ])],
        ["diagnostics", sequence(diagnostics)],
        ["evidence", map([
            ["kind", text(nested ? "nestedBisection" : "exactEndpoints")],
            ["property", text("containment")],
            ["subject", nested ? subject.parameter : subject.interval],
        ])],
        ["source", map([
            ["plugin", text("ball")],
            ["schema", text(nested ? NESTED_BALL_SCHEMA : BALL_SCHEMA)],
            ["recipe", nested ? text(subject.kind) : text("finite")],
        ])],
    ]);
}

function ballRecord(value) {
    const ball = requireBall(value);
    return map([
        ["valuekind", text("ball")],
        ["schema", text(BALL_SCHEMA)],
        ["midpoint", ball.midpoint],
        ["radius", ball.radius],
        ["interval", ball.interval],
        ["lower", ball.interval.low],
        ["upper", ball.interval.high],
        ["certified", int(1)],
    ]);
}

function nestedRecord(value) {
    if (!isNestedBallReal(value)) throw new Error("Expected a NestedBallReal value");
    return map([
        ["valuekind", text("nestedBallReal")],
        ["schema", text(NESTED_BALL_SCHEMA)],
        ["recipe", text(value.kind)],
        ["parameter", value.parameter],
        ["initialball", value.initialBall],
        ["certified", int(1)],
    ]);
}

function contains(ballValue, candidate) {
    const ball = requireBall(ballValue);
    if (isBall(candidate)) return ball.interval.contains(candidate.interval);
    const exact = exactRational(candidate, "Ball containment candidate");
    return ball.interval.containsValue(exact);
}

function method(name, impl) {
    return { type: "method_builtin", name, impl };
}

export function registerBallMethods(systemContext, owner = {}) {
    const register = (typeName, name, impl) => systemContext.registerMethod(typeName, name, method(name, impl), owner);
    register("Ball", "Midpoint", ([value]) => requireBall(value).midpoint);
    register("Ball", "Radius", ([value]) => requireBall(value).radius);
    register("Ball", "Interval", ([value]) => requireBall(value).interval);
    register("Ball", "Lower", ([value]) => requireBall(value).interval.low);
    register("Ball", "Upper", ([value]) => requireBall(value).interval.high);
    register("Ball", "Contains", ([value, candidate]) => bool(contains(value, candidate)));
    register("Ball", "RoundOut", ([value, bits]) => roundOutBall(value, bits ?? int(53)));
    register("Ball", "Record", ([value]) => ballRecord(value));
    register("Ball", "Enclose", ([value, request]) => resultRecord(value, request));
    register("Ball", "Refine", ([value, request]) => resultRecord(value, request));
    register("Ball", "NumericsCapabilities", () => capabilities("finite"));
    register("NestedBallReal", "Ball", ([value, iterations]) => {
        const calls = nonnegativeInteger(iterations ?? int(0), "Nested Ball iteration count");
        return sqrtBallAt(value, calls).ball;
    });
    register("NestedBallReal", "InitialBall", ([value]) => value.initialBall);
    register("NestedBallReal", "Record", ([value]) => nestedRecord(value));
    register("NestedBallReal", "Enclose", ([value, request]) => resultRecord(value, request));
    register("NestedBallReal", "Refine", ([value, request]) => resultRecord(value, request));
    register("NestedBallReal", "NumericsCapabilities", () => capabilities("nested"));
}

export function installBallOperators(registry) {
    if (!registry) return;
    const binary = (name, operation) => registry.installVariant(name, {
        name: `Ball.${name}`,
        priority: 220,
        prepare(args) {
            return args.length === 2 && hasBall(args[0], args[1]) ? { args } : false;
        },
        impl: ([left, right]) => operation(left, right),
    });
    binary("ADD", (left, right) => binaryBall(left, right, (a, b) => a.add(b)));
    binary("SUB", (left, right) => binaryBall(left, right, (a, b) => a.subtract(b)));
    binary("MUL", (left, right) => binaryBall(left, right, (a, b) => a.multiply(b)));
    binary("DIV", divideBalls);
    binary("EQ", (left, right) => {
        const a = promoteBall(left);
        const b = promoteBall(right);
        return a.midpoint.equals(b.midpoint) && a.radius.equals(b.radius) ? int(1) : null;
    });
    binary("NEQ", (left, right) => {
        const a = promoteBall(left);
        const b = promoteBall(right);
        return a.midpoint.equals(b.midpoint) && a.radius.equals(b.radius) ? null : int(1);
    });
    registry.installVariant("NEG", {
        name: "Ball.NEG",
        priority: 220,
        prepare(args) { return args.length === 1 && isBall(args[0]) ? { args } : false; },
        impl: ([value]) => new ExactBall(value.midpoint.negate(), value.radius),
    });
}

function constructBall(args) {
    if (args.length === 1 && isBall(args[0])) return args[0];
    return new ExactBall(args[0], args[1] ?? ZERO);
}

export function createBallPluginValue() {
    const helpers = new Map([
        ["Ball", (args) => constructBall(args)],
        ["Interval", (args) => ballFromInterval(new RationalInterval(
            exactRational(args[0], "Ball lower endpoint"),
            exactRational(args[1], "Ball upper endpoint"),
        ))],
        ["Sqrt", (args) => nestedSqrt(args[0])],
        ["Midpoint", (args) => requireBall(args[0]).midpoint],
        ["Radius", (args) => requireBall(args[0]).radius],
        ["Lower", (args) => requireBall(args[0]).interval.low],
        ["Upper", (args) => requireBall(args[0]).interval.high],
        ["Contains", (args) => bool(contains(args[0], args[1]))],
        ["RoundOut", (args) => roundOutBall(args[0], args[1] ?? int(53))],
        ["Record", (args) => isBall(args[0]) ? ballRecord(args[0]) : nestedRecord(args[0])],
    ]);
    const entries = new Map();
    const extension = new Map([["immutable", int(1)]]);
    for (const [name, helper] of helpers) {
        entries.set(name, helper);
        entries.set(name.toUpperCase(), helper);
        extension.set(name.toUpperCase(), method(name, (args) => helper(args.slice(1))));
    }
    return { type: "map", entries, _ext: extension };
}

export function installBallPlugin({ systemContext, registry, metadata = {}, options = {} }) {
    const value = createBallPluginValue();
    const mount = options.as || metadata.mount || "ball";
    const owner = { pluginId: metadata.id || "ball", mount };
    systemContext.registerHostCallableValue(mount, value, {
        impl: (args) => constructBall(args),
        pure: true,
        doc: "Construct an exact rational midpoint-radius Ball",
    }, {
        doc: metadata.description || "Certified rational and nested Ball arithmetic",
        groups: metadata.groups || ["Numerics", "Exact"],
        pluginId: metadata.id || "ball",
    });
    registerBallMethods(systemContext, owner);
    installBallOperators(registry);
    return value;
}
