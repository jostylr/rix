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
p := .algebra.Polynomial([0, 0, 1, -6, 11, -6]);
copy := .algebra.Polynomial(.algebra.Record(p));
.Table(
    ["property", "exact value"],
    [
        ["coefficients", .algebra.Coefficients(p)],
        ["p(2)", .algebra.Evaluate(p, 2)],
        ["round trip equal", .algebra.Equal(p, copy)]
    ]
);
```

## Verify a factor and show synthetic division

The transformation retains exact quotient/remainder objects and factor
metadata. Its Grid is the same portable layout family as intrinsic
`.Algebra.SyntheticDivision`, so document and terminal renderers can display it.

```rix
.Plugin.Load("algebra");
p := .algebra.Polynomial([1, -6, 11, -6]);
factor := .algebra.Polynomial([1, -2]);
division := .algebra.SyntheticDivide(p, 2);
quotient := .algebra.Coefficients(.algebra.Quotient(division));
remainder := .algebra.Coefficients(.algebra.Remainder(division));
isFactor := .algebra.IsFactor(p, factor);
.algebra.Grid(division);
```
