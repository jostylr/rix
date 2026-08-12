/** Exact dense linear algebra and coordinate-aware tensor values. */

import { Integer, Rational } from "@ratmath/core";
import {
    createTensor,
    forEachTensorCell,
    isTensor,
    tensorRank,
} from "../../src/runtime/tensor.js";
import { entriesFor, field, sequence } from "../scene3d/scene3d.js";

export const LINALG_RESULT_SCHEMA = "rix.linalg.result@1";
export const VECTOR_SPACE_SCHEMA = "rix.linalg.vector-space@1";
export const COORDINATES_SCHEMA = "rix.linalg.coordinates@1";
export const COORDINATE_TENSOR_SCHEMA = "rix.linalg.coordinate-tensor@1";

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
    forEachTensorCell(value, (entry) => values.push(entry));
    return values;
}

export function exactMatrix(value, label = "matrix") {
    let rows;
    if (isTensor(value)) {
        if (tensorRank(value) !== 2) throw new Error(`${label} must be a rank-2 tensor`);
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
    if (isTensor(value)) {
        if (tensorRank(value) !== 1) throw new Error(`${label} must be a rank-1 tensor`);
        values = flatTensorValues(value);
    } else {
        values = sequence(value, label);
    }
    return values.map((entry, index) => exactRational(entry, `${label} entry ${index + 1}`));
}

export function matrixTensor(rows) {
    if (rows.length === 0 || rows[0].length === 0) throw new Error("Matrix cannot be empty");
    return createTensor([rows.length, rows[0].length], rows.flat());
}

export function vectorTensor(values) {
    return createTensor([values.length], values);
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

function spaceValue(name, dimension, metadata = null) {
    return Object.freeze({
        type: "vector_space",
        schema: VECTOR_SPACE_SCHEMA,
        name,
        dimension,
        metadata,
        _ext: new Map([["_type", str("VectorSpace")], ["immutable", int(1)], ["name", str(name)], ["dimension", int(dimension)], ["metadata", metadata]]),
    });
}

export function vectorSpace(args) {
    const entries = entriesFor(args, ["name", "dimension", "options"], "linalg.VectorSpace");
    const name = text(field(entries, "name"), "V");
    const dimension = integer(field(entries, "dimension"), "Vector-space dimension");
    if (dimension < 1) throw new Error("Vector-space dimension must be positive");
    return spaceValue(name, dimension, field(entries, "metadata"));
}

function requireSpace(value) {
    if (value?.type !== "vector_space" || value.schema !== VECTOR_SPACE_SCHEMA) {
        throw new Error("Expected a linalg VectorSpace");
    }
    return value;
}

function requireCoordinates(value) {
    if (value?.type !== "coordinate_system" || value.schema !== COORDINATES_SCHEMA) {
        throw new Error("Expected linalg Coordinates");
    }
    return value;
}

export function coordinates(args) {
    const entries = entriesFor(args, ["space", "name", "basis", "options"], "linalg.Coordinates");
    const space = requireSpace(field(entries, "space"));
    const name = text(field(entries, "name"), "standard");
    const basisValue = field(entries, "basis");
    const basis = basisValue === null ? identityRows(space.dimension) : exactMatrix(basisValue, "Coordinate basis");
    if (basis.length !== space.dimension || basis[0].length !== space.dimension) {
        throw new Error(`Coordinate basis must be ${space.dimension}x${space.dimension}`);
    }
    const inverse = inverseRows(basis);
    return Object.freeze({
        type: "coordinate_system",
        schema: COORDINATES_SCHEMA,
        name,
        space,
        basis: matrixTensor(basis),
        inverseBasis: matrixTensor(inverse),
        metadata: field(entries, "metadata"),
        _ext: new Map([
            ["_type", str("Coordinates")], ["immutable", int(1)], ["name", str(name)],
            ["space", space], ["basis", matrixTensor(basis)], ["inverseBasis", matrixTensor(inverse)],
        ]),
    });
}

export function changeMatrixValues(sourceValue, targetValue) {
    const source = requireCoordinates(sourceValue);
    const target = requireCoordinates(targetValue);
    if (source.space !== target.space) throw new Error("Coordinate systems must belong to the same VectorSpace");
    return multiplyRows(exactMatrix(target.inverseBasis), exactMatrix(source.basis));
}

export function changeMatrix(args) {
    return matrixTensor(changeMatrixValues(args[0], args[1]));
}

function varianceName(value) {
    const name = text(value, value?.value);
    if (["up", "contravariant"].includes(name)) return "up";
    if (["down", "covariant"].includes(name)) return "down";
    throw new Error("Tensor variance entries must be :up/:contravariant or :down/:covariant");
}

function normalizeVariance(value, rankValue) {
    const values = value === null || value === undefined
        ? Array.from({ length: rankValue }, () => "up")
        : sequence(value, "Tensor variance").map(varianceName);
    if (values.length !== rankValue) throw new Error(`Tensor variance must contain ${rankValue} entries`);
    return values;
}

let tensorIdentitySerial = 0;

function coordinateTensorMethods() {
    return new Map([
        ["_type", str("CoordinateTensor")],
        ["COMPONENTS", { type: "method_builtin", name: "Components", impl: ([self]) => self.components }],
        ["COORDINATES", { type: "method_builtin", name: "Coordinates", impl: ([self]) => self.coordinates }],
        ["TRANSFORM", { type: "method_builtin", name: "Transform", impl: ([self, target]) => transformCoordinateTensor([self, target]) }],
        ["TRANSFORM!", { type: "method_builtin", name: "Transform!", impl: ([self, target]) => transformCoordinateTensorBang([self, target]) }],
        ["SAMETENSOR", { type: "method_builtin", name: "SameTensor", impl: ([self, other]) => sameTensor([self, other]) }],
    ]);
}

function syncCoordinateTensorExtension(value) {
    value._ext.set("components", value.components);
    value._ext.set("coordinates", value.coordinates);
    value._ext.set("variance", seq(value.variance.map(str)));
    value._ext.set("identity", value.identity);
    value._ext.set("equivalentTo", value.equivalentTo);
    value._ext.set("equivalentto", value.equivalentTo);
    value._ext.set("origin", value.origin);
    value._ext.set("transform", value.transform);
    return value;
}

function makeCoordinateTensor(components, coordinateSystem, variance, lineage = {}) {
    return syncCoordinateTensorExtension({
        type: "coordinate_tensor",
        schema: COORDINATE_TENSOR_SCHEMA,
        components,
        coordinates: coordinateSystem,
        variance,
        identity: lineage.identity || Object.freeze({ type: "tensor_identity", serial: ++tensorIdentitySerial }),
        equivalentTo: lineage.equivalentTo || null,
        origin: lineage.origin || null,
        transform: lineage.transform || null,
        _ext: coordinateTensorMethods(),
    });
}

function requireCoordinateTensor(value) {
    if (value?.type !== "coordinate_tensor" || value.schema !== COORDINATE_TENSOR_SCHEMA) {
        throw new Error("Expected a coordinate-aware tensor");
    }
    return value;
}

export function coordinateTensor(args) {
    const entries = entriesFor(args, ["components", "coordinates", "variance", "options"], "linalg.CoordinateTensor");
    const components = field(entries, "components");
    if (!isTensor(components)) throw new Error("CoordinateTensor components must be a tensor");
    const coordinateSystem = requireCoordinates(field(entries, "coordinates"));
    const rankValue = tensorRank(components);
    if (rankValue < 1 || components.shape.some((size) => size !== coordinateSystem.space.dimension)) {
        throw new Error("Every coordinate-tensor axis must match the VectorSpace dimension");
    }
    return makeCoordinateTensor(components, coordinateSystem,
        normalizeVariance(field(entries, "variance"), rankValue));
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
    return createTensor(shape, output);
}

function transformedComponents(value, target) {
    const change = changeMatrixValues(value.coordinates, target);
    const covariantChange = inverseRows(transposeRows(change));
    let components = value.components;
    value.variance.forEach((variance, axis) => {
        components = transformAxis(components, axis, variance === "up" ? change : covariantChange);
    });
    return { components, change };
}

export function transformCoordinateTensor(args) {
    const value = requireCoordinateTensor(args[0]);
    const target = requireCoordinates(args[1]);
    if (value.coordinates === target) return makeCoordinateTensor(value.components, target, [...value.variance], {
        identity: value.identity,
        equivalentTo: value,
        origin: value.origin || value,
        transform: { kind: "coordinateChange", source: value.coordinates, target, matrix: matrixTensor(identityRows(target.space.dimension)) },
    });
    const transformed = transformedComponents(value, target);
    return makeCoordinateTensor(transformed.components, target, [...value.variance], {
        identity: value.identity,
        equivalentTo: value,
        origin: value.origin || value,
        transform: { kind: "coordinateChange", source: value.coordinates, target, matrix: matrixTensor(transformed.change) },
    });
}

function snapshotCoordinateTensor(value) {
    return makeCoordinateTensor(value.components, value.coordinates, [...value.variance], {
        identity: value.identity,
        equivalentTo: value.equivalentTo,
        origin: value.origin,
        transform: value.transform,
    });
}

export function transformCoordinateTensorBang(args) {
    const value = requireCoordinateTensor(args[0]);
    const target = requireCoordinates(args[1]);
    const previous = snapshotCoordinateTensor(value);
    const transformed = transformedComponents(value, target);
    value.components = transformed.components;
    value.coordinates = target;
    value.equivalentTo = previous;
    value.origin = value.origin || previous;
    value.transform = { kind: "coordinateChange", source: previous.coordinates, target, matrix: matrixTensor(transformed.change) };
    return syncCoordinateTensorExtension(value);
}

export function components(args) {
    return requireCoordinateTensor(args[0]).components;
}

export function sameTensor(args) {
    return requireCoordinateTensor(args[0]).identity === requireCoordinateTensor(args[1]).identity ? int(1) : null;
}

export function vectorCoordinates(args) {
    const coordinateSystem = requireCoordinates(args[1]);
    const vector = exactVector(args[0], "Vector components");
    if (vector.length !== coordinateSystem.space.dimension) throw new Error("Vector dimension does not match its coordinate system");
    return makeCoordinateTensor(vectorTensor(vector), coordinateSystem, ["up"]);
}

export const helpers = new Map([
    ["Rref", rref], ["Rank", rank], ["Determinant", determinant], ["Inverse", inverse], ["Solve", solveLinear],
    ["VectorSpace", vectorSpace], ["Coordinates", coordinates], ["CoordinateTensor", coordinateTensor],
    ["Vector", vectorCoordinates], ["ChangeMatrix", changeMatrix], ["Transform", transformCoordinateTensor],
    ["Transform!", transformCoordinateTensorBang], ["Components", components], ["SameTensor", sameTensor],
]);
