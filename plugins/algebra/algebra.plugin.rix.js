/**
id: algebra
description: Canonical exact univariate polynomials with verified division and portable synthetic-division Grids.
kind: host
mount: algebra
exports: [Polynomial, Coefficients, Record, Evaluate, Equal, Divide, SyntheticDivide, Quotient, Remainder, IsFactor, Grid]
groups: [Algebra, Exact]
permissions: []
requires: [rix.polynomial@1]
provides: [rix.algebra.division@1]
schemas: [rix.algebra.division@1]
snapshot: false
deterministic: true
defaultEnabled: false
**/

import { Integer } from "@ratmath/core";
import {
    createPolynomial,
    dividePolynomials,
    divisionGrid,
    divisionQuotient,
    divisionRemainder,
    divisorIsFactor,
    equalPolynomials,
    evaluatePolynomial,
    installPolynomialDivisionOperators,
    polynomialCoefficients,
    polynomialRecord,
    registerAlgebraMethods,
    syntheticDivide,
} from "./algebra.js";

const HELPERS = new Map([
    ["Polynomial", createPolynomial],
    ["Coefficients", polynomialCoefficients],
    ["Record", polynomialRecord],
    ["Evaluate", evaluatePolynomial],
    ["Equal", equalPolynomials],
    ["Divide", dividePolynomials],
    ["SyntheticDivide", syntheticDivide],
    ["Quotient", divisionQuotient],
    ["Remainder", divisionRemainder],
    ["IsFactor", divisorIsFactor],
    ["Grid", divisionGrid],
]);

export function createAlgebraPluginCollection() {
    const entries = new Map();
    const extension = new Map([["immutable", new Integer(1n)]]);
    for (const [name, helper] of HELPERS) {
        entries.set(name, helper);
        entries.set(name.toUpperCase(), helper);
        extension.set(name.toUpperCase(), { type: "method_builtin", name, impl: (args, context, evaluate) => helper(args.slice(1), context, evaluate) });
    }
    return { type: "map", entries, _ext: extension };
}

export function install({ systemContext, registry, metadata = {} }) {
    const collection = createAlgebraPluginCollection();
    systemContext.registerHostValue("algebra", collection, {
        doc: "Canonical exact univariate polynomials and verified transformations",
        groups: ["Algebra", "Exact"],
    });
    registerAlgebraMethods(systemContext, { pluginId: metadata.id || "algebra", mount: metadata.mount || "algebra" });
    installPolynomialDivisionOperators(registry);
    return collection;
}

export const installAlgebraPlugin = (systemContext) => install({ systemContext });
