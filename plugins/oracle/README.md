# `oracle`

`oracle` is a proposed RiX real-number backend demonstrating the rational
betweenness oracles developed in
[`paper/oracles_short.tex`](../../../paper/oracles_short.tex). It is intended
to preserve the paper's distinction between an ideal completed betweenness
relation and a finite procedure that answers fuzzy rational-interval queries.

The package is currently **specification-only**. It deliberately has no
`oracle.plugin.rix` manifest yet, so `.Plugin.Load("oracle")` cannot appear to
install a working implementation.

## Planned surface

```rix
.Plugin.Load("oracle")

q := .oracle.Rational(3 / 7, {= procedure = :halo })
answer := .oracle.Ask(q, 0:1, 1 / 100)
small := .oracle.Refine(q, {= width = 1 / 1000, maxCalls = 100 })
```

The first implementation will include rational examples, query/answer and
prophecy values, bounded bisection, refinement funnels, and a Newton nth-root
demonstration. Later phases add Cauchy adapters, arithmetic, coarse oracles,
proof/evidence objects, and the shared Numerics protocol.

See the [implementation specification](specification.md) and the
[planned tutorial](tutorial.md).
