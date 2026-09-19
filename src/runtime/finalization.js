import { CleanupGraceFault } from "./operational-fault.js";

import { appendAsyncFailures, normalizeAsyncFailure, asyncLimits } from "./async-policy.js";

function finalOutcome(primary, cleanupErrors, hasPrimary, limit, dropped) {
    if (!hasPrimary && cleanupErrors.length === 0) return null;
    const failure = hasPrimary
        ? appendAsyncFailures(primary, cleanupErrors, limit)
        : appendAsyncFailures(cleanupErrors[0], cleanupErrors.slice(1), limit);
    if (dropped) failure.asyncDroppedErrors = (failure.asyncDroppedErrors || 0) + dropped;
    return failure;
}

function isPromiseLike(value) {
    return value && typeof value.then === "function";
}

export function withFinalizerActivationSync(context, callback) {
    context.pushFinalizerActivation();
    let result;
    let primary = null;
    let hasPrimary = false;
    const errorLimit = asyncLimits(context.getEnv("asyncLimits", {})).errors;
    let dropped = 0;
    try {
        result = callback();
    } catch (error) {
        primary = normalizeAsyncFailure(error);
        hasPrimary = true;
    }
    const finalizers = context.popFinalizerActivation();
    const cleanupErrors = [];
    for (let index = finalizers.length - 1; index >= 0; index--) {
        try {
            const cleanup = finalizers[index]();
            if (isPromiseLike(cleanup)) {
                Promise.resolve(cleanup).catch(() => {});
                throw new Error("Async cleanup requires promise-aware RiX evaluation");
            }
        } catch (error) {
            if (cleanupErrors.length < errorLimit) cleanupErrors.push(normalizeAsyncFailure(error));
            else dropped++;
        }
    }
    const failure = finalOutcome(primary, cleanupErrors, hasPrimary, errorLimit, dropped);
    if (failure) throw failure;
    return result;
}

export async function withFinalizerActivationAsync(context, callback, options = {}) {
    context.pushFinalizerActivation();
    let result;
    let primary = null;
    let hasPrimary = false;
    const errorLimit = asyncLimits(context.getEnv("asyncLimits", {})).errors;
    let dropped = 0;
    try {
        result = await callback();
    } catch (error) {
        primary = normalizeAsyncFailure(error);
        hasPrimary = true;
    }
    const finalizers = context.popFinalizerActivation();
    const cleanupErrors = [];
    const graceMs = options.graceMs;
    const controller = new AbortController();
    const deadline = Number.isFinite(graceMs) ? performance.now() + graceMs : Infinity;

    for (let index = finalizers.length - 1; index >= 0; index--) {
        try {
            const cleanup = Promise.resolve(finalizers[index](controller.signal));
            // The grace-period race can finish before the cleanup promise. Keep
            // a rejection handler attached so a late cooperative shutdown does
            // not surface as an unhandled host promise rejection.
            cleanup.catch(() => {});
            if (!Number.isFinite(deadline)) {
                await cleanup;
                continue;
            }
            const remaining = Math.max(0, deadline - performance.now());
            let timer;
            await Promise.race([
                cleanup,
                new Promise((_, reject) => {
                    timer = setTimeout(() => {
                        const fault = new CleanupGraceFault(graceMs);
                        controller.abort(fault);
                        reject(fault);
                    }, remaining);
                }),
            ]).finally(() => clearTimeout(timer));
        } catch (error) {
            if (cleanupErrors.length < errorLimit) cleanupErrors.push(normalizeAsyncFailure(error));
            else dropped++;
            if (error instanceof CleanupGraceFault) break;
        }
    }

    const failure = finalOutcome(primary, cleanupErrors, hasPrimary, errorLimit, dropped);
    if (failure) throw failure;
    return result;
}
