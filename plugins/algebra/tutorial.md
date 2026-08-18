---
title: Transform an exact polynomial
description: Normalize, evaluate, divide, and display a polynomial using exact rational arithmetic.
theme: Algebra and analysis
status: implemented
plugin: algebra
---

## Normalize and round-trip exact coefficients

Leading zeros disappear, while rational coefficients stay exact. `Record`
contains everything needed to reconstruct the same canonical polynomial.

```rix
.Plugin.Load("algebra");
P := .algebra.Polynomial([0, 0, 1, -6, 11, -6]);
Copy := .algebra.Polynomial(P.Record());
.Table(
    ["property", "exact value"],
    [
        ["coefficients", P.Coefficients()],
        ["P(2)", P(2)],
        ["round trip equal", .algebra.Equal(P, Copy)]
    ]
);
```

## Verify a factor and show synthetic division

The transformation retains exact quotient/remainder objects and factor
metadata. Its Grid is the same portable layout family as intrinsic
`.Algebra.SyntheticDivision`, so document and terminal renderers can display it.

```rix
.Plugin.Load("algebra");
P := .p`x^3 - 6x^2 + 11x - 6`;
Factor := .p`x - 2`;
division := .algebra.SyntheticDivide(P, 2);
quotient := division.Quotient().Coefficients();
remainder := division.Remainder().Coefficients();
isFactor := P.IsFactor(Factor);
division.Grid();
```

## Inspect exact factor evidence

The evidence distinguishes discovered rational factors from the residual and
verifies exact reconstruction rather than relying on approximate roots.

```rix
.Plugin.Load("algebra");
P := .p`(x-1)^2*(x+2)^3`;
evidence := .algebra.FactorEvidence(P);
.Table(
    ["property", "exact value"],
    [
        ["rational roots", evidence[:rationalRoots]],
        ["factor records", evidence[:factors]],
        ["residual", evidence[:residual].Coefficients()],
        ["verified", evidence[:verified]]
    ]
);
```

Use `.algebra.SquareFreeDecomposition(P)` when multiplicity groups matter,
`.algebra.Gcd(P, Q)` or `.algebra.Lcm(P, Q)` for canonical combinations, and
`.algebra.Resultant(P, Q)` for an exact shared-factor test.

## Keep centered and factored forms explicit

Presentation values preserve a useful form without creating a second notion
of Polynomial equality. Expanding either value reconstructs from its displayed
fields and verifies the exact result against the retained canonical source.

```rix
.Plugin.Load("algebra");
P := .poly([2, -3, 5, -7]);
centered := .algebra.CenteredExpansion(P, 2);
factored := .algebra.Factorization(.p`6*(x-1)^2*(x+2)^3*(x^2+1)`);
.Table(
    ["property", "exact value"],
    [
        ["powers of (x-2), ascending", centered.Coefficients()],
        ["centered round trip", centered.Expand().Coefficients()],
        ["factorization unit", factored.Unit()],
        ["rational factors", factored.Factors()],
        ["monic residual", factored.Residual().Coefficients()],
        ["all factors rational", factored[:complete]],
        ["factorization round trip", factored.Polynomial().Coefficients()]
    ]
);
```

`Record()` produces a portable form accepted by `.algebra.Expand(record)`.
Changing a coefficient, root, factor, multiplicity, unit, residual, basis, or
completeness claim causes conversion to fail rather than silently returning
the stored source.

## Decompose a rational function exactly

The Algebra façade also exposes `.ratfun` Phase 2 transformations. Repeated
rational poles become individual exact terms; factors not split over Q remain
visible in one proper residual rather than being approximated.

```rix
.Plugin.Load("algebra");
R := .rf`(x^5+x^3+2*x+1)/((x-1)^2*(x^2+1))`;
partial := .algebra.PartialFractions(R);
divisor := .algebra.PoleZeroEvidence(R);
.Table(
    ["property", "exact value"],
    [
        ["coefficient domain", .algebra.CoefficientDomain(R)[:id]],
        ["polynomial part", partial.PolynomialPart().Coefficients()],
        ["linear-pole terms", partial.Terms()],
        ["proper residual", partial.Residual()],
        ["verified round trip", .algebra.Expand(partial.Record()) == R],
        ["pole evidence", divisor.Poles()]
    ]
);
```
