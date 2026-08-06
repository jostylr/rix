/**
id: fraction-ops
description: Test plugin that owns a custom Fraction operator.
kind: host
mount: fractions
exports: [Make, Mediant]
groups: [Exact]
permissions: []
operator-files: [fraction.operators.rix]
defaultEnabled: false
**/

export function install() {
    throw new Error("The test supplies its approved installer directly");
}
