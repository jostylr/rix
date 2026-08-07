/**
id: nd
description: Exact n-dimensional geometry with explicit affine and Cayley projection records.
kind: host
mount: nd
exports: [Point, Polyline, Polytope, Hypercube, Projection, CoordinateProjection, CayleyRotation, Compose, Project, ToScene3D]
groups: [Geometry, Scene3D, Exact]
permissions: []
requires: [rix.scene3d@1]
provides: [rix.nd@1, rix.nd.projection@1]
schemas: [rix.nd@1, rix.nd.projection@1]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { Integer } from "@ratmath/core";
import {
    cayleyRotation,
    composeProjections,
    coordinateProjection,
    createNdPoint,
    createNdPolyline,
    createNdPolytope,
    createProjection,
    hypercube,
    projectGeometry,
    toScene3D,
} from "./nd.js";

const HELPERS = new Map([
    ["Point", createNdPoint], ["Polyline", createNdPolyline], ["Polytope", createNdPolytope],
    ["Hypercube", hypercube], ["Projection", createProjection], ["CoordinateProjection", coordinateProjection],
    ["CayleyRotation", cayleyRotation], ["Compose", composeProjections], ["Project", projectGeometry],
    ["ToScene3D", toScene3D],
]);

export function createNdPluginCollection() {
    const entries = new Map();
    const extension = new Map([["immutable", new Integer(1n)]]);
    for (const [name, helper] of HELPERS) {
        entries.set(name, helper); entries.set(name.toUpperCase(), helper);
        extension.set(name.toUpperCase(), { type: "method_builtin", name, impl: (args) => helper(args.slice(1)) });
    }
    return { type: "map", entries, _ext: extension };
}

export function install({ systemContext }) {
    const collection = createNdPluginCollection();
    systemContext.registerHostValue("nd", collection, {
        doc: "Exact n-dimensional geometry and explicit projection records",
        groups: ["Geometry", "Scene3D", "Exact"],
    });
    return collection;
}

