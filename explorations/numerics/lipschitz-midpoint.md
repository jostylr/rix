---
title: Lipschitz midpoint enclosures
kind: explanatory-exploration
companion: lipschitz-midpoint.rix
---

# Lipschitz midpoint enclosures

Suppose `f` is differentiable throughout a closed interval
`I=[m-r,m+r]`, and an exact range calculation proves

```text
|f'(x)| <= L for every x in I.
```

The mean value theorem then gives

```text
f(I) is contained in f(m) + [-L*r,L*r].
```

This is deliberately an enclosure, not a claim that every value in the outer
interval is attained. Its ingredients are attractive for certification: a
single midpoint value, a derivative range on the entire interval, exact
rational multiplication, and a theorem with a small checkable boundary.

## What RiX checks

The companion begins with a Calculus graph and its derivative transformation:

```rix
x := .calculus.Variable(:x);
f := x^3-x;
firstDerivative := .calculus.DifferentiateResult(f,:x);
```

`.numerics.LipschitzRange` independently checks that transformation. On every
requested subinterval it then:

1. evaluates `f` at the exact rational midpoint;
2. certifies the derivative graph range on the whole closed piece;
3. discharges every carried domain obligation;
4. computes `L` as the greatest certified absolute derivative bound; and
5. forms `midpointRange + [-L*r,L*r]` with exact range arithmetic.

The result's `partitions` field exposes `midpoint`, `radius`,
`derivativeRange`, `lipschitzBound`, `errorRadius`, and `enclosure`. Its
`checker` field reports whether recomputation accepted the public claim.

## Why subdivision helps

One broad interval uses the worst derivative magnitude everywhere. Splitting
the input gives each piece its own midpoint, radius, and derivative bound. The
piece enclosures are unioned as sets. The theorem remains the same; only the
cover becomes finer. Work grows roughly with the number of pieces, while the
term `L*r` usually shrinks.

Open [lipschitz-midpoint.rix](lipschitz-midpoint.rix) in `rix-web`. Its sliders
change the measurement centre, its rational half-width, and the bounded number
of subintervals. The table is not sampled data: every row is one certified
theorem application.

## Failure is informative

Try replacing the polynomial with `(x+1)/(x-1)` and choose an input crossing
`1`. The derivative transformation carries a nonzero-denominator obligation.
Because that obligation cannot hold on the entire piece, the result becomes
`status=:unknown` with `domainStatus=:unresolved`; the pole is not silently
removed.

## Further explorations

1. Set the centre to `0`, half-width to `1`, and compare 1, 2, 4, and 8 pieces.
   Record how the union enclosure changes and which row has the largest `L`.
2. Change `f` in the companion to `x^2`, regenerate `firstDerivative`, and
   predict the one-piece result before running it.
3. Change `f` to `x^4-2*x^2`. Find an input where subdivision creates visibly
   different derivative bounds on different pieces.
4. Use a disconnected `RangeSet` binding from two closed intervals. Ensure the
   `maxSubintervals` budget is at least the number of components, then inspect
   whether the output remains disconnected.
5. Deliberately cross a denominator zero. Inspect `diagnostics`, then split the
   input into two closed sets that avoid the pole and compare their union.

