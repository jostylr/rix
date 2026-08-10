---
title: Certified algebraic reals in RiX
description: Build exact real roots, inspect Sturm certificates, refine rational intervals, and compare sqrt(2) without floating point.
theme: Numbers and numerics
status: implemented
order: 999
---

The algebraic-real plugin is written entirely in RiX and delegates polynomial
work to the pure-RiX `.poly` dependency. Its algorithms use exact Integer and
Rational arithmetic, so the same certificate path runs in the CLI, RiX Web,
and RiX Notebook without a JavaScript plugin boundary or duplicate Polynomial
representation.

## Construct an isolated root

Coefficient arrays start with the constant term:

```rix
.Plugin.Load("algebraic-real");
root := .ar.Root([-2, 0, 1], 1:2, 2);
.Table({=
  columns=["polynomial", "interval", "real-root index", "sign"],
  rows=[[
    root.Coefficients(),
    root.Interval(),
    root.RootIndex(),
    root.Sign()
  ]]
});
```

This identifies the positive root of `x^2 - 2`: the interval `1:2` contains
one real root and one real root lies to its left, so its certified index is 2.
Try changing the index to 1. Construction fails rather than retaining
inconsistent metadata.

## Inspect the exact certificate machinery

```rix
.Plugin.Load("algebraic-real");
p := .ar.Polynomial([-4, 0, 2]);
.Table({=
  columns=["canonical coefficients", "derivative", "Sturm sequence"],
  rows=[[
    p.Coefficients(),
    p.Derivative().AscendingCoefficients(),
    p.SturmSequence()
  ]]
});
```

Content normalization changes `[-4, 0, 2]` to `[-2, 0, 1]`. The Sturm
sequence is `[-2, 0, 1]`, `[0, 2]`, `[2]`. Sign-variation differences count
roots in any rational interval:

`p` is an ordinary `rix.polynomial@1` callable. It can be passed directly to
other polynomial-aware plugins; algebraic-real adds no private polynomial type.

```rix
.ar.RootCount([-2, 0, 1], -2:-1);  ## 1
.ar.RootCount([-2, 0, 1], 1:2);    ## 1
```

Repeated factors are rejected for stored algebraic reals:

```rix
repeated := [1, -2, 1];
.ar.IsSquareFree(repeated);          ## null; Root(...) rejects it
```

## Compare `sqrt(2)` exactly

```rix
.Plugin.Load("algebraic-real");
root := .ar.Sqrt2();
.Table({=
  columns=["question", "exact answer"],
  rows=[
    ["sign", root.Sign()],
    ["sqrt(2) vs 7/5", root.CompareRational(7/5)],
    ["sqrt(2) vs 3/2", root.CompareRational(3/2)]
  ]
});
```

No decimal approximation is needed. Polynomial evaluation proves equality
when the comparator is a rational root; otherwise a Sturm count tells which
side of that rational contains the isolated root.

## Refine with bounded work

```rix
.Plugin.Load("algebraic-real");
.Plugin.Load("numerics");
root := .ar.Sqrt2();
answer := .numerics.Refine(root, {=
  absoluteWidth=1/1000,
  maxWork=20
});
.Table({=
  columns=["status", "interval", "width", "bisections"],
  rows=[[
    answer[:status],
    answer[:interval],
    answer[:achievedWidth],
    answer[:work][:calls]
  ]]
});
root < {~ 3/2, 1/1000 };
```

Ten exact bisections shrink `1:2` to width `1/1024`. Set `maxWork=2` to see a
`:budgetExhausted` result that still carries the best certified interval.

## Save and restore

```rix
.Plugin.Load("algebraic-real");
root := .ar.Sqrt2();
encoded := root.Export();
restored := .ar.Import(encoded);
{: encoded[:schema], restored.Coefficients(), restored.Interval(), restored.Sign() };
```

Import recomputes normalization, square-freeness, isolation, and root index.
The serialized evidence is provenance, not an unchecked authority.
