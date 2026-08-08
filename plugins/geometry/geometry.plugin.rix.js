/**
id: geometry
description: Exact ruler-and-compass geometry with explicit intersections and portable Graphics snapshots.
kind: host
mount: geometry
exports: [Point, Line, Circle, Midpoint, PerpendicularBisector, Circumcircle, Intersect, Points, Status, Draw]
groups: [Geometry, Graphics, Exact]
permissions: []
provides: [rix.geometry@1, rix.geometry.intersection@1]
schemas: [rix.geometry@1, rix.geometry.intersection@1]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import { Integer } from "@ratmath/core";
import {
    circumcircle,
    createGeometryCircle,
    createLine,
    createPoint,
    drawGeometry,
    intersect,
    intersectionPoints,
    intersectionStatus,
    midpoint,
    perpendicularBisector,
} from "./geometry.js";

const HELPERS = new Map([
    ["Point", createPoint],
    ["Line", createLine],
    ["Circle", createGeometryCircle],
    ["Midpoint", midpoint],
    ["PerpendicularBisector", perpendicularBisector],
    ["Circumcircle", circumcircle],
    ["Intersect", intersect],
    ["Points", intersectionPoints],
    ["Status", intersectionStatus],
    ["Draw", drawGeometry],
]);

export function createGeometryPluginCollection() {
    const entries = new Map();
    const extension = new Map([["immutable", new Integer(1n)]]);
    for (const [name, helper] of HELPERS) {
        entries.set(name, helper);
        entries.set(name.toUpperCase(), helper);
        extension.set(name.toUpperCase(), {
            type: "method_builtin",
            name,
            impl: (args) => helper(args.slice(1)),
        });
    }
    return { type: "map", entries, _ext: extension };
}

export function install({ systemContext }) {
    const collection = createGeometryPluginCollection();
    systemContext.registerHostValue("geometry", collection, {
        doc: "Exact ruler-and-compass geometry and portable Graphics snapshots",
        groups: ["Geometry", "Graphics", "Exact"],
    });
    return collection;
}

export const installGeometryPlugin = (systemContext) => install({ systemContext });
