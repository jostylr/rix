/**
id: poly
description: Semantic callable univariate polynomials with structural and symbolic entry forms.
kind: host
mount: poly
aliases: [polynomial, p]
exports: [Polynomial, Parse, Var, Fun]
groups: [Algebra, Exact, Symbolic]
permissions: []
provides: [rix.polynomial@1]
schemas: [rix.polynomial@1]
snapshot: false
deterministic: true
defaultEnabled: false
**/

import {
    createPolyPluginValue,
    createPolynomial,
    installPolynomialOperators,
    registerPolynomialMethods,
} from "./polynomial.js";

export function install({ systemContext, registry, metadata = {}, options = {} }) {
    const value = createPolyPluginValue();
    const mount = options.as || metadata.mount || "poly";
    systemContext.registerHostCallableValue(mount, value, {
        impl: (args, context) => createPolynomial(args, context),
        pure: true,
        doc: "Construct a semantic callable Polynomial from coefficients, structural arithmetic, or a symbolic spec",
    }, {
        doc: metadata.description || "Semantic callable univariate polynomials",
        groups: metadata.groups || ["Algebra", "Exact", "Symbolic"],
        pluginId: metadata.id || "poly",
    });
    registerPolynomialMethods(systemContext, { pluginId: metadata.id || "poly", mount });
    installPolynomialOperators(registry);
    return value;
}
