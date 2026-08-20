---
title: Certified functions as regular continued fractions
kind: explanatory-exploration
companion: certified-function-extraction.rix
---

# Certified functions as regular continued fractions

`FromRefinable` converts any certified, arbitrarily refinable singleton real
into a native regular continued-fraction stream. It never converts through a
Float. For the current complete quotient it retains an exact Möbius form

```text
             A*x + B
T(x) =      ---------
             C*x + D
```

of the original source `x`. The initial form is the identity. If a certified
source enclosure is `I`, the extrema of `T(I)` occur at its rational endpoints
provided `C*x+D` does not contain zero. An output coefficient `a` is emitted
only when every value in `T(I)` has floor `a`. The next state is exactly

```text
Tnext(x) = 1 / (T(x)-a).
```

This is the familiar floor-and-reciprocal definition, but retaining the one
Möbius form avoids repeatedly rounding or widening an already transformed
interval. Every arithmetic operation used for certification is Rational.

Open [certified-function-extraction.rix](certified-function-extraction.rix) to
extract coefficients of `exp(1)`, `ln(2)`, `sin(1)`, and `erf(1)`, and to
compare the resulting convergents.

## The Farey-pair interpretation

The floor-and-reciprocal algorithm and a Stern–Brocot/Farey walk are not
competing definitions. They are two schedules for extracting the same path.
Starting with the bracket `1:2` for `sqrt(2)`, successive mediants give

| certified bracket | tested mediant | retained side |
| --- | --- | --- |
| `1:2` | `3/2` | upper becomes `3/2` |
| `1:3/2` | `4/3` | lower becomes `4/3` |
| `4/3:3/2` | `7/5` | lower becomes `7/5` |
| `7/5:3/2` | `10/7` | upper becomes `10/7` |

Runs in one direction are the partial quotients. A switch finalizes the run,
which is the coefficient-boundary behavior in the question. The two endpoints
are neighboring Farey fractions, and after a coefficient is finalized they
are the same projective basis encoded by the convergent matrix.

A one-mediant-at-a-time walk has two practical benefits: it produces a tighter
visible bracket after every successful comparison, and it gives an intuitive
geometric trace. Its cost is proportional to a partial quotient. If the next
coefficient is one million, it may take one million same-direction mediants.
The stable-floor method determines that run length in one quotient decision;
it is therefore the run-length-accelerated Farey walk.

RiX uses the accelerated form for coefficient production. `Enclosure(n)` still
returns the adjacent convergent/Farey pair determined by the first `n`
coefficients, so no enclosing information is discarded. A future UI could
animate the unaccelerated mediants without changing the certified-real core.

## Roots

`.cf.Sqrt(rational)` takes a stronger path. Perfect squares become finite exact
continued fractions. Nonsquares use the exact quadratic-surd recurrence and
produce an explicitly periodic stream; this also works for rational radicands
such as

```text
sqrt(2/3) = [0; 1, overline{4,2}].
```

Perfect rational nth powers also fold exactly. Other nth roots use Numerics'
certified root real and the general extractor. Higher algebraic roots are not
generally periodic.

## Rational and zero boundaries

Coefficient extraction is discontinuous at every rational boundary. Suppose a
provider knows that its value is exactly `2` mathematically but only returns
intervals with points on both sides of `2`. No amount of honest floor testing
can choose between leading coefficients `1` and `2` at a prescribed finite
budget. The Farey walk has the identical issue when the value could equal its
mediant.

The result is `status=:budgetExhausted`, not a guessed coefficient. Exact
shortcuts such as `.cf.Sqrt(4)` avoid the problem by proving the finite value
before extraction. The same rule protects reciprocal steps: if the transformed
denominator can still be zero, RiX refines the original source and emits
nothing until the pole is excluded.

## Generalized continued fractions

The extractor immediately covers all certified Numerics functions, but it
does not claim that their internal algorithms are continued fractions.
Published formulas for exponentials, logarithms, tangent, Bessel ratios, and
incomplete gamma/beta functions are usually generalized continued fractions.
A later generalized-CF protocol can improve their evaluation, provided each
recipe supplies a proven tail enclosure. Its certified value can feed this
same regular-CF extractor.

## Further explorations

- Change the coefficient and source-work controls in
  [certified-function-extraction.rix](certified-function-extraction.rix).
- Compare a large partial quotient using individual Stern–Brocot mediants and
  one stable-floor extraction.
- Replace `exp(1)` with `Gamma(1/2)`, a Bessel value, or another certified
  Numerics real.
- Request `CoefficientResult(n,{=trace=1})` and inspect every source enclosure,
  transformed interval, and output Möbius form.

