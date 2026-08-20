---
title: Gosper continued-fraction arithmetic
kind: explanatory-exploration
companion: gosper-arithmetic.rix
---

# Gosper continued-fraction arithmetic

A regular continued fraction is useful as an exact real only if arithmetic can
produce another coefficient stream without first choosing a decimal precision.
Gosper's algorithm does that. Given continued fractions `x` and `y`, it carries
the exact bihomographic form

```text
             a*x*y + b*x + c*y + d
F(x,y) =  -----------------------------
             e*x*y + f*x + g*y + h
```

with eight Integer coefficients. The four operations differ only in their
initial state:

| operation | numerator `(a,b,c,d)` | denominator `(e,f,g,h)` |
| --- | --- | --- |
| `x+y` | `(0,1,1,0)` | `(0,0,0,1)` |
| `x-y` | `(0,1,-1,0)` | `(0,0,0,1)` |
| `x*y` | `(1,0,0,0)` | `(0,0,0,1)` |
| `x/y` | `(0,1,0,0)` | `(0,0,1,0)` |

These are the original HAKMEM forms, translated to RiX's coefficient order.
The historical presentation and transaction rules are available in the
[HAKMEM continued-fraction memo](https://www.inwap.com/pdp10/hbaker/hakmem/cf.html).

## Consuming input

If the next input coefficient is `p`, write `x = p + 1/x'` (or the analogous
formula for `y`) and substitute it into `F`. Clearing the harmless common
denominator gives a new eight-Integer state. RiX divides out the coefficient
gcd and normalizes the denominator sign; this limits growth without changing
the represented projective form.

The implementation alternates fairly: after both streams have started, it
requests from the side with fewer consumed terms unless that side has ended.
This is an adaptive scheduling choice, not part of the proof of an output term.

## Emitting output

After some input has been consumed, each remaining positive continued-fraction
tail has reciprocal coordinate `u` or `v` in the closed interval `[0,1]`.
For a fixed state, the possible output is the image of the unit square. A
bihomographic function with a denominator of one sign has its extrema at the
four corners, so RiX evaluates all four exact Rational corner values.

It emits an Integer `q` only when:

1. every corner denominator is nonzero and has the same sign; and
2. all four exact floors are `q`.

The whole known image then lies inside `[q,q+1)`, so `q` is forced. RiX replaces
`F` with `1/(F-q)` and continues. The unary homographic form
`(a*x+b)/(c*x+d)` uses the same rule with two corners.

Open [gosper-arithmetic.rix](gosper-arithmetic.rix) to see all four operations
on `sqrt(2)=[1;overline{2}]` and
`sqrt(3)=[1;overline{1,2}]`. The transaction table shows every exact input
substitution and output transformation used to force the second coefficient of
the sum.

## Why bounded work can be inconclusive

If the true result is on an Integer boundary, every finite input box may touch
both adjacent floors. More input makes the box thinner but need not force a
coefficient after any prescribed finite number of requests. This is ordinary
partial productivity for exact-real algorithms. `CoefficientResult` therefore
returns `status=:budgetExhausted` and `reason=:coefficientNotStable`; the strict
`Coefficient` method turns that unresolved result into an error instead of
inventing a digit.

The numerical enclosure protocol is complementary. Each transduced stream
retains a certified Oracle recipe for the same arithmetic expression, so a
caller can request an enclosing RationalInterval even when the next canonical
continued-fraction coefficient has not stabilized.

## Which representations leave zero possible?

There are two different questions: whether the represented real is zero, and
whether the information inspected so far separates it from zero.

- The terminating regular continued fraction `[0]` is exactly zero.
- A terminating `[0;a1,...,an]` with `n>=1` and positive tail coefficients is
  strictly positive.
- A declared infinite regular continued fraction `[0;a1,a2,...]` is also
  strictly positive. However, its first closed convergent cylinder, between
  `[0]` and `[0;a1]`, still includes zero. One more valid coefficient excludes
  zero. Thus the representation proves nonzero while a shallow enclosure does
  not yet display that fact.
- A Gosper stream can remain undecided before its first coefficient stabilizes.
  Subtracting two separately constructed streams with identical observed
  prefixes is the instructive case: they may be equal, but prefix agreement is
  not a correlation proof. The finite unit-square image can straddle zero
  forever when they are in fact equal.
- `x-x` using the same immutable object is recognized as correlated and folds
  to exact `[0]`. A transduced stream already known to begin `[0;a1]` is likewise
  certified positive.
- A finite exact zero divisor is a domain error, represented by a structured
  unknown refinement result rather than a continued-fraction stream. If a lazy
  or transduced divisor has not been separated from zero under the requested
  budget, division cannot be certified yet.
- Generalized signed-digit or retracting continued fractions can genuinely
  carry intervals across zero. RiX's current plugin accepts regular simple
  continued fractions only, so those future representations will need explicit
  zero-separation contracts.

`ZeroStatus(options?)` reports `:zero`, `:nonzero`, or `:unknown` without
conflating those cases.

## Further explorations

1. Increase the output-term control from 2 to 8 and compare how many input
   requests the second sum coefficient needs in its trace.
2. Replace `sqrt(3)` with a finite Rational continued fraction. Confirm that
   finite/finite arithmetic folds to a finite exact result while mixed input
   remains a transduced stream.
3. Compare `x-x` with `.cf.Sqrt2()-.cf.Sqrt2()`. Inspect `ZeroStatus` and explain
   why object identity is valid evidence in only the first expression.
4. Lower `maxInputTerms` until one of the four demonstrations reports bounded
   uncertainty, then raise it until the term stabilizes.
5. Chain the output, for example `(x+y)*y`, and inspect its record. The outer
   transducer consumes the inner transducer exactly like any other coefficient
   source.
