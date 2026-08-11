---
title: Exact continued-fraction reals in RiX
description: Explore finite values, lazy coefficient rules, convergent cylinders, and bounded refinement.
theme: Numbers and numerics
status: implemented
---

This plugin is written entirely in RiX. The same coefficient rules and exact
refinement code run in the CLI, RiX Web, and RiX Notebook without a JavaScript
plugin permission boundary.

## Finite continued fractions

A finite coefficient sequence is an exact Rational presentation. RiX's native
continued-fraction literals interoperate through the callable plugin root:

```rix
.Plugin.Load("continued-fraction");
explicit := .cf.Finite([3, 7, 16]);
literal := .continuedFraction(3.~7~16);
.Table({=
  columns=["source", "coefficients", "convergents", "exact value"],
  rows=[
    ["explicit", explicit.Coefficients(), explicit.Convergents(), explicit.Value()],
    ["literal", literal.Coefficients(), literal.Convergents(), literal.Value()]
  ]
});
```

Both rows end at `355/113`. Coefficients are indexed from zero in the usual
mathematical notation, while `Convergent(n)` consumes `n` coefficients.

## A lazy quadratic irrational

The familiar expansion `sqrt(2) = [1; overline{2}]` never terminates. Its
successive exact Rational convergents alternate around the real value:

```rix
.Plugin.Load("continued-fraction");
root := .cf.Sqrt2();
counts := [2, 3, 4, 5, 6];
.Table({=
  columns=["terms", "convergent", "certified cylinder", "error interval"],
  rows=counts.Map((n) -> [
    n,
    root.Convergent(n),
    root.Enclosure(n),
    root.ErrorInterval(n)
  ])
});
```

Each cylinder is the ordered interval between two consecutive convergents.
The exact determinant identity makes its width shrink rapidly without using a
floating-point estimate.

## Define a coefficient rule

`Lazy` accepts any RiX callable. The constructor validates the first cylinder,
then validates each later coefficient when refinement requests it:

```rix
.Plugin.Load("continued-fraction");
silver := .cf.Lazy(
  (n) -> n == 0 ?: 2 ?_ 2,
  {= name=:silverRatio, evidence=:declaredPositiveTail }
);
silver.Coefficients(8);
silver.Enclosure(6);
```

For an arbitrary rule, the claim that every future tail coefficient stays
positive remains an explicit constructor guarantee. Observed violations are
rejected rather than silently producing an invalid enclosure.

## Bounded refinement and Halo comparisons

The shared Numerics protocol advances at most one coefficient per call and
keeps the narrowest certified cylinder reached within the budget:

```rix
.Plugin.Load("continued-fraction");
.Plugin.Load("numerics");
root := .cf.Sqrt2();
result := .numerics.Refine(root, {=
  absoluteWidth=1/1000,
  maxWork=20
});
.Table({=
  columns=["status", "interval", "width", "coefficients", "calls"],
  rows=[[
    result[:status],
    result[:interval],
    result[:achievedWidth],
    result[:work][:coefficients],
    result[:work][:calls]
  ]]
});
root < {~ 3/2, 1/1000 };
```

Try changing `maxWork` to `0`, `1`, and `2`. The comparison remains undecided
until the available convergent cylinder separates the two neighborhoods.

## Arithmetic of continued-fraction reals

Coefficient transducers remain available for future specialized algorithms.
The complete field surface works now through a certified recipe while keeping
the `ContinuedFractionReal` semantic family:

```rix
.Plugin.Load("continued-fraction");
.Plugin.Load("numerics");
x := .cf.Sqrt2();
values := [x+x, x-x, x*x, x/x, -x, .Abs(x), x^2, x+1/3];
.Table({=
  columns=["type", "interval"],
  rows=values.Map((value) -> [
    value.__type,
    .numerics.Refine(value, {= absoluteWidth=1/1000, maxWork=120 })[:interval]
  ])
});
```

`x+1/3` stays in the continued-fraction family because the Rational is an
exact embeddable value. Combining `x` with a Cauchy or algebraic real instead
chooses their common certified Oracle target.
