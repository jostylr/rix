/** Browser-safe glTF 2.0 JSON exporter for retained Scene3D values. */

import { flattenScene3D, isScene3D, SCENE3D_SCHEMA } from "../scene3d/scene3d.js";
import { diagnostic } from "../renderers/common.js";

function rgba(color, opacity = 1) {
    const match = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(color || "");
    if (!match) return [0.153, 0.365, 0.678, opacity];
    const hex = match[1].length === 3 ? [...match[1]].map((item) => item + item).join("") : match[1];
    return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255).concat(opacity);
}

function zUpToYUp([x, y, z]) {
    return [x, z, -y];
}

function align4(value) {
    return (value + 3) & ~3;
}

function base64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunk) {
        binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunk)));
    }
    if (typeof btoa === "function") return btoa(binary);
    throw new Error("This host does not provide browser-compatible base64 encoding");
}

function encodeBuffer(chunks) {
    const total = chunks.reduce((size, chunk) => align4(size) + chunk.byteLength, 0);
    const bytes = new Uint8Array(align4(total));
    const views = [];
    let offset = 0;
    for (const chunk of chunks) {
        offset = align4(offset);
        bytes.set(chunk, offset);
        views.push({ byteOffset: offset, byteLength: chunk.byteLength });
        offset += chunk.byteLength;
    }
    return { bytes, views };
}

function floatBytes(values) {
    const bytes = new Uint8Array(values.length * 4);
    const view = new DataView(bytes.buffer);
    values.forEach((value, index) => view.setFloat32(index * 4, value, true));
    return bytes;
}

function uintBytes(values) {
    const bytes = new Uint8Array(values.length * 4);
    const view = new DataView(bytes.buffer);
    values.forEach((value, index) => view.setUint32(index * 4, value, true));
    return bytes;
}

export function exportSceneGltf(scene, { pretty = true } = {}) {
    if (!isScene3D(scene)) throw new Error("gltf accepts a Scene3D scene");
    const primitives = flattenScene3D(scene);
    const chunks = [];
    const records = [];
    let approximated = false;
    for (const primitive of primitives) {
        const positions = primitive.points.map(zUpToYUp);
        if (positions.some((point) => point.some((value) => Math.fround(value) !== value))) approximated = true;
        const flatPositions = positions.flat();
        let indices;
        let mode;
        if (primitive.kind === "mesh") {
            indices = primitive.triangles.flat();
            mode = 4;
        } else if (primitive.kind === "lines") {
            indices = primitive.segments.flat();
            mode = 1;
        } else {
            indices = positions.map((_, index) => index);
            mode = 0;
        }
        const positionChunk = chunks.push(floatBytes(flatPositions)) - 1;
        const indexChunk = chunks.push(uintBytes(indices)) - 1;
        records.push({ primitive, positions, indices, mode, positionChunk, indexChunk });
    }
    const encoded = encodeBuffer(chunks);
    const gltf = {
        asset: { version: "2.0", generator: "RiX glTF renderer" },
        scene: 0,
        scenes: [{ name: "RiX Scene3D", nodes: records.map((_, index) => index) }],
        nodes: records.map((_, index) => ({ name: `RiX primitive ${index + 1}`, mesh: index })),
        meshes: [],
        materials: [],
        accessors: [],
        bufferViews: encoded.views.map((view) => ({ buffer: 0, ...view })),
        buffers: [{ byteLength: encoded.bytes.byteLength, uri: `data:application/octet-stream;base64,${base64(encoded.bytes)}` }],
        extras: {
            rix: { schema: SCENE3D_SCHEMA, sourceCoordinates: "right-handed Z-up", exportedCoordinates: "right-handed Y-up" },
        },
    };
    records.forEach((record, index) => {
        const style = record.primitive.style;
        const opacity = Number(style?.opacity?.value ?? style?.opacity?.numerator ?? style?.opacity ?? 1)
            / Number(style?.opacity?.denominator ?? 1);
        const material = gltf.materials.push({
            name: `RiX material ${index + 1}`,
            pbrMetallicRoughness: { baseColorFactor: rgba(style?.color, opacity), metallicFactor: 0, roughnessFactor: 1 },
            alphaMode: opacity < 1 ? "BLEND" : "OPAQUE",
            doubleSided: true,
        }) - 1;
        const xs = record.positions.map((point) => point[0]);
        const ys = record.positions.map((point) => point[1]);
        const zs = record.positions.map((point) => point[2]);
        const positionAccessor = gltf.accessors.push({
            bufferView: record.positionChunk,
            componentType: 5126,
            count: record.positions.length,
            type: "VEC3",
            min: [Math.min(...xs), Math.min(...ys), Math.min(...zs)],
            max: [Math.max(...xs), Math.max(...ys), Math.max(...zs)],
        }) - 1;
        const indexAccessor = gltf.accessors.push({
            bufferView: record.indexChunk,
            componentType: 5125,
            count: record.indices.length,
            type: "SCALAR",
            min: record.indices.length ? [Math.min(...record.indices)] : [0],
            max: record.indices.length ? [Math.max(...record.indices)] : [0],
        }) - 1;
        gltf.meshes.push({
            name: `RiX mesh ${index + 1}`,
            primitives: [{ attributes: { POSITION: positionAccessor }, indices: indexAccessor, material, mode: record.mode }],
        });
    });
    const diagnostics = [];
    if (approximated) diagnostics.push(diagnostic(
        "gltf-float32-approximation",
        "Exact Scene3D coordinates were rounded to glTF Float32 positions at export.",
    ));
    if (primitives.some((primitive) => primitive.kind === "lines")) diagnostics.push(diagnostic(
        "gltf-line-width-portability",
        "glTF line primitives do not portably preserve Scene3D line widths.",
        "info",
    ));
    if (scene.lights.length) diagnostics.push(diagnostic(
        "gltf-lights-not-exported",
        "Scene3D lights are retained by the scene but are not exported in glTF phase 1.",
        "info",
    ));
    return { content: `${JSON.stringify(gltf, null, pretty ? 2 : 0)}\n`, diagnostics, metadata: { schema: "model/gltf+json", primitives: records.length } };
}

