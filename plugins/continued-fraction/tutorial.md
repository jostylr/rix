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

## Evaluate a nonregular generalized form

A generalized continued fraction stores separate partial numerators and
denominators. Finite forms may use signed exact coefficients, so their
convergents come from the continuant recurrence rather than the regular
positive-tail cylinder rule:

```rix
.Plugin.Load("continued-fraction");
g := .cf.GeneralizedFinite(1, [-1,2], [2,-3], {= name=:signedExample });
normalization := g.Normalize();
.Table({=
  columns=["generalized convergents", "exact value", "regular coefficients"],
  rows=[[g.Convergents(), g.Value(), normalization[:coefficients]]]
});
```

The value is `1/4`, and its canonical regular form is `[0,4]`. If a continuant
denominator becomes zero, `ConvergentResult` records that exact witness and
`ZeroStatus` stays `:unknown`; the plugin does not invent an infinite value or
reuse the positive-tail proof from simple continued fractions.

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

## Extract a certified function stream

Any certified arbitrarily refinable singleton real can be exposed as a native
regular-CF stream. The source continues to provide enclosing evidence; the
extractor decides permanent coefficients with exact RationalInterval floors:

```rix
.Plugin.Load("numerics");
.Plugin.Load("continued-fraction");
e := .cf.FromRefinable(.numerics.Exp(1));
ln2 := .cf.FromRefinable(.numerics.Ln(2));
.Table({=
  columns=["function","coefficients","five-term cylinder"],
  rows=[
    ["exp(1)",e.Coefficients(8),e.Enclosure(5)],
    ["ln(2)",ln2.Coefficients(6),ln2.Enclosure(5)]
  ]
});
```

`CoefficientResult(index,{=trace=1})` shows each requested source enclosure,
its image under the accumulated Möbius form, the two endpoint floors, and each
accepted output. `maxRefinements`, `sourceMaxWork`, and `initialSourceWidth`
bound the transaction.

The method is also an accelerated Farey walk. Repeated moves toward one Farey
parent form a run; the run length is the next continued-fraction coefficient.
Testing individual mediants exposes intermediate brackets, while a stable
floor determines the complete run length at once. Both schedules stall at the
same exact rational boundaries unless equality can be proved.

## Roots choose the strongest available representation

```rix
.Plugin.Load("continued-fraction");
periodic := .cf.Sqrt(2/3);
exact := .cf.NthRoot(27,3);
general := .cf.NthRoot(2,3);
.Table({=
  columns=["root","kind","coefficients or value"],
  rows=[
    ["sqrt(2/3)",periodic.Record()[:kind],periodic.Coefficients(8)],
    ["cuberoot(27)",exact.Record()[:kind],exact.Value()],
    ["cuberoot(2)",general.Record()[:kind],general.Coefficients(6)]
  ]
});
```

Perfect powers are finite, nonsquare rational square roots are periodic, and
other roots use certified function extraction. Calling
`FromRefinable(.numerics.Sqrt(4))` deliberately bypasses the exact shortcut and
illustrates why an interval-only provider can remain stuck around the Integer
boundary `2`; `.cf.Sqrt(4)` proves the finite result immediately.

## Arithmetic of continued-fraction reals

Native continued-fraction operands use exact Gosper homographic and
bihomographic coefficient transducers by default. The certified recipe remains
attached as the numerical enclosure witness:

```rix
.Plugin.Load("continued-fraction");
.Plugin.Load("numerics");
x := .cf.Sqrt2();
y := .cf.Periodic([1], [1,2]);
values := [x+y, x-y, x*y, x/y];
.Table({=
  columns=["operation", "transducer", "coefficients", "interval"],
  rows=values.Map((value) -> [
    value.Record()[:operation],
    value.Record()[:transducer],
    value.Coefficients(6),
    .numerics.Refine(value, {= absoluteWidth=1/1000, maxWork=120 })[:interval]
  ])
});
```

Every emitted term follows from agreeing exact corner floors of Gosper's
bihomographic form. `CoefficientResult(n,{=maxInputTerms=...,trace=1})` exposes
the bounded decision and its input/output transactions. It may report
`budgetExhausted` when a coefficient is not yet forced; `Coefficient(n)` never
substitutes a guess.

Finite arithmetic is folded exactly. Identity-aware shortcuts prove `x-x=0`
and nonzero `x/x=1`, while separately constructed equal streams retain bounded
uncertainty because matching prefixes do not prove correlation. Use
`ZeroStatus()` to distinguish exact zero, certified nonzero, and unknown.
Combining a continued fraction with a Cauchy or algebraic real still chooses
their common certified Oracle target.

For a transaction-by-transaction explanation and all four demonstrations, see
the [Gosper arithmetic exploration](../../explorations/continued-fractions/gosper-arithmetic.md).

## Recognize the periodic quadratic equation

An explicitly periodic stream determines an exact Möbius fixed point. The
plugin eliminates that repeating tail and returns a primitive quadratic form
without using floating-point recognition:

```rix
.Plugin.Load("continued-fraction");
root := .cf.Sqrt2();
shifted := root.Translate(3);
reciprocal := root.Reciprocal();
rootForm := root.QuadraticForm();
shiftedForm := shifted.QuadraticForm();
reciprocalForm := reciprocal.QuadraticForm();
.Table({=
  columns=["value", "prefix", "quadratic coefficients", "discriminant"],
  rows=[
    ["sqrt(2)", root.Record()[:prefix], rootForm[:coefficients], rootForm[:discriminant]],
    ["sqrt(2)+3", shifted.Record()[:prefix], shiftedForm[:coefficients], shiftedForm[:discriminant]],
    ["1/sqrt(2)", reciprocal.Record()[:prefix], reciprocalForm[:coefficients], reciprocalForm[:discriminant]]
  ]
});
```

The three equations are `x^2-2=0`, `x^2-6x+7=0`, and `2x^2-1=0`.
The returned source cylinder still encloses the represented root; no decimal
root choice is guessed.

## Query a denominator-bounded best approximation

The second-kind query minimizes the exact scaled error `|q*x-p|` through the
requested denominator bound. It reads one further convergent to certify that
the next denominator is outside the search range:

```rix
.Plugin.Load("continued-fraction");
root := .cf.Sqrt2();
best := root.BestApproximation(10);
limited := root.BestApproximation(100, {= maxCoefficients=2 });
.Table({=
  columns=["request", "status", "approximation", "next denominator", "diagnostics"],
  rows=[
    [10, best[:status], best[:approximation], best[:nextDenominator], best[:diagnostics]],
    [100, limited[:status], limited[:approximation], limited[:nextDenominator], limited[:diagnostics]]
  ]
});
```

The first row certifies `7/5` because the next convergent has denominator `12`.
The second row keeps `3/2`, but reports budget exhaustion instead of claiming
that two observed coefficients settle every denominator through `100`.
