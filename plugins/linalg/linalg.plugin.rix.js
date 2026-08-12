/**
id: linalg
description: Exact dense linear algebra and coordinate-aware tensor transformations.
kind: host
mount: linalg
exports: [Rref, Rank, Determinant, Inverse, Solve, VectorSpace, Coordinates, CoordinateTensor, Vector, ChangeMatrix, Transform, Transform!, Components, SameTensor]
groups: [LinearAlgebra, Exact]
permissions: []
provides: [rix.linear-algebra@1, rix.coordinate-tensor@1]
schemas: [rix.linalg.result@1, rix.linalg.vector-space@1, rix.linalg.coordinates@1, rix.linalg.coordinate-tensor@1]
snapshot: false
deterministic: true
defaultEnabled: false
**/

import { Integer } from "@ratmath/core";
import { helpers } from "./linalg.js";

export function createLinalgPluginCollection() {
    const entries = new Map();
    // The namespace exposes Transform! as an explicitly mutating operation on
    // its coordinate-tensor argument. RiX's bang-call guard checks the receiver
    // namespace, so the namespace must advertise mutability even though the
    // helper never mutates the namespace itself.
    const extension = new Map([["_mutable", new Integer(1n)]]);
    for (const [name, helper] of helpers) {
        entries.set(name, helper);
        entries.set(name.toUpperCase(), helper);
        extension.set(name.toUpperCase(), {
            type: "method_builtin",
            name,
            impl: (args, context, evaluate, invoke) => helper(args.slice(1), { context, evaluate, invoke }),
        });
    }
    return { type: "map", entries, _ext: extension };
}

export function install({ systemContext }) {
    const collection = createLinalgPluginCollection();
    systemContext.registerHostValue("linalg", collection, {
        doc: "Exact dense linear algebra and coordinate-aware tensors",
        groups: ["LinearAlgebra", "Exact"],
    });
    return collection;
}
