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
