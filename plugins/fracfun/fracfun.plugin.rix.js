/**
id: fracfun
description: Form-preserving callable polynomial and rational expressions with explicit transformations and canonical projections.
kind: host
mount: fracfun
aliases: [fractionFunction, ff]
exports: [FractionFunction, Parse, Var, Fun]
groups: [Algebra, Exact, Symbolic]
permissions: []
requires: [rix.fraction@1, rix.rational-function@1]
provides: [rix.fraction-function@1]
schemas: [rix.fraction-function@1]
snapshot: false
deterministic: true
defaultEnabled: false
**/

import {
    createFracfunPluginValue,
    createFractionFunction,
    installFractionFunctionOperators,
    registerFractionFunctionMethods,
} from "./fraction-function.js";

export function install({ systemContext, registry, metadata = {}, options = {} }) {
    const value = createFracfunPluginValue();
    const mount = options.as || metadata.mount || "fracfun";
    systemContext.registerHostCallableValue(mount, value, {
        impl: (args, context, evaluate) => createFractionFunction(args, context, evaluate),
        pure: true,
        doc: "Construct a callable form-preserving FractionFunction",
    }, {
        doc: metadata.description || "Form-preserving polynomial and rational expressions",
        groups: metadata.groups || ["Algebra", "Exact", "Symbolic"],
        pluginId: metadata.id || "fracfun",
    });
    registerFractionFunctionMethods(systemContext, { pluginId: metadata.id || "fracfun", mount });
    installFractionFunctionOperators(registry);
    return value;
}
