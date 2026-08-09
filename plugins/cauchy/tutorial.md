---
title: Certified Cauchy sequences
description: Turn rational terms and effective tail bounds into certified real enclosures.
theme: Numbers and numerics
status: implemented
---

## A sequence is not yet a certified real

A bare rational sequence supports exact term inspection, but it has no
effective information about where its limit lies:

```rix
.Plugin.Load("cauchy");
.Plugin.Load("numerics");
s := .cauchy.Sequence((n) -> 1 / (n + 1));
.Table({=
  columns=["index", "term"],
  rows=[0,1,2,3,9].Map((n) -> [n, s.Term(n)])
});
.numerics.Refine(s)[:status];
```

The final status is `:unsupported`. Sampling more terms would be observation,
not proof of a tail bound.

## Supplying a tail bound and modulus

A certified sequence supplies `term(n)`, a nonnegative error bound around
that term, and a modulus choosing an index for a requested error radius:

```rix
.Plugin.Load("cauchy");
.Plugin.Load("numerics");
c := .cauchy.Certified(
  (n) -> n == 0 ?: 0 ?_ 1,
  (n) -> n == 0 ?: 1 ?_ 0,
  (radius) -> 1,
  {= name="eventually one", evidence=:eventuallyConstant }
);
.Table({=
  columns=["index", "term", "tail bound", "enclosure"],
  rows=[0,1].Map((n) -> [n, c.Term(n), c.TailBound(n), c.Enclosure(n)])
});
.numerics.Refine(c, {= absoluteWidth=1/100, maxWork=3 })[:interval];
```

RiX checks that the selected tail bound actually meets the requested radius.
For arbitrary supplied functions, the global convergence claim remains an
explicit constructor guarantee rather than a theorem inferred from source.

## A verified geometric-series real

The built-in geometric constructor knows and verifies its exact remainder
formula. It retains the sequence even though this particular limit is
Rational:

```rix
.Plugin.Load("cauchy");
g := .cauchy.Geometric(1, 1/2, {= name="binary geometric" });
.Table({=
  columns=["index", "partial sum", "tail bound", "certified interval"],
  rows=[0,1,2,3,8].Map((n) -> [
    n,
    g.Term(n),
    g.TailBound(n),
    g.Enclosure(n)
  ])
});
```

At every row the exact limit `2` lies in the interval. Negative ratios use the
same absolute remainder theorem and produce certified alternating examples.

## Bounded refinement and Halo decisions

Refinement advances only while its exact work budget permits. The result keeps
the best tail witness whether or not the requested width is reached:

```rix
.Plugin.Load("cauchy");
.Plugin.Load("numerics");
g := .cauchy.Geometric(1, 1/2);
result := .numerics.Refine(g, {=
  absoluteWidth=1/1000,
  maxWork=20
});
.Table({=
  columns=["status", "index", "interval", "width", "calls"],
  rows=[[
    result[:status],
    result[:work][:index],
    result[:interval],
    result[:achievedWidth],
    result[:work][:calls]
  ]]
});
g < {~ 3, 1/1000 };
```

With `maxCalls=0`, a relation not already proved by the initial enclosure
remains undecided with `:budgetExhausted` evidence.
