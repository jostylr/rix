import { REACTIVE_OUTPUT_READ_ENV } from "./functions/reactive-bindings.js";

function envSnapshot(context, key) {
    return {
        has: context.env?.has(key) === true,
        value: context.getEnv(key, undefined),
    };
}

function restoreEnv(context, key, snapshot) {
    if (snapshot.has) context.setEnv(key, snapshot.value);
    else context.env?.delete(key);
}

export function reactiveSourceValue(source) {
    if (source?.type === "formula_sheet") return source;
    if (typeof source?.peek === "function") return source.peek();
    if (typeof source?.snapshot === "function") return source.snapshot();
    return undefined;
}

export function captureObservedEvaluation(context, evaluateValue) {
    if (!context || typeof context.setEnv !== "function") {
        throw new Error("Observed evaluation requires a RiX Context");
    }
    if (typeof evaluateValue !== "function") {
        throw new Error("Observed evaluation requires an evaluation callback");
    }
    const reads = new Map();
    const previous = envSnapshot(context, REACTIVE_OUTPUT_READ_ENV);
    context.setEnv(REACTIVE_OUTPUT_READ_ENV, (source, value) => reads.set(source, value));
    try {
        return { value: evaluateValue(), reads };
    } finally {
        restoreEnv(context, REACTIVE_OUTPUT_READ_ENV, previous);
    }
}

export async function captureObservedEvaluationAsync(context, evaluateValue) {
    if (!context || typeof context.setEnv !== "function") {
        throw new Error("Observed evaluation requires a RiX Context");
    }
    if (typeof evaluateValue !== "function") {
        throw new Error("Observed evaluation requires an evaluation callback");
    }
    const reads = new Map();
    const previous = envSnapshot(context, REACTIVE_OUTPUT_READ_ENV);
    context.setEnv(REACTIVE_OUTPUT_READ_ENV, (source, value) => reads.set(source, value));
    try {
        return { value: await evaluateValue(), reads };
    } finally {
        restoreEnv(context, REACTIVE_OUTPUT_READ_ENV, previous);
    }
}

function observedSource(value, reads) {
    const candidates = [];
    for (const [source, readValue] of reads || []) {
        if (readValue === value && typeof source?.subscribe === "function") candidates.push(source);
    }
    return candidates.length === 1 ? candidates[0] : null;
}

export function createObservedEvaluationResult(value, reads = []) {
    const source = observedSource(value, reads);
    const subscriptions = new Set();
    let disposed = false;

    const observe = source ? (listener) => {
        if (typeof listener !== "function") throw new Error("Observed evaluation listener must be a function");
        if (disposed) throw new Error("Observed evaluation has been disposed");
        let active = true;
        const unsubscribeSource = source.subscribe((event) => {
            if (active && !disposed) listener(reactiveSourceValue(source), event);
        });
        const unsubscribe = () => {
            if (!active) return;
            active = false;
            subscriptions.delete(unsubscribe);
            unsubscribeSource?.();
        };
        subscriptions.add(unsubscribe);
        return unsubscribe;
    } : null;

    return Object.freeze({
        value,
        observe,
        dispose() {
            if (disposed) return;
            disposed = true;
            for (const unsubscribe of [...subscriptions]) unsubscribe();
            subscriptions.clear();
        },
    });
}

export function observedReadsFromSources(sources) {
    return new Map([...sources].map((source) => [source, reactiveSourceValue(source)]));
}
