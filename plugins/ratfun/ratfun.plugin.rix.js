/**
id: ratfun
description: Canonical callable univariate rational functions with exact cancellation and Polynomial interoperability.
kind: host
mount: ratfun
aliases: [rationalFunction, rf]
exports: [RationalFunction, Parse, Var, Fun]
groups: [Algebra, Exact, Symbolic]
permissions: []
requires: [rix.polynomial@1]
provides: [rix.rational-function@1]
schemas: [rix.rational-function@1]
snapshot: false
deterministic: true
defaultEnabled: false
**/

import {
    createRatfunPluginValue,
    createRationalFunction,
    installRationalFunctionOperators,
    registerRationalFunctionMethods,
} from "./rational-function.js";

export function install({ systemContext, registry, metadata = {}, options = {} }) {
    const value = createRatfunPluginValue();
    const mount = options.as || metadata.mount || "ratfun";
    systemContext.registerHostCallableValue(mount, value, {
        impl: (args, context, evaluate) => createRationalFunction(args, context, evaluate),
        pure: true,
        doc: "Construct a canonical callable RationalFunction from exact polynomials or a rational symbolic expression",
    }, {
        doc: metadata.description || "Canonical callable univariate rational functions",
        groups: metadata.groups || ["Algebra", "Exact", "Symbolic"],
        pluginId: metadata.id || "ratfun",
    });
    registerRationalFunctionMethods(systemContext, { pluginId: metadata.id || "ratfun", mount });
    installRationalFunctionOperators(registry);
    return value;
}
