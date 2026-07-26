---
title: Rational betweenness oracles
description: Query and refine a real number through exact rational intervals.
theme: Numbers and numerics
status: proposed
---

# Rational betweenness oracles

> This tutorial defines the acceptance example for the proposed `oracle`
> plugin. The code is not runnable until the implementation phases in
> [specification.md](specification.md) are complete.

Load the package and construct the paper's halo oracle for a rational number:

```rix
.Plugin.Load("oracle");

x := .oracle.Rational(3 / 7, {= procedure = :halo });
answer := .oracle.Ask(x, (2 / 5):(1 / 2), 1 / 100);
.Table({=
  columns = ["status", "query", "fuzziness", "prophecy"],
  rows = [[answer.status, answer.query, answer.delta, answer.prophecy]]
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
  trace = true
});

.Fragment([
  .Heading(2, "Refinement result"),
  .Paragraph(["Certified interval: ", result.interval]),
  .Table(result.trace)
]);
```

The trace is suitable for the CLI, RiX Web, or a document renderer. A renderer
does not query the oracle itself; the bounded mathematical operation first
produces a portable interval and evidence.

## A Newton funnel

The paper constructs nth-root oracles from nested Newton intervals. The plugin
will expose that construction directly:

```rix
sqrt2 := .oracle.NthRoot(2, 2, {= method = :newtonFunnel });
view := .oracle.Refine(sqrt2, {= width = 1 / 1000000 });
view.interval;
```

`sqrt2` retains the constructor parameters and refinement procedure, while
`view.interval` is a finite exact enclosure suitable for serialization and
display.

## Approximate comparison

Exact equality of arbitrary oracle reals is not generally a finite numerical
test. The useful executable operation is the paper's epsilon-trichotomy:

```rix
y := .oracle.NthRoot(2, 2);
.oracle.CompareWithin(x, y, 1 / 1000);
```

The result is one of `:less`, `:greater`, `:compatible`, or `:undecided`, with
the disjoint intervals or common compatible interval that justify it. It does
not turn a failed attempt to separate two values into a claim of exact
equality.
