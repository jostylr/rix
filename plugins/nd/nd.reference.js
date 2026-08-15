/** Historical host implementation retained as a migration reference. Not loaded. */

import { Integer, Rational } from "@ratmath/core";
import { isCayleyInfinity } from "../../src/runtime/exact-values.js";
import {
    createGroup3D,
    createPointCloud,
    createPolyline,
    createScene3D,
    entriesFor,
    exact,
    field,
    sequence,
} from "../scene3d/scene3d.reference.js";

export const ND_SCHEMA = "rix.nd@1";
export const PROJECTION_SCHEMA = "rix.nd.projection@1";

const int = (value) => new Integer(BigInt(value));
const str = (value) => ({ type: "string", value: String(value) });
const seq = (values) => ({ type: "sequence", values });
const map = (entries) => ({ type: "map", entries: new Map(entries) });
const zero = () => new Rational(0n, 1n);
const one = () => new Rational(1n, 1n);

function rational(value, label) {
    if (value instanceof Rational) return value;
    if (value instanceof Integer) return new Rational(value.value, 1n);
    throw new Error(`${label} must be an exact integer or rational`);
}

function integer(value, label) {
    const number = value instanceof Integer ? Number(value.value)
        : value instanceof Rational && value.denominator === 1n ? Number(value.numerator) : NaN;
    if (!Number.isSafeInteger(number)) throw new Error(`${label} must be an integer`);
    return number;
}

function ndValue(kind, fields) {
    return Object.freeze({
        type: "nd_geometry",
        kind,
        schema: ND_SCHEMA,
        ...fields,
        _ext: new Map([["_type", str("nd_geometry")], ["kind", str(kind)], ["immutable", int(1)]]),
    });
}

export function isNdGeometry(value) {
    return value?.type === "nd_geometry" && value.schema === ND_SCHEMA;
}

function points(value, label, requiredDimension = null) {
    let dimension = requiredDimension;
    const result = sequence(value, label).map((point, pointIndex) => {
        const coordinates = sequence(point, `${label} ${pointIndex + 1}`);
        if (dimension === null) dimension = coordinates.length;
        if (coordinates.length !== dimension) throw new Error(`${label} ${pointIndex + 1} must have dimension ${dimension}`);
        if (dimension < 1) throw new Error(`${label} points cannot be empty`);
        return Object.freeze(coordinates.map((coordinate, index) => exact(coordinate, `${label} ${pointIndex + 1} coordinate ${index + 1}`)));
    });
    return { dimension: dimension ?? 0, values: Object.freeze(result) };
}

function edgePairs(value, vertexCount, label) {
    return Object.freeze(sequence(value, label).map((edge, edgeIndex) => {
        const pair = sequence(edge, `${label} ${edgeIndex + 1}`);
        if (pair.length !== 2) throw new Error(`${label} ${edgeIndex + 1} must contain two indices`);
        const values = pair.map((item, index) => integer(item, `${label} ${edgeIndex + 1} index ${index + 1}`));
        if (values.some((item) => item < 1 || item > vertexCount)) throw new Error(`${label} indices must be between 1 and ${vertexCount}`);
        return Object.freeze(values.map((item) => item - 1));
    }));
}

function provenance(entries) {
    const value = field(entries, "provenance");
    return value === null ? Object.freeze([]) : Object.freeze(sequence(value, "n-dimensional provenance"));
}

function truthy(value) {
    if (value instanceof Integer) return value.value !== 0n;
    if (value instanceof Rational) return value.numerator !== 0n;
    return Boolean(value);
}

export function createNdPoint(args) {
    const entries = entriesFor(args, ["coordinates", "options"], "nd.Point");
    const coordinates = sequence(field(entries, "coordinates"), "nd.Point coordinates");
    if (coordinates.length < 1) throw new Error("nd.Point requires at least one coordinate");
    return ndValue("point", {
        dimension: coordinates.length,
        coordinates: Object.freeze(coordinates.map((value, index) => exact(value, `nd.Point coordinate ${index + 1}`))),
        provenance: provenance(entries),
        metadata: field(entries, "metadata"),
    });
}

export function createNdPolyline(args) {
    const entries = entriesFor(args, ["points", "options"], "nd.Polyline");
    const normalized = points(field(entries, "points"), "nd.Polyline point");
    if (normalized.values.length < 2) throw new Error("nd.Polyline requires at least two points");
    return ndValue("polyline", {
        dimension: normalized.dimension,
        points: normalized.values,
        closed: truthy(field(entries, "closed")),
        provenance: provenance(entries),
        metadata: field(entries, "metadata"),
        style: field(entries, "style"),
    });
}

export function createNdPolytope(args) {
    const entries = entriesFor(args, ["vertices", "edges", "options"], "nd.Polytope");
    const normalized = points(field(entries, "vertices"), "nd.Polytope vertex");
    if (normalized.values.length < 1) throw new Error("nd.Polytope requires vertices");
    return ndValue("polytope", {
        dimension: normalized.dimension,
        vertices: normalized.values,
        edges: edgePairs(field(entries, "edges"), normalized.values.length, "nd.Polytope edge"),
        provenance: provenance(entries),
        metadata: field(entries, "metadata"),
        style: field(entries, "style"),
    });
}

function projectionValue(matrix, offset, method, provenanceValue = []) {
    const targetDimension = matrix.length;
    const sourceDimension = matrix[0]?.length ?? 0;
    if (sourceDimension < 1 || targetDimension < 1) throw new Error("nd.Projection matrix cannot be empty");
    if (!matrix.every((row) => row.length === sourceDimension)) throw new Error("nd.Projection matrix rows must have equal lengths");
    if (offset.length !== targetDimension) throw new Error(`nd.Projection offset must have ${targetDimension} coordinates`);
    return Object.freeze({
        type: "nd_projection",
        kind: "affine",
        schema: PROJECTION_SCHEMA,
        sourceDimension,
        targetDimension,
        matrix: Object.freeze(matrix.map((row) => Object.freeze(row.map((value, index) => exact(value, `nd.Projection matrix coordinate ${index + 1}`))))),
        offset: Object.freeze(offset.map((value, index) => exact(value, `nd.Projection offset ${index + 1}`))),
        method,
        provenance: Object.freeze(provenanceValue),
        _ext: new Map([["_type", str("nd_projection")], ["immutable", int(1)]]),
    });
}

export function createProjection(args) {
    const entries = entriesFor(args, ["matrix", "offset", "options"], "nd.Projection");
    const rows = sequence(field(entries, "matrix"), "nd.Projection matrix").map((row, index) =>
        sequence(row, `nd.Projection matrix row ${index + 1}`));
    const offsetValue = field(entries, "offset");
    const offset = offsetValue === null ? rows.map(() => zero()) : sequence(offsetValue, "nd.Projection offset");
    return projectionValue(rows, offset, field(entries, "method")?.value ?? "affine", provenance(entries));
}

export function coordinateProjection(args) {
    const entries = entriesFor(args, ["sourceDimension", "axes"], "nd.CoordinateProjection");
    const sourceDimension = integer(field(entries, "sourceDimension"), "nd.CoordinateProjection source dimension");
    const axes = sequence(field(entries, "axes"), "nd.CoordinateProjection axes")
        .map((axis, index) => integer(axis, `nd.CoordinateProjection axis ${index + 1}`));
    if (sourceDimension < 1 || axes.length < 1 || new Set(axes).size !== axes.length || axes.some((axis) => axis < 1 || axis > sourceDimension)) {
        throw new Error("nd.CoordinateProjection axes must be unique indices in the source dimension");
    }
    const rows = axes.map((axis) => Array.from({ length: sourceDimension }, (_, index) => index === axis - 1 ? one() : zero()));
    return projectionValue(rows, axes.map(() => zero()), "coordinate", [map([["axes", seq(axes.map(int))]])]);
}

export function cayleyRotation(args) {
    const entries = entriesFor(args, ["dimension", "axis1", "axis2", "t"], "nd.CayleyRotation");
    const dimension = integer(field(entries, "dimension"), "nd.CayleyRotation dimension");
    const axis1 = integer(field(entries, "axis1"), "nd.CayleyRotation axis1");
    const axis2 = integer(field(entries, "axis2"), "nd.CayleyRotation axis2");
    if (dimension < 2 || axis1 < 1 || axis2 < 1 || axis1 > dimension || axis2 > dimension || axis1 === axis2) {
        throw new Error("nd.CayleyRotation axes must be distinct indices in the dimension");
    }
    let cosine; let sine;
    const t = field(entries, "t");
    if (isCayleyInfinity(t)) {
        cosine = new Rational(-1n, 1n);
        sine = zero();
    } else {
        const parameter = rational(t, "nd.CayleyRotation t");
        const square = parameter.multiply(parameter);
        const denominator = one().add(square);
        cosine = one().subtract(square).divide(denominator);
        sine = new Rational(2n, 1n).multiply(parameter).divide(denominator);
    }
    const matrix = Array.from({ length: dimension }, (_, row) => Array.from({ length: dimension }, (_, column) => row === column ? one() : zero()));
    matrix[axis1 - 1][axis1 - 1] = cosine;
    matrix[axis1 - 1][axis2 - 1] = sine.negate ? sine.negate() : new Rational(-sine.numerator, sine.denominator);
    matrix[axis2 - 1][axis1 - 1] = sine;
    matrix[axis2 - 1][axis2 - 1] = cosine;
    return projectionValue(matrix, Array.from({ length: dimension }, zero), "cayley-rotation", [map([
        ["axes", seq([int(axis1), int(axis2)])], ["parameter", t],
    ])]);
}

function multiplyMatrices(left, right) {
    if (left[0].length !== right.length) throw new Error("nd.Compose projection dimensions do not match");
    return left.map((row) => right[0].map((_, column) => row.reduce(
        (sum, value, index) => sum.add(rational(value, "projection value").multiply(rational(right[index][column], "projection value"))),
        zero(),
    )));
}

function applyMatrix(matrix, vector, offset) {
    return matrix.map((row, rowIndex) => row.reduce(
        (sum, coefficient, index) => sum.add(rational(coefficient, "projection coefficient").multiply(rational(vector[index], "projected coordinate"))),
        rational(offset[rowIndex], "projection offset"),
    ));
}

export function composeProjections(args) {
    const entries = entriesFor(args, ["after", "before"], "nd.Compose");
    const after = field(entries, "after");
    const before = field(entries, "before");
    if (after?.type !== "nd_projection" || before?.type !== "nd_projection") throw new Error("nd.Compose requires two projections");
    if (before.targetDimension !== after.sourceDimension) throw new Error("nd.Compose projection dimensions do not match");
    const matrix = multiplyMatrices(after.matrix, before.matrix);
    const offset = applyMatrix(after.matrix, before.offset, after.offset);
    return projectionValue(matrix, offset, "composition", [...before.provenance, ...after.provenance]);
}

function projectCoordinates(coordinates, projection, label) {
    if (coordinates.length !== projection.sourceDimension) throw new Error(`${label} dimension ${coordinates.length} does not match projection source dimension ${projection.sourceDimension}`);
    return Object.freeze(applyMatrix(projection.matrix, coordinates, projection.offset));
}

export function projectGeometry(args) {
    const entries = entriesFor(args, ["geometry", "projection"], "nd.Project");
    const geometry = field(entries, "geometry");
    const projection = field(entries, "projection");
    if (!isNdGeometry(geometry)) throw new Error("nd.Project geometry must be n-dimensional geometry");
    if (projection?.type !== "nd_projection" || projection.schema !== PROJECTION_SCHEMA) throw new Error("nd.Project requires an nd.Projection");
    const trace = [...geometry.provenance, projection];
    if (geometry.kind === "point") return ndValue("point", { ...geometry, dimension: projection.targetDimension, coordinates: projectCoordinates(geometry.coordinates, projection, "nd.Point"), provenance: Object.freeze(trace) });
    if (geometry.kind === "polyline") return ndValue("polyline", { ...geometry, dimension: projection.targetDimension, points: Object.freeze(geometry.points.map((point) => projectCoordinates(point, projection, "nd.Polyline"))), provenance: Object.freeze(trace) });
    if (geometry.kind === "polytope") return ndValue("polytope", { ...geometry, dimension: projection.targetDimension, vertices: Object.freeze(geometry.vertices.map((point) => projectCoordinates(point, projection, "nd.Polytope"))), provenance: Object.freeze(trace) });
    throw new Error(`nd.Project does not support geometry kind '${geometry.kind}'`);
}

export function hypercube(args) {
    const entries = entriesFor(args, ["dimension", "size"], "nd.Hypercube");
    const dimension = integer(field(entries, "dimension"), "nd.Hypercube dimension");
    if (dimension < 1 || dimension > 10) throw new Error("nd.Hypercube dimension must be between 1 and 10");
    const half = rational(field(entries, "size", int(2)), "nd.Hypercube size").divide(new Rational(2n, 1n));
    const negative = half.negate ? half.negate() : new Rational(-half.numerator, half.denominator);
    const vertexCount = 2 ** dimension;
    const vertices = Array.from({ length: vertexCount }, (_, bits) =>
        Array.from({ length: dimension }, (_, axis) => (bits & (1 << axis)) ? half : negative));
    const edges = [];
    for (let bits = 0; bits < vertexCount; bits += 1) for (let axis = 0; axis < dimension; axis += 1) {
        const other = bits ^ (1 << axis);
        if (bits < other) edges.push([bits + 1, other + 1]);
    }
    return createNdPolytope([seq(vertices.map(seq)), seq(edges.map((edge) => seq(edge.map(int))))]);
}

function styleOptions(style) {
    return style?.type === "map" ? style : map([]);
}

export function toScene3D(args) {
    const entries = entriesFor(args, ["geometry", "options"], "nd.ToScene3D");
    const geometry = field(entries, "geometry");
    if (!isNdGeometry(geometry)) throw new Error("nd.ToScene3D requires n-dimensional geometry");
    if (geometry.dimension !== 3) throw new Error(`nd.ToScene3D requires dimension 3; explicitly project dimension ${geometry.dimension} first`);
    const style = field(entries, "style", geometry.style);
    let children;
    if (geometry.kind === "point") children = [createPointCloud([seq([seq(geometry.coordinates)]), styleOptions(style)])];
    else if (geometry.kind === "polyline") children = [createPolyline([seq(geometry.points.map(seq)), styleOptions(style)])];
    else if (geometry.kind === "polytope") {
        children = geometry.edges.map(([a, b]) => createPolyline([seq([seq(geometry.vertices[a]), seq(geometry.vertices[b])]), styleOptions(style)]));
    } else throw new Error(`nd.ToScene3D does not support geometry kind '${geometry.kind}'`);
    const group = createGroup3D([seq(children)]);
    const camera = field(entries, "camera");
    return createScene3D([camera === null
        ? map([["children", seq([group])], ["metadata", map([["source", str(ND_SCHEMA)], ["projectionCount", int(geometry.provenance.length)]])]])
        : map([["children", seq([group])], ["camera", camera], ["metadata", map([["source", str(ND_SCHEMA)], ["projectionCount", int(geometry.provenance.length)]])]])]);
}
