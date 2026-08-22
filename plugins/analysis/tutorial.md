---
title: Effective limits, series, and justified exchanges in RiX
description: Build scalar and function sequences, inspect exact convergence witnesses, and keep limit-exchange hypotheses visible.
theme: Analysis
status: implemented
---

The `analysis` plugin starts with the distinction that matters most in a first
real-analysis course: looking at many terms is useful exploration, but it is
not a proof about every later term or every point of a domain.

## Build a sequence of functions

Each term is an ordinary `.calculus` abstract function. Loading `.analysis`
loads that capability dependency automatically.

```rix
.Plugin.Load("analysis");
make := (n)->.calculus.Function(@"tutorial.fn.@{n}@1", {=
  name=@"f_@{n}",
  domain=(-1):1,
  codomain=:Rational,
  implementation=(x)->x/(n+1),
  implementationEvidence=:exactRationalFormula
});
sequence := .analysis.FunctionSequence(make, {=
  name=:shrinkingLines,
  domain=(-1):1,
  codomain=:Rational
});
.Table({=
  columns=["n","f_n(1)"],
  rows=[0,1,2,3].Map((n)->[n,sequence.Term(n)(1)])
});
```

The table evaluates four exact functions. `sequence.Record()` shows the index
ray, common domain/codomain, and whether effective tail information exists.

## Consume terms lazily

`Terms` returns the shared native lazy-sequence representation, not a special
Analysis-only iterator.

```rix
.Plugin.Load("analysis");
make := (n)->.calculus.Function(@"tutorial.lazy.@{n}@1", {=
  implementation=(x)->x+n,
  implementationEvidence=:definition
});
sequence := .analysis.FunctionSequence(make);
window := sequence.Terms(2,3);
functions := window.Materialize();
functions.Map((function)->function.SemanticId());
```

Use a finite `count` before `Materialize`. An unbounded `Terms()` stream is
intended for finite indexing and incremental algorithms.

## State the mode explicitly

The same sequence can appear in several different mathematical claims. The
mode is never inferred from a plot or a list of values.

```rix
.Plugin.Load("analysis");
series := .analysis.GeometricSeries(1/2);
claims := [:pointwise,:uniform,:almostEverywhere,:inMeasure,:norm]
  .Map((mode)->series.Claim(mode));
.Table({=
  columns=["mode","status","reason"],
  rows=claims.Map((claim)->{;
    result := claim.Check({= epsilon=1/100 });
    [claim[:mode],result[:status],result[:reason]]
  })
});
```

Phase 1 has one proof kernel, for the geometric series in uniform mode. The
other four rows remain `:unknown`; the records do not blur their meanings.

## Inspect the exact uniform certificate

For `r=1/2`, the domain is exactly `-1/2:1/2`, and
`r^(n+1)/(1-r)` is a global remainder bound.

```rix
.Plugin.Load("analysis");
series := .analysis.GeometricSeries(1/2,{= name=:binaryGeometric });
result := series.Check(:uniform,{= epsilon=1/1000,maxWork=20 });
.Table({=
  columns=["quantity","exact value"],
  rows=[
    ["S_2(1/2)",series.Term(2)(1/2)],
    ["S(1/2)",series.Limit()(1/2)],
    ["tail after n=3",series.TailBound(3)],
    ["chosen N",result[:witness][:index]],
    ["tail at N",result[:witness][:tailBound]],
    ["status",result[:status]]
  ]
});
```

Try `radius=9/10` with the same epsilon. The certified domain gets wider and
the required index grows. `maxWork` makes that search bounded; exhausting it
returns `:unknown` with the best work record rather than a false conclusion.

## Do not promote a sample grid

A supplied tail callback can express an assumption or feed an exploration,
but the general Phase 1 checker does not certify arbitrary RiX code as a
global theorem.

```rix
.Plugin.Load("analysis");
zero := .calculus.Function("tutorial.zero@1", {=
  implementation=(x)->0,
  implementationEvidence=:definition
});
make := (n)->.calculus.Function(@"tutorial.sample.@{n}@1", {=
  implementation=(x)->x/(n+1),
  implementationEvidence=:definition
});
declared := .analysis.TailEvidence(
  :uniform,
  (n)->1/(n+1),
  (epsilon)->1000,
  {= limit=zero,property=:claimedUniformTail }
);
sequence := .analysis.FunctionSequence(make,{=
  limit=zero,
  tailEvidence=declared,
  domain=(-1):1,
  codomain=:Rational
});
result := sequence.Claim(:uniform,_,{= samples=[-1,-1/2,0,1/2,1] })
  .Check({= epsilon=1/100 });
result[:status];
result[:diagnostics];
```

The result is `:unknown`, with both `:finiteSamplesIgnored` and
`:unverifiedTailProperty` diagnostics. This is the intended result: a theorem
provider can later discharge that assumption, but sampling alone cannot.

## Explore visually

Run
[the geometric function-series exploration](../../explorations/analysis/geometric-function-series.md)
to change the exact radius and requested error, compare partial sums, and see
the certified remainder decrease without confusing the graph with the proof.

## Sum an infinite series with an exact tail

The scalar geometric kernel keeps the term, partial sum, infinite sum, and
remainder in exact Rational arithmetic.

```rix
.Plugin.Load("analysis");
series := .analysis.GeometricScalarSeries(1,1/2,{= name=:binarySeries });
limit := series.Check({= epsilon=1/1000,maxWork=20 });
cauchy := series.Cauchy({= epsilon=1/1000,maxWork=20 });
.Table({=
  columns=["quantity","exact value"],
  rows=[
    ["term a_3",series.Term(3)],
    ["partial sum S_3",series.PartialSum(3)],
    ["infinite sum",series.Sum()],
    ["effective index",limit[:witness][:index]],
    ["tail at that index",limit[:witness][:tailBound]],
    ["Cauchy pair bound",cauchy[:witness][:pairBound]],
    ["limsup",series.Limsup()[:value]],
    ["liminf",series.Liminf()[:value]]
  ]
});
```

`Limsup` and `Liminf` agree here because an effective convergence proof is
available. An arbitrary sampled sequence does not get that conclusion.

## Move through the Cauchy and Numerics protocols

The adapters are optional. Loading `.analysis` alone does not select a real
representation.

```rix
.Plugin.Load("cauchy");
.Plugin.Load("analysis");
.Plugin.Load("numerics");
series := .analysis.GeometricScalarSeries(1,1/2);
real := series.ToCauchy({= name=:twoByGeometricSeries });
sequence := .analysis.FromCauchy(real);
checked := sequence.Check({= epsilon=1/1000 });
enclosure := .analysis.RefineLimit(checked,{= targetWidth=1/100 });
{:
  .cauchy.Term(real,3),
  .cauchy.TailBound(real,3),
  checked[:status],
  enclosure[:interval]
};
```

The checked limit points to the Cauchy real rather than copying it. Numerics
then negotiates refinement with that value's own protocol.

## Ask whether a limit exchange is justified

The continuity theorem for a uniform limit needs continuous terms. The
geometric partial sums are polynomials, so the plugin can discharge both
hypotheses. The differentiation theorem needs different evidence and remains
unknown.

```rix
.Plugin.Load("analysis");
series := .analysis.GeometricSeries(1/2);
limit := .analysis.Limit(series,_,{= mode=:uniform })
  .Check({= epsilon=1/1000,maxWork=20 });
continuity := .analysis.Exchange(:continuity,limit).Check();
differentiation := .analysis.Exchange(:differentiation,limit).Check();
.Table({=
  columns=["operation","status","remaining obligations"],
  rows=[
    [:continuity,continuity[:status],continuity[:obligations]],
    [:differentiation,differentiation[:status],differentiation[:obligations]]
  ]
});
```

Passing an option such as `differentiableTerms=1` records a caller assumption.
It does not silently turn that assumption into proof authority.

## Build exact integral specifications, then refine numerically

On a closed subinterval of its certified domain, the uniform geometric limit
can be exchanged with integration. Analysis owns the theorem record; Calculus
owns the inert integrals; Numerics owns quadrature.

```rix
.Plugin.Load("analysis");
.Plugin.Load("numerics");
series := .analysis.GeometricSeries(1/2);
exchange := .analysis.IntegralExchange(series,-1/2,1/2,{= epsilon=1/1000 });
termIntegral := exchange.TermIntegral(2);
limitIntegral := exchange.LimitIntegral();
enclosure := exchange.Numerical({= secondDerivativeBound=16 })
  .Refine({= targetWidth=1/1000,maxIterations=10000 });
{:
  exchange[:status],
  termIntegral[:schema],
  limitIntegral[:schema],
  enclosure[:interval]
};
```

The second-derivative bound is deliberately explicit. Analysis does not infer
a certified global bound from a few evaluations.
