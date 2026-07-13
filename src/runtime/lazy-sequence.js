/**
 * Incremental sequence values shared by array generators, interval ranges,
 * and collection pipes. Lazy sequences cache every emitted value so positive
 * indexing is stable and repeatable.
 */

export function isLazySequence(value) {
    return Boolean(value && value.type === "lazy_sequence" && value._lazy);
}

export function createLazySequence(options) {
    const sequence = {
        type: "lazy_sequence",
        _lazy: {
            state: options.createState(),
            initialState: options.createState,
            cloneState: options.cloneState || ((state) => ({ ...state })),
            pull: options.pull,
            cache: options.cache ? [...options.cache] : [],
            done: false,
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

export function pullLazyValue(sequence, iterationBudget = null) {
    if (!isLazySequence(sequence)) throw new Error("Expected a lazy sequence");
    const lazy = sequence._lazy;
    if (lazy.done) return { done: true, attempts: 0 };
    if (lazy.knownLength !== null && lazy.cache.length >= lazy.knownLength) {
        lazy.done = true;
        return { done: true, attempts: 0 };
    }

    const budget = iterationBudget ?? lazy.maxIterations;
    const result = lazy.pull(lazy.state, sequence, budget) || { done: true };
    const attempts = result.attempts ?? (result.done ? 0 : 1);
    if (attempts > budget) {
        throw new Error(`${lazy.label} exceeded the iteration limit of ${budget} while producing one value`);
    }
    if (result.done) {
        lazy.done = true;
        lazy.knownLength = lazy.cache.length;
        return { done: true, attempts };
    }
    lazy.cache.push(result.value);
    return { done: false, value: result.value, attempts };
}

export function ensureLazyIndex(sequence, oneBasedIndex) {
    if (!Number.isInteger(oneBasedIndex) || oneBasedIndex < 1) {
        throw new Error("Lazy sequence index must be a positive integer");
    }
    while (sequence._lazy.cache.length < oneBasedIndex && !sequence._lazy.done) {
        pullLazyValue(sequence);
    }
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
            cache: restart ? [] : source.cache.map(cloneValue),
            done: restart ? false : source.done,
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
                if (predicate(value, state.sourceIndex, state.source, filtered)) {
                    return { done: false, value, attempts };
                }
            }
            return { attempts: budget + 1 };
        },
    });
    return filtered;
}
