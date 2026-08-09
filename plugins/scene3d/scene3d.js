/** Host-neutral retained 3D scene values and deterministic wireframe snapshots. */

import { Integer, Rational } from "@ratmath/core";
import { createCircle, createGraphic, createPath } from "../../src/runtime/output.js";

export const SCENE3D_SCHEMA = "rix.scene3d@1";

const int = (value) => new Integer(BigInt(value));
const str = (value) => ({ type: "string", value: String(value) });
const seq = (values) => ({ type: "sequence", values });
const rixMap = (entries) => ({ type: "map", entries: new Map(entries) });

export function sequence(value, label) {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.values)) return value.values;
    if (Array.isArray(value?.elements)) return value.elements;
    throw new Error(`${label} must be a sequence`);
}

export function entriesFor(args, positional, name) {
    if (args.length === 1 && args[0]?.type === "map" && args[0].entries instanceof Map) return args[0].entries;
    if (args.length > positional.length) throw new Error(`${name} received too many arguments`);
    const entries = new Map(positional.slice(0, args.length).map((key, index) => [key, args[index]]));
    const options = entries.get("options");
    if (options?.type === "map" && options.entries instanceof Map) {
        for (const [key, value] of options.entries) if (!entries.has(key)) entries.set(key, value);
    }
    return entries;
}

export function field(entries, name, fallback = null) {
    if (!(entries instanceof Map)) return fallback;
    if (entries.has(name)) return entries.get(name);
    const key = [...entries.keys()].find((candidate) => String(candidate).toLowerCase() === String(name).toLowerCase());
    return key === undefined ? fallback : entries.get(key);
}

export function numeric(value, label) {
    let result;
    if (value instanceof Integer) result = Number(value.value);
    else if (value instanceof Rational) result = Number(value.numerator) / Number(value.denominator);
    else if (typeof value === "number") result = value;
    else if (typeof value === "bigint") result = Number(value);
    else throw new Error(`${label} must be numeric`);
    if (!Number.isFinite(result)) throw new Error(`${label} must be finite`);
    return result;
}

export function exact(value, label) {
    if (value instanceof Integer || value instanceof Rational) return value;
    throw new Error(`${label} must be an exact integer or rational`);
}

function integer(value, label) {
    if (value instanceof Integer) return Number(value.value);
    if (value instanceof Rational && value.denominator === 1n) return Number(value.numerator);
    if (typeof value === "number" && Number.isInteger(value)) return value;
    throw new Error(`${label} must be an integer`);
}

function truthy(value, fallback = false) {
    if (value === null || value === undefined) return fallback;
    if (value instanceof Integer) return value.value !== 0n;
    if (value instanceof Rational) return value.numerator !== 0n;
    return Boolean(value);
}

function text(value, fallback = null) {
    if (value?.type === "string") return value.value;
    return typeof value === "string" ? value : fallback;
}

export function exactVector(value, dimension, label) {
    const values = sequence(value, label);
    if (values.length !== dimension) throw new Error(`${label} must contain ${dimension} coordinates`);
    return Object.freeze(values.map((item, index) => exact(item, `${label} coordinate ${index + 1}`)));
}

function indexTriples(value, vertexCount, label) {
    return Object.freeze(sequence(value, label).map((triangle, triangleIndex) => {
        const values = sequence(triangle, `${label} ${triangleIndex + 1}`);
        if (values.length !== 3) throw new Error(`${label} ${triangleIndex + 1} must contain three indices`);
        const result = values.map((item, index) => integer(item, `${label} ${triangleIndex + 1} index ${index + 1}`));
        if (result.some((item) => item < 1 || item > vertexCount)) {
            throw new Error(`${label} ${triangleIndex + 1} indices must be between 1 and ${vertexCount}`);
        }
        return Object.freeze(result.map((item) => item - 1));
    }));
}

function sceneValue(kind, fields = {}) {
    return Object.freeze({
        type: kind === "scene" ? "output" : "scene3d_node",
        kind: kind === "scene" ? "scene3d" : kind,
        schema: SCENE3D_SCHEMA,
        ...fields,
        _ext: new Map([
            ["_type", str(kind === "scene" ? "output" : "scene3d_node")],
            ["kind", str(kind === "scene" ? "scene3d" : kind)],
            ["immutable", int(1)],
        ]),
    });
}

export function isScene3D(value) {
    return Boolean(value?.type === "output" && value.kind === "scene3d" && value.schema === SCENE3D_SCHEMA);
}

export function isScene3DNode(value) {
    return Boolean(value?.type === "scene3d_node" && value.schema === SCENE3D_SCHEMA);
}

function validateNode(value, label) {
    if (!isScene3DNode(value)) throw new Error(`${label} must be a Scene3D node`);
    return value;
}

function normalizeChildren(value, label) {
    return Object.freeze(sequence(value, label).map((child, index) => validateNode(child, `${label} ${index + 1}`)));
}

function styleOptions(entries) {
    const material = field(entries, "material");
    const materialEntries = material?.type === "scene3d_node" && material.kind === "material"
        ? material.values
        : material?.type === "map" && material.entries instanceof Map ? material.entries : new Map();
    const color = text(field(entries, "color"), text(field(materialEntries, "color"), "#275dad"));
    const width = field(entries, "width", field(materialEntries, "width", int(1)));
    const opacity = field(entries, "opacity", field(materialEntries, "opacity", int(1)));
    return Object.freeze({ color, width, opacity, material: material ?? null });
}

export function createMaterial(args) {
    const entries = entriesFor(args, ["color", "opacity", "width"], "scene3d.Material");
    const color = text(field(entries, "color"), "#275dad");
    const opacity = field(entries, "opacity", int(1));
    const width = field(entries, "width", int(1));
    numeric(opacity, "scene3d.Material opacity");
    numeric(width, "scene3d.Material width");
    return sceneValue("material", { values: new Map([["color", str(color)], ["opacity", opacity], ["width", width]]) });
}

function lightOptions(entries, name) {
    const color = text(field(entries, "color"), "#ffffff");
    const intensity = field(entries, "intensity", int(1));
    if (numeric(intensity, `${name} intensity`) < 0) throw new Error(`${name} intensity must be nonnegative`);
    if (!/^#[0-9a-f]{6}$/i.test(color) && !/^#[0-9a-f]{3}$/i.test(color)) {
        throw new Error(`${name} color must be a three- or six-digit hexadecimal color`);
    }
    return { color, intensity };
}

export function createAmbientLight(args) {
    const entries = entriesFor(args, ["color", "intensity"], "scene3d.AmbientLight");
    return sceneValue("ambient_light", lightOptions(entries, "scene3d.AmbientLight"));
}

export function createDirectionalLight(args) {
    const entries = entriesFor(args, ["direction", "options"], "scene3d.DirectionalLight");
    const direction = exactVector(field(entries, "direction"), 3, "scene3d.DirectionalLight direction");
    if (Math.hypot(...direction.map((value, index) => numeric(value, `scene3d.DirectionalLight direction ${index + 1}`))) < 1e-12) {
        throw new Error("scene3d.DirectionalLight direction must not be zero");
    }
    return sceneValue("directional_light", { direction, ...lightOptions(entries, "scene3d.DirectionalLight") });
}

export function createPointLight(args) {
    const entries = entriesFor(args, ["position", "options"], "scene3d.PointLight");
    return sceneValue("point_light", {
        position: exactVector(field(entries, "position"), 3, "scene3d.PointLight position"),
        ...lightOptions(entries, "scene3d.PointLight"),
    });
}

export function createMesh(args) {
    const entries = entriesFor(args, ["vertices", "triangles", "options"], "scene3d.Mesh");
    const vertices = Object.freeze(sequence(field(entries, "vertices"), "scene3d.Mesh vertices")
        .map((vertex, index) => exactVector(vertex, 3, `scene3d.Mesh vertex ${index + 1}`)));
    if (vertices.length === 0) throw new Error("scene3d.Mesh requires at least one vertex");
    const triangles = indexTriples(field(entries, "triangles"), vertices.length, "scene3d.Mesh triangle");
    return sceneValue("mesh", { vertices, triangles, style: styleOptions(entries), metadata: field(entries, "metadata") });
}

export function createPolyline(args) {
    const entries = entriesFor(args, ["points", "options"], "scene3d.Polyline");
    const points = Object.freeze(sequence(field(entries, "points"), "scene3d.Polyline points")
        .map((point, index) => exactVector(point, 3, `scene3d.Polyline point ${index + 1}`)));
    if (points.length < 2) throw new Error("scene3d.Polyline requires at least two points");
    return sceneValue("polyline", {
        points,
        closed: truthy(field(entries, "closed")),
        style: styleOptions(entries),
        metadata: field(entries, "metadata"),
    });
}

export function createPointCloud(args) {
    const entries = entriesFor(args, ["points", "options"], "scene3d.PointCloud");
    const points = Object.freeze(sequence(field(entries, "points"), "scene3d.PointCloud points")
        .map((point, index) => exactVector(point, 3, `scene3d.PointCloud point ${index + 1}`)));
    if (points.length === 0) throw new Error("scene3d.PointCloud requires at least one point");
    return sceneValue("point_cloud", {
        points,
        radius: field(entries, "radius", int(3)),
        style: styleOptions(entries),
        metadata: field(entries, "metadata"),
    });
}

export function createGroup3D(args) {
    const entries = entriesFor(args, ["children", "options"], "scene3d.Group");
    return sceneValue("group", { children: normalizeChildren(field(entries, "children"), "scene3d.Group children"), metadata: field(entries, "metadata") });
}

function identityExact() {
    return [int(1), int(0), int(0), int(0), int(0), int(1), int(0), int(0), int(0), int(0), int(1), int(0), int(0), int(0), int(0), int(1)];
}

export function createTransform3D(args) {
    const entries = entriesFor(args, ["children", "options"], "scene3d.Transform");
    let matrix = identityExact();
    const matrixValue = field(entries, "matrix");
    if (matrixValue !== null) {
        const values = sequence(matrixValue, "scene3d.Transform matrix");
        if (values.length !== 16) throw new Error("scene3d.Transform matrix must contain 16 row-major values");
        matrix = values.map((value, index) => exact(value, `scene3d.Transform matrix value ${index + 1}`));
    }
    const translate = field(entries, "translate");
    if (translate !== null) {
        const vector = exactVector(translate, 3, "scene3d.Transform translate");
        matrix[3] = vector[0]; matrix[7] = vector[1]; matrix[11] = vector[2];
    }
    const scale = field(entries, "scale");
    if (scale !== null) {
        const values = (Array.isArray(scale) || Array.isArray(scale?.values))
            ? exactVector(scale, 3, "scene3d.Transform scale") : [exact(scale, "scene3d.Transform scale"), exact(scale, "scene3d.Transform scale"), exact(scale, "scene3d.Transform scale")];
        matrix[0] = values[0]; matrix[5] = values[1]; matrix[10] = values[2];
    }
    return sceneValue("transform", {
        children: normalizeChildren(field(entries, "children"), "scene3d.Transform children"),
        matrix: Object.freeze(matrix),
        metadata: field(entries, "metadata"),
    });
}

function camera(args, projection) {
    const name = projection === "perspective" ? "scene3d.PerspectiveCamera" : "scene3d.OrthographicCamera";
    const entries = entriesFor(args, ["position", "target", "options"], name);
    return sceneValue("camera", {
        projection,
        position: exactVector(field(entries, "position"), 3, `${name} position`),
        target: exactVector(field(entries, "target"), 3, `${name} target`),
        up: exactVector(field(entries, "up", seq([int(0), int(0), int(1)])), 3, `${name} up`),
        fov: field(entries, "fov", int(50)),
        near: field(entries, "near", new Rational(1n, 100n)),
        far: field(entries, "far", int(1000)),
        scale: field(entries, "scale"),
    });
}

export const createPerspectiveCamera = (args) => camera(args, "perspective");
export const createOrthographicCamera = (args) => camera(args, "orthographic");

export function defaultCamera() {
    return camera([seq([int(4), int(4), int(3)]), seq([int(0), int(0), int(0)])], "perspective");
}

export function createScene3D(args) {
    const entries = entriesFor(args, ["children", "options"], "scene3d.Scene");
    const cameraValue = field(entries, "camera", defaultCamera());
    if (!isScene3DNode(cameraValue) || cameraValue.kind !== "camera") throw new Error("scene3d.Scene camera must be a Scene3D camera");
    const lights = field(entries, "lights") === null ? [] : sequence(field(entries, "lights"), "scene3d.Scene lights");
    for (const [index, light] of lights.entries()) {
        if (!isScene3DNode(light) || !["ambient_light", "directional_light", "point_light"].includes(light.kind)) {
            throw new Error(`scene3d.Scene light ${index + 1} must be a Scene3D light`);
        }
    }
    return sceneValue("scene", {
        children: normalizeChildren(field(entries, "children"), "scene3d.Scene children"),
        camera: cameraValue,
        lights: Object.freeze([...lights]),
        metadata: field(entries, "metadata"),
        coordinateSystem: Object.freeze({ handedness: "right", up: "z", units: "unspecified" }),
    });
}

const identityNumber = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply4(left, right) {
    const result = Array(16).fill(0);
    for (let row = 0; row < 4; row += 1) for (let column = 0; column < 4; column += 1) {
        for (let index = 0; index < 4; index += 1) result[row * 4 + column] += left[row * 4 + index] * right[index * 4 + column];
    }
    return result;
}

function transformPoint(matrix, point) {
    const [x, y, z] = point.map((value, index) => numeric(value, `Scene3D coordinate ${index + 1}`));
    return [
        matrix[0] * x + matrix[1] * y + matrix[2] * z + matrix[3],
        matrix[4] * x + matrix[5] * y + matrix[6] * z + matrix[7],
        matrix[8] * x + matrix[9] * y + matrix[10] * z + matrix[11],
    ];
}

function collectPrimitives(children, parentMatrix = identityNumber(), result = []) {
    for (const child of children) {
        if (child.kind === "group") collectPrimitives(child.children, parentMatrix, result);
        else if (child.kind === "transform") {
            const local = child.matrix.map((value, index) => numeric(value, `Scene3D transform ${index + 1}`));
            collectPrimitives(child.children, multiply4(parentMatrix, local), result);
        } else if (child.kind === "mesh") {
            const vertices = child.vertices.map((point) => transformPoint(parentMatrix, point));
            const edges = new Map();
            for (const [a, b, c] of child.triangles) for (const pair of [[a, b], [b, c], [c, a]]) {
                const ordered = pair[0] < pair[1] ? pair : [pair[1], pair[0]];
                edges.set(`${ordered[0]}:${ordered[1]}`, ordered);
            }
            result.push({ kind: "mesh", points: vertices, segments: [...edges.values()], triangles: child.triangles, style: child.style });
        } else if (child.kind === "polyline") {
            const points = child.points.map((point) => transformPoint(parentMatrix, point));
            const segments = points.slice(1).map((_, index) => [index, index + 1]);
            if (child.closed && points.length > 2) segments.push([points.length - 1, 0]);
            result.push({ kind: "lines", points, segments, style: child.style });
        } else if (child.kind === "point_cloud") {
            result.push({ kind: "points", points: child.points.map((point) => transformPoint(parentMatrix, point)), radius: child.radius, style: child.style });
        } else if (child.kind !== "material" && child.kind !== "camera") {
            throw new Error(`Unsupported Scene3D node '${child.kind}'`);
        }
    }
    return result;
}

export function flattenScene3D(scene) {
    if (!isScene3D(scene)) throw new Error("Expected a Scene3D scene");
    return collectPrimitives(scene.children);
}

const subtract = (a, b) => a.map((value, index) => value - b[index]);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function normalize(value, label) {
    const length = Math.hypot(...value);
    if (length < 1e-12) throw new Error(`${label} must not be zero or collinear with the view direction`);
    return value.map((entry) => entry / length);
}

function cameraFrame(cameraValue) {
    const position = cameraValue.position.map((value, index) => numeric(value, `Camera position ${index + 1}`));
    const target = cameraValue.target.map((value, index) => numeric(value, `Camera target ${index + 1}`));
    const upHint = cameraValue.up.map((value, index) => numeric(value, `Camera up ${index + 1}`));
    const forward = normalize(subtract(target, position), "Camera view direction");
    const right = normalize(cross(forward, upHint), "Camera up vector");
    const up = cross(right, forward);
    return { position, forward, right, up };
}

function cameraPoint(point, frame) {
    const delta = subtract(point, frame.position);
    return [dot(delta, frame.right), dot(delta, frame.up), dot(delta, frame.forward)];
}

function clipDepth(a, b, near, far) {
    let start = a; let end = b;
    if ((start[2] < near && end[2] < near) || (start[2] > far && end[2] > far)) return null;
    for (const plane of [near, far]) {
        const below = plane === near ? (point) => point[2] < plane : (point) => point[2] > plane;
        if (below(start) !== below(end)) {
            const t = (plane - start[2]) / (end[2] - start[2]);
            const cut = start.map((value, index) => value + (end[index] - value) * t);
            if (below(start)) start = cut; else end = cut;
        }
    }
    return [start, end];
}

function styleMap(style, fill = false) {
    return rixMap([
        [fill ? "fill" : "stroke", str(style.color)],
        [fill ? "stroke" : "fill", str(fill ? style.color : "none")],
        ["width", style.width],
        ["opacity", style.opacity],
    ]);
}

function rgb(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color) && !/^#[0-9a-f]{3}$/i.test(color)) {
        throw new Error("Scene3D lit snapshots require hexadecimal material colors");
    }
    const source = color.length === 4
        ? color.slice(1).split("").map((digit) => digit + digit).join("")
        : color.slice(1);
    return [0, 2, 4].map((offset) => Number.parseInt(source.slice(offset, offset + 2), 16));
}

function hex(values) {
    return `#${values.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
}

function litMeshColor(style, triangle, lights) {
    const edge1 = subtract(triangle[1], triangle[0]);
    const edge2 = subtract(triangle[2], triangle[0]);
    const normal = normalize(cross(edge1, edge2), "Scene3D triangle");
    const center = [0, 1, 2].map((index) => triangle.reduce((sum, point) => sum + point[index], 0) / 3);
    const illumination = [0, 0, 0];
    const activeLights = lights.length ? lights : [{ kind: "ambient_light", color: "#ffffff", intensity: int(1) }];
    for (const light of activeLights) {
        let factor = numeric(light.intensity, "Scene3D light intensity");
        if (light.kind === "directional_light") {
            const direction = normalize(light.direction.map((value, index) => -numeric(value, `Directional light direction ${index + 1}`)), "Directional light direction");
            factor *= Math.abs(dot(normal, direction));
        } else if (light.kind === "point_light") {
            const position = light.position.map((value, index) => numeric(value, `Point light position ${index + 1}`));
            factor *= Math.abs(dot(normal, normalize(subtract(position, center), "Point light position")));
        }
        const lightRgb = rgb(light.color);
        for (let index = 0; index < 3; index += 1) illumination[index] += factor * lightRgb[index] / 255;
    }
    const base = rgb(style.color);
    return hex(base.map((value, index) => value * Math.min(1, illumination[index])));
}

export function snapshotScene3D(args) {
    const entries = entriesFor(args, ["scene", "options"], "scene3d.Snapshot");
    const scene = field(entries, "scene");
    if (!isScene3D(scene)) throw new Error("scene3d.Snapshot requires a Scene3D scene");
    const mode = text(field(entries, "mode"), "wireframe");
    if (!["wireframe", "lit"].includes(mode)) throw new Error("scene3d.Snapshot mode must be 'wireframe' or 'lit'");
    const sizeValue = field(entries, "size", seq([int(640), int(480)]));
    const [width, height] = sequence(sizeValue, "scene3d.Snapshot size").map((value, index) => numeric(value, `scene3d.Snapshot size ${index + 1}`));
    if (width <= 0 || height <= 0) throw new Error("scene3d.Snapshot size must be positive");
    const cameraValue = field(entries, "camera", scene.camera);
    if (!isScene3DNode(cameraValue) || cameraValue.kind !== "camera") throw new Error("scene3d.Snapshot camera must be a Scene3D camera");
    const primitives = flattenScene3D(scene);
    const frame = cameraFrame(cameraValue);
    const near = numeric(cameraValue.near, "Camera near plane");
    const far = numeric(cameraValue.far, "Camera far plane");
    if (!(near > 0 && far > near)) throw new Error("Camera requires 0 < near < far");
    const cameraPrimitives = primitives.map((primitive) => ({ ...primitive, points: primitive.points.map((point) => cameraPoint(point, frame)) }));
    const aspect = width / height;
    let project;
    if (cameraValue.projection === "perspective") {
        const fov = numeric(cameraValue.fov, "Camera field of view");
        if (!(fov > 0 && fov < 180)) throw new Error("Perspective camera fov must be between 0 and 180 degrees");
        const focal = 1 / Math.tan(fov * Math.PI / 360);
        project = ([x, y, depth]) => [(1 + x * focal / (depth * aspect)) * width / 2, (1 - y * focal / depth) * height / 2];
    } else {
        const all = cameraPrimitives.flatMap((primitive) => primitive.points);
        const centerX = all.length ? (Math.min(...all.map((point) => point[0])) + Math.max(...all.map((point) => point[0]))) / 2 : 0;
        const centerY = all.length ? (Math.min(...all.map((point) => point[1])) + Math.max(...all.map((point) => point[1]))) / 2 : 0;
        const requested = cameraValue.scale === null ? null : numeric(cameraValue.scale, "Orthographic camera scale");
        const spanX = all.length ? Math.max(...all.map((point) => point[0])) - Math.min(...all.map((point) => point[0])) : 1;
        const spanY = all.length ? Math.max(...all.map((point) => point[1])) - Math.min(...all.map((point) => point[1])) : 1;
        const vertical = requested ?? Math.max(spanY, spanX / aspect, 1) * 1.12;
        project = ([x, y]) => [width / 2 + (x - centerX) * height / vertical, height / 2 - (y - centerY) * height / vertical];
    }
    const children = [];
    let segmentCount = 0;
    let pointCount = 0;
    let faceCount = 0;
    if (mode === "lit") {
        const faces = cameraPrimitives.flatMap((primitive) => {
            if (primitive.kind !== "mesh") return [];
            return primitive.triangles.map((indices) => {
                const points = indices.map((index) => primitive.points[index]);
                return { points, style: primitive.style, depth: points.reduce((sum, point) => sum + point[2], 0) / 3 };
            }).filter(({ points }) => points.every((point) => point[2] >= near && point[2] <= far));
        }).sort((left, right) => right.depth - left.depth);
        for (const face of faces) {
            const worldPoints = face.points.map((point) => {
                const delta = [
                    frame.right[0] * point[0] + frame.up[0] * point[1] + frame.forward[0] * point[2],
                    frame.right[1] * point[0] + frame.up[1] * point[1] + frame.forward[1] * point[2],
                    frame.right[2] * point[0] + frame.up[2] * point[1] + frame.forward[2] * point[2],
                ];
                return delta.map((value, index) => value + frame.position[index]);
            });
            children.push(createPath([face.points.map(project), styleMap({ ...face.style, color: litMeshColor(face.style, worldPoints, scene.lights) }, true)]));
            faceCount += 1;
        }
    }
    for (const primitive of cameraPrimitives) {
        if (primitive.kind === "lines" || (primitive.kind === "mesh" && mode === "wireframe")) for (const [aIndex, bIndex] of primitive.segments) {
            let endpoints = [primitive.points[aIndex], primitive.points[bIndex]];
            endpoints = clipDepth(endpoints[0], endpoints[1], near, far);
            if (!endpoints) continue;
            children.push(createPath([[project(endpoints[0]), project(endpoints[1])], styleMap(primitive.style)]));
            segmentCount += 1;
        } else if (primitive.kind === "points") {
            const radius = numeric(primitive.radius, "PointCloud radius");
            for (const point of primitive.points) {
                if (point[2] < near || point[2] > far) continue;
                children.push(createCircle([project(point), radius, styleMap(primitive.style, true)]));
                pointCount += 1;
            }
        }
    }
    const graphic = createGraphic([[width, height], children, rixMap([["schema", str("rix.graphics@1")], ["source", str(SCENE3D_SCHEMA)], ["mode", str(mode)]])]);
    const diagnostics = mode === "wireframe" && scene.lights.length > 0
        ? [rixMap([["level", str("info")], ["code", str("scene3d-wireframe-ignores-lights")], ["message", str("Wireframe snapshots do not evaluate Scene3D lights.")]])]
        : [];
    return rixMap([
        ["value", graphic],
        ["resolved", int(1)],
        ["uncertainty", seq([])],
        ["work", rixMap([["primitives", int(primitives.length)], ["segments", int(segmentCount)], ["faces", int(faceCount)], ["points", int(pointCount)]])],
        ["source", rixMap([["schema", str(SCENE3D_SCHEMA)], ["projection", str(cameraValue.projection)], ["mode", str(mode)]])],
        ["diagnostics", seq(diagnostics)],
    ]);
}
