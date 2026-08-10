/**
 * JavaScript host installer retained for comparison with the executable
 * pure-RiX plugin in fraction.plugin.rix.
 *
id: fraction
description: Representation-sensitive unreduced integer fractions with mediant and classroom addition policies.
kind: host
mount: fraction
aliases: [frac, f]
exports: [Fraction, Parse, FromSternBrocotPath]
groups: [Algebra, Exact, Symbolic]
permissions: []
provides: [rix.fraction@1]
schemas: [rix.fraction@1]
snapshot: true
deterministic: true
defaultEnabled: false
**/

import {
    createFraction,
    createFractionPluginValue,
    installFractionOperators,
    registerFractionMethods,
} from "./fraction.js";

export function install({ systemContext, registry, metadata = {}, options = {} }) {
    const value = createFractionPluginValue();
    const mount = options.as || metadata.mount || "fraction";
    systemContext.registerHostCallableValue(mount, value, {
        impl: (args) => createFraction(args),
        pure: true,
        doc: "Construct an unreduced Fraction from a value or explicit numerator and denominator",
    }, {
        doc: metadata.description || "Representation-sensitive unreduced fractions",
        groups: metadata.groups || ["Algebra", "Exact", "Symbolic"],
        pluginId: metadata.id || "fraction",
    });
    registerFractionMethods(systemContext, { pluginId: metadata.id || "fraction", mount });
    installFractionOperators(registry);
    return value;
}
