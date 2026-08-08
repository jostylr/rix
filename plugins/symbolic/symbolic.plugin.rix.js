/**
id: symbolic
description: Meta-plugin loading RiX representation-sensitive Fraction and FractionFunction workspaces.
kind: host
mount: symbolic
exports: [Fraction, FractionFunction, Services]
groups: [Algebra, Exact, Symbolic]
permissions: []
requires: [rix.fraction-function@1]
provides: [rix.symbolic.formal@1]
schemas: []
snapshot: false
deterministic: true
defaultEnabled: false
**/

import { Integer } from "@ratmath/core";
import { createFraction } from "../fraction/fraction.js";
import { createFractionFunction } from "../fracfun/fraction-function.js";

const str = (value) => ({ type: "string", value: String(value) });
const method = (name, impl) => ({ type: "method_builtin", name, impl });

export function install({ systemContext, metadata = {} }) {
    const fraction = (args) => createFraction(args);
    const fractionFunction = (args, context, evaluate) => createFractionFunction(args, context, evaluate);
    const value = {
        type: "symbolic_plugin",
        entries: new Map([
            ["Fraction", fraction], ["FRACTION", fraction],
            ["FractionFunction", fractionFunction], ["FRACTIONFUNCTION", fractionFunction],
            ["Services", { type: "sequence", values: [str("fraction"), str("fracfun"), str("poly"), str("ratfun")] }],
        ]),
        _ext: new Map([
            ["FRACTION", method("Fraction", ([, ...args]) => createFraction(args))],
            ["FRACTIONFUNCTION", method("FractionFunction", ([, ...args], context, evaluate) => createFractionFunction(args, context, evaluate))],
            ["SERVICES", method("Services", () => ({
                type: "sequence", values: [str("fraction"), str("fracfun"), str("poly"), str("ratfun")],
            }))],
            ["immutable", new Integer(1n)],
        ]),
    };
    systemContext.registerHostValue("symbolic", value, {
        doc: metadata.description || "Representation-sensitive symbolic workspace",
        groups: metadata.groups || ["Algebra", "Exact", "Symbolic"],
        pluginId: metadata.id || "symbolic",
    });
    return value;
}
