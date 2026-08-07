# `oracle`

`oracle` is a pure RiX real-number backend demonstrating the rational
betweenness oracles developed in
[`paper/oracles_short.tex`](../../../paper/oracles_short.tex). It is intended
to preserve the paper's distinction between an ideal completed betweenness
relation and a finite procedure that answers fuzzy rational-interval queries.

Phase 1 is implemented in `oracle.plugin.rix` without a JavaScript arithmetic
backend. It provides exact value schemas, five rational procedure
demonstrations, Range validation, reproducible finite alternatives, and
bounded bisection refinement. Funnel adapters, Newton constructions,
arithmetic, and the shared Numerics dispatcher remain later-phase work.

## Phase 1 surface

```rix
.Plugin.Load("oracle")

q := .oracle.Rational(3 / 7, {= procedure = :halo })
answer := .oracle.Ask(q, 0:1, 1 / 100)
small := .oracle.Refine(q, {= width = 1 / 1000, maxCalls = 100 })
```

The available methods are `.Rational`, `.Query`, `.Answer`, `.Prophecy`,
`.WorkPolicy`, `.Evidence`, `.Ask`, `.AskAll`, `.CheckRange`, and `.Refine`.
The rational constructor accepts `:singular`, `:reflexive`, `:halo`,
`:randomHalo`, and `:bisection` procedure modes. Every refinement operation
has a finite call budget and returns its exact interval, achieved width, work
record, evidence level, and optional trace as ordinary portable RiX values.

See the [implementation specification](specification.md) and the
[planned tutorial](tutorial.md).
