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

Newton funnels, Cauchy adapters, arithmetic, and epsilon-trichotomy are later
phases. Their absence is explicit rather than replaced with floating-point
guesses.
