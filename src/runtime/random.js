import { Integer, Rational } from "@ratmath/core";

function seedNumber(value) {
    if (value instanceof Integer) return Number(value.value & 0xffffffffn) >>> 0;
    if (value instanceof Rational && value.denominator === 1n) return Number(value.numerator & 0xffffffffn) >>> 0;
    if (typeof value === "bigint") return Number(value & 0xffffffffn) >>> 0;
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error("Random seed must be a finite integer");
    return Math.trunc(number) >>> 0;
}

export function seedRuntimeRandom(context, value) {
    const seed = seedNumber(value);
    context.setEnv("randomState", { value: seed, seed });
    context.setEnv("randomForkCounter", { value: 0 });
    context.setEnv("randomFunction", null);
    return new Integer(BigInt(seed));
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

/** Give a concurrent child an independent, reproducible seeded PRNG stream. */
export function forkRuntimeRandom(parent, child) {
    const state = parent?.getEnv?.("randomState", null);
    if (!state) return;
    let counter = parent.getEnv("randomForkCounter", null);
    if (!counter) {
        counter = { value: 0 };
        parent.setEnv("randomForkCounter", counter);
    }
    const ordinal = ++counter.value;
    const base = state.seed ?? state.value;
    const seed = mix32((base ^ Math.imul(ordinal, 0x9e3779b9)) >>> 0);
    child.setEnv("randomState", { value: seed, seed });
    child.setEnv("randomForkCounter", { value: 0 });
}

export function runtimeRandom(context) {
    const injected = context?.getEnv?.("randomFunction", null);
    if (typeof injected === "function") return injected();
    const state = context?.getEnv?.("randomState", null);
    if (!state) return Math.random();
    let t = state.value = (state.value + 0x6D2B79F5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomBigIntBelow(context, exclusiveMax) {
    if (exclusiveMax <= 0n) throw new Error("Random bound must be positive");
    if (exclusiveMax <= BigInt(Number.MAX_SAFE_INTEGER)) {
        return BigInt(Math.floor(runtimeRandom(context) * Number(exclusiveMax)));
    }
    const bits = exclusiveMax.toString(2).length;
    const chunks = Math.ceil(bits / 32);
    const mask = (1n << BigInt(bits)) - 1n;
    while (true) {
        let value = 0n;
        for (let i = 0; i < chunks; i++) {
            value = (value << 32n) | BigInt(Math.floor(runtimeRandom(context) * 4294967296));
        }
        value &= mask;
        if (value < exclusiveMax) return value;
    }
}
