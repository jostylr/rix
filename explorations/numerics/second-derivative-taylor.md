---
title: Second-derivative Taylor enclosures
kind: explanatory-exploration
companion: second-derivative-taylor.rix
---

# Second-derivative Taylor enclosures

The Lipschitz construction forgets the slope at the midpoint. A first-order
Taylor enclosure retains it. For `x=m+d`, Taylor's theorem gives

```text
f(x) = f(m) + f'(m)*d + f''(xi)*d^2/2
```

for some `xi` between `m` and `x`. If a checked range proves
`f''(I) contained in S` and `|d|<=r`, RiX encloses the remainder with

```text
S * [0,r^2/2].
```

The complete enclosure is therefore

```text
f(m) + f'(m)*[-r,r] + S*[0,r^2/2].
```

All three operations are exact rational range operations. Keeping `S` rather
than replacing it immediately by `[-M,M]` preserves curvature information: a
nonnegative second derivative gives a nonnegative remainder, and a
nonpositive one gives a nonpositive remainder.

## What RiX checks

The strategy consumes a second-order transformation:

```rix
x := .calculus.Variable(:x);
f := x^4-2*x^2;
secondDerivative := .calculus.DifferentiateNResult(f,:x,2);
result := .numerics.TaylorRange(secondDerivative,{= x=(-1):1 });
```

The independent checker recomputes both derivative stages from the original
graph, checks that both differentiations use the bound variable, and compares
the accumulated domain obligations in order. For each closed piece the
strategy certifies `f(m)`, `f'(m)`, and `f''(I)` before constructing the linear
and remainder ranges.

Each partition record exposes `midpointRange`, `midpointDerivativeRange`,
`secondDerivativeRange`, `linearRange`, `remainderRange`, and `enclosure`.
`curvature` is `:convex`, `:concave`, `:affine`, or `:unknown` for a piece; the
whole result says `:mixed` when the pieces have different classifications.

## Convexity is useful knowledge, not decoration

For `f(x)=x^2` on `[-1,1]`, midpoint slope is zero and `f''=2`. The remainder
is `[0,1]`, so this strategy obtains `[0,1]` directly. Replacing the signed
second-derivative range by only an absolute bound would give the weaker
`[-1,1]`.

For `x^4-2*x^2`, the second derivative `12*x^2-4` changes sign. Subdivision can
separate concave central pieces from convex outer pieces. Open
[second-derivative-taylor.rix](second-derivative-taylor.rix) in `rix-web` and
watch the curvature column change as the piece count grows.

## Further explorations

1. Start with one piece on `[-1,1]`, then use 2, 4, and 8. Compare the
   `linearRange`, `remainderRange`, and final union independently.
2. Replace `f` by `x^2`. Verify that every piece is convex and explain why the
   one-piece result is already exact.
3. Replace `f` by `-x^2`. Predict the sign of `remainderRange` and the reported
   curvature before running it.
4. Try `x^3` on an interval entirely left of zero, entirely right of zero, and
   crossing zero. Compare `:concave`, `:convex`, and `:unknown`/`:mixed`.
5. Compare `.numerics.LipschitzRange` and `.numerics.TaylorRange` for the same
   polynomial and work budget. Identify cases where retaining the midpoint
   slope helps and cases where dependency in the linear range remains wide.
6. Introduce a quotient whose denominator stays away from zero, then move the
   interval across the pole. Trace exactly which domain obligation changes the
   result from certified to unresolved.

