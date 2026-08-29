---
title: Rational betweenness oracles
description: Query and refine a real number through exact rational intervals.
theme: Numbers and numerics
status: implemented
---

Load the package and construct the paper's halo oracle for a rational number:

```rix
.Plugin.Load("oracle");

x := .oracle.Rational(3 / 7, {= procedure = :halo });
answer := .oracle.Ask(x, (2 / 5):(1 / 2), 1 / 100);
.Table({=
  columns = ["status", "query", "fuzziness", "prophecy"],
  rows = [[
    answer[:status],
    answer[:query][:interval],
    answer[:query][:delta],
    answer[:prophecy][:interval]
  ]]
});
```

The answer is structured data. `:yes`, `:no`, and `:unknown` are distinct, and
a returned prophecy is an exact rational interval with provenance rather than
a pair of display decimals.

When ordinary RiX control flow needs a logical value, adapt the procedural
answer explicitly:

```rix
decision := .oracle.Decision(answer);
```

`:yes` becomes true, `:no` becomes null/false, and `:unknown` becomes a
diagnostic undecided value carrying the query, reason, evidence, and work.
This keeps the procedure's three statuses without making a symbol accidentally
truthy.

Refine the same represented number with a finite work budget:

```rix
result := .oracle.Refine(x, {=
  width = 1 / 1000,
  maxCalls = 100,
  trace = 1
});

.Fragment([
  .Heading(2, "Refinement result"),
  .Paragraph(["Certified interval: ", result[:interval]]),
  .Table({=
    columns = ["iteration", "split", "branch", "interval", "width"],
    rows = result[:trace].Map((step) -> [
      step[:iteration], step[:split], step[:branch],
      step[:interval], step[:width]
    ])
  })
]);
```

`result[:approximation]` is the scalar form of the work completed by the
refiner. It is present whether the requested width was reached or the finite
budget was exhausted:

```rix
bounded := .oracle.Refine(x, {= width = 1/1000000, maxCalls = 3 });
bounded[:status];         ## :budgetExhausted
bounded[:approximation];  ## certified candidate plus the achieved enclosure
```

This value can participate in ordinary Core/RiX arithmetic and three-state
comparisons. The Oracle remains responsible for further refinement; the
finite approximation itself does not hide an infinite process.

## Language Halo neighborhoods

A language Halo is the compact comparison and membership surface for bounded
certified refinement:

```rix
.Plugin.Load("oracle");

x := .oracle.Rational(3 / 7);
x < {~ 1 / 2, 1 / 1000 };
x ? {~ (2 / 5):(1 / 2), 1 / 1000 };
x < {~ 1 / 2, 1 / 1000, {= maxCalls=3 } };
```

This is not the paper procedure named `:halo`. In `.oracle.Ask`, `delta`
expands the query's open neighborhood. In `{~ target, epsilon }`, epsilon only
sets the requested enclosure width; the target itself is unchanged. If a
budget ends, RiX still uses the best certified enclosure to prove a result
when it can, otherwise the decision is undecided with `:budgetExhausted`
details.

The trace is suitable for the CLI, RiX Web, or a document renderer. A renderer
does not query the oracle itself; the bounded mathematical operation first
produces a portable interval and evidence.

## Reproducible alternatives

The random-halo demonstration records its seed. `Ask` replays one branch,
while bounded `AskAll` shows the two finite alternatives without treating that
observation as a theorem about every possible oracle:

```rix
.Plugin.Load("oracle");
random := .oracle.Rational(3 / 7, {=
  procedure = :randomHalo,
  seed = 17
});
alternatives := .oracle.AskAll(
  random,
  (1 / 2):(3 / 5),
  1 / 10,
  {= maxAlternatives = 2 }
);
alternatives.Map((item) -> item[:status]);
```

## Arithmetic and certified adapters

Oracle arithmetic keeps an immutable recipe and materializes exact rational
intervals only when a width is requested:

```rix
.Plugin.Load("oracle");
.Plugin.Load("numerics");
x := .oracle.Rational(3/2);
values := [x+x, x-x, x*x, x/x, -x, .Abs(x), x^3];
values.Map((value) -> .numerics.Refine(value, {=
  absoluteWidth=1/1000,
  maxWork=40,
  trace=1
})[:interval]);
```

Exact Rationals become exact point leaves. `.oracle.From(value)` also accepts
any certified, arbitrarily refinable singleton provider. It rejects finite
non-point Balls, RationalIntervals, and Floats because those inputs do not
carry the missing singleton/refinement meaning.

## Exact refinement funnels

A funnel exposes compatible certified intervals at arbitrarily small rational
widths. The nth-root constructor uses exact Newton brackets; the trace remains
an enclosure even when the work budget ends:

```rix
.Plugin.Load("oracle");
funnel := .oracle.NthRootFunnel(2, 2, {= start=2 });
root := .oracle.FromFunnel(funnel);
refined := .oracle.Refine(root, {=
  width=1/1000,
  maxCalls=20,
  maxIterations=20,
  trace=1
});
refined[:trace].Map((step) -> {=
  interval=step[:interval],
  brackets=step[:interval].Low()^2 <= 2 && step[:interval].High()^2 >= 2
});
```

The generic adapter accepts any provider that publicly certifies singleton
denotation and arbitrary refinement. A certified Cauchy sequence therefore
needs no private Oracle integration:

```rix
.Plugin.Load("cauchy");
sequence := .cauchy.Geometric(1, 1/2);
cauchyReal := .oracle.Cauchy(sequence);
.oracle.Refine(cauchyReal, {= width=1/1000, maxCalls=20 });
```

## Coarse oracles

A coarse Oracle knows a fixed exact interval at eta resolution, but does not
pretend to denote one arbitrarily refinable singleton:

```rix
.Plugin.Load("oracle");
coarse := .oracle.Coarse((2/5):(3/5), 1/10);
wide := .oracle.Refine(coarse, {= width=1/4, maxCalls=0 });
fine := .oracle.Refine(coarse, {= width=1/1000, maxCalls=0 });
{: wide[:status], fine[:status], fine[:diagnostics], fine[:work] };
```

The wide request is `:enclosed`. The fine request is `:resolutionFloor`, not
`:budgetExhausted`: more host work cannot extract precision that this coarse
model never claimed. Both results retain the exact certified interval.

## Compare without guessing equality

Bounded comparison distinguishes strict order from epsilon compatibility:

```rix
.Plugin.Load("oracle");
third := .oracle.Rational(1/3);
sqrt2 := .oracle.NthRoot(2,2);
ordered := .oracle.CompareWithin(third,sqrt2,1/100,{= maxCalls=40 });
selfCheck := .oracle.Equivalent(sqrt2,sqrt2,{= epsilon=1/100,maxCalls=40 });
{: ordered[:status],selfCheck[:status],selfCheck[:evidence] };
```

The first status is `:less`. The second is `:undecided`, because two compatible
finite enclosures are not a proof of equality.

Arithmetic recipes can also be exposed as certified funnels:

```rix
x := .oracle.Rational(2/3);
y := .oracle.Rational(3/5);
productFunnel := .oracle.FunnelOperation(:mul,x,y);
.oracle.FunnelRefine(productFunnel,{= absoluteWidth=1/1000,maxCalls=20 });
```

## A testing root with explicit evidence

The testing constructor refuses to infer a theorem from sampled signs. Supply
the existence, uniqueness, and continuity evidence separately:

```rix
rootEvidence := .oracle.RootEvidence({=
  domain=1:2,
  rootExists=1,
  unique=1,
  continuous=1,
  endpointSigns=[:negative,:positive],
  level=:proof,
  source=:declaredTutorialHypotheses
});
testingRoot := .oracle.Testing({=
  function=(x)->x^2-2,
  domain=1:2,
  rootEvidence=rootEvidence
});
.oracle.Refine(testingRoot,{= width=1/1000,maxCalls=20,trace=1 });
```

An `:assumed` or `:observed` record remains useful metadata but cannot authorize
certified testing-root bisection.
