# `analysis`

`analysis` is an opt-in, pure-RiX package for effective scalar and function
limits, infinite series, Cauchy criteria, and explicit limit-exchange claims. It consumes
`rix.abstract-function@1`, supplied by `.calculus`, and uses RiX's native
cloneable lazy sequences for term streams. It does not create a competing
function, stream, or real-number representation.

The package deliberately separates three things:

- a sequence of Calculus `MathematicalFunction` values;
- a claim naming one precise mode of convergence and a candidate limit; and
- a checked result which is either certified or explicitly `:unknown`.

## Function sequences

```rix
.Plugin.Load("analysis");
make := (n)->.calculus.Function(@"example.shift.@{n}@1", {=
  domain=:Rational,
  codomain=:Rational,
  implementation=(x)->x+@n,
  implementationEvidence=:definition
});
sequence := .analysis.FunctionSequence(make, {=
  start=0,
  name=:shifts,
  domain=:Rational,
  codomain=:Rational
});
sequence.Term(3)(2);
sequence.Terms(0,4).Materialize();
```

A `FunctionSequence` record carries the versioned schema
`rix.analysis.function-sequence@1`, an integer-ray index domain, the common
function domain and codomain, a term constructor, an optional Calculus limit,
optional effective tail evidence, and provenance. `Term(n)` checks that the
constructor really returns a Calculus function.

`Terms(start?, count?)` stays lazy. A bounded stream can be materialized;
omitting `count` creates an unbounded stream that must be consumed through
finite indexing. Shallow copies copy the current cache and advance
independently (`clonePolicy=:cachedIndependent`); deep copying restarts the
generator (`deepClonePolicy=:restart`).

## Convergence is a typed claim, not a Boolean guess

The versioned claim/result protocol recognizes five distinct modes:

| Mode | Additional data commonly needed |
| --- | --- |
| `:pointwise` | a point or quantified domain statement |
| `:uniform` | a domain-wide tail bound independent of the point |
| `:almostEverywhere` | a measure and an exceptional null set |
| `:inMeasure` | a measure and quantitative bad-set bounds |
| `:norm` | a named norm or function-space record |

Constructing a claim never proves it:

```rix
claim := sequence.Claim(:uniform);
result := claim.Check({= epsilon=1/1000,maxWork=100 });
```

Unsupported evidence returns a
`rix.analysis.convergence-result@1` record with `status=:unknown`, a reason,
visible obligations, diagnostics, and no permission to exchange the limit
with evaluation or another operation.

## Exact geometric function series

The Phase 1 checked kernel is the function sequence

```text
S_n(x) = 1 + x + ... + x^n,      |x| <= r < 1,
S(x)   = 1/(1-x).
```

For every point in the exact Rational interval `[-r,r]`, its remainder obeys

```text
|S(x)-S_n(x)| <= r^(n+1)/(1-r).
```

The bound is independent of `x`, so it certifies uniform convergence:

```rix
.Plugin.Load("analysis");
series := .analysis.GeometricSeries(1/2);
series.Term(2)(1/2);                 ## 7/4
series.Limit()(1/2);                 ## 2
series.TailBound(3);                 ## 1/8
checked := series.Check(:uniform,{= epsilon=1/1000,maxWork=20 });
```

Here `checked[:witness][:index]` is `10`, and the exact tail bound `1/1024`
is at most `1/1000`. The result records the finite-geometric-remainder theorem,
the exact domain, the work budget, and `evidenceLevel=:proof`.

The radius may be any exact nonnegative Rational below one. A larger radius
is a wider domain but normally requires more terms for the same error.

## The finite-sampling boundary

`.analysis.TailEvidence(...)` records caller-supplied bound and modulus
functions, but marks them `authority=:declared` and
`evidenceLevel=:assumed`. The checker validates their local return types when
they are queried; it does not prove their global mathematical assertion from
source code.

Likewise, a `samples` field on a convergence claim is retained only as an
observation. It adds a `:finiteSamplesIgnored` diagnostic and never turns a
claim into a theorem. This prevents an apparently convincing grid from
justifying `lim f_n(x) = f(x)`, or an exchange of limit and evaluation, on an
uncounted domain.

## Scalar sequences, series, and effective limits

`ScalarSequence` represents exact Rational terms. `InfiniteSeries` adds exact
partial sums, while `GeometricScalarSeries` supplies the Phase 2 checked
kernel:

```rix
.Plugin.Load("analysis");
series := .analysis.GeometricScalarSeries(1,1/2);
series.Term(3);                         ## 1/8
series.PartialSum(3);                   ## 15/8
series.Sum();                           ## 2
limit := series.Check({= epsilon=1/1000,maxWork=20 });
```

The exact absolute remainder is
`|a| |r|^(n+1)/(1-|r|)`. `Modulus(epsilon)` returns an index and its checked
bound; `Cauchy(...)` uses two such tails to bound every later pair. For a
checked convergent sequence, `Limsup` and `Liminf` both return the effective
limit. They remain `:unknown` for general bounded or oscillating sequences;
Phase 2 does not infer extrema from a finite prefix.

The generic `ScalarTailEvidence` constructor is useful for recording a
proposed bound and modulus, but its authority is `:declared`. It can be
queried and locally checked without being promoted into a convergence proof.

## Optional real-number adapters

Analysis has no hard dependency on a particular exact-real backend. When the
optional plugins are loaded:

```rix
.Plugin.Load("cauchy");
.Plugin.Load("analysis");
.Plugin.Load("numerics");
series := .analysis.GeometricScalarSeries(1,1/2);
real := series.ToCauchy();
sequence := .analysis.FromCauchy(real);
checked := sequence.Check({= epsilon=1/1000 });
enclosure := .analysis.RefineLimit(checked,{= targetWidth=1/100 });
```

`ToCauchy` is limited to the checked geometric-series kernel.
`FromCauchy` accepts effective `rix.cauchy.real@1` values and preserves their
tail/modulus evidence. `RefineLimit` returns a point enclosure for an exact
Rational limit or delegates a refinable candidate to `.numerics`.

## Limit exchanges expose their hypotheses

`Exchange(operation, checkedLimit)` produces a claim with named hypotheses.
Its result is `:justified` only when every hypothesis has proof authority;
truthy options supplied by a caller are recorded as `:assumed`, not `:proved`.

| Operation | Required hypotheses |
| --- | --- |
| evaluation | uniform convergence; point in domain |
| continuity | uniform convergence; continuous terms |
| integration | uniform convergence; integrable terms and limit; finite measure |
| differentiation | differentiable terms; uniform derivative convergence; anchor convergence |
| summation | row convergence; absolute summability |
| expectation | almost-everywhere convergence; dominating integrable bound |

The geometric function-series kernel discharges continuity. Its dedicated
`IntegralExchange(sequence, lower, upper)` also discharges uniform integration
on an exact Rational subinterval and returns portable Calculus definite-integral
specifications for every term and the limit:

```rix
.Plugin.Load("analysis");
.Plugin.Load("numerics");
series := .analysis.GeometricSeries(1/2);
exchange := .analysis.IntegralExchange(series,-1/2,1/2);
termSpec := exchange.TermIntegral(3);
limitSpec := exchange.LimitIntegral();
quadrature := exchange.Numerical({= secondDerivativeBound=16 });
```

Numerical quadrature remains owned by `.numerics`; the derivative-bound option
is an explicit certified input to that provider. General differentiation,
summation, and expectation exchanges retain their unresolved theorem
obligations for later providers.

See [tutorial.md](tutorial.md) and the browser-safe
[geometric-function-series exploration](../../explorations/analysis/geometric-function-series.md).
