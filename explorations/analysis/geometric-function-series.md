---
title: Exact uniform convergence of a geometric function series
kind: explanatory-exploration
companion: geometric-function-series.rix
---

# Exact uniform convergence of a geometric function series

For an exact Rational `r` with `0 <= r < 1`, consider the functions

```text
S_n(x) = 1 + x + x^2 + ... + x^n
```

on the entire closed interval `[-r,r]`. The finite geometric identity gives

```text
1/(1-x) - S_n(x) = x^(n+1)/(1-x).
```

Because `|x| <= r` and `1-x >= 1-r > 0`, every point of the interval obeys

```text
|1/(1-x) - S_n(x)| <= r^(n+1)/(1-r).
```

The right side depends on `n` and `r`, but not on `x`. That independence is
exactly what makes this a uniform tail bound.

## What the companion computes

[geometric-function-series.rix](geometric-function-series.rix) uses exact
RiX Rationals for the radius, epsilon, every partial sum, and every remainder
bound. The radius slider chooses tenths from `1/10` through `9/10`; the
accuracy slider chooses `10^-1` through `10^-4`.

The plugin searches for the first index `N` satisfying

```text
r^(N+1)/(1-r) <= epsilon.
```

The returned convergence record includes that index, the exact bound, the
domain, the named finite-geometric-remainder theorem, and its bounded work.
No floating-point rounding is needed.

## Why the plot is not the proof

The figure plots exact values of the already-proved remainder formula. It
helps show how the rate slows as `r` approaches one, but the line segments do
not establish convergence. A graph samples finitely many indices and cannot
inspect every point of an interval.

The convergence-mode table makes this boundary visible. The same function sequence is
placed in pointwise, uniform, almost-everywhere, in-measure, and norm claims.
The checked kernel recognizes only its uniform certificate. Unsupported modes
return `status=:unknown`; they are not guessed from the displayed rows.

## Scalar limits and the Cauchy criterion

The companion also builds the scalar series

```text
1 + r + r^2 + ... = 1/(1-r).
```

Its exact tail formula supplies an effective modulus: for a requested epsilon,
RiX finds an `N` after which the remainder is at most epsilon. Applying the
triangle inequality to two remainders gives a Cauchy witness. The scalar table
shows that pair bound explicitly, rather than merely reporting a Boolean.

Because this series has an effective limit, its limsup and liminf both equal
the sum. This does not claim a general algorithm for arbitrary bounded
sequences: without effective evidence those records remain unknown.

## Exchanges are separate theorem applications

Uniform convergence plus continuity of every polynomial partial sum justifies
continuity of the limit on the exact closed interval. Differentiating a limit
requires different hypotheses—differentiability of the terms, uniform
convergence of their derivatives, and convergence at an anchor point. The
exchange table keeps those unmet obligations visible.

## Wider domains cost more

At a fixed epsilon, increasing `r` does two things at once:

1. it asks for convergence on a wider interval; and
2. it makes `r^(n+1)` decay more slowly while shrinking `1-r`.

The required `N` therefore rises sharply near one. This is not merely an
implementation detail: the geometric series does not converge uniformly on
the whole open interval `(-1,1)`, even though it converges at every individual
point there. Each fixed `r < 1` supplies the positive distance from the pole
at `x=1` needed by this certificate.

## Further explorations

1. Hold epsilon at `1/1000` and record the witness index for radii `1/10`,
   `1/2`, `4/5`, and `9/10`. Explain both factors in the increase.
2. For `r=1/2`, verify by exact arithmetic that the bound at `N-1` is too
   large while the bound at `N` meets the target.
3. Compare the actual endpoint error
   `series.Limit()(r)-series.Term(n)(r)` with `series.TailBound(n)`. Determine
   where equality occurs and why negative `x` can give a smaller error.
4. Add a dense sample grid to a claim. Confirm that the result still relies
   on the theorem witness and labels the samples as ignored evidence.
5. Construct a caller-declared `.analysis.TailEvidence` for another sequence.
   Inspect the `:unverifiedTailProperty` result and list what a future theorem
   provider would need to check.
6. Compare the continuity and differentiation exchange records. Supply caller
   assumptions and confirm that their status is `:assumed`, not `:proved`.
