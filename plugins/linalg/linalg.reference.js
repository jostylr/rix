/** Exact dense linear algebra and coordinate-aware tensor values. */

import { Integer, Rational } from "@ratmath/core";
import {
    createShaped,
    forEachShapedCell,
    isShaped,
    shapedRank,
} from "../../src/runtime/shaped.js";
import { entriesFor, field, sequence } from "../scene3d/scene3d.reference.js";

export const LINALG_RESULT_SCHEMA = "rix.linalg.result@1";
export const VECTOR_SPACE_SCHEMA = "rix.linalg.vector-space@1";
export const FRAME_SCHEMA = "rix.linalg.frame@1";
export const TENSOR_SCHEMA = "rix.linalg.tensor@1";

const int = (value) => new Integer(BigInt(value));
const str = (value) => ({ type: "string", value: String(value) });
const seq = (values) => ({ type: "sequence", values });
const zero = () => new Rational(0n, 1n);
const one = () => new Rational(1n, 1n);

function exposed(value) {
    if (typeof value === "string") return str(value);
    if (typeof value === "number" && Number.isSafeInteger(value)) return int(value);
    if (typeof value === "boolean") return value ? int(1) : null;
    return value;
}

export function exactRational(value, label = "value") {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value.value, 1n);
    if (typeof value === "bigint" || Number.isSafeInteger(value)) return new Rational(value, 1n);
    throw new Error(`${label} must be an exact Integer or Rational`);
}

function integer(value, label) {
    const result = value instanceof Integer ? Number(value.value)
        : value instanceof Rational && value.denominator === 1n ? Number(value.numerator)
            : Number.isSafeInteger(value) ? value : NaN;
    if (!Number.isSafeInteger(result)) throw new Error(`${label} must be an Integer`);
    return result;
}

function text(value, fallback = null) {
    if (value?.type === "string") return value.value;
    if (typeof value === "string") return value;
    return fallback;
}

function isZero(value) {
    return exactRational(value).numerator === 0n;
}

function isNegative(value) {
    return exactRational(value).numerator < 0n;
}

function copyRows(rows) {
    return rows.map((row) => row.map((value) => exactRational(value)));
}

function flatTensorValues(value) {
    const values = [];
    forEachShapedCell(value, (entry) => values.push(entry));
    return values;
}

export function exactMatrix(value, label = "matrix") {
    let rows;
    if (isShaped(value)) {
        if (shapedRank(value) !== 2) throw new Error(`${label} must be a rank-2 tensor`);
        const flat = flatTensorValues(value);
        rows = Array.from({ length: value.shape[0] }, (_, row) =>
            flat.slice(row * value.shape[1], (row + 1) * value.shape[1]));
    } else if (value?.type === "matrix" && Array.isArray(value.rows)) {
        rows = value.rows.map((row) => sequence(row, `${label} row`));
    } else {
        rows = sequence(value, label).map((row, index) => sequence(row, `${label} row ${index + 1}`));
    }
    const columns = rows[0]?.length ?? 0;
    if (rows.length === 0 || columns === 0) throw new Error(`${label} cannot be empty`);
    if (!rows.every((row) => row.length === columns)) throw new Error(`${label} rows must have equal lengths`);
    return rows.map((row, rowIndex) => row.map((entry, columnIndex) =>
        exactRational(entry, `${label} entry ${rowIndex + 1},${columnIndex + 1}`)));
}

export function exactVector(value, label = "vector") {
    let values;
    if (isShaped(value)) {
        if (shapedRank(value) !== 1) throw new Error(`${label} must be a rank-1 tensor`);
        values = flatTensorValues(value);
    } else {
        values = sequence(value, label);
    }
    return values.map((entry, index) => exactRational(entry, `${label} entry ${index + 1}`));
}

export function matrixTensor(rows) {
    if (rows.length === 0 || rows[0].length === 0) throw new Error("Matrix cannot be empty");
    const value = createShaped([rows.length, rows[0].length], rows.flat());
    value._ext.set("__type", str("Matrix"));
    return value;
}

export function vectorTensor(values) {
    return createShaped([values.length], values);
}

export function identityRows(size) {
    return Array.from({ length: size }, (_, row) =>
        Array.from({ length: size }, (_, column) => row === column ? one() : zero()));
}

export function transposeRows(rows) {
    return Array.from({ length: rows[0].length }, (_, column) => rows.map((row) => row[column]));
}

export function multiplyRows(left, right) {
    if (left[0].length !== right.length) throw new Error("Matrix multiplication dimensions must agree");
    return left.map((row) => Array.from({ length: right[0].length }, (_, column) =>
        row.reduce((sum, value, index) => sum.add(value.multiply(right[index][column])), zero())));
}

export function multiplyMatrixVector(rows, values) {
    if (rows[0].length !== values.length) throw new Error("Matrix/vector dimensions must agree");
    return rows.map((row) => row.reduce((sum, value, index) => sum.add(value.multiply(values[index])), zero()));
}

export function rrefRows(source, coefficientColumns = source[0].length) {
    const rows = copyRows(source);
    const pivots = [];
    let pivotRow = 0;
    for (let column = 0; column < coefficientColumns && pivotRow < rows.length; column++) {
        const selected = rows.findIndex((row, index) => index >= pivotRow && !isZero(row[column]));
        if (selected < 0) continue;
        [rows[pivotRow], rows[selected]] = [rows[selected], rows[pivotRow]];
        const pivot = rows[pivotRow][column];
        rows[pivotRow] = rows[pivotRow].map((value) => value.divide(pivot));
        for (let row = 0; row < rows.length; row++) {
            if (row === pivotRow || isZero(rows[row][column])) continue;
            const factor = rows[row][column];
            rows[row] = rows[row].map((value, index) => value.subtract(factor.multiply(rows[pivotRow][index])));
        }
        pivots.push(column);
        pivotRow += 1;
    }
    return { rows, pivots };
}

export function inverseRows(source) {
    if (source.length !== source[0].length) throw new Error("Inverse requires a square matrix");
    const size = source.length;
    const reduced = rrefRows(source.map((row, index) => [...row, ...identityRows(size)[index]]), size);
    if (reduced.pivots.length !== size) throw new Error("Matrix is singular");
    return reduced.rows.map((row) => row.slice(size));
}

export function determinantRows(source) {
    if (source.length !== source[0].length) throw new Error("Determinant requires a square matrix");
    const rows = copyRows(source);
    let determinant = one();
    for (let column = 0; column < rows.length; column++) {
        const selected = rows.findIndex((row, index) => index >= column && !isZero(row[column]));
        if (selected < 0) return zero();
        if (selected !== column) {
            [rows[column], rows[selected]] = [rows[selected], rows[column]];
            determinant = determinant.negate();
        }
        const pivot = rows[column][column];
        determinant = determinant.multiply(pivot);
        for (let row = column + 1; row < rows.length; row++) {
            if (isZero(rows[row][column])) continue;
            const factor = rows[row][column].divide(pivot);
            for (let index = column; index < rows[row].length; index++) {
                rows[row][index] = rows[row][index].subtract(factor.multiply(rows[column][index]));
            }
        }
    }
    return determinant;
}

function linalgResult(fields) {
    const result = {
        type: "linalg_result",
        schema: LINALG_RESULT_SCHEMA,
        exact: true,
        ...fields,
        _ext: new Map([["_type", str("LinearSolveResult")], ["immutable", int(1)]]),
    };
    for (const [name, value] of Object.entries(fields)) result._ext.set(name, exposed(value));
    result._ext.set("schema", str(LINALG_RESULT_SCHEMA));
    result._ext.set("exact", int(1));
    return result;
}

export function solveLinearValues(matrixValue, vectorValue) {
    const matrix = exactMatrix(matrixValue, "Solve matrix");
    const vector = exactVector(vectorValue, "Solve right-hand side");
    if (matrix.length !== vector.length) throw new Error("Solve right-hand side length must equal the matrix row count");
    const columns = matrix[0].length;
    const reduced = rrefRows(matrix.map((row, index) => [...row, vector[index]]), columns);
    const inconsistent = reduced.rows.some((row) =>
        row.slice(0, columns).every(isZero) && !isZero(row[columns]));
    if (inconsistent) {
        return linalgResult({
            status: "inconsistent",
            solution: null,
            particular: null,
            nullspace: seq([]),
            rank: reduced.pivots.length,
            rref: matrixTensor(reduced.rows),
            pivots: seq(reduced.pivots.map((column) => int(column + 1))),
        });
    }

    const particular = Array.from({ length: columns }, () => zero());
    reduced.pivots.forEach((column, row) => { particular[column] = reduced.rows[row][columns]; });
    const freeColumns = Array.from({ length: columns }, (_, index) => index)
        .filter((column) => !reduced.pivots.includes(column));
    const nullspace = freeColumns.map((freeColumn) => {
        const basis = Array.from({ length: columns }, () => zero());
        basis[freeColumn] = one();
        reduced.pivots.forEach((pivotColumn, row) => {
            basis[pivotColumn] = reduced.rows[row][freeColumn].negate();
        });
        return vectorTensor(basis);
    });
    const solution = vectorTensor(particular);
    return linalgResult({
        status: freeColumns.length === 0 ? "unique" : "underdetermined",
        solution,
        particular: solution,
        nullspace: seq(nullspace),
        rank: reduced.pivots.length,
        rref: matrixTensor(reduced.rows),
        pivots: seq(reduced.pivots.map((column) => int(column + 1))),
    });
}

export function rref(args) {
    const rows = exactMatrix(args[0], "Rref matrix");
    return matrixTensor(rrefRows(rows).rows);
}

export function rank(args) {
    const rows = exactMatrix(args[0], "Rank matrix");
    return int(rrefRows(rows).pivots.length);
}

export function determinant(args) {
    return determinantRows(exactMatrix(args[0], "Determinant matrix"));
}

export function inverse(args) {
    return matrixTensor(inverseRows(exactMatrix(args[0], "Inverse matrix")));
}

export function solveLinear(args) {
    if (args.length === 1 && args[0]?.type === "map") {
        return solveLinearValues(field(args[0].entries, "A"), field(args[0].entries, "b"));
    }
    if (args.length !== 2) throw new Error("linalg.Solve expects a matrix and right-hand side");
    return solveLinearValues(args[0], args[1]);
}

let spaceIdentitySerial = 0;
let tensorIdentitySerial = 0;
let tensorRepresentationSerial = 0;

function scalarFieldName(value) {
    const name = text(value, value?.value ?? (value === null ? "Rational" : null));
    if (!name || name.toLowerCase() !== "rational") {
        throw new Error("Phase 1 VectorSpace currently requires over=:Rational");
    }
    return "Rational";
}

function spaceValue(name, dimension, over, metadata = null) {
    const value = {
        type: "vector_space",
        schema: VECTOR_SPACE_SCHEMA,
        identity: Object.freeze({ type: "vector_space_identity", serial: ++spaceIdentitySerial }),
        name,
        dimension,
        over,
        metadata,
        definingFrame: null,
        _ext: new Map([
            ["_type", str("VectorSpace")], ["immutable", int(1)], ["name", str(name)],
            ["dimension", int(dimension)], ["over", str(over)], ["metadata", metadata],
        ]),
    };
    return value;
}

export function vectorSpace(args) {
    const entries = entriesFor(args, ["name", "dimension", "options"], "linalg.VectorSpace");
    const name = text(field(entries, "name"), "V");
    const dimension = integer(field(entries, "dimension"), "Vector-space dimension");
    if (dimension < 1) throw new Error("Vector-space dimension must be positive");
    return spaceValue(name, dimension, scalarFieldName(field(entries, "over")), field(entries, "metadata"));
}

function requireSpace(value) {
    if (value?.type !== "vector_space" || value.schema !== VECTOR_SPACE_SCHEMA) {
        throw new Error("Expected a linalg VectorSpace");
    }
    return value;
}

function requireFrame(value) {
    if (value?.type !== "frame" || value.schema !== FRAME_SCHEMA) {
        if (value?.type === "vector_space") throw new Error("Tensor components require a Frame, not a bare VectorSpace");
        throw new Error("Expected a linalg Frame");
    }
    return value;
}

export function frame(args) {
    const entries = args.length === 2 && args[1]?.type === "map" && args[1].entries instanceof Map
        ? new Map([["space", args[0]], ...args[1].entries])
        : entriesFor(args, ["space", "name", "basis", "options"], "linalg.Frame");
    const space = requireSpace(field(entries, "space"));
    const name = text(field(entries, "name"), space.definingFrame ? "frame" : "defining");
    const basisValue = field(entries, "basis");
    const defining = text(basisValue) === "defining" || (basisValue === null && space.definingFrame === null);
    if (defining && space.definingFrame) throw new Error("VectorSpace already has a defining Frame");

    let relativeTo = field(entries, "relativeTo");
    let localBasis;
    let absoluteBasis;
    if (defining) {
        relativeTo = null;
        localBasis = identityRows(space.dimension);
        absoluteBasis = localBasis;
    } else {
        relativeTo = requireFrame(relativeTo || space.definingFrame);
        if (relativeTo.space !== space) throw new Error("relativeTo Frame must belong to the same VectorSpace");
        localBasis = exactMatrix(basisValue, "Frame basis");
        if (localBasis.length !== space.dimension || localBasis[0].length !== space.dimension) {
            throw new Error(`Frame basis must be ${space.dimension}x${space.dimension}`);
        }
        inverseRows(localBasis);
        absoluteBasis = multiplyRows(exactMatrix(relativeTo.basis), localBasis);
    }
    const inverse = inverseRows(absoluteBasis);
    const value = Object.freeze({
        type: "frame",
        schema: FRAME_SCHEMA,
        name,
        space,
        relativeTo,
        localBasis: matrixTensor(localBasis),
        basis: matrixTensor(absoluteBasis),
        inverseBasis: matrixTensor(inverse),
        defining,
        metadata: field(entries, "metadata"),
        _ext: new Map([
            ["_type", str("Frame")], ["immutable", int(1)], ["name", str(name)], ["space", space],
            ["relativeTo", relativeTo], ["basis", matrixTensor(absoluteBasis)], ["inverseBasis", matrixTensor(inverse)],
            ["defining", defining ? int(1) : null],
        ]),
    });
    if (defining) {
        space.definingFrame = value;
        space._ext.set("definingFrame", value);
    }
    return value;
}

export function changeMatrixValues(sourceValue, targetValue) {
    const source = requireFrame(sourceValue);
    const target = requireFrame(targetValue);
    if (source.space !== target.space) throw new Error("Frames must belong to the same VectorSpace");
    return multiplyRows(exactMatrix(target.inverseBasis), exactMatrix(source.basis));
}

export function changeMatrix(args) {
    return matrixTensor(changeMatrixValues(args[0], args[1]));
}

function varianceName(value) {
    const name = text(value, value?.value);
    if (["up", "contravariant"].includes(name)) return false;
    if (["down", "covariant"].includes(name)) return true;
    throw new Error("Tensor variance entries must be :up/:contravariant or :down/:covariant");
}

function normalizeDuals(value, rankValue) {
    const values = value === null || value === undefined
        ? Array.from({ length: rankValue }, () => false)
        : sequence(value, "Tensor variance").map(varianceName);
    if (values.length !== rankValue) throw new Error(`Tensor variance must contain ${rankValue} entries`);
    return values;
}

function tensorTypeName(slots) {
    if (slots.length === 1) return slots[0].dual ? "Covector" : "Vector";
    return "Tensor";
}

function tensorMethods(typeName) {
    return new Map([
        ["_type", str(typeName)], ["__type", str(typeName)], ["_mutable", int(1)],
        ["COMPONENTS", { type: "method_builtin", name: "Components", impl: ([self]) => self.components }],
        ["FRAME", { type: "method_builtin", name: "Frame", impl: ([self]) => self.slots.length === 1 ? self.slots[0].frame : null }],
        ["FRAMES", { type: "method_builtin", name: "Frames", impl: ([self]) => seq(self.slots.map((slot) => slot.frame)) }],
        ["TRANSFORM", { type: "method_builtin", name: "Transform", impl: ([self, target], context) => transformTensor([self, target], { context }) }],
        ["TRANSFORM!", { type: "method_builtin", name: "Transform!", impl: ([self, target], context) => transformTensorBang([self, target], { context }) }],
        ["PAIR", { type: "method_builtin", name: "Pair", impl: ([self, other], context) => pair([self, other], { context }) }],
        ["SAMETENSOR", { type: "method_builtin", name: "SameTensor", impl: ([self, other]) => sameTensor([self, other]) }],
    ]);
}

function syncTensorExtension(value) {
    value._ext.set("components", value.components);
    value._ext.set("slots", seq(value.slots.map((slot) => ({
        type: "map", entries: new Map([["frame", slot.frame], ["dual", slot.dual ? int(1) : null]]),
    }))));
    value._ext.set("frame", value.slots.length === 1 ? value.slots[0].frame : null);
    value._ext.set("identity", value.identity);
    value._ext.set("representationIdentity", value.representationIdentity);
    value._ext.set("representationidentity", value.representationIdentity);
    value._ext.set("equivalentTo", value.equivalentTo);
    value._ext.set("equivalentto", value.equivalentTo);
    value._ext.set("origin", value.origin);
    value._ext.set("transform", value.transform);
    value._ext.set("derivedFrom", seq(value.derivedFrom));
    value._ext.set("derivedfrom", seq(value.derivedFrom));
    return value;
}

function validateComponents(components, slots) {
    if (!isShaped(components)) throw new Error("Vector/Tensor components must be Shaped");
    if (shapedRank(components) !== slots.length || slots.length < 1) {
        throw new Error(`Tensor components rank ${shapedRank(components)} does not match ${slots.length} slots`);
    }
    slots.forEach((slot, axis) => {
        requireFrame(slot.frame);
        if (components.shape[axis] !== slot.frame.space.dimension) {
            throw new Error(`Tensor axis ${axis + 1} has size ${components.shape[axis]} but Frame ${slot.frame.name} has dimension ${slot.frame.space.dimension}`);
        }
    });
}

function recordRepresentation(identity, value, context) {
    const configured = context?.getEnv?.("tensorLineageLimit", 30) ?? 30;
    const limit = Math.max(1, integer(configured, "tensorLineageLimit"));
    if (!identity.origin) identity.origin = value;
    if (!identity.representations.includes(value)) identity.representations.push(value);
    while (identity.representations.length > limit + 1) {
        const evicted = identity.representations.splice(1, 1)[0];
        if (evicted && evicted !== identity.origin) evicted.equivalentTo = null;
    }
}

function makeTensor(components, slots, lineage = {}, context = null) {
    const normalizedSlots = slots.map((slot) => Object.freeze({ frame: requireFrame(slot.frame), dual: slot.dual === true }));
    validateComponents(components, normalizedSlots);
    const typeName = tensorTypeName(normalizedSlots);
    const identity = lineage.identity || { type: "tensor_identity", serial: ++tensorIdentitySerial, origin: null, representations: [] };
    const value = {
        type: typeName.toLowerCase(),
        schema: TENSOR_SCHEMA,
        components,
        slots: Object.freeze(normalizedSlots),
        identity,
        representationIdentity: Object.freeze({ type: "tensor_representation_identity", serial: ++tensorRepresentationSerial }),
        equivalentTo: lineage.equivalentTo || null,
        origin: lineage.origin || identity.origin || null,
        transform: lineage.transform || null,
        viewOf: lineage.viewOf || null,
        derivedFrom: Object.freeze([...(lineage.derivedFrom || [])]),
        _ext: tensorMethods(typeName),
    };
    if (!identity.origin) {
        identity.origin = value;
        value.origin = value;
    } else if (!value.origin) value.origin = identity.origin;
    recordRepresentation(identity, value, context);
    return syncTensorExtension(value);
}

function requireTensor(value) {
    if (!["vector", "covector", "tensor"].includes(value?.type) || value.schema !== TENSOR_SCHEMA) {
        throw new Error("Expected a coordinate-aware Vector, Covector, or Tensor");
    }
    return value;
}

export function tensor(args, runtime = {}) {
    const entries = entriesFor(args, ["components", "frames", "variance", "options"], "linalg.Tensor");
    const components = field(entries, "components");
    const framesValue = field(entries, "frames");
    const frames = framesValue?.type === "frame"
        ? Array.from({ length: shapedRank(components) }, () => framesValue)
        : sequence(framesValue, "Tensor frames").map(requireFrame);
    const duals = normalizeDuals(field(entries, "variance"), frames.length);
    return makeTensor(components, frames.map((frameValue, index) => ({ frame: frameValue, dual: duals[index] })), {}, runtime.context);
}

function strides(shape) {
    return shape.map((_, axis) => shape.slice(axis + 1).reduce((product, size) => product * size, 1));
}

function tupleForLinear(linear, shape) {
    const result = [];
    let remainder = linear;
    for (const stride of strides(shape)) {
        result.push(Math.floor(remainder / stride));
        remainder %= stride;
    }
    return result;
}

function transformAxis(tensor, axis, matrix) {
    const shape = [...tensor.shape];
    const input = flatTensorValues(tensor).map((value) => exactRational(value));
    const output = new Array(input.length);
    const sourceStrides = strides(shape);
    for (let linear = 0; linear < output.length; linear++) {
        const targetTuple = tupleForLinear(linear, shape);
        let sum = zero();
        for (let sourceIndex = 0; sourceIndex < shape[axis]; sourceIndex++) {
            const sourceTuple = [...targetTuple];
            sourceTuple[axis] = sourceIndex;
            const sourceLinear = sourceTuple.reduce((total, coordinate, index) =>
                total + coordinate * sourceStrides[index], 0);
            sum = sum.add(matrix[targetTuple[axis]][sourceIndex].multiply(input[sourceLinear]));
        }
        output[linear] = sum;
    }
    return createShaped(shape, output);
}

function targetFrames(value, targetValue) {
    if (targetValue?.type === "frame") return value.slots.map(() => requireFrame(targetValue));
    const targets = sequence(targetValue, "Transform target Frames").map(requireFrame);
    if (targets.length !== value.slots.length) {
        throw new Error(`Transform requires ${value.slots.length} target Frames`);
    }
    return targets;
}

function transformedComponents(value, targets) {
    let components = value.components;
    const changes = [];
    value.slots.forEach((slot, axis) => {
        const target = targets[axis];
        if (slot.frame.space !== target.space) {
            throw new Error(`Target Frame ${target.name} does not belong to tensor slot ${axis + 1}'s VectorSpace`);
        }
        const change = changeMatrixValues(slot.frame, target);
        const applied = slot.dual ? inverseRows(transposeRows(change)) : change;
        components = transformAxis(components, axis, applied);
        changes.push(matrixTensor(applied));
    });
    return { components, changes };
}

export function transformTensor(args, runtime = {}) {
    const value = requireTensor(args[0]);
    const targets = targetFrames(value, args[1]);
    const transformed = transformedComponents(value, targets);
    return makeTensor(transformed.components, value.slots.map((slot, axis) => ({
        frame: targets[axis], dual: slot.dual,
    })), {
        identity: value.identity,
        equivalentTo: value,
        origin: value.identity.origin,
        transform: {
            kind: "coordinateChange",
            sources: value.slots.map((slot) => slot.frame),
            targets,
            matrices: transformed.changes,
        },
        viewOf: value.viewOf,
    }, runtime.context);
}

function snapshotTensor(value) {
    const snapshot = {
        ...value,
        slots: Object.freeze(value.slots.map((slot) => Object.freeze({ ...slot }))),
        _ext: tensorMethods(tensorTypeName(value.slots)),
    };
    return syncTensorExtension(snapshot);
}

export function transformTensorBang(args, runtime = {}) {
    const value = requireTensor(args[0]);
    const targets = targetFrames(value, args[1]);
    const previous = snapshotTensor(value);
    if (value.identity.origin === value) {
        value.identity.origin = previous;
        const originIndex = value.identity.representations.indexOf(value);
        if (originIndex >= 0) value.identity.representations[originIndex] = previous;
    }
    const transformed = transformedComponents(value, targets);
    value.components = transformed.components;
    value.representationIdentity = Object.freeze({ type: "tensor_representation_identity", serial: ++tensorRepresentationSerial });
    value.slots = Object.freeze(value.slots.map((slot, axis) => Object.freeze({ frame: targets[axis], dual: slot.dual })));
    value.equivalentTo = previous;
    value.origin = value.identity.origin;
    value.transform = {
        kind: "coordinateChange",
        sources: previous.slots.map((slot) => slot.frame),
        targets,
        matrices: transformed.changes,
    };
    recordRepresentation(value.identity, value, runtime.context);
    return syncTensorExtension(value);
}

export function components(args) {
    return requireTensor(args[0]).components;
}

export function sameTensor(args) {
    return requireTensor(args[0]).identity === requireTensor(args[1]).identity ? int(1) : null;
}

export function pair(args, runtime = {}) {
    const first = requireTensor(args[0]);
    const second = requireTensor(args[1]);
    const covectorValue = first.type === "covector" ? first : second.type === "covector" ? second : null;
    const vectorValue = first.type === "vector" ? first : second.type === "vector" ? second : null;
    if (!covectorValue || !vectorValue || first.slots.length !== 1 || second.slots.length !== 1) {
        throw new Error("Pair requires one Vector and one Covector");
    }
    if (covectorValue.slots[0].frame.space !== vectorValue.slots[0].frame.space) {
        throw new Error("Vector and Covector must belong to the same VectorSpace");
    }
    const alignedVector = vectorValue.slots[0].frame === covectorValue.slots[0].frame
        ? vectorValue
        : transformTensor([vectorValue, covectorValue.slots[0].frame], runtime);
    const covectorEntries = flatTensorValues(covectorValue.components).map(exactRational);
    const vectorEntries = flatTensorValues(alignedVector.components).map(exactRational);
    return covectorEntries.reduce((sum, entry, index) =>
        sum.add(entry.multiply(vectorEntries[index])), zero());
}

export function vector(args, runtime = {}) {
    const entries = entriesFor(args, ["components", "frame", "options"], "linalg.Vector");
    const frameValue = requireFrame(field(entries, "frame"));
    const values = exactVector(field(entries, "components"), "Vector components");
    if (values.length !== frameValue.space.dimension) throw new Error("Vector dimension does not match its Frame");
    return makeTensor(vectorTensor(values), [{ frame: frameValue, dual: false }], {}, runtime.context);
}

export function covector(args, runtime = {}) {
    const entries = entriesFor(args, ["components", "frame", "options"], "linalg.Covector");
    const frameValue = requireFrame(field(entries, "frame"));
    const values = exactVector(field(entries, "components"), "Covector components");
    if (values.length !== frameValue.space.dimension) throw new Error("Covector dimension does not match its Frame");
    return makeTensor(vectorTensor(values), [{ frame: frameValue, dual: true }], {}, runtime.context);
}

export function typedShaped(componentsValue, header, resolvedSlots, context = null) {
    const requested = String(header.typeName || "").toLowerCase();
    if (!["vector", "covector", "tensor"].includes(requested)) {
        throw new Error(`Compact slot annotation is only valid for Vector, Covector, or Tensor, not ${header.typeName}`);
    }
    if ((requested === "vector" || requested === "covector") && resolvedSlots.length !== 1) {
        throw new Error(`${header.typeName} requires exactly one Frame annotation`);
    }
    const slots = resolvedSlots.map((slot) => ({
        frame: requireFrame(slot.frame),
        dual: requested === "covector" ? true : slot.dual === true,
    }));
    if (requested === "vector" && slots[0].dual) {
        return makeTensor(componentsValue, slots, {}, context);
    }
    if (requested === "tensor" && slots.length !== shapedRank(componentsValue)) {
        throw new Error(`Tensor header declares ${slots.length} slots for rank-${shapedRank(componentsValue)} components`);
    }
    return makeTensor(componentsValue, slots, {}, context);
}

function compatibleSlots(left, right) {
    return left.slots.length === right.slots.length && left.slots.every((slot, axis) =>
        slot.frame.space === right.slots[axis]?.frame.space && slot.dual === right.slots[axis]?.dual);
}

function combineTensorValues(name, leftValue, rightValue, runtime = {}) {
    const left = requireTensor(leftValue);
    const right = requireTensor(rightValue);
    if (!compatibleSlots(left, right)) throw new Error(`${name} requires tensors with the same ordered VectorSpace slots and variance`);
    const aligned = left.slots.every((slot, axis) => slot.frame === right.slots[axis].frame)
        ? right
        : transformTensor([right, seq(left.slots.map((slot) => slot.frame))], runtime);
    const a = flatTensorValues(left.components).map(exactRational);
    const b = flatTensorValues(aligned.components).map(exactRational);
    const values = a.map((entry, index) => name === "ADD" ? entry.add(b[index]) : entry.subtract(b[index]));
    return makeTensor(createShaped(left.components.shape, values), left.slots, {
        derivedFrom: [left, right],
    }, runtime.context);
}

function scaleTensorValue(name, value, scalarValue, scalarFirst, runtime = {}) {
    const tensorValue = requireTensor(value);
    const scalar = exactRational(scalarValue, "Tensor scalar");
    const values = flatTensorValues(tensorValue.components).map((entry) => {
        const exactEntry = exactRational(entry);
        if (name === "MUL") return exactEntry.multiply(scalar);
        return scalarFirst ? scalar.divide(exactEntry) : exactEntry.divide(scalar);
    });
    return makeTensor(createShaped(tensorValue.components.shape, values), tensorValue.slots, {
        derivedFrom: [tensorValue],
    }, runtime.context);
}

export function installTensorOperators(registry) {
    if (!registry || registry.get("ADD")?.variants?.some((variant) => variant.name === "LinalgTensorAddition")) return;
    const isTensor = (value) => ["vector", "covector", "tensor"].includes(value?.type) && value.schema === TENSOR_SCHEMA;
    registry.installVariant("ADD", {
        name: "LinalgTensorAddition", priority: 400,
        prep: (args) => args.length === 2 && isTensor(args[0]) && isTensor(args[1]),
        impl: ([left, right], context) => combineTensorValues("ADD", left, right, { context }),
    });
    registry.installVariant("SUB", {
        name: "LinalgTensorSubtraction", priority: 400,
        prep: (args) => args.length === 2 && isTensor(args[0]) && isTensor(args[1]),
        impl: ([left, right], context) => combineTensorValues("SUB", left, right, { context }),
    });
    registry.installVariant("MUL", {
        name: "LinalgTensorScaling", priority: 400,
        prep: (args) => args.length === 2 && (isTensor(args[0]) !== isTensor(args[1])),
        impl: ([left, right], context) => isTensor(left)
            ? scaleTensorValue("MUL", left, right, false, { context })
            : scaleTensorValue("MUL", right, left, true, { context }),
    });
    registry.installVariant("DIV", {
        name: "LinalgTensorDivision", priority: 400,
        prep: (args) => args.length === 2 && isTensor(args[0]) && !isTensor(args[1]),
        impl: ([left, right], context) => scaleTensorValue("DIV", left, right, false, { context }),
    });
}

export const helpers = new Map([
    ["Rref", rref], ["Rank", rank], ["Determinant", determinant], ["Inverse", inverse], ["Solve", solveLinear],
    ["VectorSpace", vectorSpace], ["Frame", frame], ["Tensor", tensor], ["Vector", vector], ["Covector", covector],
    ["ChangeMatrix", changeMatrix], ["Transform", transformTensor], ["Transform!", transformTensorBang],
    ["Components", components], ["Pair", pair], ["SameTensor", sameTensor],
]);
