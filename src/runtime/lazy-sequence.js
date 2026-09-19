import { ASYNC_LIMITS, asyncLimitFault } from "./async-policy.js";

/**
 * Incremental sequence values shared by array generators, interval ranges,
 * and collection pipes. Lazy sequences cache every emitted value so positive
 * indexing is stable and repeatable.
 */

export function isLazySequence(value) {
    return Boolean(value && value.type === "lazy_sequence" && value._lazy);
}

export function createLazySequence(options) {
    for (const [key, fallback] of [["maxCache", ASYNC_LIMITS.outputItems], ["maxPending", ASYNC_LIMITS.queued]]) {
        if (!Number.isSafeInteger(options[key] ?? fallback) || (options[key] ?? fallback) < 1) throw new Error(`Lazy ${key} must be a positive safe integer`);
    }
    if ((options.cache?.length || 0) > Math.min(options.maxCache ?? ASYNC_LIMITS.outputItems, ASYNC_LIMITS.outputItems)) throw asyncLimitFault("lazy cache", options.maxCache ?? ASYNC_LIMITS.outputItems);
    const sequence = {
        type: "lazy_sequence",
        _lazy: {
            state: options.createState(),
            initialState: options.createState,
            cloneState: options.cloneState || ((state) => ({ ...state })),
            pull: options.pull,
            pullAsync: options.pullAsync || null,
            pending: null,
            pendingCount: 0,
            maxPending: Math.min(options.maxPending ?? ASYNC_LIMITS.queued, ASYNC_LIMITS.queued),
            maxCache: Math.min(options.maxCache ?? ASYNC_LIMITS.outputItems, ASYNC_LIMITS.outputItems),
            cache: options.cache ? options.cache.map(requireConcreteLazyValue) : [],
            done: false,
            unresolved: null,
            knownLength: options.knownLength ?? null,
            maxIterations: options.maxIterations ?? 10000,
            label: options.label || "generator",
        },
        _ext: options.ext ? new Map(options.ext) : new Map(),
    };
    return sequence;
}

export function lazyKnownLength(sequence) {
    if (!isLazySequence(sequence)) return null;
    if (sequence._lazy.done) return sequence._lazy.cache.length;
    return sequence._lazy.knownLength;
}

function isThenable(value) { return value && typeof value.then === "function"; }

export function requireConcreteLazyValue(value) {
    if (isThenable(value)) {
        // Observe a rejected host promise even when the synchronous caller rejects it.
        Promise.resolve(value).catch(() => {});
        throw new Error("Async recurrence requires promise-aware evaluation; promises cannot enter a lazy cache");
    }
    return value;
}

function preparePull(lazy) {
    if (lazy.done) return false;
    if (lazy.knownLength !== null && lazy.cache.length >= lazy.knownLength) {
        lazy.done = true;
        return false;
    }
    if (lazy.cache.length >= lazy.maxCache) throw asyncLimitFault("lazy cache", lazy.maxCache);
    return true;
}

function commitPull(lazy, state, result, budget) {
    result = requireConcreteLazyValue(result) || { done: true };
    requireConcreteLazyValue(result.value);
    requireConcreteLazyValue(result.unresolved);
    const attempts = result.attempts ?? (result.done ? 0 : 1);
    if (attempts > budget) throw new Error(`${lazy.label} exceeded the iteration limit of ${budget} while producing one value`);
    lazy.state = state;
    if (result.unresolved !== undefined) {
        lazy.unresolved = result.unresolved;
        lazy.done = true;
        lazy.knownLength = null;
        return { done: true, unresolved: result.unresolved, attempts };
    }
    if (result.done) {
        lazy.done = true;
        lazy.knownLength = lazy.cache.length;
        return { done: true, attempts };
    }
    lazy.cache.push(result.value);
    return { done: false, value: result.value, attempts };
}

export function pullLazyValue(sequence, iterationBudget = null) {
    if (!isLazySequence(sequence)) throw new Error("Expected a lazy sequence");
    const lazy = sequence._lazy;
    if (!preparePull(lazy)) return { done: true, attempts: 0 };
    if (lazy.pullAsync || lazy.pending) throw new Error("Async recurrence requires promise-aware evaluation");
    const budget = iterationBudget ?? lazy.maxIterations;
    const state = lazy.cloneState(lazy.state);
    return commitPull(lazy, state, lazy.pull(state, sequence, budget), budget);
}

async function pullAsync(sequence, iterationBudget, signal) {
    const lazy = sequence._lazy;
    if (signal?.aborted) throw signal.reason;
    if (!preparePull(lazy)) return { done: true, attempts: 0 };
    const budget = iterationBudget ?? lazy.maxIterations;
    const state = lazy.cloneState(lazy.state);
    const result = await (lazy.pullAsync || lazy.pull)(state, sequence, budget, signal);
    if (signal?.aborted) throw signal.reason;
    return commitPull(lazy, state, result, budget);
}

function lockedLazy(sequence, callback) {
    const lazy = sequence._lazy;
    if (lazy.pendingCount >= lazy.maxPending) return Promise.reject(asyncLimitFault("lazy pull queue", lazy.maxPending));
    lazy.pendingCount++;
    const operation = (lazy.pending || Promise.resolve()).then(callback);
    const settled = operation.then(() => { lazy.pendingCount--; }, () => { lazy.pendingCount--; });
    lazy.pending = settled;
    settled.then(() => { if (lazy.pending === settled) lazy.pending = null; });
    return operation;
}

export function pullLazyValueAsync(sequence, iterationBudget = null, signal = null) {
    if (!isLazySequence(sequence)) return Promise.reject(new Error("Expected a lazy sequence"));
    return lockedLazy(sequence, () => pullAsync(sequence, iterationBudget, signal));
}

export async function ensureLazyIndexAsync(sequence, oneBasedIndex, signal = null) {
    if (!Number.isSafeInteger(oneBasedIndex) || oneBasedIndex < 1) throw new Error("Lazy sequence index must be a positive safe integer");
    if (signal?.aborted) throw signal.reason;
    const read = () => sequence._lazy.unresolved ?? sequence._lazy.cache[oneBasedIndex - 1] ?? null;
    if (sequence._lazy.cache.length >= oneBasedIndex || sequence._lazy.done) return read();
    return lockedLazy(sequence, async () => {
        while (sequence._lazy.cache.length < oneBasedIndex && !sequence._lazy.done) await pullAsync(sequence, null, signal);
        return read();
    });
}

export async function materializeLazySequenceAsync(sequence, options = {}) {
    if (!isLazySequence(sequence)) return sequence;
    const lazy = sequence._lazy;
    if (lazy.knownLength === null && options.allowUnknown !== true && !lazy.done) throw new Error(`Cannot materialize unbounded or predicate-bounded ${lazy.label} without an explicit bound`);
    return lockedLazy(sequence, async () => {
        const limit = options.maxIterations ?? lazy.maxIterations;
        let attempts = 0;
        while (!lazy.done) {
            const result = await pullAsync(sequence, Math.max(0, limit - attempts), options.signal);
            attempts += result.attempts || 0;
        }
        return lazy.unresolved ?? { type: "sequence", values: [...lazy.cache], _ext: new Map([["_mutable", 1]]) };
    });
}

export function ensureLazyIndex(sequence, oneBasedIndex) {
    if (!Number.isInteger(oneBasedIndex) || oneBasedIndex < 1) {
        throw new Error("Lazy sequence index must be a positive integer");
    }
    while (sequence._lazy.cache.length < oneBasedIndex && !sequence._lazy.done) {
        pullLazyValue(sequence);
    }
    if (sequence._lazy.unresolved !== null) return sequence._lazy.unresolved;
    return sequence._lazy.cache[oneBasedIndex - 1] ?? null;
}

export function materializeLazySequence(sequence, options = {}) {
    if (!isLazySequence(sequence)) return sequence;
    const lazy = sequence._lazy;
    if (lazy.knownLength === null && options.allowUnknown !== true && !lazy.done) {
        throw new Error(`Cannot materialize unbounded or predicate-bounded ${lazy.label} without an explicit bound`);
    }
    const limit = options.maxIterations ?? lazy.maxIterations;
    let attempts = 0;
    while (!lazy.done) {
        const result = pullLazyValue(sequence, Math.max(0, limit - attempts));
        attempts += result.attempts || 0;
        if (attempts > limit) {
            throw new Error(`${lazy.label} exceeded the iteration limit of ${limit} while materializing`);
        }
    }
    if (lazy.unresolved !== null) return lazy.unresolved;
    return { type: "sequence", values: [...lazy.cache], _ext: new Map([["_mutable", 1]]) };
}

export function cloneLazySequence(sequence, options = {}) {
    if (!isLazySequence(sequence)) return sequence;
    const source = sequence._lazy;
    const restart = options.restart === true;
    const cloneValue = options.cloneValue || ((value) => value);
    const clone = {
        type: "lazy_sequence",
        _lazy: {
            state: restart ? source.initialState({ cloneValue, restart: true }) : source.cloneState(source.state, { cloneValue }),
            initialState: source.initialState,
            cloneState: source.cloneState,
            pull: source.pull,
            pullAsync: source.pullAsync,
            pending: null,
            pendingCount: 0,
            maxPending: source.maxPending,
            maxCache: source.maxCache,
            cache: restart ? [] : source.cache.map(cloneValue),
            done: restart ? false : source.done,
            unresolved: restart ? null : source.unresolved,
            knownLength: source.knownLength,
            maxIterations: source.maxIterations,
            label: source.label,
        },
        _ext: sequence._ext ? new Map(sequence._ext) : new Map(),
    };
    return clone;
}

export function mapLazySequence(source, mapper, options = {}) {
    let mapped;
    mapped = createLazySequence({
        createState: ({ cloneValue, restart } = {}) => ({
            index: 0,
            source: restart ? cloneLazySequence(source, { restart: true, cloneValue }) : source,
        }),
        cloneState: (state, { cloneValue } = {}) => ({
            index: state.index,
            source: cloneLazySequence(state.source, { cloneValue }),
        }),
        knownLength: lazyKnownLength(source),
        maxIterations: source._lazy.maxIterations,
        label: options.label || "lazy map",
        pull(state) {
            state.index++;
            const value = ensureLazyIndex(state.source, state.index);
            if (value === null && state.source._lazy.done && state.source._lazy.cache.length < state.index) {
                return { done: true };
            }
            return { done: false, value: mapper(value, state.index, state.source, mapped), attempts: 1 };
        },
    });
    return mapped;
}

export function filterLazySequence(source, predicate, options = {}) {
    let filtered;
    filtered = createLazySequence({
        createState: ({ cloneValue, restart } = {}) => ({
            sourceIndex: 0,
            source: restart ? cloneLazySequence(source, { restart: true, cloneValue }) : source,
        }),
        cloneState: (state, { cloneValue } = {}) => ({
            sourceIndex: state.sourceIndex,
            source: cloneLazySequence(state.source, { cloneValue }),
        }),
        knownLength: null,
        maxIterations: source._lazy.maxIterations,
        label: options.label || "lazy filter",
        pull(state, _self, budget) {
            let attempts = 0;
            while (attempts < budget) {
                state.sourceIndex++;
                attempts++;
                const value = ensureLazyIndex(state.source, state.sourceIndex);
                if (value === null && state.source._lazy.done && state.source._lazy.cache.length < state.sourceIndex) {
                    return { done: true, attempts };
                }
                const decision = requireConcreteLazyValue(predicate(value, state.sourceIndex, state.source, filtered));
                if (options.isUnresolved?.(decision)) {
                    return { unresolved: decision, attempts };
                }
                if (decision) {
                    return { done: false, value, attempts };
                }
            }
            return { attempts: budget + 1 };
        },
    });
    return filtered;
}
