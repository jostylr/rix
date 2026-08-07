/**
id: scene3d
description: Exact retained 3D scenes with deterministic wireframe Graphics snapshots.
kind: host
mount: scene3d
exports: [Scene, Group, Transform, Mesh, Polyline, PointCloud, Material, PerspectiveCamera, OrthographicCamera, Snapshot]
groups: [Scene3D, Graphics]
permissions: []
provides: [rix.scene3d@1]
schemas: [rix.scene3d@1]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { Integer } from "@ratmath/core";
import {
    createGroup3D,
    createMaterial,
    createMesh,
    createOrthographicCamera,
    createPerspectiveCamera,
    createPointCloud,
    createPolyline,
    createScene3D,
    createTransform3D,
    snapshotScene3D,
} from "./scene3d.js";

const HELPERS = new Map([
    ["Scene", createScene3D],
    ["Group", createGroup3D],
    ["Transform", createTransform3D],
    ["Mesh", createMesh],
    ["Polyline", createPolyline],
    ["PointCloud", createPointCloud],
    ["Material", createMaterial],
    ["PerspectiveCamera", createPerspectiveCamera],
    ["OrthographicCamera", createOrthographicCamera],
    ["Snapshot", snapshotScene3D],
]);

export function createScene3DPluginCollection() {
    const entries = new Map();
    const extension = new Map([["immutable", new Integer(1n)]]);
    for (const [name, helper] of HELPERS) {
        entries.set(name, helper);
        entries.set(name.toUpperCase(), helper);
        extension.set(name.toUpperCase(), { type: "method_builtin", name, impl: (args) => helper(args.slice(1)) });
    }
    return { type: "map", entries, _ext: extension };
}

export function install({ systemContext }) {
    const collection = createScene3DPluginCollection();
    systemContext.registerHostValue("scene3d", collection, {
        doc: "Exact retained 3D scenes and deterministic wireframe snapshots",
        groups: ["Scene3D", "Graphics"],
    });
    return collection;
}

