/**
id: solve
description: Exact Phase 1 linear-system classification and symbolic-spec solving.
kind: host
mount: solve
exports: [Classify, Linear, System]
groups: [Solve, Symbolic, Exact]
permissions: []
requires: [rix.linear-algebra@1]
provides: [rix.system-solver@1]
schemas: [rix.solve.system-result@1]
snapshot: false
deterministic: true
defaultEnabled: false
**/

import { Integer } from "@ratmath/core";
import { helpers } from "./solve.js";

export function createSolvePluginCollection() {
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
    const collection = createSolvePluginCollection();
    systemContext.registerHostValue("solve", collection, {
        doc: "Exact linear-system classification and symbolic-spec solving",
        groups: ["Solve", "Symbolic", "Exact"],
    });
    return collection;
}

