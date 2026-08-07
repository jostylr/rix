import { Integer, Rational } from "@ratmath/core";

export const RUNTIME_RNG_KEY = "rng";
export const DEFAULT_RANDOM_SEED = 1;

function seedNumber(value) {
    if (value instanceof Integer) return Number(value.value & 0xffffffffn) >>> 0;
    if (value instanceof Rational && value.denominator === 1n) return Number(value.numerator & 0xffffffffn) >>> 0;
    if (typeof value === "bigint") return Number(value & 0xffffffffn) >>> 0;
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error("Random seed must be a finite integer");
    return Math.trunc(number) >>> 0;
}

function option(value, key, fallback = undefined) {
    if (value?.entries instanceof Map) {
        if (value.entries.has(key)) return value.entries.get(key);
        const wanted = key.toLowerCase();
        for (const [candidate, item] of value.entries) {
            if (String(candidate).toLowerCase() === wanted) return item;
        }
        return fallback;
    }
    if (value && typeof value === "object" && Object.hasOwn(value, key)) return value[key];
    return fallback;
}

function nameValue(value) {
    if (value === null || value === undefined) return "default";
    if (value?.type === "string") return value.value;
    if (typeof value === "string") return value;
    return null;
}

function entropySeed(context) {
    const supplied = context?.getEnv?.("randomSeedSource", null);
    if (typeof supplied === "function") return seedNumber(supplied());
    if (globalThis.crypto?.getRandomValues) {
        const words = new Uint32Array(1);
        globalThis.crypto.getRandomValues(words);
        return words[0] >>> 0;
    }
    throw new Error("Random seed selection requires host entropy, but this host provides none");
}

function requestedSeed(options, context) {
    const requested = option(options, "seed", DEFAULT_RANDOM_SEED);
    const name = nameValue(requested);
    if (name?.toLowerCase() === "random") return entropySeed(context);
    return seedNumber(requested);
}

function mulberry32(seed) {
    return {
        implementation: "default",
        algorithm: "mulberry32",
        seed,
        state: seed,
        forkCounter: 0,
        nextUint32() {
            let value = this.state = (this.state + 0x6D2B79F5) >>> 0;
            value = Math.imul(value ^ (value >>> 15), value | 1);
            value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
            return (value ^ (value >>> 14)) >>> 0;
        },
    };
}

function validateRng(rng, implementation) {
    if (!rng || (typeof rng.nextUint32 !== "function" && typeof rng.next !== "function")) {
        throw new Error(`RNG implementation '${implementation}' must create an object with nextUint32() or next()`);
    }
    if (!rng.implementation) rng.implementation = implementation;
    if (!Number.isInteger(rng.forkCounter)) rng.forkCounter = 0;
    return rng;
}

/** Build the host-plugin value accepted as the first argument to `.RNG`. */
export function createRngImplementation(name, factory) {
    const implementationName = String(name ?? "");
    if (!implementationName) throw new Error("RNG implementation requires a name");
    if (typeof factory !== "function") throw new Error("RNG implementation requires a factory function");
    return Object.freeze({
        type: "rng_implementation",
        name: implementationName,
        createRng: factory,
    });
}

export function createRuntimeRng(implementationValue = null, options = null, context = null) {
    const implementation = nameValue(implementationValue);
    if (implementation !== null) {
        const normalized = implementation.toLowerCase();
        if (normalized === "default" || normalized === "mulberry32") {
            return mulberry32(requestedSeed(options, context));
        }
        throw new Error(`Unknown RNG implementation '${implementation}'`);
    }

    const factory = implementationValue?._createRng ?? implementationValue?.createRng;
    if (typeof factory !== "function") {
        throw new Error("RNG implementation must be a name or a host RNG implementation object");
    }
    const displayName = implementationValue.name || implementationValue.id || "host";
    return validateRng(factory(options, context), displayName);
}

export function configureRuntimeRandom(context, implementation = null, options = null) {
    if (!context?.setScopedEnv) throw new Error("RNG configuration requires a lexical evaluation context");
    const rng = createRuntimeRng(implementation, options, context);
    context.setScopedEnv(RUNTIME_RNG_KEY, rng);
    return rng;
}

export function runtimeRandomInfo(rng) {
    return {
        type: "map",
        entries: new Map([
            ["implementation", { type: "string", value: String(rng.implementation || "host") }],
            ["algorithm", { type: "string", value: String(rng.algorithm || rng.implementation || "host") }],
            ["seed", rng.seed === undefined ? null : new Integer(BigInt(seedNumber(rng.seed)))],
        ]),
    };
}

export function seedRuntimeRandom(context, value) {
    const rng = configureRuntimeRandom(context, "default", {
        type: "map",
        entries: new Map([["seed", value]]),
    });
    return new Integer(BigInt(rng.seed));
}

function mix32(value) {
    let mixed = value >>> 0;
    mixed ^= mixed >>> 16;
    mixed = Math.imul(mixed, 0x7feb352d);
    mixed ^= mixed >>> 15;
    mixed = Math.imul(mixed, 0x846ca68b);
    mixed ^= mixed >>> 16;
    return mixed >>> 0;
}

function effectiveRng(context) {
    let rng = context?.getScopedEnv?.(RUNTIME_RNG_KEY, null);
    if (rng) return rng;
    const injected = context?.getEnv?.("randomFunction", null);
    if (typeof injected === "function") {
        return {
            implementation: "hostInjected",
            forkCounter: 0,
            next() { return injected(); },
        };
    }
    rng = createRuntimeRng("default", null, context);
    context?.setRootScopedEnv?.(RUNTIME_RNG_KEY, rng);
    return rng;
}

/** Give a concurrent child an independent, reproducible seeded PRNG stream. */
export function forkRuntimeRandom(parent, child) {
    const rng = effectiveRng(parent);
    if (rng.seed === undefined) return;
    const ordinal = ++rng.forkCounter;
    const seed = mix32((rng.seed ^ Math.imul(ordinal, 0x9e3779b9)) >>> 0);
    child.setScopedEnv(RUNTIME_RNG_KEY, mulberry32(seed));
}

export function runtimeRandom(context) {
    const rng = effectiveRng(context);
    if (typeof rng.nextUint32 === "function") return rng.nextUint32() / 4294967296;
    const value = Number(rng.next());
    if (!(value >= 0 && value < 1)) throw new Error("RNG next() must return a number in [0, 1)");
    return value;
}

export function randomBigIntBelow(context, exclusiveMax) {
    if (exclusiveMax <= 0n) throw new Error("Random bound must be positive");
    const rng = effectiveRng(context);
    // A host-injected next() hook is also used for deterministic tests and
    // scripted sampling. Preserve its direct scaling semantics: rejection
    // sampling could otherwise loop forever for a deliberately constant hook.
    if (typeof rng.nextUint32 !== "function" && exclusiveMax <= BigInt(Number.MAX_SAFE_INTEGER)) {
        const value = Number(rng.next());
        if (!(value >= 0 && value < 1)) throw new Error("RNG next() must return a number in [0, 1)");
        return BigInt(Math.floor(value * Number(exclusiveMax)));
    }
    const bits = exclusiveMax.toString(2).length;
    const chunks = Math.ceil(bits / 32);
    const mask = (1n << BigInt(bits)) - 1n;
    const maxAttempts = context?.getEnv?.("randomMaxAttempts", 10000) ?? 10000;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        let value = 0n;
        for (let i = 0; i < chunks; i++) {
            value = (value << 32n) | BigInt(Math.floor(runtimeRandom(context) * 4294967296));
        }
        value &= mask;
        if (value < exclusiveMax) return value;
    }
    throw new Error(`RNG could not produce an in-range value after ${maxAttempts} attempts`);
}
