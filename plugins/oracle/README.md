# `oracle`

`oracle` is a pure RiX real-number backend demonstrating the rational
betweenness oracles developed in
[`paper/oracles_short.tex`](../../../paper/oracles_short.tex). It is intended
to preserve the paper's distinction between an ideal completed betweenness
relation and a finite procedure that answers fuzzy rational-interval queries.

The plugin is implemented in `oracle.plugin.rix` without a JavaScript
arithmetic backend. It provides exact value schemas, five rational procedure
demonstrations, Range validation, reproducible finite alternatives, bounded
bisection refinement, and the neutral provider methods consumed by
`.numerics`. It also supplies immutable arithmetic recipes and adapters from
every certified refinable singleton-real provider.

## Phase 1 surface

```rix
.Plugin.Load("oracle")

q := .oracle.Rational(3 / 7, {= procedure = :halo })
answer := .oracle.Ask(q, 0:1, 1 / 100)
small := .oracle.Refine(q, {= width = 1 / 1000, maxCalls = 100 })
```

The available methods are `.Rational`, `.Query`, `.Answer`, `.Decision`, `.Prophecy`,
`.WorkPolicy`, `.Evidence`, `.Ask`, `.AskAll`, `.CheckRange`, and `.Refine`.
The rational constructor accepts `:singular`, `:reflexive`, `:halo`,
`:randomHalo`, and `:bisection` procedure modes. Every refinement operation
has a finite call budget and returns its exact interval, achieved width, work
record, evidence level, and optional trace as ordinary portable RiX values.
Certified refinement records also include `approximation`, a
`CertifiedApproximation` retaining the exact interval reached when the budget
ends. Budget exhaustion is therefore usable uncertainty, not an error or a
silently truncated decimal.

`.oracle.From(value)` accepts an Oracle, an exact Integer/Rational, or a value
whose Numerics capabilities certify singleton denotation and arbitrary
refinement. Arithmetic supports `+`, `-`, `*`, `/`, integer powers, unary `-`,
and absolute value. Exact Rationals are point leaves; unlike real families
meet at Oracle. A finite Ball (set denotation) and Float (stored scalar without
certified refinement) are intentionally rejected.

The paper-specific `procedure=:halo` and `.Ask(real, interval, delta)` retain
their original open-delta query meaning. They are distinct from a language
Halo neighborhood such as `real < {~ 1/2, 1/1000 }`: the latter asks the
shared refinement contract for a certified enclosure of the represented real,
and its epsilon is a resolution target rather than an expansion of `1/2`.

See the [implementation specification](specification.md) and the
[tutorial](tutorial.md).
