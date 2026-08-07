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
