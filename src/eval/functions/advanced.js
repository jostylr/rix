/**
 * Advanced system functions: SOLVE, assertions, generators, and random helpers.
 *
 * These provide the constraint/assertion system and placeholder
 * implementations for extended features (calculus, generators, etc.)
 */

import { Integer, Rational, RationalInterval } from "@ratmath/core";
import { createTensor, createTensorView, isTensor, tensorRank } from "../../runtime/tensor.js";
import { captureIrValue, constructorDefaultCaptureMode } from "../../runtime/constructor-capture.js";
import { applySemanticHeader } from "../../runtime/semantic.js";
import { attachBuiltinProto } from "../../runtime/methods.js";
import { createLazySequence } from "../../runtime/lazy-sequence.js";
import { randomBigIntBelow, runtimeRandom } from "../../runtime/random.js";

function toNumber(val) {
    if (val instanceof Integer) return Number(val.value);
    if (val instanceof Rational) return Number(val.numerator) / Number(val.denominator);
    if (typeof val === "number") return val;
    if (typeof val === "bigint") return Number(val);
    return NaN;
}

function toInteger(val, name) {
    const number = toNumber(val);
    if (!Number.isSafeInteger(number)) throw new Error(`${name} must be a safe integer`);
    return number;
}

function toRational(val, name = "value") {
    if (val instanceof Rational) return val;
    if (val instanceof Integer) return new Rational(val.value, 1n);
    if (typeof val === "bigint" || typeof val === "number" || typeof val === "string") {
        try { return new Rational(val); } catch { /* handled below */ }
    }
    throw new Error(`${name} must be an exact rational value`);
}

function intervalBounds(interval) {
    if (interval instanceof RationalInterval) return [interval.low, interval.high];
    if (interval?.type === "interval") return [toRational(interval.lo, "interval lower bound"), toRational(interval.hi, "interval upper bound")];
    throw new Error("Interval operation requires a rational interval");
}

function eagerSequence(values) {
    return attachBuiltinProto({
        type: "sequence",
        values,
        _ext: new Map([["_mutable", new Integer(1n)]]),
    });
}

function finiteLazySequence(length, valueAt, label, maxIterations = 10000) {
    return attachBuiltinProto(createLazySequence({
        createState: () => ({ index: 0 }),
        cloneState: (state) => ({ ...state }),
        knownLength: length,
        maxIterations,
        label,
        pull(state) {
            if (state.index >= length) return { done: true };
            const value = valueAt(state.index++);
            return { done: false, value, attempts: 1 };
        },
    }));
}

function floorDiv(a, b) {
    let q = a / b;
    const r = a % b;
    if (r !== 0n && ((r > 0n) !== (b > 0n))) q--;
    return q;
}

function ceilDiv(a, b) {
    return -floorDiv(-a, b);
}

function randomGridRational(lo, hi, denominator, context) {
    const d = BigInt(denominator);
    if (d <= 0n) throw new Error("Random denominator must be positive");
    const min = ceilDiv(lo.numerator * d, lo.denominator);
    const max = floorDiv(hi.numerator * d, hi.denominator);
    if (min > max) throw new Error("The requested denominator has no points inside the interval");
    const width = max - min + 1n;
    const offset = randomBigIntBelow(context, width);
    return new Rational(min + offset, d);
}

function simplestRandomRational(lo, hi, tolerance, context) {
    const loNumber = toNumber(lo);
    const hiNumber = toNumber(hi);
    const x = loNumber + runtimeRandom(context) * (hiNumber - loNumber);
    const tol = tolerance ?? context?.getEnv?.("randomTolerance", 1e-6) ?? 1e-6;
    if (!(tol > 0)) throw new Error("Random rational tolerance must be positive");
    const lower = Math.max(loNumber, x - tol);
    const upper = Math.min(hiNumber, x + tol);
    const maxDenominator = context?.getEnv?.("randomMaxDenominator", 1000000) ?? 1000000;
    for (let d = 1; d <= maxDenominator; d++) {
        const min = Math.ceil(lower * d - Number.EPSILON);
        const max = Math.floor(upper * d + Number.EPSILON);
        if (min <= max) {
            const numerator = Math.max(min, Math.min(max, Math.round(x * d)));
            return new Rational(BigInt(numerator), BigInt(d));
        }
    }
    return new Rational(BigInt(Math.round(x * maxDenominator)), BigInt(maxDenominator));
}

function randomParameters(value) {
    const values = value?.type === "tuple" ? value.values : [value];
    const count = toInteger(values[0], "Random sample count");
    if (count <= 0) throw new Error("Random sample count must be positive");
    let denominator = null;
    if (values[1] !== null && values[1] !== undefined) {
        if (values[1] instanceof Integer) denominator = values[1].value;
        else if (values[1] instanceof Rational && values[1].denominator === 1n) denominator = values[1].numerator;
        else if (typeof values[1] === "bigint") denominator = values[1];
        else {
            const parsed = toInteger(values[1], "Random denominator");
            denominator = BigInt(parsed);
        }
        if (denominator <= 0n) throw new Error("Random denominator must be positive");
    }
    const tolerance = values[2] === null || values[2] === undefined ? null : toNumber(values[2]);
    return { count, denominator, tolerance };
}

function mediant(a, b) {
    return new Rational(a.numerator + b.numerator, a.denominator + b.denominator);
}

function mediantLevels(lo, hi, levels) {
    const result = [[lo, hi]];
    let boundaries = [lo, hi];
    for (let level = 1; level <= levels; level++) {
        const inserted = [];
        const next = [boundaries[0]];
        for (let i = 0; i < boundaries.length - 1; i++) {
            const value = mediant(boundaries[i], boundaries[i + 1]);
            inserted.push(value);
            next.push(value, boundaries[i + 1]);
        }
        result.push(inserted);
        boundaries = next;
    }
    return { levels: result, boundaries };
}

export const advancedFunctions = {
    SOLVE: {
        lazy: true,
        impl(args, context, evaluate) {
            // SOLVE(name, expr) — set variable to the value that satisfies expr
            // For now, just evaluate the expression and assign it
            let name = typeof args[0] === "object" && args[0] !== null && args[0].fn
                ? evaluate(args[0])
                : args[0];

            // Unwrap RiX string object if necessary
            if (name && typeof name === "object" && name.type === "string") {
                name = name.value;
            }

            const value = evaluate(args[1]);
            context.set(name, value);
            return { type: "constraint", name, value, satisfied: true };
        },
        doc: "Solve/constrain: x :=: expr",
    },

    ASSERT_LT: {
        impl(args) {
            const a = toNumber(args[0]);
            const b = toNumber(args[1]);
            if (!(a < b)) {
                throw new Error(`Assertion failed: ${a} < ${b}`);
            }
            return new Integer(1);
        },
        pure: true,
        doc: "Assert a < b (:<:)",
    },

    ASSERT_LTE: {
        impl(args) {
            const a = toNumber(args[0]);
            const b = toNumber(args[1]);
            if (!(a <= b)) {
                throw new Error(`Assertion failed: ${a} <= ${b}`);
            }
            return new Integer(1);
        },
        pure: true,
        doc: "Assert a <= b (:<=:)",
    },

    ASSERT_GT: {
        impl(args) {
            const a = toNumber(args[0]);
            const b = toNumber(args[1]);
            if (!(a > b)) {
                throw new Error(`Assertion failed: ${a} > ${b}`);
            }
            return new Integer(1);
        },
        pure: true,
        doc: "Assert a > b (:>:)",
    },

    ASSERT_GTE: {
        impl(args) {
            const a = toNumber(args[0]);
            const b = toNumber(args[1]);
            if (!(a >= b)) {
                throw new Error(`Assertion failed: ${a} >= ${b}`);
            }
            return new Integer(1);
        },
        pure: true,
        doc: "Assert a >= b (:>=:)",
    },

    GENERATOR: {
        impl(args) {
            throw new Error("Generator IR must be evaluated inside an array constructor");
        },
        doc: "Internal array-generator marker",
    },

    STEP: {
        impl(args, context) {
            const [lo, hi] = intervalBounds(args[0]);
            const step = toRational(args[1], "Interval step");
            const direction = step.compareTo(Rational.zero);
            if (direction === 0) throw new Error("Interval step cannot be zero");
            const start = direction > 0 ? lo : hi;
            const bound = direction > 0 ? hi : lo;
            const distance = hi.subtract(lo);
            const magnitude = direction > 0 ? step : step.multiply(new Rational(-1n, 1n));
            const quotient = distance.divide(magnitude);
            const lengthValue = quotient.numerator / quotient.denominator + 1n;
            const knownLength = lengthValue <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(lengthValue) : null;
            return attachBuiltinProto(createLazySequence({
                createState: () => ({ current: start, started: false }),
                cloneState: (state) => ({ ...state }),
                knownLength,
                maxIterations: context?.getEnv?.("generatorMaxIterations", 10000) ?? 10000,
                label: "stepped interval",
                pull(state) {
                    const value = state.started ? state.current.add(step) : state.current;
                    state.started = true;
                    state.current = value;
                    if ((direction > 0 && value.compareTo(bound) > 0) || (direction < 0 && value.compareTo(bound) < 0)) return { done: true };
                    return { done: false, value, attempts: 1 };
                },
            }));
        },
        pure: true,
        doc: "Lazy exact stepped range over a rational interval",
    },

    DIVIDE: {
        impl(args, context) {
            const [lo, hi] = intervalBounds(args[0]);
            const count = toInteger(args[1], "Point count");
            if (count <= 0) throw new Error("Point count must be positive");
            if (count === 1) return finiteLazySequence(1, () => lo, "interval division", context?.getEnv?.("generatorMaxIterations", 10000));
            const step = hi.subtract(lo).divide(new Rational(BigInt(count - 1), 1n));
            return finiteLazySequence(count, (index) => lo.add(step.multiply(new Rational(BigInt(index), 1n))), "interval division", context?.getEnv?.("generatorMaxIterations", 10000));
        },
        pure: true,
        doc: "Return n lazy equally spaced points including interval endpoints",
    },

    PARTITION: {
        impl(args) {
            const [lo, hi] = intervalBounds(args[0]);
            const count = toInteger(args[1], "Partition count");
            if (count <= 0) throw new Error("Partition count must be positive");
            const width = hi.subtract(lo).divide(new Rational(BigInt(count), 1n));
            const values = [];
            for (let i = 0; i < count; i++) {
                const start = lo.add(width.multiply(new Rational(BigInt(i), 1n)));
                const end = i === count - 1 ? hi : lo.add(width.multiply(new Rational(BigInt(i + 1), 1n)));
                values.push(new RationalInterval(start, end));
            }
            return eagerSequence(values);
        },
        pure: true,
        doc: "Partition an interval into n equal touching subintervals",
    },

    MEDIANTS: {
        impl(args) {
            const [lo, hi] = intervalBounds(args[0]);
            const levels = toInteger(args[1], "Mediant level count");
            if (levels < 0) throw new Error("Mediant level count cannot be negative");
            return eagerSequence(mediantLevels(lo, hi, levels).levels.map((values) => eagerSequence(values)));
        },
        pure: true,
        doc: "Return nested levels of exact mediants",
    },

    MEDIANT_PARTITION: {
        impl(args) {
            const [lo, hi] = intervalBounds(args[0]);
            const levels = toInteger(args[1], "Mediant level count");
            if (levels < 0) throw new Error("Mediant level count cannot be negative");
            const boundaries = mediantLevels(lo, hi, levels).boundaries;
            return eagerSequence(boundaries.slice(0, -1).map((start, index) => new RationalInterval(start, boundaries[index + 1])));
        },
        pure: true,
        doc: "Partition an interval using exact mediant boundaries",
    },

    RANDOM: {
        impl(args, context) {
            const [lo, hi] = intervalBounds(args[0]);
            const { count, denominator, tolerance } = randomParameters(args[1]);
            const values = Array.from({ length: count }, () => denominator === null
                ? simplestRandomRational(lo, hi, tolerance, context)
                : randomGridRational(lo, hi, denominator, context));
            return count === 1 ? values[0] : eagerSequence(values);
        },
        doc: "Sample exact rational points from an interval",
    },

    RANDOM_PARTITION: {
        impl(args, context) {
            const [lo, hi] = intervalBounds(args[0]);
            const { count, denominator, tolerance } = randomParameters(args[1]);
            if (count === 1) return eagerSequence([new RationalInterval(lo, hi)]);
            const points = new Map();
            const maxAttempts = context?.getEnv?.("generatorMaxIterations", 10000) ?? 10000;
            let attempts = 0;
            while (points.size < count - 1 && attempts++ < maxAttempts) {
                const point = denominator === null
                    ? simplestRandomRational(lo, hi, tolerance, context)
                    : randomGridRational(lo, hi, denominator, context);
                if (point.compareTo(lo) > 0 && point.compareTo(hi) < 0) points.set(point.toString(), point);
            }
            if (points.size < count - 1) throw new Error("Could not choose enough distinct interior random partition points");
            const boundaries = [lo, ...points.values(), hi].sort((a, b) => a.compareTo(b));
            return eagerSequence(boundaries.slice(0, -1).map((start, index) => new RationalInterval(start, boundaries[index + 1])));
        },
        doc: "Partition an interval at distinct random rational points",
    },

    INFSEQ: {
        impl(args, context) {
            const start = toRational(args[0], "Infinite sequence start");
            const step = args[1] === null ? Rational.one : toRational(args[1], "Infinite sequence step");
            return attachBuiltinProto(createLazySequence({
                createState: () => ({ current: start, started: false }),
                cloneState: (state) => ({ ...state }),
                knownLength: null,
                maxIterations: context?.getEnv?.("generatorMaxIterations", 10000) ?? 10000,
                label: "infinite arithmetic sequence",
                pull(state) {
                    const value = state.started ? state.current.add(step) : state.current;
                    state.started = true;
                    state.current = value;
                    return { done: false, value, attempts: 1 };
                },
            }));
        },
        pure: true,
        doc: "Lazy unbounded exact arithmetic sequence",
    },

    MATRIX: {
        impl(args) {
            // Basic matrix as nested array
            return { type: "matrix", rows: args };
        },
        pure: true,
        doc: "Matrix literal",
    },

    TENSOR: {
        lazy: true,
        impl(args, context, evaluate) {
            const defaultMode = constructorDefaultCaptureMode(context);
            return createTensor([args.length], args.map((arg) => captureIrValue(arg, defaultMode, context, evaluate)));
        },
        pure: true,
        doc: "Tensor literal",
    },

    TENSOR_LITERAL: {
        lazy: true,
        impl(args, context, evaluate) {
            const hasMeta = args[0] && typeof args[0] === "object" && !Array.isArray(args[0]) && args[0].header;
            const header = hasMeta ? args[0].header : null;
            const defaultMode = header?.captureMode || constructorDefaultCaptureMode(context);
            const shape = hasMeta ? args[1] : args[0];
            const values = (hasMeta ? args.slice(2) : args.slice(1)).map((arg) => captureIrValue(arg, defaultMode, context, evaluate));
            return applySemanticHeader(attachBuiltinProto(createTensor(shape, values.length === 0 ? null : values)), header, context);
        },
        pure: true,
        doc: "Tensor literal with explicit shape",
    },

    TENSOR_TRANSPOSE: {
        impl(args) {
            const tensor = args[0];
            if (!isTensor(tensor) || tensorRank(tensor) !== 2) {
                throw new Error("^^ expects rank-2 tensor (matrix)");
            }
            return createTensorView(tensor, {
                shape: [tensor.shape[1], tensor.shape[0]],
                strides: [tensor.strides[1], tensor.strides[0]],
                offset: tensor.offset,
            });
        },
        pure: true,
        doc: "Transpose a rank-2 tensor view",
    },

};
