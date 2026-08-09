# `cauchy`

`cauchy` is an opt-in exact-real package for rational sequences. It keeps the
sequence itself distinct from the extra information required to certify its
limit.

## Bare and certified sequences

```rix
.Plugin.Load("cauchy");
bare := .cauchy.Sequence((n) -> 1 / (n + 1));
bare.Term(3);

real := .cauchy.Certified(
  (n) -> n == 0 ?: 0 ?_ 1,
  (n) -> n == 0 ?: 1 ?_ 0,
  (radius) -> 1,
  {= evidence=:eventuallyConstant }
);
```

`Sequence(term)` is intentionally non-certifying. A finite collection of
terms, or even a promise that a sequence is Cauchy, does not by itself give an
effective enclosure of its limit.

`Certified(term, tailBound, modulus, options?)` adds two callable witnesses:

- `tailBound(n)` is a nonnegative exact Rational `e_n` certifying that the
  limit lies in `term(n) ± e_n`;
- `modulus(radius)` returns an index `n` whose tail bound is at most `radius`.

The general constructor treats this mathematical claim as an explicit
constructor guarantee. RiX verifies exact result types, nonnegative bounds,
the modulus inequality at every requested witness, and consistency with the
initial certified enclosure. It does not pretend to prove arbitrary user
functions from their source code.

## Verified geometric series

```rix
.Plugin.Load("cauchy");
g := .cauchy.Geometric(1, 1 / 2);
g.Term(3);       ## 15/8
g.TailBound(3);  ## 1/8
g.Enclosure(3);  ## 7/4:2
```

`Geometric(first, ratio)` requires exact Rational inputs and `|ratio| < 1`.
For index `n`, its term is the partial sum through `n`, and its certified tail
bound is

```text
|first| |ratio|^(n+1) / (1 - |ratio|).
```

This works for positive and alternating ratios. Although a geometric sum is
itself Rational, the constructor deliberately retains the sequence and tail
proof so the refinement process remains visible.

## Refinement

Certified Cauchy reals implement `Enclose`, `Refine`, and
`NumericsCapabilities`, advertising `rix.refinable@1` and
`rix.enclosable-real@1`:

```rix
.Plugin.Load("cauchy");
.Plugin.Load("numerics");
result := .numerics.Refine(.cauchy.Geometric(1, 1/2), {=
  absoluteWidth=1/1000,
  maxWork=20
});
```

The result contains an exact `RationalInterval`, `CertifiedApproximation`,
selected sequence index, tail witness, evidence, and bounded work record.
Insufficient work returns `:budgetExhausted` with the best certified enclosure.
Language Halo comparisons use the same protocol.

## Phase 1 boundary

Phase 1 does not infer a modulus for a bare sequence. Arithmetic with computed
moduli, lazy stream policies, convergence transformations, and the
paper-compatible funnel/Oracle adapter remain later phases.

See [tutorial.md](tutorial.md).
