---
title: Reusable certified function facts
description: Inspect trusted domains, ranges, periods, symmetries, monotonicity families, boundaries, and pole sets published beside Numerics functions.
theme: Numbers and numerics
status: implemented
---

# Reusable function facts

The direct interval algorithms for `Sin`, `Cos`, `Tan`, `Sec`, `Csc`, and
`Cot` already use classical facts about their domains and landmarks. RiX now
also publishes those facts as one shared `rix.numerics.function-facts@1`
record, so later strategies do not need to duplicate hidden tables.

```{.rix exec=true}
.Plugin.Load("numerics");

sine := .numerics.FunctionFacts(.numerics.Sin);
tangent := .numerics.FunctionFacts(.numerics.Tan);

{:
  sine[:globalRange][:range],
  sine[:period],
  sine[:symmetry],
  tangent[:domain],
  tangent[:monotonicity],
  tangent[:singularities]
};
```

The six fact operations are:

- `domain`: all reals or reals excluding a symbolic pi lattice;
- `globalRange`: an exact rational range set when possible, otherwise a
  precise symbolic set family such as all reals or `|y| >= 1`;
- `period`: a rational multiple of the named constant pi;
- `symmetry`: odd or even about zero;
- `monotonicity`: a periodic family or a direction on every domain component;
- `singularities`: no poles or a complete simple-pole lattice.

Pi multiples remain symbolic because pi is not rational. This avoids turning
an approximation to a period or pole into an exact statement. A strategy that
needs rational endpoints must enclose the named landmark to its requested
tolerance, as the current circular range algorithms do.

## Elementary domains and monotonicity

The same surface covers exponentials, logarithms, roots, inverse circular
functions, and real hyperbolic functions:

```{.rix exec=true}
.Plugin.Load("numerics");

logarithm := .numerics.FunctionFacts(.numerics.Ln);
root := .numerics.FunctionFacts(.numerics.Sqrt);
cosh := .numerics.FunctionFacts(.numerics.Cosh);
cosech := .numerics.FunctionFacts(.numerics.Csch);

{:
  logarithm[:domain], logarithm[:monotonicity],
  root[:domain],
  cosh[:symmetry], cosh[:monotonicity],
  cosech[:domain], cosech[:singularities]
};
```

These records distinguish a function-domain boundary from a pole. Square root
includes its boundary at zero; `Csch` excludes zero and has a simple pole
there; `Atanh` has two open logarithmic boundaries. The parameterized `Log`
surface reports base-dependent monotonicity instead of claiming an
unconditional direction.

## Compare the six circular functions

```{.rix exec=true}
.Plugin.Load("numerics");

functions := [
  [:sin,.numerics.Sin], [:cos,.numerics.Cos],
  [:tan,.numerics.Tan], [:sec,.numerics.Sec],
  [:csc,.numerics.Csc], [:cot,.numerics.Cot]
];

.Table({=
  columns=["function","domain","range","period multiplier","symmetry","singularities"],
  rows=functions.Map((item)->{;
    facts = .numerics.FunctionFacts(item[2]);
    [item[1], facts[:domain][:kind], facts[:globalRange][:kind],
     facts[:period][:multiplier], facts[:symmetry][:kind],
     facts[:singularities][:kind]];
  })
});
```

## What “certified” means here

These are trusted leaves, not self-authenticating maps. `FunctionFacts`
resolves the exact callable through the host's sealed RangeProvider registry
before returning `certified=1`. Copying the visible fields does not acquire
that seal, and future fact consumers must resolve the registered provider
again rather than trust a caller-supplied record.

The leaf's evidence identifies the theorem family, provider, and version. A
derived claim—such as “this particular rational interval contains no tangent
pole”—still needs a checkable reduction from the symbolic lattice to rational
bounds. The static fact states the complete family; it does not pretend that a
specific input has already been analyzed.

## Large-period experiment

The published facts are most useful when the interval is far from zero. This
example compares the static global fallback with the direct algorithm's
landmark reasoning:

```{.rix exec=true}
.Plugin.Load("numerics");

facts := .numerics.FunctionFacts(.numerics.Sin);
far := .numerics.Range(.numerics.Sin(102:103), {=
  endpointTolerance=1/1000,
  maxSubintervals=4,
  maxWork=120
});

{:
  facts[:globalRange][:range],
  facts[:period],
  far[:range],
  far[:evidence][:landmarks]
};
```

The input is never converted to floating point merely to decide which period
it lies in. Certified pi enclosures establish the relevant landmark indices,
and `[-1,1]` remains a sound fallback if a bounded search cannot exclude or
include a landmark within its work budget.
