# `analysis`

`analysis` is an opt-in, pure-RiX package for sequences of mathematical
functions and explicit convergence claims. It consumes
`rix.abstract-function@1`, supplied by `.calculus`, and uses RiX's native
cloneable lazy sequences for term streams. It does not create a competing
function or stream representation.

Phase 1 deliberately separates three things:

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

Phase 1 therefore grants `allows.evaluation=1` only for the checked geometric
uniform result. Integration, differentiation, and expectation remain unset;
their exchange hypotheses belong to Phase 2.

See [tutorial.md](tutorial.md) and the browser-safe
[geometric-function-series exploration](../../explorations/analysis/geometric-function-series.md).

