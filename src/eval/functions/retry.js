import { Integer, Rational } from "@ratmath/core";
import { runtimeDefaults } from "../../runtime/runtime-config.js";
import { expectedErrorArgs, expectedErrorKind } from "../../runtime/expected-error.js";
import { withFinalizerActivationAsync, withFinalizerActivationSync } from "../../runtime/finalization.js";

function numberValue(value, label) {
    let number;
    if (value instanceof Integer) number = Number(value.value);
    else if (value instanceof Rational) number = Number(value.numerator) / Number(value.denominator);
    else if (typeof value === "bigint") number = Number(value);
    else number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`Retry ${label} must be a finite number`);
    return number;
}

function positiveSafeInteger(value, label) {
    const number = numberValue(value, label);
    if (!Number.isSafeInteger(number) || number < 1) {
        throw new Error(`Retry ${label} must be a positive safe integer`);
    }
    return number;
}

function kindName(value) {
    const raw = value?.type === "string" ? value.value : value;
    if (typeof raw !== "string") throw new Error("Retry kinds must contain strings or colon-strings");
    return raw.replace(/^:/, "");
}

function policyKinds(value) {
    if (value === null || value === undefined) return null;
    const values = Array.isArray(value?.values) ? value.values : null;
    if (!values) throw new Error("Retry kinds must be a finite array, tuple, or set");
    return new Set(values.map(kindName));
}

function parseRetryPolicy(value) {
    if (value?.type !== "map") {
        return { attempts: positiveSafeInteger(value, "attempts"), delay: 0, backoff: 1, kinds: null };
    }
    const entries = value.entries;
    if (!(entries instanceof Map)) throw new Error("Retry policy must be a valid map");
    if (!entries.has("attempts")) throw new Error("Retry policy requires attempts");
    const attempts = positiveSafeInteger(entries.get("attempts"), "attempts");
    const delay = entries.has("delay") ? numberValue(entries.get("delay"), "delay") : 0;
    const backoff = entries.has("backoff") ? numberValue(entries.get("backoff"), "backoff") : 1;
    if (delay < 0) throw new Error("Retry delay must be non-negative");
    if (backoff < 0) throw new Error("Retry backoff must be non-negative");
    return { attempts, delay, backoff, kinds: policyKinds(entries.get("kinds")) };
}

function deferredBody(node) {
    if (!node || node.fn !== "DEFER") {
        throw new Error("Retry work must be deferred with @{ ... }");
    }
    return node.args[0];
}

function shouldRetry(value, policy) {
    if (expectedErrorArgs(value) === null) return false;
    if (policy.kinds === null) return true;
    const kind = expectedErrorKind(value);
    return kind !== null && policy.kinds.has(kind);
}

function retryDelay(policy, failedAttempt) {
    return policy.delay * (policy.backoff ** Math.max(0, failedAttempt - 1));
}

function waitForRetry(seconds, signal) {
    if (seconds === 0) {
        if (signal?.aborted) return Promise.reject(signal.reason);
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        let timer;
        const abort = () => {
            clearTimeout(timer);
            reject(signal.reason);
        };
        if (signal?.aborted) return abort();
        timer = setTimeout(() => {
            signal?.removeEventListener("abort", abort);
            resolve();
        }, seconds * 1000);
        signal?.addEventListener("abort", abort, { once: true });
    });
}

function retrySync(policyNode, workNode, context, evaluate) {
    const policy = parseRetryPolicy(evaluate(policyNode));
    const work = deferredBody(workNode);
    for (let attempt = 1; attempt <= policy.attempts; attempt++) {
        const result = withFinalizerActivationSync(
            context,
            () => context.withSharedBody(work, () => evaluate(work)),
        );
        if (!shouldRetry(result, policy) || attempt === policy.attempts) return result;
        if (retryDelay(policy, attempt) > 0) {
            throw new Error("Retry delay requires promise-aware RiX evaluation");
        }
    }
    return null;
}

async function retryAsync(policyNode, workNode, context, evaluate, signal) {
    const policy = parseRetryPolicy(await evaluate(policyNode));
    const work = deferredBody(workNode);
    for (let attempt = 1; attempt <= policy.attempts; attempt++) {
        if (signal?.aborted) throw signal.reason;
        const result = await withFinalizerActivationAsync(context, () => (
            context.withSharedBody(work, () => evaluate(work))
        ), {
            graceMs: context.getEnv("asyncCleanupGraceMs", runtimeDefaults.asyncCleanupGraceMs),
        });
        if (!shouldRetry(result, policy) || attempt === policy.attempts) return result;
        await waitForRetry(retryDelay(policy, attempt), signal);
    }
    return null;
}

export const retryCapabilities = {
    Retry: {
        lazy: true,
        impl(args, context, evaluate, options) {
            if (args.length !== 2) throw new Error("Retry expects a policy/attempt count and deferred work");
            return options
                ? retryAsync(args[0], args[1], context, evaluate, options.signal ?? null)
                : retrySync(args[0], args[1], context, evaluate);
        },
        doc: "Repeat deferred work for expected error tuple values under a bounded retry policy",
        groups: ["Async"],
    },
};
