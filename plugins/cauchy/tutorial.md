---
title: Certified Cauchy sequences in RiX
description: Use pure RiX rational terms and effective tail bounds to build certified real enclosures.
theme: Numbers and numerics
status: implemented
---

The plugin itself is written in RiX, so the same definitions run in the CLI,
RiX Web, and RiX Notebook without a JavaScript plugin permission boundary.

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

## Arithmetic of certified Cauchy reals

Arithmetic results remain `CauchyReal` values. Effective same-family operands
produce new sequences with exact computed moduli:

```rix
.Plugin.Load("cauchy");
.Plugin.Load("numerics");
x := .cauchy.Geometric(1, 1/2); ## limit 2
values := [x+x, x-x, x*x, x/x, -x, .Abs(x), x^3, x+1/3];
.Table({=
  columns=["type", "interval"],
  rows=values.Map((value) -> [
    value.__type,
    .numerics.Refine(value, {= absoluteWidth=1/1000, maxWork=120 })[:interval]
  ])
});
```

The Rational operand becomes an exact Cauchy-family leaf. Every computed term
comes from an exact interval image of certified operand enclosures, and the
derived tail bound is checked before it is returned. This can make an interval
wider than a hand-optimized proof, but it never narrows away known truth.

Division and negative powers stay native only when the initial denominator
certificate excludes zero. In the example, `x/x` crosses that conservative
boundary because `x` initially encloses zero, so it uses the shared Oracle
recipe. Oracle refinement can later separate zero; if it cannot do so within
the work budget, the result is structured `:unknown` evidence.

## Lazy terms and a paper-compatible funnel

`Terms` creates a bounded lazy sequence. The callback is evaluated only as
elements are requested, and shallow copies keep their current cache but advance
independently:

```rix
.Plugin.Load("cauchy");
g := .cauchy.Geometric(1, 1/2);
terms := g.Terms(0, 5);
third := terms.Get(3);
copy := terms;
fifth := copy.Get(5);
.Table({=
  columns=["third partial sum", "fifth partial sum"],
  rows=[[third, fifth]]
});
```

A certified effective sequence can also expose the paper-compatible refinement
funnel used by Oracle. Both routes below preserve exact enclosing intervals and
stop at the supplied call budget:

```rix
.Plugin.Load("cauchy");
g := .cauchy.Geometric(1, 1/2);
funnel := g.Funnel({= name=:geometricFunnel });
direct := funnel.Refine({= absoluteWidth=1/1000, maxCalls=20 });
throughOracle := funnel.ToOracle().Refine({=
  absoluteWidth=1/1000,
  maxCalls=20
});
.Table({=
  columns=["route", "status", "certified interval"],
  rows=[
    ["funnel", direct[:status], direct[:interval]],
    ["oracle", throughOracle[:status], throughOracle[:interval]]
  ]
});
```
