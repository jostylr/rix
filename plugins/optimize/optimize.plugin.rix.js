/**
id: optimize
description: Exact linear-program models and deterministic Phase 1 simplex optimization.
kind: host
mount: optimize
exports: [LinearProgram, Solve, Evaluate, Maximize, Minimize]
groups: [Optimization, Exact]
permissions: []
requires: [rix.linear-algebra@1]
provides: [rix.optimization@1, rix.linear-program@1]
schemas: [rix.optimize.linear-program@1, rix.optimize.result@1]
snapshot: false
deterministic: true
defaultEnabled: false
**/

import { Integer } from "@ratmath/core";
import { helpers } from "./optimize.js";

export function createOptimizePluginCollection() {
    const entries = new Map();
    const extension = new Map([["immutable", new Integer(1n)]]);
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
    const collection = createOptimizePluginCollection();
    systemContext.registerHostValue("optimize", collection, {
        doc: "Exact linear programs and deterministic simplex optimization",
        groups: ["Optimization", "Exact"],
    });
    return collection;
}

