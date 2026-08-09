/**
id: cauchy
description: Rational Cauchy sequences with explicit certified tail bounds and moduli.
kind: host
mount: cauchy
exports: [Sequence, Certified, Geometric, Term, TailBound, Modulus, Enclosure, Record]
groups: [Numerics, Exact]
permissions: []
provides: [rix.cauchy@1, rix.refinable@1, rix.enclosable-real@1]
schemas: [rix.cauchy.sequence@1, rix.cauchy.real@1]
snapshot: false
deterministic: true
defaultEnabled: false
**/

import { installCauchyPlugin } from "./cauchy.js";

export function install(options) {
    return installCauchyPlugin(options);
}
