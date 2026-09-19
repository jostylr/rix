import { OperationalFault } from "./operational-fault.js";

// Host settings may lower these ceilings; RiX source cannot raise them.
export const ASYNC_LIMITS = Object.freeze({
    concurrency: 64, queued: 4096, outstanding: 4096, background: 128,
    errors: 64, outputItems: 10000, traceEvents: 2048, branchRecords: 4096,
});

export function asyncLimits(input = {}) {
    const result = {};
    for (const [key, ceiling] of Object.entries(ASYNC_LIMITS)) {
        const value = input?.[key] ?? ceiling;
        if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Async ${key} limit must be a positive safe integer`);
        result[key] = Math.min(value, ceiling);
    }
    return Object.freeze(result);
}

export function asyncLimitFault(resource, limit) {
    return new OperationalFault(`Async ${resource} limit of ${limit} exceeded`, {
        code: "ASYNC_LIMIT_EXCEEDED", data: { resource, limit },
    });
}

export function capabilityAsyncPolicy(definition = {}) {
    const effect = definition.effect ?? (definition.pure === true ? "pure" : "unknown");
    const concurrency = definition.concurrency ?? (effect === "pure" ? "safe" : "serial");
    const cancellation = definition.cancellation ?? "none";
    if (!["pure", "read", "write", "unknown"].includes(effect)) throw new Error(`Invalid capability effect: ${effect}`);
    if (!["safe", "serial"].includes(concurrency)) throw new Error(`Invalid capability concurrency: ${concurrency}`);
    if (!["none", "cooperative"].includes(cancellation)) throw new Error(`Invalid capability cancellation: ${cancellation}`);
    return { effect, concurrency, cancellation };
}

/** One FIFO owner lane per evaluation context, shared by its concurrent children.
 * Delegated callbacks temporarily release the lease, avoiding nested deadlocks.
 * The adapter must await its callback before accessing its own effectful state.
 */
export class AsyncEffectLane {
    constructor(limits = ASYNC_LIMITS) { this.tail = Promise.resolve(); this.pending = 0; this.limits = limits; }
    async acquire(signal) {
        if (signal?.aborted) throw signal.reason;
        if (this.pending >= this.limits.outstanding) throw asyncLimitFault("effect queue", this.limits.outstanding);
        this.pending++;
        const before = this.tail;
        let release;
        this.tail = new Promise((resolve) => { release = resolve; });
        await before;
        if (signal?.aborted) { this.pending--; release(); throw signal.reason; }
        let active = true;
        return () => { if (active) { active = false; this.pending--; release(); } };
    }
    async run(callback, signal) {
        let release = await this.acquire(signal);
        let delegated = 0;
        const delegate = async (invoke) => {
            if (delegated++ === 0) release();
            try { return await invoke(); }
            finally { if (--delegated === 0) release = await this.acquire(signal); }
        };
        try { return await callback(delegate); }
        finally { release(); }
    }
}

export function normalizeAsyncFailure(value) {
    if (value && typeof value === "object" && Object.isExtensible(value)) return value;
    const error = new Error(value?.message ?? String(value), { cause: value });
    for (const key of ["kind", "code", "data", "asyncTaskPath", "asyncTaskSegments"]) {
        if (value?.[key] !== undefined) error[key] = value[key];
    }
    return error;
}

export function appendAsyncFailures(primary, errors, limit = ASYNC_LIMITS.errors) {
    primary = normalizeAsyncFailure(primary);
    const existing = Array.isArray(primary.suppressed) ? primary.suppressed : [];
    const incoming = errors.filter((error) => error !== primary).map(normalizeAsyncFailure);
    const combined = [...existing, ...incoming];
    primary.suppressed = combined.slice(0, limit);
    const dropped = Math.max(0, combined.length - limit);
    if (dropped) primary.asyncDroppedErrors = (primary.asyncDroppedErrors || 0) + dropped;
    return primary;
}
