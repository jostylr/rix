# `oracle`

`oracle` is a pure RiX real-number backend demonstrating the rational
betweenness oracles developed in
[`paper/oracles_short.tex`](../../../paper/oracles_short.tex). It is intended
to preserve the paper's distinction between an ideal completed betweenness
relation and a finite procedure that answers fuzzy rational-interval queries.

The plugin is implemented in `oracle.plugin.rix` without a JavaScript
arithmetic backend. It provides exact value schemas, five rational procedure
demonstrations, Range validation, reproducible finite alternatives, bounded
bisection refinement, certified refinement funnels, and the neutral provider
methods consumed by `.numerics`. It also supplies an exact rational Newton
nth-root funnel, a Cauchy adapter, coarse eta-resolution oracles, immutable
arithmetic recipes, and adapters from every certified refinable singleton-real
provider.

## Rational surface

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

## Phase 2 funnels

`ToFunnel` accepts a provider only when its public Numerics capabilities say
that it is certified, singleton-denoting, and arbitrarily refinable.
`FromFunnel` turns that certified family of compatible rational intervals into
an Oracle. The adapter asks its source for at most half the requested width,
so an accepted source result is strictly shorter than the funnel request.

```rix
.Plugin.Load("cauchy");
sequence := .cauchy.Geometric(1, 1/2);
funnel := .oracle.ToFunnel(sequence);
real := .oracle.FromFunnel(funnel);
.oracle.Refine(real, {= width=1/1000, maxCalls=20 });
```

The built-in Newton construction uses only exact Rational arithmetic. Each
step stores `a`, `b = q/a^(n-1)`, and the interval between them. Those endpoint
powers bracket `q`, so the interval encloses the positive nth root regardless
of which endpoint is lower. Work exhaustion returns the last certified
interval instead of claiming the requested precision.

```rix
sqrt2 := .oracle.NthRoot(2, 2, {= start=2 });
rootResult := .oracle.Refine(sqrt2, {= width=1/1000, maxCalls=20, trace=1 });
```

`.oracle.Cauchy(source)` is the named Cauchy-to-funnel adapter. The source must
already carry a certified tail bound/modulus through the shared refinement
protocol; a bare sequence is rejected.

## Coarse eta resolution

A coarse Oracle explicitly denotes a compatibility class rather than one
arbitrarily refinable singleton:

```rix
coarse := .oracle.Coarse((2/5):(3/5), 1/10);
coarseResult := .oracle.Refine(coarse, {= width=1/1000, maxCalls=0 });
```

The constructor requires the stored interval width to be at most `2*eta`.
When a request is finer than that fixed certified interval,
`coarseResult[:status]` is `:resolutionFloor`, with
`:etaResolutionFloor` diagnostics. Its work record is not exhausted. This is
different from `:budgetExhausted`, where a refinable procedure could have
continued with more resources.

## Phase 3 ordering, arithmetic, and evidence

`CompareWithin(left, right, epsilon, policy?)` performs bounded
epsilon-trichotomy. Certified disjoint enclosures produce `:less` or
`:greater`; overlapping enclosures whose common hull is no wider than epsilon
produce `:compatible`. Compatibility is deliberately not equality.
`Equivalent` proves equality for identical exact Rational constructors and
difference from separated certified enclosures, but returns `:undecided` when
finite refinement only establishes compatibility. `Compatible` checks two
prophecy intervals exactly.

Named `Negate`, `Add`, `Subtract`, `Multiply`, `Reciprocal`, and `Divide`
construct the same immutable interval-arithmetic recipes used by operators.
`FunnelOperation` adapts a recipe to `rix.oracle.funnel@1`; for example,
`FunnelOperation(:mul, x, y)` can be passed to `FunnelRefine`. Reciprocal and
division never use a midpoint when zero has not been excluded: refinement
returns structured `:unknown` evidence instead.

`RootEvidence` records domain, existence, uniqueness, continuity, endpoint
signs, and evidence level. `Testing` accepts an exact Rational-valued function
only with proof or constructor-guarantee root evidence whose domain matches
the testing interval. Its bisection trace is then certified by those explicit
hypotheses. Merely observed or assumed evidence is retained by
`TruthEvidence` and `PropertyEvidence` but cannot silently authorize a testing
root. These records use the versioned `rix.oracle.*-evidence@1` schemas.
