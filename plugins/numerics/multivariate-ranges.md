---
title: Certified multivariate ranges on rational boxes
description: Design and proof contracts for Jacobian subdivision, affine arithmetic, and Taylor models.
theme: Numbers and numerics
status: implemented
---

# Certified multivariate ranges on rational boxes

A measurement rarely has one uncertain coordinate. A length, temperature, and
calibration factor naturally describe a Cartesian product

```text
B = I1 x I2 x ... x In
```

where each `Ii` is a closed bounded rational interval. RiX represents that
product as `rix.numerics.rational-box@1`. Axes are ordered by normalized
lowercase name, so derivative collections and proof records have one stable
coordinate order. A union on one coordinate is deliberately not a single box:
split it into boxes, evaluate each, and take the exact `RationalIntervalSet`
union of their outputs.

`rix.numerics.multivariate-range-request@1` binds an immutable Calculus graph,
one box, and bounded-work options. Every implemented strategy returns a
`RationalIntervalSet`; dependency-aware internal representations never leak
through the public numeric boundary.

## Jacobian subdivision

For a scalar graph `f`, a checked gradient, a box with centre `c`, and certified
partial-derivative ranges `Di` on the whole box, the multivariate mean-value
theorem gives

```text
f(B) subset f(c) + D1*(I1-c1) + ... + Dn*(In-cn).
```

`.numerics.JacobianRange` verifies every derivative transformation, discharges
its domain obligations on the whole subbox, evaluates the derivative graphs,
and forms the sum using exact rational-set arithmetic. `maxSubboxes` repeatedly
bisects the widest rational axis. Shared boundaries are harmless: the boxes
still cover the original set and normalized output union removes duplication.

## Affine arithmetic

An affine form stores

```text
a0 + a1*e1 + ... + ak*ek,  each ei in [-1,1].
```

The same input coordinate reuses the same noise symbol. This proves `x-x=0`
without pretending the two occurrences are independent. Addition and scalar
division are exact transformations of a form. Multiplication retains the
linear correlated part and introduces one fresh noise symbol bounded by the
product of operand radii. The current checked kernel supports rational
constants, variables, negation, addition, subtraction, multiplication, small
nonnegative integer powers, and division by a nonzero rational constant.
Unsupported reciprocals or semantic applications return `status=:unknown`;
they are never approximated by an uncertified linearization.

## Multivariate Taylor models

Given a checked gradient and Hessian, the first-order model with a certified
second-order remainder is

```text
f(c) + grad(f)(c) dot d + 1/2 * d^T H(B) d,  d = x-c.
```

RiX evaluates gradient entries at the exact box centre and Hessian entries on
the complete box. Diagonal products use the sharper exact set `[0,ri^2]`;
off-diagonal products use exact interval multiplication. All derivative and
branch obligations must be discharged before the result is certified.

This model is intentionally a range model, not a polynomial optimizer. It can
be wider than the true range because its remainder terms are combined as
sets. Subdivision trades additional exact work for smaller displacement and
remainder terms.

## Evidence and limitations

The three strategies use `rix.runtime.multivariate-range-checker@1`. Evidence
contains the source graph, exact box, derivative collections when applicable,
options, scoped `0^0` convention, and strategy name. The checker recomputes the
entire enclosure and rejects a changed range, derivative graph, coordinate
order, option, or convention.

Current v1-development limits are deliberate:

- 1 through 16 axes;
- one closed bounded component per axis;
- at most 256 subboxes per call;
- real rational interval results;
- affine semantic functions require a future registered certified model; and
- a principal complex branch obligation is left to a future complex checker.

These schemas remain changeable until RiX 1.0, in accordance with the project
version policy.
