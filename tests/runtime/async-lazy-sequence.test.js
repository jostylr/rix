import { describe, expect, test } from "bun:test";
import { createLazySequence, ensureLazyIndex, ensureLazyIndexAsync, materializeLazySequenceAsync, cloneLazySequence } from "../../src/runtime/lazy-sequence.js";
import { AsyncEffectLane, asyncLimits, capabilityAsyncPolicy } from "../../src/runtime/async-policy.js";
import { Context } from "../../src/runtime/context.js";
import { reserveBackgroundTask, registerBackgroundTask, drainBackgroundTasks, recordBackgroundError, disposeAsyncResources, registerAsyncResource } from "../../src/runtime/async-runtime.js";

const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

describe("concrete recurrence caches", () => {
    test("simultaneous lazy consumers share one ordered committed cache", async () => {
        let calls = 0;
        const sequence = createLazySequence({
            createState: () => ({ index: 0 }), knownLength: 12,
            async pullAsync(state) { calls++; await Promise.resolve(); return { value: ++state.index }; },
        });
        const [a, b, c] = await Promise.all([ensureLazyIndexAsync(sequence, 8), ensureLazyIndexAsync(sequence, 3), ensureLazyIndexAsync(sequence, 12)]);
        expect([a, b, c]).toEqual([8, 3, 12]);
        expect(calls).toBe(12);
        expect(sequence._lazy.cache).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
        expect(ensureLazyIndex(sequence, 3)).toBe(3);
        expect((await materializeLazySequenceAsync(sequence)).values).toHaveLength(12);
        expect((await materializeLazySequenceAsync(cloneLazySequence(sequence, { restart: true }))).values).toEqual(sequence._lazy.cache);
    });

    test("a cancellation during pull discards its uncommitted local state", async () => {
        const gate = deferred();
        const controller = new AbortController();
        const sequence = createLazySequence({
            createState: () => ({ index: 0 }), knownLength: 2,
            async pullAsync(state) { state.index++; await gate.promise; return { value: state.index }; },
        });
        const read = ensureLazyIndexAsync(sequence, 1, controller.signal);
        await Promise.resolve();
        const restart = cloneLazySequence(sequence);
        controller.abort(new Error("stop"));
        gate.resolve();
        await expect(read).rejects.toThrow("stop");
        expect(sequence._lazy.cache).toEqual([]);
        expect(sequence._lazy.state.index).toBe(0);
        expect(restart._lazy.state.index).toBe(0);
        expect(await ensureLazyIndexAsync(sequence, 1)).toBe(1);
    });

    test("synchronous misuse and excessive retained output never poison a cache", async () => {
        const sequence = createLazySequence({ createState: () => ({ index: 0 }), pull(state) { state.index++; return Promise.resolve({ value: 1 }); } });
        expect(() => ensureLazyIndex(sequence, 1)).toThrow("promises cannot enter");
        expect(sequence._lazy.cache).toEqual([]);
        expect(sequence._lazy.state.index).toBe(0);
        const limited = createLazySequence({ createState: () => ({ index: 0 }), maxCache: 2, knownLength: 5, async pullAsync(state) { return { value: ++state.index }; } });
        await expect(materializeLazySequenceAsync(limited)).rejects.toMatchObject({ code: "ASYNC_LIMIT_EXCEEDED" });
        expect(limited._lazy.cache).toEqual([1, 2]);
    });
});

describe("owner effects and detached lifetime", () => {
    test("unknown effects serialize; explicit policies are validated", async () => {
        expect(capabilityAsyncPolicy({})).toEqual({ effect: "unknown", concurrency: "serial", cancellation: "none" });
        expect(capabilityAsyncPolicy({ pure: true }).concurrency).toBe("safe");
        expect(() => capabilityAsyncPolicy({ concurrency: "sometimes" })).toThrow("Invalid");
        const lane = new AsyncEffectLane(asyncLimits({ outstanding: 2 }));
        const gate = deferred();
        const events = [];
        const first = lane.run(async () => { events.push(1); await gate.promise; events.push(2); });
        const second = lane.run(() => { events.push(3); });
        await expect(lane.run(() => 4)).rejects.toMatchObject({ code: "ASYNC_LIMIT_EXCEEDED" });
        await Promise.resolve();
        expect(events).toEqual([1]);
        gate.resolve();
        await Promise.all([first, second]);
        expect(events).toEqual([1, 2, 3]);
        expect(lane.pending).toBe(0);
    });

    test("delegated callback effects release the owner lane without deadlocking", async () => {
        const lane = new AsyncEffectLane();
        const events = [];
        await lane.run(async (delegate) => {
            events.push("before");
            await Promise.all([delegate(() => lane.run(() => events.push("a"))), delegate(() => lane.run(() => events.push("b")))]);
            events.push("after");
        });
        expect(events).toEqual(["before", "a", "b", "after"]);
        expect(lane.pending).toBe(0);
    });

    test("detached admission reserves capacity and bounds handler failures; shutdown is exactly once", async () => {
        const context = new Context();
        context.setEnv("asyncLimits", { background: 1, errors: 2 });
        const release = reserveBackgroundTask(context);
        expect(() => reserveBackgroundTask(context)).toThrow("background tasks");
        const gate = deferred();
        registerBackgroundTask(context, gate.promise, release);
        expect(() => reserveBackgroundTask(context)).toThrow("background tasks");
        gate.resolve();
        await drainBackgroundTasks(context);
        for (let i = 0; i < 5; i++) recordBackgroundError(context, new Error(String(i)));
        expect(await drainBackgroundTasks(context)).toHaveLength(2);
        expect(context.getEnv("__async_dropped_background_errors__")).toBe(3);
        let closed = 0;
        registerAsyncResource(context, {}, async () => { closed++; await Promise.resolve(); });
        await Promise.all([disposeAsyncResources(context), disposeAsyncResources(context)]);
        expect(closed).toBe(1);
    });
});

test("cleanup failures preserve falsy and frozen primary errors with bounded aggregates", async () => {
    const { withFinalizerActivationAsync } = await import("../../src/runtime/finalization.js");
    const context = new Context();
    context.setEnv("asyncLimits", { errors: 2, outstanding: 8 });
    let cleanups = 0;
    let failure;
    try {
        await withFinalizerActivationAsync(context, () => {
            for (let i = 0; i < 5; i++) context.registerFinalizer(() => { cleanups++; throw Object.freeze(new Error(`cleanup ${i}`)); });
            throw 0;
        });
    } catch (error) { failure = error; }
    expect(failure.message).toBe("0");
    expect(failure.cause).toBe(0);
    expect(failure.suppressed.map((error) => error.message)).toEqual(["cleanup 4", "cleanup 3"]);
    expect(failure.asyncDroppedErrors).toBe(3);
    expect(cleanups).toBe(5);
});

test("resource acquisition during shutdown is rejected rather than leaked", async () => {
    const context = new Context();
    registerAsyncResource(context, {}, () => {
        expect(() => reserveBackgroundTask(context)).toThrow("during context shutdown");
        expect(() => registerAsyncResource(context, {}, () => {})).toThrow("during context shutdown");
    });
    expect(await disposeAsyncResources(context)).toEqual([]);
});

test("overrides and unclassified installed variants cannot inherit a pure safety claim", async () => {
    const { Registry } = await import("../../src/eval/registry.js");
    const registry = new Registry();
    registry.register("CUSTOM", () => 1, { pure: true });
    expect(registry.get("CUSTOM").concurrency).toBe("safe");
    registry.override("CUSTOM", () => 2);
    expect(registry.get("CUSTOM").concurrency).toBe("serial");
    expect(registry.get("CUSTOM").pure).toBe(false);
    registry.restore("CUSTOM");
    registry.installVariant("CUSTOM", { name: "unknown", impl: () => 3 });
    expect(registry.get("CUSTOM").concurrency).toBe("serial");
    expect(capabilityAsyncPolicy({ pure: true, concurrency: "serial" }).concurrency).toBe("serial");
});
