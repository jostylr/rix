import { Integer, Rational, RationalInterval } from "@ratmath/core";
import { HOLE, isHole } from "./hole.js";

function domainKey(value) {
    return String(value ?? "").normalize("NFKC").toLocaleLowerCase("en-US");
}

function scalarDomainName(value) {
    if (value instanceof Integer) return "Integer";
    if (value instanceof Rational) return "Rational";
    if (value instanceof RationalInterval) return "RationalInterval";
    const semantic = value?._ext instanceof Map ? value._ext.get("__type")?.value : null;
    if (semantic) return semantic;
    if (value?.type) return value.type;
    if (typeof value === "bigint" || Number.isSafeInteger(value)) return "Integer";
    return value?.constructor?.name ?? typeof value;
}

function mergeDomains(left, right) {
    if (!left) return right;
    if (!right || domainKey(left) === domainKey(right)) return left;
    const pair = new Set([domainKey(left), domainKey(right)]);
    if ([...pair].every((name) => name === "integer" || name === "rational")) return "Rational";
    if ([...pair].every((name) => ["integer", "rational", "rationalinterval", "interval"].includes(name))) {
        return "RationalInterval";
    }
    throw new Error(`Shaped entries span incompatible scalar domains ${left} and ${right}; convert them explicitly`);
}

export function inferShapedScalarDomain(values) {
    let domain = null;
    for (const value of values || []) {
        if (isHole(value)) continue;
        domain = mergeDomains(domain, scalarDomainName(value));
    }
    return domain ?? "Unspecified";
}

export function shapedScalarDomain(value) {
    return value?._ext instanceof Map
        ? (value._ext.get("scalarDomain")?.value ?? value._ext.get("scalardomain")?.value ?? "Unspecified")
        : "Unspecified";
}

export function valueBelongsToScalarDomain(value, domain) {
    if (isHole(value) || domainKey(domain) === "unspecified") return true;
    const source = domainKey(scalarDomainName(value));
    const target = domainKey(domain);
    if (source === target) return true;
    if (target === "rational" && source === "integer") return true;
    if (["rationalinterval", "interval"].includes(target) && ["integer", "rational"].includes(source)) return true;
    return false;
}

function setScalarDomain(ext, domain) {
    const label = { type: "string", value: domain };
    ext.set("scalarDomain", label);
    ext.set("scalardomain", label);
}

export function validateShapedScalarDomain(value, requestedDomain = null) {
    if (!isShaped(value)) throw new Error("Scalar-domain validation expects a Shaped value");
    const declared = requestedDomain ?? shapedScalarDomain(value);
    const actual = domainKey(declared) === "unspecified" ? inferShapedScalarDomain(value.data) : declared;
    for (const entry of value.data) {
        if (!valueBelongsToScalarDomain(entry, actual)) {
            throw new Error(`Shaped entry from scalar domain ${scalarDomainName(entry)} does not satisfy declared domain ${actual}`);
        }
    }
    setScalarDomain(value._ext, actual);
    return value;
}

function exactInteger(value, label = "Index") {
    if (value instanceof Integer) {
        return Number(value.value);
    }
    if (value instanceof Rational) {
        if (value.denominator !== 1n) {
            throw new Error(`${label} must be an integer`);
        }
        return Number(value.numerator);
    }
    if (typeof value === "bigint") {
        return Number(value);
    }
    if (typeof value === "number") {
        if (!Number.isInteger(value)) {
            throw new Error(`${label} must be an integer`);
        }
        return value;
    }
    if (value && typeof value === "object") {
        if (typeof value.value === "bigint") {
            return Number(value.value);
        }
        if (typeof value.numerator === "bigint" && typeof value.denominator === "bigint") {
            if (value.denominator !== 1n) {
                throw new Error(`${label} must be an integer`);
            }
            return Number(value.numerator);
        }
    }
    throw new Error(`${label} must be an integer`);
}

function normalizeIndex(rawIndex, dimLength, axis) {
    const index = exactInteger(rawIndex, `Index for axis ${axis + 1}`);
    if (index === 0) {
        throw new Error(`Shaped index 0 is invalid on axis ${axis + 1}`);
    }
    const normalized = index < 0 ? dimLength + 1 + index : index;
    if (normalized < 1 || normalized > dimLength) {
        throw new Error(
            `Shaped index ${index} is out of range for axis ${axis + 1} with length ${dimLength}`,
        );
    }
    return normalized;
}

function intervalEndpoints(value) {
    if (value instanceof RationalInterval) {
        return [value.start, value.end];
    }
    if (value && value.type === "interval") {
        return [value.lo, value.hi];
    }
    return null;
}

function valueToSelectorSpec(value) {
    const endpoints = intervalEndpoints(value);
    if (endpoints) {
        return {
            kind: "slice",
            start: endpoints[0],
            end: endpoints[1],
        };
    }
    return {
        kind: "index",
        value,
    };
}

export function isShaped(value) {
    return !!value &&
        value.type === "shaped" &&
        Array.isArray(value.data) &&
        Array.isArray(value.shape) &&
        Array.isArray(value.strides);
}

export function shapedRank(shaped) {
    return shaped.shape.length;
}

export function shapedShape(shaped) {
    return [...shaped.shape];
}

export function shapedSize(shaped) {
    return shaped.shape.reduce((product, dim) => product * dim, 1);
}

export function computeDefaultStrides(shape) {
    const strides = new Array(shape.length);
    let stride = 1;
    for (let i = shape.length - 1; i >= 0; i--) {
        strides[i] = stride;
        stride *= shape[i];
    }
    return strides;
}

export function createShaped(shape, data = null, options = {}) {
    if (!Array.isArray(shape)) {
        throw new Error("Shaped shape must be an array");
    }

    const normalizedShape = shape.map((dim, axis) => {
        const n = exactInteger(dim, `Shaped shape axis ${axis + 1}`);
        if (n < 0) {
            throw new Error(`Shaped shape axis ${axis + 1} must be nonnegative`);
        }
        return n;
    });

    const size = normalizedShape.reduce((product, dim) => product * dim, 1);
    const actualData = data ? [...data] : new Array(size).fill(HOLE);
    if (actualData.length !== size) {
        throw new Error(
            `Shaped literal element count mismatch (expected ${size}, got ${actualData.length})`,
        );
    }

    const ext = options.ext ?? new Map([["_mutable", new Integer(1n)]]);
    const result = {
        type: "shaped",
        data: actualData,
        shape: normalizedShape,
        strides: options.strides ? [...options.strides] : computeDefaultStrides(normalizedShape),
        offset: options.offset ?? 0,
        _ext: ext,
    };
    const scalarDomain = options.scalarDomain ?? inferShapedScalarDomain(actualData);
    setScalarDomain(ext, scalarDomain);
    return validateShapedScalarDomain(result, scalarDomain);
}

export function createShapedView(shaped, view) {
    if (!isShaped(shaped)) {
        throw new Error("Cannot create a shaped view from a non-shaped value");
    }
    const ext = new Map(shaped._ext instanceof Map ? shaped._ext : []);
    const semanticType = ext.get("__type")?.value?.toLowerCase?.();
    if (semanticType === "matrix" && view.shape.length !== 2) {
        ext.set("__type", { type: "string", value: "Shaped" });
        ext.delete("__proto");
    }
    return {
        type: "shaped",
        data: shaped.data,
        shape: [...view.shape],
        strides: [...view.strides],
        offset: view.offset,
        _ext: ext,
    };
}

export function shapedIndexTuple(indices) {
    return {
        type: "tuple",
        values: indices.map((index) => new Integer(BigInt(index))),
    };
}

export function linearIndexToTuple(linearIndex, shape) {
    if (shape.length === 0) {
        return [];
    }

    const defaultStrides = computeDefaultStrides(shape);
    const tuple = new Array(shape.length);
    let remaining = linearIndex;

    for (let axis = 0; axis < shape.length; axis++) {
        const stride = defaultStrides[axis];
        const dim = shape[axis];
        if (dim === 0) {
            return [];
        }
        tuple[axis] = Math.floor(remaining / stride) + 1;
        remaining %= stride;
    }

    return tuple;
}

export function shapedOffsetForTuple(shaped, tuple) {
    let offset = shaped.offset;
    for (let axis = 0; axis < shaped.shape.length; axis++) {
        offset += (tuple[axis] - 1) * shaped.strides[axis];
    }
    return offset;
}

export function forEachShapedCell(shaped, callback) {
    const size = shapedSize(shaped);
    if (shaped.shape.length === 0) {
        callback(shaped.data[shaped.offset], [], shaped.offset);
        return;
    }

    for (let linear = 0; linear < size; linear++) {
        const tuple = linearIndexToTuple(linear, shaped.shape);
        const offset = shapedOffsetForTuple(shaped, tuple);
        callback(shaped.data[offset], tuple, offset);
    }
}

export function normalizeShapedSelectors(shaped, selectorSpecs) {
    let specs = selectorSpecs;

    if (
        specs.length === 1 &&
        specs[0]?.kind === "index" &&
        specs[0].value &&
        specs[0].value.type === "tuple"
    ) {
        specs = specs[0].value.values.map((value) => valueToSelectorSpec(value));
    }

    if (specs.length !== shaped.shape.length) {
        throw new Error(
            `Shaped rank mismatch: expected ${shaped.shape.length} indices, got ${specs.length}`,
        );
    }

    return specs.map((spec, axis) => {
        if (spec.kind === "index") {
            const normalizedSpec = valueToSelectorSpec(spec.value);
            if (normalizedSpec.kind === "slice") {
                spec = normalizedSpec;
            }
        }

        if (spec.kind === "full") {
            const start = normalizeIndex(1, shaped.shape[axis], axis);
            const end = normalizeIndex(-1, shaped.shape[axis], axis);
            const direction = start <= end ? 1 : -1;
            return {
                kind: "slice",
                start,
                end,
                direction,
                length: Math.abs(end - start) + 1,
            };
        }

        if (spec.kind === "slice") {
            const start = normalizeIndex(spec.start, shaped.shape[axis], axis);
            const end = normalizeIndex(spec.end, shaped.shape[axis], axis);
            const direction = start <= end ? 1 : -1;
            return {
                kind: "slice",
                start,
                end,
                direction,
                length: Math.abs(end - start) + 1,
            };
        }

        return {
            kind: "index",
            index: normalizeIndex(spec.value, shaped.shape[axis], axis),
        };
    });
}

export function shapedGetBySelectors(shaped, selectorSpecs) {
    const selectors = normalizeShapedSelectors(shaped, selectorSpecs);
    let offset = shaped.offset;
    const shape = [];
    const strides = [];

    for (let axis = 0; axis < selectors.length; axis++) {
        const selector = selectors[axis];
        const stride = shaped.strides[axis];

        if (selector.kind === "index") {
            offset += (selector.index - 1) * stride;
            continue;
        }

        offset += (selector.start - 1) * stride;
        shape.push(selector.length);
        strides.push(stride * selector.direction);
    }

    if (shape.length === 0) {
        const value = shaped.data[offset];
        return isHole(value) ? null : value;
    }

    return createShapedView(shaped, { shape, strides, offset });
}

export function shapedAssignBySelectors(shaped, selectorSpecs, value) {
    const selectors = normalizeShapedSelectors(shaped, selectorSpecs);
    let offset = shaped.offset;
    const shape = [];
    const strides = [];

    for (let axis = 0; axis < selectors.length; axis++) {
        const selector = selectors[axis];
        const stride = shaped.strides[axis];

        if (selector.kind === "index") {
            offset += (selector.index - 1) * stride;
            continue;
        }

        offset += (selector.start - 1) * stride;
        shape.push(selector.length);
        strides.push(stride * selector.direction);
    }

    let declaredDomain = shapedScalarDomain(shaped);
    if (domainKey(declaredDomain) === "unspecified" && !isHole(value)) {
        declaredDomain = scalarDomainName(value);
        setScalarDomain(shaped._ext, declaredDomain);
    }
    if (!valueBelongsToScalarDomain(value, declaredDomain)) {
        throw new Error(`Shaped assignment from scalar domain ${scalarDomainName(value)} does not satisfy declared domain ${declaredDomain}`);
    }

    if (shape.length === 0) {
        shaped.data[offset] = value;
        return value;
    }

    const view = createShapedView(shaped, { shape, strides, offset });
    forEachShapedCell(view, (_cellValue, _tuple, cellOffset) => {
        shaped.data[cellOffset] = value;
    });
    return value;
}

export function coerceShapeValue(shapeValue) {
    if (isShaped(shapeValue)) {
        return shapedShape(shapeValue);
    }
    if (shapeValue && shapeValue.type === "tuple") {
        return shapeValue.values.map((value, axis) =>
            exactInteger(value, `Shaped shape axis ${axis + 1}`),
        );
    }
    throw new Error("Shaped.Generate expects a Shaped or tuple shape");
}
