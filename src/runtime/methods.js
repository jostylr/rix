import { Fraction, Integer, RationalInterval, Rational } from "@ratmath/core";
import { HOLE, isHole } from "./hole.js";
import { keyOf } from "../eval/functions/keyof.js";
import { deferredMethods } from "../eval/functions/deferred.js";
import { shallowCopyValue } from "./cell.js";
import { arithmeticFunctions } from "../eval/functions/arithmetic.js";
import { collectionFunctions } from "../eval/functions/collections.js";
import {
    createTensor,
    createTensorView,
    forEachTensorCell,
    isTensor,
    tensorAssignBySelectors,
    tensorGetBySelectors,
    tensorIndexTuple,
    tensorRank,
    tensorShape,
    tensorSize,
} from "./tensor.js";
import { checkTraits, refreshRuntimeMetadata } from "./semantic.js";
import {
    cayleyCartesian,
    cayleyFromCartesian,
    cayleyImaginary,
    cayleyReal,
    addScalars,
    complexConjugate,
    complexNormSquared,
    complexParts,
    conjugateCayley,
    inverseCayley,
    isExactValue,
    multiplyScalars,
} from "./exact-values.js";
import { isUnitValue } from "./quantities.js";
import { ensureLazyIndex, lazyKnownLength, materializeLazySequence } from "./lazy-sequence.js";
import { asyncStreamMethodHelpers } from "./async-stream.js";
import {
    collapseStructuralValue,
    formatStructuralValue,
    inspectStructuralValue,
    simplifyStructuralValue,
    structuralAlgebra,
    createStructuralAlgebraProfile,
    structuralForm,
    structuralSourceSpan,
} from "./structural-arithmetic.js";

function int(value) {
    return new Integer(BigInt(value));
}

function truthy(value) {
    return value !== null && value !== undefined;
}

function bool(flag) {
    return flag ? int(1) : null;
}

function stringValue(value) {
    if (value?.type === "string") return value.value;
    if (value === null || value === undefined) return "";
    return String(value);
}

function stringObj(value) {
    return { type: "string", value };
}

function exactBigInt(value, label) {
    if (value instanceof Integer) return value.value;
    if (value instanceof Rational && value.denominator === 1n) return value.numerator;
    throw new Error(`${label} must be an exact integer`);
}

function safeExactNumber(value, label) {
    const bigint = exactBigInt(value, label);
    const number = Number(bigint);
    if (!Number.isSafeInteger(number)) {
        throw new Error(`${label} must fit in a safe JavaScript integer`);
    }
    return number;
}

function exactRational(value, label) {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value.value, 1n);
    throw new Error(`${label} must be an exact integer or rational`);
}

function exactInterval(value, label) {
    if (value instanceof RationalInterval) return value;
    throw new Error(`${label} must be a rational interval`);
}

function exactSequence(values) {
    return { type: "sequence", values, _ext: mutableExt() };
}

function createFrozenMeta() {
    return new Map([
        ["frozen", int(1)],
        ["immutable", int(1)],
    ]);
}

function createBuiltinProto(entries) {
    return {
        type: "map",
        entries: new Map(entries),
        _ext: createFrozenMeta(),
    };
}

function method(name, impl) {
    return { type: "method_builtin", name, impl };
}

function mutableExt() {
    return new Map([["_mutable", int(1)]]);
}

function ensureMutableExt(value) {
    if (!value._ext) value._ext = mutableExt();
    if (!value._ext.get("_mutable")) value._ext.set("_mutable", int(1));
    return value._ext;
}

function ensureExt(value) {
    if (!value._ext) value._ext = new Map();
    return value._ext;
}

function createEmptySequence() {
    return { type: "sequence", values: [], _ext: mutableExt() };
}

function createEmptyMap() {
    return { type: "map", entries: new Map(), _ext: mutableExt() };
}

function createEmptySet() {
    return { type: "set", values: [], _ext: mutableExt() };
}

function createEmptyTupleLike(tuple) {
    return {
        type: "tuple",
        values: new Array(tuple.values.length).fill(HOLE),
        _ext: mutableExt(),
    };
}

function createEmptyTensorLike(tensor) {
    return createTensor(tensor.shape, null, { ext: mutableExt() });
}

function defaultAccumulator(target) {
    if (target?.type === "sequence") return createEmptySequence();
    if (target?.type === "map") return createEmptyMap();
    if (target?.type === "set") return createEmptySet();
    if (target?.type === "tuple") return createEmptyTupleLike(target);
    if (target?.type === "string") return stringObj("");
    if (isTensor(target)) return createEmptyTensorLike(target);
    throw new Error("Reduce does not know how to build a default accumulator for this value");
}

function valueKey(value) {
    if (isHole(value)) return "__hole__";
    if (value === null || value === undefined) return "null";
    if (value instanceof Integer) return value.toString();
    if (value?.type === "string") return JSON.stringify(value.value);
    if (value?.type === "tuple" || value?.type === "sequence" || value?.type === "set") {
        return `${value.type}[${value.values.map(valueKey).join(",")}]`;
    }
    if (value?.type === "map") {
        return `map{${Array.from(value.entries.entries()).map(([k, v]) => `${k}:${valueKey(v)}`).join(",")}}`;
    }
    if (isTensor(value)) {
        return `tensor(${value.shape.join("x")})[${value.data.map(valueKey).join(",")}]`;
    }
    if (typeof value?.toString === "function" && value.toString !== Object.prototype.toString) {
        return value.toString();
    }
    return JSON.stringify(value);
}

function isInterval(value) {
    if (!value || typeof value !== "object") return false;
    if (value instanceof RationalInterval) return true;
    if (value.type === "interval") return true;
    return false;
}

function getIntervalRange(value, length) {
    let lo, hi;
    if (value && (value.type === "interval" || value instanceof RationalInterval)) {
        lo = value.start;
        hi = value.end;
    } else {
        lo = value.lo;
        hi = value.hi;
    }
    const startNum = normalizeLookupIndex(lo, length);
    const start = startNum === null ? (numericIndex(lo) < 1 ? 1 : length + 1) : startNum;
    const endNum = normalizeLookupIndex(hi, length);
    const end = endNum === null ? (numericIndex(hi) < 1 ? 1 : length + 1) : endNum;
    return { start, end };
}

function numericIndex(value, label = "Index") {
    if (value instanceof Integer) return Number(value.value);
    if (value instanceof Rational) {
        if (value.denominator !== 1n) {
            throw new Error(`${label} must be an integer, got ${value}`);
        }
        return Number(value.numerator);
    }
    if (value && typeof value === "object") {
        if (typeof value.value === "bigint") return Number(value.value);
        if (typeof value.numerator === "bigint" && typeof value.denominator === "bigint") {
            if (value.denominator !== 1n) {
                throw new Error(`${label} must be an integer, got ${value}`);
            }
            return Number(value.numerator);
        }
    }
    if (typeof value === "number" || typeof value === "bigint") return Number(value);
    if (typeof value === "string" && !isNaN(value)) return Number(value);
    throw new Error(`${label} must be numeric, got ${typeof value} (${value})`);
}

function normalizeLookupIndex(rawIndex, length) {
    const index = numericIndex(rawIndex);
    const normalized = index < 0 ? length + 1 + index : index;
    if (normalized < 1 || normalized > length) return null;
    return normalized;
}

function normalizeWritableIndex(rawIndex, length, allowEnd = false) {
    let index = numericIndex(rawIndex);
    if (index < 0) index = length + 1 + index;
    const max = allowEnd ? length + 1 : Math.max(length, 1);
    if (index < 1) index = 1;
    if (index > max) index = max;
    return index;
}

function normalizeSliceStart(rawIndex, length) {
    if (rawIndex === undefined || rawIndex === null) return 1;
    let index = numericIndex(rawIndex);
    if (index < 0) index = length + 1 + index;
    if (index < 1) index = 1;
    if (index > length + 1) index = length + 1;
    return index;
}

function normalizeSliceEnd(rawIndex, length) {
    if (rawIndex === undefined || rawIndex === null) return length + 1;
    let index = numericIndex(rawIndex);
    if (index < 0) index = length + 1 + index;
    if (index < 1) index = 1;
    if (index > length + 1) index = length + 1;
    return index;
}

function jsSlice(values, startArg, endArg) {
    const start = normalizeSliceStart(startArg, values.length);
    const end = normalizeSliceEnd(endArg, values.length);
    return values.slice(start - 1, end - 1);
}

function charsOf(value) {
    return Array.from(stringValue(value)).map((char) => stringObj(char));
}

function fromChars(chars) {
    return stringObj(chars.map((char) => stringValue(char)).join(""));
}

function compareValues(a, b) {
    const ak = valueKey(a);
    const bk = valueKey(b);
    if (ak < bk) return -1;
    if (ak > bk) return 1;
    return 0;
}

function arrayEntries(target) {
    return target.values.map((value, index) => ({
        value,
        key: int(index + 1),
    }));
}

function tupleEntries(target) {
    return target.values.map((value, index) => ({
        value,
        key: int(index + 1),
    }));
}

function mapEntries(target) {
    return Array.from(target.entries.entries()).map(([key, value]) => ({
        value,
        key: stringObj(key),
    }));
}

function setEntries(target) {
    return target.values.map((value) => ({
        value,
        key: value,
    }));
}

function stringEntries(target) {
    return charsOf(target).map((value, index) => ({
        value,
        key: int(index + 1),
    }));
}

function tensorEntries(target) {
    const entries = [];
    forEachTensorCell(target, (value, tuple) => {
        entries.push({
            value,
            key: tensorIndexTuple(tuple),
        });
    });
    return entries;
}

function isIndexedIteratorSource(target) {
    return target?.type === "sequence" ||
        target?.type === "lazy_sequence" ||
        target?.type === "tuple" ||
        target?.type === "string" ||
        isTensor(target);
}

function iteratorStep(value, label) {
    const step = numericIndex(value, label);
    if (!Number.isSafeInteger(step)) throw new Error(`${label} must be an integer`);
    return step;
}

function iteratorLookup(source, index) {
    if (!Number.isSafeInteger(index) || index < 1) return { found: false, value: null };
    if (source?.type === "lazy_sequence") {
        ensureLazyIndex(source, index);
        if (index <= source._lazy.cache.length) {
            return { found: true, value: source._lazy.cache[index - 1] };
        }
        return { found: false, value: null };
    }
    const entries = iterateEntries(source);
    if (index > entries.length) return { found: false, value: null };
    return { found: true, value: entries[index - 1].value };
}

function iteratorLength(source) {
    if (source?.type === "lazy_sequence") return lazyKnownLength(source);
    return iterateEntries(source).length;
}

function createCollectionIterator(source) {
    return attachBuiltinProto({
        type: "iterator",
        source,
        cursor: 0,
        _ext: new Map(),
    });
}

function iterateEntries(target) {
    if (target?.type === "sequence") return arrayEntries(target);
    if (target?.type === "tuple") return tupleEntries(target);
    if (target?.type === "map") return mapEntries(target);
    if (target?.type === "set") return setEntries(target);
    if (target?.type === "string") return stringEntries(target);
    if (isTensor(target)) return tensorEntries(target);
    throw new Error("Value is not iterable for this method");
}

function callIterator(fn, args, context, evaluate, invoke) {
    if (!fn) {
        return args[1];
    }
    return invoke(fn, args, context, evaluate);
}

function predicateResult(fn, args, context, evaluate, invoke) {
    return truthy(callIterator(fn, args, context, evaluate, invoke));
}

function sequenceAt(target, rawIndex) {
    const index = normalizeLookupIndex(rawIndex, target.values.length);
    if (index === null) return null;
    return target.values[index - 1];
}

function stringAt(target, rawIndex) {
    const chars = charsOf(target);
    const index = normalizeLookupIndex(rawIndex, chars.length);
    if (index === null) return null;
    return chars[index - 1];
}

function mapValue(target, key) {
    const canonical = keyOf(key);
    return target.entries.has(canonical) ? target.entries.get(canonical) : null;
}

function setHas(target, value) {
    const wanted = valueKey(value);
    return target.values.some((entry) => valueKey(entry) === wanted);
}

function mapLikeKeys(arg) {
    if (arg?.type === "set" || arg?.type === "sequence" || arg?.type === "tuple") {
        return (arg.values || []).map((value) => keyOf(value));
    }
    return [keyOf(arg)];
}

function ensureSequence(target, name) {
    if (!target || target.type !== "sequence") throw new Error(`${name} is only defined for sequences`);
}

function ensureMap(target, name) {
    if (!target || target.type !== "map") throw new Error(`${name} is only defined for maps`);
}

function ensureSet(target, name) {
    if (!target || target.type !== "set") throw new Error(`${name} is only defined for sets`);
}

function ensureTuple(target, name) {
    if (!target || target.type !== "tuple") throw new Error(`${name} is only defined for tuples`);
}

function ensureString(target, name) {
    if (!target || target.type !== "string") throw new Error(`${name} is only defined for strings`);
}

function ensureTensor(target, name) {
    if (!isTensor(target)) throw new Error(`${name} is only defined for tensors`);
}

function mutableSetValue(target, rawIndex, value) {
    const index = normalizeWritableIndex(rawIndex, target.values.length, true);
    while (target.values.length < index - 1) target.values.push(HOLE);
    if (index === target.values.length + 1) {
        target.values.push(value);
    } else {
        target.values[index - 1] = value;
    }
    return target;
}

function nonMutatingSetValue(target, rawIndex, value) {
    const copy = shallowCopyValue(target);
    mutableSetValue(copy, rawIndex, value);
    return copy;
}

function removeDuplicates(values) {
    const seen = new Set();
    const out = [];
    for (const value of values) {
        const key = valueKey(value);
        if (!seen.has(key)) {
            seen.add(key);
            out.push(value);
        }
    }
    return out;
}

function flattenValues(values, depth) {
    if (depth <= 0) return [...values];
    const out = [];
    for (const value of values) {
        if (value?.type === "sequence" || value?.type === "tuple" || value?.type === "set") {
            out.push(...flattenValues(value.values, depth - 1));
        } else {
            out.push(value);
        }
    }
    return out;
}

function reduceEntries(target, iterator, initial, context, evaluate, invoke, entryMapper = (entry) => [entry.value, entry.key, target]) {
    const entries = iterateEntries(target);
    let accumulator = initial === undefined ? defaultAccumulator(target) : initial;
    for (const entry of entries) {
        accumulator = invoke(iterator, [accumulator, ...entryMapper(entry)], context, evaluate);
    }
    return accumulator;
}

function anyEntries(target, iterator, context, evaluate, invoke) {
    for (const entry of iterateEntries(target)) {
        if (predicateResult(iterator, [entry.value, entry.key, target], context, evaluate, invoke)) {
            return int(1);
        }
    }
    return null;
}

function allEntries(target, iterator, context, evaluate, invoke) {
    for (const entry of iterateEntries(target)) {
        if (!predicateResult(iterator, [entry.value, entry.key, target], context, evaluate, invoke)) {
            return null;
        }
    }
    return int(1);
}

function countEntries(target, iterator, context, evaluate, invoke) {
    let count = 0;
    for (const entry of iterateEntries(target)) {
        if (!iterator || predicateResult(iterator, [entry.value, entry.key, target], context, evaluate, invoke)) {
            count += 1;
        }
    }
    return int(count);
}

function findEntry(target, iterator, context, evaluate, invoke, wantKey = false) {
    for (const entry of iterateEntries(target)) {
        if (predicateResult(iterator, [entry.value, entry.key, target], context, evaluate, invoke)) {
            return wantKey ? entry.key : entry.value;
        }
    }
    return null;
}

function arithmeticAdd(a, b) {
    return arithmeticFunctions.ADD.impl([a, b]);
}

function arithmeticMul(a, b) {
    return arithmeticFunctions.MUL.impl([a, b]);
}

function arithmeticDiv(a, b) {
    return arithmeticFunctions.DIV.impl([a, b]);
}

const arrayMethods = {
    LEN: method("LEN", ([target]) => {
        ensureSequence(target, "Len");
        return int(target.values.length);
    }),
    ISEMPTY: method("ISEMPTY", ([target]) => {
        ensureSequence(target, "IsEmpty");
        return bool(target.values.length === 0);
    }),
    GET: method("GET", ([target, index]) => {
        ensureSequence(target, "Get");
        return sequenceAt(target, index);
    }),
    FIRST: method("FIRST", ([target]) => {
        ensureSequence(target, "First");
        return target.values[0] ?? null;
    }),
    LAST: method("LAST", ([target]) => {
        ensureSequence(target, "Last");
        return target.values[target.values.length - 1] ?? null;
    }),
    INCLUDES: method("INCLUDES", ([target, value]) => {
        ensureSequence(target, "Includes");
        return bool(target.values.some((entry) => valueKey(entry) === valueKey(value)));
    }),
    INDEXOF: method("INDEXOF", ([target, value]) => {
        ensureSequence(target, "IndexOf");
        const idx = target.values.findIndex((entry) => valueKey(entry) === valueKey(value));
        return idx === -1 ? null : int(idx + 1);
    }),
    LASTINDEXOF: method("LASTINDEXOF", ([target, value]) => {
        ensureSequence(target, "LastIndexOf");
        for (let i = target.values.length - 1; i >= 0; i--) {
            if (valueKey(target.values[i]) === valueKey(value)) return int(i + 1);
        }
        return null;
    }),
    HASAT: method("HASAT", ([target, index]) => {
        ensureSequence(target, "HasAt");
        const found = sequenceAt(target, index);
        return bool(found !== null && !isHole(found));
    }),
    SLICE: method("SLICE", ([target, start, end]) => {
        ensureSequence(target, "Slice");
        return { type: "sequence", values: jsSlice(target.values, start, end), _ext: mutableExt() };
    }),
    JOIN: method("JOIN", ([target, separator]) => {
        ensureSequence(target, "Join");
        return stringObj(target.values.map((value) => stringValue(value)).join(stringValue(separator ?? stringObj(","))));
    }),
    PUSH: method("PUSH", ([target, ...values]) => {
        ensureSequence(target, "Push");
        const copy = shallowCopyValue(target);
        copy.values.push(...values);
        return copy;
    }),
    "PUSH!": method("PUSH!", ([target, ...values]) => {
        ensureSequence(target, "Push!");
        target.values.push(...values);
        return target;
    }),
    UNSHIFT: method("UNSHIFT", ([target, ...values]) => {
        ensureSequence(target, "Unshift");
        const copy = shallowCopyValue(target);
        copy.values.unshift(...values);
        return copy;
    }),
    "UNSHIFT!": method("UNSHIFT!", ([target, ...values]) => {
        ensureSequence(target, "Unshift!");
        target.values.unshift(...values);
        return target;
    }),
    SET: method("SET", ([target, index, value]) => {
        ensureSequence(target, "Set");
        return nonMutatingSetValue(target, index, value);
    }),
    "SET!": method("SET!", ([target, index, value]) => {
        ensureSequence(target, "Set!");
        mutableSetValue(target, index, value);
        return target;
    }),
    INSERT: method("INSERT", ([target, index, value]) => {
        ensureSequence(target, "Insert");
        const copy = shallowCopyValue(target);
        const at = normalizeWritableIndex(index, copy.values.length, true);
        copy.values.splice(at - 1, 0, value);
        return copy;
    }),
    "INSERT!": method("INSERT!", ([target, index, value]) => {
        ensureSequence(target, "Insert!");
        const at = normalizeWritableIndex(index, target.values.length, true);
        target.values.splice(at - 1, 0, value);
        return target;
    }),
    REMOVEAT: method("REMOVEAT", ([target, index]) => {
        ensureSequence(target, "RemoveAt");
        const copy = shallowCopyValue(target);
        const at = normalizeLookupIndex(index, copy.values.length);
        if (at !== null) copy.values.splice(at - 1, 1);
        return copy;
    }),
    "REMOVEAT!": method("REMOVEAT!", ([target, index]) => {
        ensureSequence(target, "RemoveAt!");
        const at = normalizeLookupIndex(index, target.values.length);
        if (at !== null) target.values[at - 1] = HOLE;
        return target;
    }),
    CONCAT: method("CONCAT", ([target, ...others]) => {
        ensureSequence(target, "Concat");
        return others.reduce((acc, other) => collectionFunctions.CONCAT.impl([acc, other]), target);
    }),
    "CONCAT!": method("CONCAT!", ([target, ...others]) => {
        ensureSequence(target, "Concat!");
        for (const other of others) {
            const values = other?.values || [other];
            target.values.push(...values);
        }
        return target;
    }),
    REVERSE: method("REVERSE", ([target]) => {
        ensureSequence(target, "Reverse");
        const copy = shallowCopyValue(target);
        copy.values.reverse();
        return copy;
    }),
    "REVERSE!": method("REVERSE!", ([target]) => {
        ensureSequence(target, "Reverse!");
        target.values.reverse();
        return target;
    }),
    SORT: method("SORT", ([target]) => {
        ensureSequence(target, "Sort");
        const copy = shallowCopyValue(target);
        copy.values.sort(compareValues);
        return copy;
    }),
    "SORT!": method("SORT!", ([target]) => {
        ensureSequence(target, "Sort!");
        target.values.sort(compareValues);
        return target;
    }),
    DISTINCT: method("DISTINCT", ([target]) => {
        ensureSequence(target, "Distinct");
        return { type: "sequence", values: removeDuplicates(target.values), _ext: mutableExt() };
    }),
    "DISTINCT!": method("DISTINCT!", ([target]) => {
        ensureSequence(target, "Distinct!");
        target.values = removeDuplicates(target.values);
        return target;
    }),
    FLATTEN: method("FLATTEN", ([target, depth]) => {
        ensureSequence(target, "Flatten");
        const levels = depth === undefined ? 1 : numericIndex(depth, "Flatten depth");
        return { type: "sequence", values: flattenValues(target.values, levels), _ext: mutableExt() };
    }),
    "FLATTEN!": method("FLATTEN!", ([target, depth]) => {
        ensureSequence(target, "Flatten!");
        const levels = depth === undefined ? 1 : numericIndex(depth, "Flatten depth");
        target.values = flattenValues(target.values, levels);
        return target;
    }),
    DROPFIRST: method("DROPFIRST", ([target, count]) => {
        ensureSequence(target, "DropFirst");
        const n = count === undefined ? 1 : Math.max(0, numericIndex(count));
        return { type: "sequence", values: target.values.slice(n), _ext: mutableExt() };
    }),
    DROPLAST: method("DROPLAST", ([target, count]) => {
        ensureSequence(target, "DropLast");
        const n = count === undefined ? 1 : Math.max(0, numericIndex(count));
        return { type: "sequence", values: target.values.slice(0, Math.max(0, target.values.length - n)), _ext: mutableExt() };
    }),
    "POP!": method("POP!", ([target]) => {
        ensureSequence(target, "Pop!");
        return target.values.length === 0 ? HOLE : target.values.pop();
    }),
    "SHIFT!": method("SHIFT!", ([target]) => {
        ensureSequence(target, "Shift!");
        return target.values.length === 0 ? HOLE : target.values.shift();
    }),
    MAP: method("MAP", ([target, iterator], context, evaluate, invoke) => {
        ensureSequence(target, "Map");
        return {
            type: "sequence",
            values: iterateEntries(target).map((entry) => invoke(iterator, [entry.value, entry.key, target], context, evaluate)),
            _ext: mutableExt(),
        };
    }),
    FILTER: method("FILTER", ([target, iterator], context, evaluate, invoke) => {
        ensureSequence(target, "Filter");
        return {
            type: "sequence",
            values: iterateEntries(target)
                .filter((entry) => predicateResult(iterator, [entry.value, entry.key, target], context, evaluate, invoke))
                .map((entry) => entry.value),
            _ext: mutableExt(),
        };
    }),
    ANY: method("ANY", ([target, iterator], context, evaluate, invoke) => anyEntries(target, iterator, context, evaluate, invoke)),
    ALL: method("ALL", ([target, iterator], context, evaluate, invoke) => allEntries(target, iterator, context, evaluate, invoke)),
    COUNT: method("COUNT", ([target, iterator], context, evaluate, invoke) => countEntries(target, iterator, context, evaluate, invoke)),
    FIND: method("FIND", ([target, iterator], context, evaluate, invoke) => findEntry(target, iterator, context, evaluate, invoke, false)),
    FINDINDEX: method("FINDINDEX", ([target, iterator], context, evaluate, invoke) => findEntry(target, iterator, context, evaluate, invoke, true)),
    REDUCE: method("REDUCE", ([target, iterator, initial], context, evaluate, invoke) =>
        reduceEntries(target, iterator, initial, context, evaluate, invoke)),
    "SWAP!": method("SWAP!", ([target, i, j]) => {
        ensureSequence(target, "Swap!");
        const len = target.values.length;
        const idxI = normalizeLookupIndex(i, len);
        const idxJ = normalizeLookupIndex(j, len);
        if (idxI === null || idxJ === null) throw new Error("Index out of bounds for Swap!");
        const tmp = target.values[idxI - 1];
        target.values[idxI - 1] = target.values[idxJ - 1];
        target.values[idxJ - 1] = tmp;
        return target;
    }),
    SWAP: method("SWAP", ([target, i, j]) => {
        ensureSequence(target, "Swap");
        const copy = shallowCopyValue(target);
        copy.values = [...target.values];
        return arrayMethods["SWAP!"].impl([copy, i, j]);
    }),
    "MOVE!": method("MOVE!", ([target, rangeOrIdx, targetIdx]) => {
        ensureSequence(target, "Move!");
        const len = target.values.length;

        let s, e;
        if (isInterval(rangeOrIdx)) {
            const range = getIntervalRange(rangeOrIdx, len);
            s = range.start;
            e = range.end;
        } else {
            s = normalizeLookupIndex(rangeOrIdx, len);
            e = s;
        }

        if (s === null || e === null) throw new Error("Index out of bounds for Move!");

        const actualStart = Math.min(s, e);
        const actualEnd = Math.max(s, e);
        const count = actualEnd - actualStart + 1;

        const movedItems = target.values.splice(actualStart - 1, count);

        let insertPos;
        const newLen = target.values.length;
        const rawTargetIdx = numericIndex(targetIdx);

        if (rawTargetIdx > 0) {
            insertPos = normalizeWritableIndex(targetIdx, newLen, true);
        } else if (rawTargetIdx < 0) {
            let idx = normalizeLookupIndex(targetIdx, newLen);
            insertPos = (idx === null) ? newLen + 1 : idx + 1;
        } else {
            insertPos = 1;
        }

        target.values.splice(insertPos - 1, 0, ...movedItems);
        return target;
    }),
    MOVE: method("MOVE", ([target, rangeOrIdx, targetIdx]) => {
        ensureSequence(target, "Move");
        const copy = shallowCopyValue(target);
        copy.values = [...target.values];
        return arrayMethods["MOVE!"].impl([copy, rangeOrIdx, targetIdx]);
    }),
};

const lazySequenceMethods = {
    LEN: method("LEN", ([target]) => {
        const length = lazyKnownLength(target);
        if (length === null) throw new Error("Length is unknown for this lazy sequence");
        return int(length);
    }),
    ISEMPTY: method("ISEMPTY", ([target]) => {
        ensureLazyIndex(target, 1);
        return bool(target._lazy.done && target._lazy.cache.length === 0);
    }),
    GET: method("GET", ([target, index]) => {
        const raw = numericIndex(index);
        if (raw < 0) return sequenceAt(materializeLazySequence(target), index);
        if (raw === 0) throw new Error("Sequence indexes are 1-based; zero is invalid");
        return ensureLazyIndex(target, raw);
    }),
    FIRST: method("FIRST", ([target]) => ensureLazyIndex(target, 1)),
    LAST: method("LAST", ([target]) => {
        const sequence = materializeLazySequence(target);
        return sequence.values.at(-1) ?? null;
    }),
    MATERIALIZE: method("MATERIALIZE", ([target]) => materializeLazySequence(target)),
};

function requireAsyncStreamExecution(execution, methodName) {
    if (!execution?.consume) {
        throw new Error(`Async stream ${methodName} requires promise-aware RiX evaluation`);
    }
    return execution;
}

function optionalBound(value, label) {
    if (value === undefined || value === null) return null;
    return asyncStreamMethodHelpers.positiveInteger(value, label, { allowZero: true });
}

const asyncStreamMethods = {
    MAP: method("MAP", ([target, mapper]) => asyncStreamMethodHelpers.mapAsyncStream(target, mapper)),
    FILTER: method("FILTER", ([target, predicate]) => asyncStreamMethodHelpers.filterAsyncStream(target, predicate)),
    TAKE: method("TAKE", ([target, count]) => asyncStreamMethodHelpers.takeAsyncStream(target, count)),
    DROP: method("DROP", ([target, count]) => asyncStreamMethodHelpers.dropAsyncStream(target, count)),
    CHUNK: method("CHUNK", ([target, size]) => asyncStreamMethodHelpers.chunkAsyncStream(target, size)),
    WINDOW: method("WINDOW", ([target, size, step]) => asyncStreamMethodHelpers.windowAsyncStream(target, size, step)),
    FOREACH: method("FOREACH", ([target, callable], _context, _evaluate, _invoke, execution) =>
        requireAsyncStreamExecution(execution, "ForEach").consume(target, {
            kind: "forEach", callable, initial: null, bound: null,
        })),
    REDUCE: method("REDUCE", ([target, initial, callable], _context, _evaluate, _invoke, execution) =>
        requireAsyncStreamExecution(execution, "Reduce").consume(target, {
            kind: "reduce", callable, initial, bound: null,
        })),
    COLLECT: method("COLLECT", ([target, bound], _context, _evaluate, _invoke, execution) =>
        requireAsyncStreamExecution(execution, "Collect").consume(target, {
            kind: "collect", callable: null, initial: null, bound: optionalBound(bound, "Collect bound"),
        })),
    FIRST: method("FIRST", ([target], _context, _evaluate, _invoke, execution) =>
        requireAsyncStreamExecution(execution, "First").consume(target, {
            kind: "first", callable: null, initial: null, bound: 1,
        })),
    FIND: method("FIND", ([target, callable], _context, _evaluate, _invoke, execution) =>
        requireAsyncStreamExecution(execution, "Find").consume(target, {
            kind: "find", callable, initial: null, bound: null,
        })),
    COUNT: method("COUNT", ([target, bound], _context, _evaluate, _invoke, execution) =>
        requireAsyncStreamExecution(execution, "Count").consume(target, {
            kind: "count", callable: null, initial: null, bound: optionalBound(bound, "Count bound"),
        })),
    CLOSE: method("CLOSE", ([target, reason]) => asyncStreamMethodHelpers.closeAsyncStream(target, reason)),
    DONE: method("DONE", ([target]) => bool(asyncStreamMethodHelpers.asyncStreamDone(target))),
    STATUS: method("STATUS", ([target]) => asyncStreamMethodHelpers.asyncStreamStatus(target)),
};

const iterableMethods = {
    ITERATOR: method("ITERATOR", ([target]) => createCollectionIterator(target)),
};

const iteratorMethods = {
    NEXT: method("NEXT", ([target, step]) => {
        if (target.cursor === null) return null;
        const amount = step === undefined ? 1 : iteratorStep(step, "Iterator step");
        const destination = target.cursor + amount;
        if (amount === 0 && target.cursor === 0) return null;
        const result = iteratorLookup(target.source, destination);
        if (!result.found) {
            target.cursor = null;
            return null;
        }
        target.cursor = destination;
        return result.value;
    }),
    PEEK: method("PEEK", ([target, offset]) => {
        if (target.cursor === null) return null;
        const amount = offset === undefined ? 0 : iteratorStep(offset, "Iterator peek offset");
        return iteratorLookup(target.source, target.cursor + amount).value;
    }),
    DONE: method("DONE", ([target]) => bool(target.cursor === null)),
    INDEX: method("INDEX", ([target]) => target.cursor === null ? null : int(target.cursor)),
    RESET: method("RESET", ([target, index]) => {
        if (index === undefined || !isIndexedIteratorSource(target.source)) {
            target.cursor = 0;
            return target;
        }
        let destination = iteratorStep(index, "Iterator reset index");
        if (destination < 0) {
            const length = iteratorLength(target.source);
            if (length === null) throw new Error("Cannot reset an unbounded lazy iterator from the end");
            destination = length + 1 + destination;
        }
        if (destination === 0) {
            target.cursor = 0;
            return target;
        }
        const result = iteratorLookup(target.source, destination);
        target.cursor = result.found ? destination : null;
        return target;
    }),
};

const mapMethods = {
    LEN: method("LEN", ([target]) => {
        ensureMap(target, "Len");
        return int(target.entries.size);
    }),
    ISEMPTY: method("ISEMPTY", ([target]) => {
        ensureMap(target, "IsEmpty");
        return bool(target.entries.size === 0);
    }),
    HAS: method("HAS", ([target, key]) => {
        ensureMap(target, "Has");
        return bool(target.entries.has(keyOf(key)));
    }),
    GET: method("GET", ([target, key]) => {
        ensureMap(target, "Get");
        return mapValue(target, key);
    }),
    KEYS: method("KEYS", ([target]) => {
        ensureMap(target, "Keys");
        return { type: "set", values: Array.from(target.entries.keys()) };
    }),
    VALUES: method("VALUES", ([target]) => {
        ensureMap(target, "Values");
        return { type: "set", values: Array.from(target.entries.values()) };
    }),
    ENTRIES: method("ENTRIES", ([target]) => {
        ensureMap(target, "Entries");
        return {
            type: "sequence",
            values: Array.from(target.entries.entries()).map(([key, value]) => ({
                type: "tuple",
                values: [stringObj(key), value],
            })),
            _ext: mutableExt(),
        };
    }),
    SET: method("SET", ([target, key, value]) => {
        ensureMap(target, "Set");
        const copy = shallowCopyValue(target);
        copy.entries.set(keyOf(key), value);
        return copy;
    }),
    "SET!": method("SET!", ([target, key, value]) => {
        ensureMap(target, "Set!");
        target.entries.set(keyOf(key), value);
        return target;
    }),
    REMOVE: method("REMOVE", ([target, key]) => {
        ensureMap(target, "Remove");
        const copy = shallowCopyValue(target);
        copy.entries.delete(keyOf(key));
        return copy;
    }),
    "REMOVE!": method("REMOVE!", ([target, key]) => {
        ensureMap(target, "Remove!");
        target.entries.delete(keyOf(key));
        return target;
    }),
    MERGE: method("MERGE", ([target, other]) => {
        ensureMap(target, "Merge");
        ensureMap(other, "Merge");
        return { type: "map", entries: new Map([...target.entries, ...other.entries]), _ext: mutableExt() };
    }),
    "MERGE!": method("MERGE!", ([target, other]) => {
        ensureMap(target, "Merge!");
        ensureMap(other, "Merge!");
        for (const [key, value] of other.entries) target.entries.set(key, value);
        return target;
    }),
    UPDATE: method("UPDATE", ([target, key, updater], context, evaluate, invoke) => {
        ensureMap(target, "Update");
        const canonical = keyOf(key);
        const current = target.entries.has(canonical) ? target.entries.get(canonical) : null;
        const next = invoke(updater, [current, stringObj(canonical), target], context, evaluate);
        const copy = shallowCopyValue(target);
        copy.entries.set(canonical, next);
        return copy;
    }),
    "UPDATE!": method("UPDATE!", ([target, key, updater], context, evaluate, invoke) => {
        ensureMap(target, "Update!");
        const canonical = keyOf(key);
        const current = target.entries.has(canonical) ? target.entries.get(canonical) : null;
        const next = invoke(updater, [current, stringObj(canonical), target], context, evaluate);
        target.entries.set(canonical, next);
        return target;
    }),
    DEFAULT: method("DEFAULT", ([target, key, value]) => {
        ensureMap(target, "Default");
        const canonical = keyOf(key);
        if (target.entries.has(canonical)) return shallowCopyValue(target);
        const copy = shallowCopyValue(target);
        copy.entries.set(canonical, value);
        return copy;
    }),
    "DEFAULT!": method("DEFAULT!", ([target, key, value]) => {
        ensureMap(target, "Default!");
        const canonical = keyOf(key);
        if (!target.entries.has(canonical)) target.entries.set(canonical, value);
        return target;
    }),
    KEEP: method("KEEP", ([target, keys]) => {
        ensureMap(target, "Keep");
        const wanted = new Set(mapLikeKeys(keys));
        return {
            type: "map",
            entries: new Map(Array.from(target.entries.entries()).filter(([key]) => wanted.has(key))),
            _ext: mutableExt(),
        };
    }),
    "KEEP!": method("KEEP!", ([target, keys]) => {
        ensureMap(target, "Keep!");
        const wanted = new Set(mapLikeKeys(keys));
        for (const key of Array.from(target.entries.keys())) {
            if (!wanted.has(key)) target.entries.delete(key);
        }
        return target;
    }),
    OMIT: method("OMIT", ([target, keys]) => {
        ensureMap(target, "Omit");
        const blocked = new Set(mapLikeKeys(keys));
        return {
            type: "map",
            entries: new Map(Array.from(target.entries.entries()).filter(([key]) => !blocked.has(key))),
            _ext: mutableExt(),
        };
    }),
    "OMIT!": method("OMIT!", ([target, keys]) => {
        ensureMap(target, "Omit!");
        const blocked = new Set(mapLikeKeys(keys));
        for (const key of blocked) target.entries.delete(key);
        return target;
    }),
    MAPVALUES: method("MAPVALUES", ([target, iterator], context, evaluate, invoke) => {
        ensureMap(target, "MapValues");
        const entries = new Map();
        for (const [key, value] of target.entries) {
            entries.set(key, invoke(iterator, [value, stringObj(key), target], context, evaluate));
        }
        return { type: "map", entries, _ext: mutableExt() };
    }),
    REDUCEKEYS: method("REDUCEKEYS", ([target, iterator, initial], context, evaluate, invoke) => {
        ensureMap(target, "ReduceKeys");
        let acc = initial === undefined ? defaultAccumulator(target) : initial;
        for (const [key, value] of target.entries) {
            acc = invoke(iterator, [acc, stringObj(key), value, target], context, evaluate);
        }
        return acc;
    }),
    FILTER: method("FILTER", ([target, iterator], context, evaluate, invoke) => {
        ensureMap(target, "Filter");
        const entries = new Map();
        for (const [key, value] of target.entries) {
            if (predicateResult(iterator, [value, stringObj(key), target], context, evaluate, invoke)) {
                entries.set(key, value);
            }
        }
        return { type: "map", entries, _ext: mutableExt() };
    }),
    ANY: method("ANY", ([target, iterator], context, evaluate, invoke) => anyEntries(target, iterator, context, evaluate, invoke)),
    ALL: method("ALL", ([target, iterator], context, evaluate, invoke) => allEntries(target, iterator, context, evaluate, invoke)),
    COUNT: method("COUNT", ([target, iterator], context, evaluate, invoke) => countEntries(target, iterator, context, evaluate, invoke)),
    REDUCE: method("REDUCE", ([target, iterator, initial], context, evaluate, invoke) =>
        reduceEntries(target, iterator, initial, context, evaluate, invoke)),
};

const setMethods = {
    LEN: method("LEN", ([target]) => {
        ensureSet(target, "Len");
        return int(target.values.length);
    }),
    ISEMPTY: method("ISEMPTY", ([target]) => {
        ensureSet(target, "IsEmpty");
        return bool(target.values.length === 0);
    }),
    HAS: method("HAS", ([target, value]) => {
        ensureSet(target, "Has");
        return bool(setHas(target, value));
    }),
    VALUES: method("VALUES", ([target]) => {
        ensureSet(target, "Values");
        return { type: "sequence", values: [...target.values], _ext: mutableExt() };
    }),
    ADD: method("ADD", ([target, value]) => {
        ensureSet(target, "Add");
        if (setHas(target, value)) return shallowCopyValue(target);
        const copy = shallowCopyValue(target);
        copy.values.push(value);
        return copy;
    }),
    "ADD!": method("ADD!", ([target, value]) => {
        ensureSet(target, "Add!");
        if (!setHas(target, value)) target.values.push(value);
        return target;
    }),
    REMOVE: method("REMOVE", ([target, value]) => {
        ensureSet(target, "Remove");
        const copy = shallowCopyValue(target);
        copy.values = copy.values.filter((entry) => valueKey(entry) !== valueKey(value));
        return copy;
    }),
    "REMOVE!": method("REMOVE!", ([target, value]) => {
        ensureSet(target, "Remove!");
        target.values = target.values.filter((entry) => valueKey(entry) !== valueKey(value));
        return target;
    }),
    UNION: method("UNION", ([target, other]) => collectionFunctions.UNION.impl([target, other])),
    "UNION!": method("UNION!", ([target, other]) => {
        ensureSet(target, "Union!");
        ensureSet(other, "Union!");
        target.values = collectionFunctions.UNION.impl([target, other]).values;
        return target;
    }),
    INTERSECT: method("INTERSECT", ([target, other]) => collectionFunctions.INTERSECT.impl([target, other])),
    "INTERSECT!": method("INTERSECT!", ([target, other]) => {
        ensureSet(target, "Intersect!");
        ensureSet(other, "Intersect!");
        const next = collectionFunctions.INTERSECT.impl([target, other]);
        target.values = next ? next.values : [];
        return target;
    }),
    DIFF: method("DIFF", ([target, other]) => collectionFunctions.SET_DIFF.impl([target, other])),
    "DIFF!": method("DIFF!", ([target, other]) => {
        ensureSet(target, "Diff!");
        const next = collectionFunctions.SET_DIFF.impl([target, other]);
        target.values = next.values;
        return target;
    }),
    SYMDIFF: method("SYMDIFF", ([target, other]) => collectionFunctions.SET_SYMDIFF.impl([target, other])),
    "SYMDIFF!": method("SYMDIFF!", ([target, other]) => {
        ensureSet(target, "SymDiff!");
        const next = collectionFunctions.SET_SYMDIFF.impl([target, other]);
        target.values = next.values;
        return target;
    }),
    SUBSETOF: method("SUBSETOF", ([target, other]) => {
        ensureSet(target, "SubsetOf");
        ensureSet(other, "SubsetOf");
        return bool(target.values.every((value) => setHas(other, value)));
    }),
    SUPERSETOF: method("SUPERSETOF", ([target, other]) => {
        ensureSet(target, "SupersetOf");
        ensureSet(other, "SupersetOf");
        return bool(other.values.every((value) => setHas(target, value)));
    }),
    DISJOINT: method("DISJOINT", ([target, other]) => {
        ensureSet(target, "Disjoint");
        ensureSet(other, "Disjoint");
        return bool(target.values.every((value) => !setHas(other, value)));
    }),
    FILTER: method("FILTER", ([target, iterator], context, evaluate, invoke) => {
        ensureSet(target, "Filter");
        return {
            type: "set",
            values: target.values.filter((value) => predicateResult(iterator, [value, value, target], context, evaluate, invoke)),
            _ext: mutableExt(),
        };
    }),
    ANY: method("ANY", ([target, iterator], context, evaluate, invoke) => anyEntries(target, iterator, context, evaluate, invoke)),
    ALL: method("ALL", ([target, iterator], context, evaluate, invoke) => allEntries(target, iterator, context, evaluate, invoke)),
    COUNT: method("COUNT", ([target, iterator], context, evaluate, invoke) => countEntries(target, iterator, context, evaluate, invoke)),
    REDUCE: method("REDUCE", ([target, iterator, initial], context, evaluate, invoke) =>
        reduceEntries(target, iterator, initial, context, evaluate, invoke)),
};

const stringMethods = {
    LEN: method("LEN", ([target]) => {
        ensureString(target, "Len");
        return int(Array.from(target.value).length);
    }),
    ISEMPTY: method("ISEMPTY", ([target]) => {
        ensureString(target, "IsEmpty");
        return bool(target.value.length === 0);
    }),
    GET: method("GET", ([target, index]) => {
        ensureString(target, "Get");
        return stringAt(target, index);
    }),
    FIRST: method("FIRST", ([target]) => {
        ensureString(target, "First");
        return charsOf(target)[0] ?? null;
    }),
    LAST: method("LAST", ([target]) => {
        ensureString(target, "Last");
        const chars = charsOf(target);
        return chars[chars.length - 1] ?? null;
    }),
    INCLUDES: method("INCLUDES", ([target, needle]) => {
        ensureString(target, "Includes");
        return bool(target.value.includes(stringValue(needle)));
    }),
    STARTSWITH: method("STARTSWITH", ([target, prefix]) => {
        ensureString(target, "StartsWith");
        return bool(target.value.startsWith(stringValue(prefix)));
    }),
    ENDSWITH: method("ENDSWITH", ([target, suffix]) => {
        ensureString(target, "EndsWith");
        return bool(target.value.endsWith(stringValue(suffix)));
    }),
    INDEXOF: method("INDEXOF", ([target, needle]) => {
        ensureString(target, "IndexOf");
        const idx = target.value.indexOf(stringValue(needle));
        return idx === -1 ? null : int(idx + 1);
    }),
    LASTINDEXOF: method("LASTINDEXOF", ([target, needle]) => {
        ensureString(target, "LastIndexOf");
        const idx = target.value.lastIndexOf(stringValue(needle));
        return idx === -1 ? null : int(idx + 1);
    }),
    SLICE: method("SLICE", ([target, start, end]) => {
        ensureString(target, "Slice");
        return fromChars(jsSlice(charsOf(target), start, end));
    }),
    CONCAT: method("CONCAT", ([target, ...parts]) => {
        ensureString(target, "Concat");
        return stringObj([target, ...parts].map((part) => stringValue(part)).join(""));
    }),
    SPLIT: method("SPLIT", ([target, separator]) => {
        ensureString(target, "Split");
        const parts = separator === undefined
            ? Array.from(target.value)
            : target.value.split(stringValue(separator));
        return { type: "sequence", values: parts.map((part) => stringObj(part)), _ext: mutableExt() };
    }),
    TRIM: method("TRIM", ([target]) => {
        ensureString(target, "Trim");
        return stringObj(target.value.trim());
    }),
    TRIMSTART: method("TRIMSTART", ([target]) => {
        ensureString(target, "TrimStart");
        return stringObj(target.value.trimStart());
    }),
    TRIMEND: method("TRIMEND", ([target]) => {
        ensureString(target, "TrimEnd");
        return stringObj(target.value.trimEnd());
    }),
    UPPER: method("UPPER", ([target]) => {
        ensureString(target, "Upper");
        return stringObj(target.value.toUpperCase());
    }),
    LOWER: method("LOWER", ([target]) => {
        ensureString(target, "Lower");
        return stringObj(target.value.toLowerCase());
    }),
    REPLACE: method("REPLACE", ([target, search, replacement]) => {
        ensureString(target, "Replace");
        return stringObj(target.value.replace(stringValue(search), stringValue(replacement)));
    }),
    REPLACEALL: method("REPLACEALL", ([target, search, replacement]) => {
        ensureString(target, "ReplaceAll");
        return stringObj(target.value.split(stringValue(search)).join(stringValue(replacement)));
    }),
    PADLEFT: method("PADLEFT", ([target, length, pad]) => {
        ensureString(target, "PadLeft");
        return stringObj(target.value.padStart(numericIndex(length), stringValue(pad ?? stringObj(" "))));
    }),
    PADRIGHT: method("PADRIGHT", ([target, length, pad]) => {
        ensureString(target, "PadRight");
        return stringObj(target.value.padEnd(numericIndex(length), stringValue(pad ?? stringObj(" "))));
    }),
    REPEAT: method("REPEAT", ([target, count]) => {
        ensureString(target, "Repeat");
        return stringObj(target.value.repeat(numericIndex(count)));
    }),
    REDUCE: method("REDUCE", ([target, iterator, initial], context, evaluate, invoke) =>
        reduceEntries(target, iterator, initial, context, evaluate, invoke)),
};

const tupleMethods = {
    LEN: method("LEN", ([target]) => {
        ensureTuple(target, "Len");
        return int(target.values.length);
    }),
    GET: method("GET", ([target, index]) => {
        ensureTuple(target, "Get");
        const at = normalizeLookupIndex(index, target.values.length);
        return at === null ? null : target.values[at - 1];
    }),
    FIRST: method("FIRST", ([target]) => {
        ensureTuple(target, "First");
        return target.values[0] ?? null;
    }),
    LAST: method("LAST", ([target]) => {
        ensureTuple(target, "Last");
        return target.values[target.values.length - 1] ?? null;
    }),
    SLICE: method("SLICE", ([target, start, end]) => {
        ensureTuple(target, "Slice");
        return { type: "tuple", values: jsSlice(target.values, start, end) };
    }),
    SET: method("SET", ([target, index, value]) => {
        ensureTuple(target, "Set");
        const copy = shallowCopyValue(target);
        const at = normalizeLookupIndex(index, copy.values.length);
        if (at === null) return copy;
        copy.values[at - 1] = value;
        return copy;
    }),
    TOARRAY: method("TOARRAY", ([target]) => {
        ensureTuple(target, "ToArray");
        return { type: "sequence", values: [...target.values], _ext: mutableExt() };
    }),
    REDUCE: method("REDUCE", ([target, iterator, initial], context, evaluate, invoke) =>
        reduceEntries(target, iterator, initial, context, evaluate, invoke)),
};

function tensorSelectorsFromArgs(args) {
    if (args.length === 1 && args[0]?.type === "tuple") {
        return args[0].values.map((value) => ({ kind: "index", value }));
    }
    return args.map((value) => ({ kind: "index", value }));
}

const tensorMethods = {
    SHAPE: method("SHAPE", ([target]) => {
        ensureTensor(target, "Shape");
        return { type: "tuple", values: tensorShape(target).map((dim) => int(dim)) };
    }),
    RANK: method("RANK", ([target]) => {
        ensureTensor(target, "Rank");
        return int(tensorRank(target));
    }),
    SIZE: method("SIZE", ([target]) => {
        ensureTensor(target, "Size");
        return int(tensorSize(target));
    }),
    GET: method("GET", ([target, ...selectors]) => {
        ensureTensor(target, "Get");
        return tensorGetBySelectors(target, tensorSelectorsFromArgs(selectors));
    }),
    SET: method("SET", ([target, ...selectorsAndValue]) => {
        ensureTensor(target, "Set");
        const value = selectorsAndValue[selectorsAndValue.length - 1];
        const selectors = selectorsAndValue.slice(0, -1);
        const copy = shallowCopyValue(target);
        tensorAssignBySelectors(copy, tensorSelectorsFromArgs(selectors), value);
        return copy;
    }),
    "SET!": method("SET!", ([target, ...selectorsAndValue]) => {
        ensureTensor(target, "Set!");
        const value = selectorsAndValue[selectorsAndValue.length - 1];
        const selectors = selectorsAndValue.slice(0, -1);
        tensorAssignBySelectors(target, tensorSelectorsFromArgs(selectors), value);
        return target;
    }),
    RESHAPE: method("RESHAPE", ([target, shape]) => {
        ensureTensor(target, "Reshape");
        const nextShape = shape?.type === "tuple" ? shape.values.map((value) => numericIndex(value)) : null;
        if (!nextShape) throw new Error("Reshape expects a shape tuple");
        const expected = nextShape.reduce((product, dim) => product * dim, 1);
        if (expected !== tensorSize(target)) throw new Error("Reshape size mismatch");
        return createTensor(nextShape, target.data);
    }),
    FLATTEN: method("FLATTEN", ([target]) => {
        ensureTensor(target, "Flatten");
        return createTensor([tensorSize(target)], [...target.data]);
    }),
    TRANSPOSE: method("TRANSPOSE", ([target]) => {
        ensureTensor(target, "Transpose");
        if (tensorRank(target) !== 2) throw new Error("Transpose currently expects a rank-2 tensor");
        return createTensorView(target, {
            shape: [target.shape[1], target.shape[0]],
            strides: [target.strides[1], target.strides[0]],
            offset: target.offset,
        });
    }),
    PERMUTE: method("PERMUTE", ([target, order]) => {
        ensureTensor(target, "Permute");
        if (order?.type !== "tuple") throw new Error("Permute expects a tuple of axis numbers");
        const axes = order.values.map((value) => numericIndex(value) - 1);
        if (axes.length !== target.shape.length) throw new Error("Permute rank mismatch");
        return createTensorView(target, {
            shape: axes.map((axis) => target.shape[axis]),
            strides: axes.map((axis) => target.strides[axis]),
            offset: target.offset,
        });
    }),
    MAP: method("MAP", ([target, iterator], context, evaluate, invoke) => {
        ensureTensor(target, "Map");
        const data = [];
        forEachTensorCell(target, (value, tuple) => {
            data.push(invoke(iterator, [value, tensorIndexTuple(tuple), target], context, evaluate));
        });
        return createTensor(target.shape, data);
    }),
    "FILL!": method("FILL!", ([target, value]) => {
        ensureTensor(target, "Fill!");
        forEachTensorCell(target, (_entry, _tuple, offset) => {
            target.data[offset] = value;
        });
        return target;
    }),
    SUM: method("SUM", ([target]) => {
        ensureTensor(target, "Sum");
        let acc = int(0);
        forEachTensorCell(target, (value) => {
            if (!isHole(value)) acc = arithmeticAdd(acc, value);
        });
        return acc;
    }),
    MEAN: method("MEAN", ([target]) => {
        ensureTensor(target, "Mean");
        const size = tensorSize(target);
        if (size === 0) return null;
        return arithmeticDiv(tensorMethods.SUM.impl([target]), int(size));
    }),
    DOT: method("DOT", ([target, other]) => {
        ensureTensor(target, "Dot");
        ensureTensor(other, "Dot");
        if (tensorRank(target) !== 1 || tensorRank(other) !== 1 || tensorSize(target) !== tensorSize(other)) {
            throw new Error("Dot expects rank-1 tensors of equal size");
        }
        let acc = int(0);
        for (let i = 0; i < target.data.length; i++) {
            acc = arithmeticAdd(acc, arithmeticMul(target.data[i], other.data[i]));
        }
        return acc;
    }),
    MATMUL: method("MATMUL", ([target, other]) => {
        ensureTensor(target, "MatMul");
        ensureTensor(other, "MatMul");
        if (tensorRank(target) !== 2 || tensorRank(other) !== 2) {
            throw new Error("MatMul expects rank-2 tensors");
        }
        const [rows, inner] = target.shape;
        const [otherInner, cols] = other.shape;
        if (inner !== otherInner) throw new Error("MatMul inner dimensions must agree");
        const data = [];
        for (let r = 1; r <= rows; r++) {
            for (let c = 1; c <= cols; c++) {
                let acc = int(0);
                for (let k = 1; k <= inner; k++) {
                    const a = tensorGetBySelectors(target, [{ kind: "index", value: int(r) }, { kind: "index", value: int(k) }]);
                    const b = tensorGetBySelectors(other, [{ kind: "index", value: int(k) }, { kind: "index", value: int(c) }]);
                    acc = arithmeticAdd(acc, arithmeticMul(a, b));
                }
                data.push(acc);
            }
        }
        return createTensor([rows, cols], data);
    }),
    REDUCE: method("REDUCE", ([target, iterator, initial], context, evaluate, invoke) =>
        reduceEntries(target, iterator, initial, context, evaluate, invoke)),
};

const commonMethods = {
    CHECKTRAITS: method("CHECKTRAITS", ([target], context) => checkTraits(target, context, { warnOnly: true })),
    CheckTraits: method("CheckTraits", ([target], context) => checkTraits(target, context, { warnOnly: true })),
};

function assumptionName(value) {
    if (value?.type === "string") return value.value;
    if (value?.type === "structural_symbol") return value.name;
    throw new Error("Structural nonzero assumptions must be names or structural symbols");
}

const integerExactMethods = {
    NEGATE: method("Negate", ([target]) => target.negate()),
    ABS: method("Abs", ([target]) => target.abs()),
    E: method("E", ([target, exponent]) => target.E(exactBigInt(exponent, "Exponent"))),
    BITLENGTH: method("BitLength", ([target]) => int(target.bitLength())),
    TOSTRING: method("ToString", ([target]) => stringObj(target.toString())),
};

const rationalExactMethods = {
    NUMERATOR: method("Numerator", ([target]) => int(target.numerator)),
    DENOMINATOR: method("Denominator", ([target]) => int(target.denominator)),
    NEGATE: method("Negate", ([target]) => target.negate()),
    RECIPROCAL: method("Reciprocal", ([target]) => target.reciprocal()),
    ABS: method("Abs", ([target]) => target.abs()),
    FLOOR: method("Floor", ([target]) => int(target.floor())),
    CEIL: method("Ceil", ([target]) => int(target.ceil())),
    TRUNC: method("Trunc", ([target]) => int(target.trunc())),
    ROUND: method("Round", ([target, mode]) => int(
        target.round(mode === undefined ? undefined : stringValue(mode)),
    )),
    ROUNDTO: method("RoundTo", ([target, places, mode]) => target.roundTo(
        safeExactNumber(places, "Decimal places"),
        mode === undefined ? undefined : stringValue(mode),
    )),
    E: method("E", ([target, exponent]) => target.E(exactBigInt(exponent, "Exponent"))),
    TOMIXEDSTRING: method("ToMixedString", ([target]) => stringObj(target.toMixedString())),
    TODECIMAL: method("ToDecimal", ([target]) => stringObj(target.toDecimal())),
    TOCONTINUEDFRACTION: method("ToContinuedFraction", ([target, maxTerms]) => exactSequence(
        target.toContinuedFraction(
            maxTerms === undefined ? undefined : safeExactNumber(maxTerms, "Maximum terms"),
        ).map((value) => int(value)),
    )),
    TOCONTINUEDFRACTIONSTRING: method("ToContinuedFractionString", ([target]) =>
        stringObj(target.toContinuedFractionString())),
    CONVERGENTS: method("Convergents", ([target, maxCount]) => exactSequence(
        target.convergents(
            maxCount === undefined ? undefined : safeExactNumber(maxCount, "Maximum convergents"),
        ),
    )),
    CONVERGENT: method("Convergent", ([target, index]) => {
        const oneBasedIndex = safeExactNumber(index, "Convergent index");
        if (oneBasedIndex < 1) throw new Error("Convergent index must be at least 1");
        return target.getConvergent(oneBasedIndex - 1);
    }),
    APPROXIMATIONERROR: method("ApproximationError", ([target, other]) =>
        target.approximationError(exactRational(other, "Approximation target"))),
    BESTAPPROXIMATION: method("BestApproximation", ([target, maxDenominator]) =>
        target.bestApproximation(exactBigInt(maxDenominator, "Maximum denominator"))),
    BESTCONVERGENT: method("BestConvergent", ([target, maxDenominator]) =>
        target.bestConvergent(exactBigInt(maxDenominator, "Maximum denominator"))),
    BITLENGTH: method("BitLength", ([target]) => int(target.bitLength())),
    TOSTRING: method("ToString", ([target]) => stringObj(target.toString())),
};

const rationalIntervalMethods = {
    START: method("Start", ([target]) => target.start),
    END: method("End", ([target]) => target.end),
    LOW: method("Low", ([target]) => target.low),
    HIGH: method("High", ([target]) => target.high),
    WIDTH: method("Width", ([target]) => target.high.subtract(target.low)),
    ISASCENDING: method("IsAscending", ([target]) => bool(target.isAscending)),
    MIDPOINT: method("Midpoint", ([target]) => target.midpoint()),
    MEDIANT: method("Mediant", ([target]) => target.mediant()),
    NEGATE: method("Negate", ([target]) => target.negate()),
    RECIPROCAL: method("Reciprocal", ([target]) => target.reciprocate()),
    OVERLAPS: method("Overlaps", ([target, other]) =>
        bool(target.overlaps(exactInterval(other, "Other interval")))),
    CONTAINS: method("Contains", ([target, other]) =>
        bool(target.contains(exactInterval(other, "Contained interval")))),
    CONTAINSVALUE: method("ContainsValue", ([target, value]) =>
        bool(target.containsValue(exactRational(value, "Contained value")))),
    CONTAINSZERO: method("ContainsZero", ([target]) => bool(target.containsZero())),
    INTERSECTION: method("Intersection", ([target, other]) =>
        target.intersection(exactInterval(other, "Other interval"))),
    UNION: method("Union", ([target, other]) =>
        target.union(exactInterval(other, "Other interval"))),
    SHORTESTDECIMAL: method("ShortestDecimal", ([target, base]) => target.shortestDecimal(
        base === undefined ? undefined : exactBigInt(base, "Base"),
    )),
    DENOMINATORINTERVAL: method("DenominatorInterval", ([target, denominator, onEmpty]) =>
        target.denominatorInterval(
            denominator === undefined || denominator === null
                ? undefined
                : exactBigInt(denominator, "Grid denominator"),
            onEmpty === undefined ? undefined : stringValue(onEmpty),
        )),
    RANDOM: method("Random", ([target, parameters], _context, evaluate) =>
        evaluate({ fn: "RANDOM", args: [target, parameters] })),
    RANDOMPARTITION: method("RandomPartition", ([target, parameters], _context, evaluate) =>
        evaluate({ fn: "RANDOM_PARTITION", args: [target, parameters] })),
    E: method("E", ([target, exponent]) => target.E(exactBigInt(exponent, "Exponent"))),
    BITLENGTH: method("BitLength", ([target]) => int(target.bitLength())),
    TOMIXEDSTRING: method("ToMixedString", ([target]) => stringObj(target.toMixedString())),
    TOSTRING: method("ToString", ([target]) => stringObj(target.toString())),
};

const structuralMethods = {
    INSPECT: method("Inspect", ([target]) => inspectStructuralValue(target)),
    RENDER: method("Render", ([target]) => stringObj(formatStructuralValue(target, valueKey))),
    COLLAPSE: method("Collapse", ([target], context) => collapseStructuralValue(target, context)),
    TOEXACT: method("ToExact", ([target], context, evaluate, invoke) => {
        if (target.type !== "structural_algebra") return collapseStructuralValue(target, context);
        const components = target.components.map((component) =>
            collapseStructuralValue(component, context));
        if (target.profile === "Algebra") {
            let result = components[0];
            for (let index = 0; index < target.basis.length; index++) {
                const unit = context.get(target.basis[index]);
                if (unit === undefined) {
                    throw new Error(`Undefined algebraic basis value: ${target.basis[index]}`);
                }
                result = addScalars(result, multiplyScalars(components[index + 1], unit));
            }
            return result;
        }

        const systemContext = context.getEnv("__system_context__", null);
        const capabilityName = target.profile === "Complex" ? "Complex" : "exactAlgebras";
        const entry = systemContext?.get?.(capabilityName);
        if (!entry || !Object.prototype.hasOwnProperty.call(entry, "value")) {
            if (target.profile === "Complex") {
                throw new Error("The .Complex capability is unavailable");
            }
            throw new Error(
                `The exact-algebras plugin must be loaded before converting a structural ${target.profile}`,
            );
        }
        const receiver = entry.value;
        const methodName = target.profile === "Complex" ? "FROMPARTS" : target.profile.toUpperCase();
        const constructor = resolveMethod(receiver, methodName);
        if (constructor.type === "method_builtin") {
            return constructor.impl([receiver, ...components], context, evaluate, invoke);
        }
        return invoke(constructor, [receiver, ...components], context, evaluate);
    }),
    SIMPLIFY: method("Simplify", ([target, ...nonzero]) =>
        simplifyStructuralValue(target, { nonzero: nonzero.map(assumptionName) })),
    HEAD: method("Head", ([target]) => stringObj(
        target.type === "structural_form" ? target.head
            : target.type === "structural_algebra" ? target.profile
            : target.type === "structural_literal" ? target.kind
                : target.type === "structural_symbol" ? "Symbol"
                    : "Value",
    )),
    ARGUMENTS: method("Arguments", ([target]) => ({
        type: "sequence",
        values: target.type === "structural_form" ? [...target.args]
            : target.type === "structural_algebra" ? [...target.components]
                : [],
        _ext: mutableExt(),
    })),
    SOURCESPAN: method("SourceSpan", ([target]) => {
        const span = structuralSourceSpan(target);
        if (!span) return null;
        return {
            type: "tuple",
            values: [int(span.start + 1), int(span.end + 1)],
            _ext: mutableExt(),
        };
    }),
    MAPARGUMENTS: method("MapArguments", ([target, mapper], context, evaluate, invoke) => {
        if (target.type === "structural_algebra") {
            const profile = createStructuralAlgebraProfile(target.profile, target.basis, {
                cayleyDickson: ["Complex", "Quaternion", "Octonion"].includes(target.profile),
            });
            return structuralAlgebra(
                profile,
                target.components.map((component) => invoke(mapper, [component], context, evaluate)),
                target.mode,
                structuralSourceSpan(target),
            );
        }
        if (target.type !== "structural_form") return target;
        return structuralForm(
            target.head,
            target.args.map((argument) => invoke(mapper, [argument], context, evaluate)),
            target.mode,
            structuralSourceSpan(target),
        );
    }),
};

const PROTOS = new Map([
    ["integer", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(integerExactMethods)])],
    ["rational", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(rationalExactMethods)])],
    ["rational_interval", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(rationalIntervalMethods)])],
    ["structural_algebra", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(structuralMethods)])],
    ["structural_symbol", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(structuralMethods)])],
    ["structural_literal", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(structuralMethods)])],
    ["structural_form", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(structuralMethods)])],
    ["structural_value", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(structuralMethods)])],
    ["sequence", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(iterableMethods), ...Object.entries(arrayMethods)])],
    ["lazy_sequence", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(iterableMethods), ...Object.entries(lazySequenceMethods)])],
    ["async_stream", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(asyncStreamMethods)])],
    ["map", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(iterableMethods), ...Object.entries(mapMethods)])],
    ["set", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(iterableMethods), ...Object.entries(setMethods)])],
    ["string", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(iterableMethods), ...Object.entries(stringMethods)])],
    ["tuple", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(iterableMethods), ...Object.entries(tupleMethods)])],
    ["tensor", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(iterableMethods), ...Object.entries(tensorMethods)])],
    ["iterator", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(iteratorMethods)])],
    ["deferred", createBuiltinProto([...Object.entries(commonMethods), ...Object.entries(deferredMethods)])],
    ["exact_generator", createBuiltinProto([
        ...Object.entries(commonMethods),
        ["CONJUGATE", method("Conjugate", ([target]) => complexConjugate(target))],
        ["RE", method("Re", ([target]) => complexParts(target).real)],
        ["IM", method("Im", ([target]) => complexParts(target).imaginary)],
        ["NORMSQUARED", method("NormSquared", ([target]) => complexNormSquared(target))],
        ["CAYLEY", method("Cayley", ([target]) => cayleyFromCartesian(target))],
    ])],
    ["exact_expression", createBuiltinProto([
        ...Object.entries(commonMethods),
        ["CONJUGATE", method("Conjugate", ([target]) => complexConjugate(target))],
        ["RE", method("Re", ([target]) => complexParts(target).real)],
        ["IM", method("Im", ([target]) => complexParts(target).imaginary)],
        ["NORMSQUARED", method("NormSquared", ([target]) => complexNormSquared(target))],
        ["CAYLEY", method("Cayley", ([target]) => cayleyFromCartesian(target))],
    ])],
    ["cayley", createBuiltinProto([
        ...Object.entries(commonMethods),
        ["CARTESIAN", method("Cartesian", ([target]) => cayleyCartesian(target))],
        ["CAYLEY", method("Cayley", ([target]) => target)],
        ["CONJUGATE", method("Conjugate", ([target]) => conjugateCayley(target))],
        ["RE", method("Re", ([target]) => cayleyReal(target))],
        ["IM", method("Im", ([target]) => cayleyImaginary(target))],
        ["NORMSQUARED", method("NormSquared", ([target]) => multiplyScalars(target.magnitude, target.magnitude))],
        ["MAGNITUDE", method("Magnitude", ([target]) => target.magnitude)],
        ["DIRECTION", method("Direction", ([target]) => target.direction)],
        ["INVERSE", method("Inverse", ([target]) => inverseCayley(target))],
    ])],
]);

export function isCallableValue(value) {
    return (
        typeof value === "function" ||
        (value &&
            (value.type === "function" ||
                value.type === "lambda" ||
                value.type === "sysref" ||
                value.type === "partial" ||
                value.type === "arityCap" ||
                value.type === "method_lift" ||
                value.type === "method_builtin")) ||
        isUnitValue(value) ||
        isExactValue(value)
    );
}

function ensureCallableMethod(value, name) {
    if (!isCallableValue(value)) {
        throw new Error(`Method "${name}" is not callable`);
    }
    return value;
}

function checkTraitsMethod(name) {
    if (name !== "CHECKTRAITS" && name !== "CheckTraits") return null;
    return method(name, ([target], context) => checkTraits(target, context, { warnOnly: true }));
}

function builtinProtoFor(target) {
    if (target instanceof Integer) return PROTOS.get("integer");
    if (target instanceof Rational) return PROTOS.get("rational");
    if (target instanceof RationalInterval) return PROTOS.get("rational_interval");
    if (target instanceof Fraction) return PROTOS.get("structural_value");
    if (isTensor(target)) return PROTOS.get("tensor");
    if (target && typeof target === "object" && target.fn === "DEFER") return PROTOS.get("deferred");
    return PROTOS.get(target?.type) ?? null;
}

function extensionTypeNames(target) {
    const names = [];
    const semanticName = target?._ext instanceof Map ? target._ext.get("__type")?.value : null;
    if (semanticName) names.push(semanticName);
    if (target instanceof Integer) names.push("Integer");
    else if (target instanceof Rational) names.push("Rational");
    else if (target instanceof RationalInterval) names.push("RationalInterval");
    else if (target instanceof Fraction) names.push("Fraction");
    else if (isTensor(target)) names.push("Tensor");
    else if (target?.type === "sequence" || target?.type === "lazy_sequence") names.push("Array");
    else if (target?.type) names.push(target.type);
    return [...new Set(names)];
}

function resolveFromProto(proto, candidates, methodName) {
    if (proto === null || proto === undefined) return null;
    if (proto.type !== "map" || !(proto.entries instanceof Map)) {
        throw new Error("Method prototype must be a map or null");
    }
    for (const candidate of candidates) {
        if (proto.entries.has(candidate)) {
            return ensureCallableMethod(proto.entries.get(candidate), methodName);
        }
    }
    return null;
}

export function getBuiltinProto(target) {
    const ext = target?._ext;
    if (ext instanceof Map && ext.has("_proto")) {
        const proto = ext.get("_proto");
        if (proto === null) return null;
        if (proto?.type !== "map" || !(proto.entries instanceof Map)) {
            throw new Error("Method prototype must be a map or null");
        }
        return proto;
    }
    return builtinProtoFor(target);
}

export function resolveMethod(target, name, context = null) {
    const ext = target?._ext;
    const candidates = [name, `__${name}`, `_${name}`];
    const special = checkTraitsMethod(name);
    if (special) {
        return special;
    }

    if (ext instanceof Map) {
        for (const candidate of candidates) {
            if (ext.has(candidate)) {
                return ensureCallableMethod(ext.get(candidate), name);
            }
        }
    }

    const semanticProto = ext instanceof Map ? ext.get("__proto") : null;
    const traitProto = semanticProto?.type === "map" ? semanticProto.entries?.get("traits") : null;
    const typeProto = semanticProto?.type === "map" ? semanticProto.entries?.get("type") : null;

    const semanticResolved = resolveFromProto(traitProto, candidates, name) || resolveFromProto(typeProto, candidates, name);
    if (semanticResolved) {
        return semanticResolved;
    }

    const systemContext = context?.getEnv?.("__system_context__", null);
    const extension = systemContext?.resolveMethodExtension?.(extensionTypeNames(target), name);
    if (extension) return ensureCallableMethod(extension.callable, name);

    const resolved = resolveFromProto(getBuiltinProto(target), candidates, name);
    if (resolved) {
        return resolved;
    }

    throw new Error(`Method not found: ${name}`);
}

export function builtinMethodNamesForType(typeName) {
    const aliases = new Map([
        ["integer", "integer"],
        ["rational", "rational"],
        ["rationalinterval", "rational_interval"],
        ["interval", "rational_interval"],
        ["array", "sequence"],
        ["sequence", "sequence"],
        ["map", "map"],
        ["set", "set"],
        ["string", "string"],
        ["tuple", "tuple"],
        ["tensor", "tensor"],
        ["iterator", "iterator"],
        ["asyncstream", "async_stream"],
    ]);
    const key = aliases.get(String(typeName).replaceAll("_", "").toLowerCase());
    const proto = key ? PROTOS.get(key) : null;
    return new Set(Array.from(proto?.entries?.keys?.() || [], (name) => String(name).toUpperCase()));
}

export function ensureMutableReceiver(target) {
    const ext = target?._ext;
    if (!ext?.get("_mutable") || ext.get("frozen") || ext.get("immutable")) {
        throw new Error("Cannot mutate immutable value");
    }
}

export function attachBuiltinProto(value) {
    if (!value || typeof value !== "object") return value;
    const proto = builtinProtoFor(value);
    if (!proto) return value;
    ensureExt(value);
    if (!value._ext.has("_proto")) {
        value._ext.set("_proto", proto);
    }
    refreshRuntimeMetadata(value, proto);
    return value;
}
