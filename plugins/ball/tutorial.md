---
title: Certified nested real balls in RiX
description: Use pure RiX exact midpoint-radius balls and bounded square-root refinement.
theme: Numbers and numerics
status: implemented
---

## Exact finite balls

A `Ball` is an exact midpoint-radius snapshot implemented as a semantic RiX
value. Its interval and
component accessors never pass through a floating-point value:

```rix
.Plugin.Load("ball");
b := .ball(3 / 2, 1 / 4);
.Table({=
  columns = ["ball", "midpoint", "radius", "lower", "upper"],
  rows = [[b, b.Midpoint(), b.Radius(), b.Lower(), b.Upper()]]
});
```

The ball contains every value from `5/4` through `7/4`, endpoints included.
`Contains` can check either an exact scalar or another ball.

## Outward arithmetic and dyadic grids

Finite-ball arithmetic returns the exact interval hull of the operation.
`RoundOut` explicitly widens both endpoints to a selected dyadic grid:

```rix
.Plugin.Load("ball");
a := .ball(2, 1 / 10);
b := .ball(3, 1 / 5);
product := a * b;
dyadic := product.RoundOut(8);
.Table({=
  columns = ["operation", "ball", "certified interval"],
  rows = [
    ["a + b", a + b, (a + b).Interval()],
    ["a * b", product, product.Interval()],
    ["8-bit outward", dyadic, dyadic.Interval()]
  ]
});
```

Division works when the divisor's ball excludes zero. A ball that contains
zero cannot certify a finite reciprocal and is rejected.

## A nested square-root real

`Sqrt` creates a recipe rather than choosing one permanent approximation.
Each requested bisection snapshot is contained in every earlier one:

```rix
.Plugin.Load("ball");
root := .ball.Sqrt(2);
steps := [0, 1, 2, 4, 8];
.Table({=
  columns = ["bisections", "ball", "interval", "width"],
  rows = steps.Map((n) -> [
    n,
    root.Ball(n),
    root.Ball(n).Interval(),
    root.Ball(n).Upper() - root.Ball(n).Lower()
  ])
});
```

The lower endpoint always squares to at most `2`, and the upper endpoint
always squares to at least `2`. Perfect rational squares such as `9` start as
point balls immediately.

## Generic refinement and Halo decisions

The shared Numerics contract asks for a target width and always applies a
finite work budget. Language Halo comparisons use the same certified protocol:

```rix
.Plugin.Load("ball");
.Plugin.Load("numerics");
root := .ball.Sqrt(2);
result := .numerics.Refine(root, {=
  absoluteWidth = 1 / 1000,
  maxWork = 20
});
.Table({=
  columns = ["status", "interval", "width", "calls", "certified"],
  rows = [[
    result[:status],
    result[:interval],
    result[:achievedWidth],
    result[:work][:calls],
    result[:certified]
  ]]
});
root < {~ 3 / 2, 1 / 1000 };
```

With `maxCalls=0`, that last comparison is an undecided value carrying
`:budgetExhausted` evidence. Asking an already finite ball for a narrower
enclosure similarly produces `:resolutionFloor`; neither outcome discards its
best certified interval.

## Arithmetic on nested Ball reals

Finite Balls retain their exact interval-hull arithmetic. Nested Ball recipes
retain the `NestedBallReal` family while an Oracle recipe coordinates later
refinement:

```rix
.Plugin.Load("ball");
.Plugin.Load("numerics");
x := .ball.Sqrt(2);
values := [x+x, x-x, x*x, x/x, -x, .Abs(x), x^2, x+1/3];
.Table({=
  columns=["type", "interval"],
  rows=values.Map((value) -> [
    value.__type,
    .numerics.Refine(value, {= absoluteWidth=1/1000, maxWork=100 })[:interval]
  ])
});
```

The Rational `1/3` is embedded exactly in the nested-Ball family. A Float is
not eligible for that promotion; write an explicit Float conversion only when
binary64 arithmetic is actually intended.
