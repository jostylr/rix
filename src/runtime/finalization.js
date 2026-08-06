import { CleanupGraceFault } from "./operational-fault.js";

function attachSuppressed(primary, errors) {
    if (!primary || errors.length === 0) return primary;
    const existing = Array.isArray(primary.suppressed) ? primary.suppressed : [];
    primary.suppressed = [...existing, ...errors];
    return primary;
}

function finalOutcome(primary, cleanupErrors) {
    if (primary) return attachSuppressed(primary, cleanupErrors);
    if (cleanupErrors.length === 0) return null;
    return attachSuppressed(cleanupErrors[0], cleanupErrors.slice(1));
}

function isPromiseLike(value) {
    return value && typeof value.then === "function";
}

export function withFinalizerActivationSync(context, callback) {
    context.pushFinalizerActivation();
    let result;
    let primary = null;
    try {
        result = callback();
    } catch (error) {
        primary = error;
    }
    const finalizers = context.popFinalizerActivation();
    const cleanupErrors = [];
    for (let index = finalizers.length - 1; index >= 0; index--) {
        try {
            const cleanup = finalizers[index]();
            if (isPromiseLike(cleanup)) {
                throw new Error("Async cleanup requires promise-aware RiX evaluation");
            }
        } catch (error) {
            cleanupErrors.push(error);
        }
    }
    const failure = finalOutcome(primary, cleanupErrors);
    if (failure) throw failure;
    return result;
}

export async function withFinalizerActivationAsync(context, callback, options = {}) {
    context.pushFinalizerActivation();
    let result;
    let primary = null;
    try {
        result = await callback();
    } catch (error) {
        primary = error;
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
            cleanupErrors.push(error);
            if (error instanceof CleanupGraceFault) break;
        }
    }

    const failure = finalOutcome(primary, cleanupErrors);
    if (failure) throw failure;
    return result;
}
