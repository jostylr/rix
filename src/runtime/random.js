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
    context.setEnv("randomState", { value: seed });
    context.setEnv("randomFunction", null);
    return new Integer(BigInt(seed));
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
