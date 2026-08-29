---
title: Course-level symbolic forms and integration
description: Normalize exact polynomials and inspect a bounded integration ladder with replayable rules and visible domain obligations.
theme: Algebra and analysis
status: implemented
---

# Course-level symbolic forms and integration

Load one isolated CAS surface. Its dependencies remain ordinary focused RiX
plugins rather than an external computer-algebra process.

## Normalize without losing evidence

```{.rix exec=true}
.Plugin.Load("cas");
x := .calculus.Variable(:x);
source := (x+1)*(x-1);
collected := .cas.Collect(source,x);
expanded := .cas.Expand(source,x);
factored := .cas.Factor(source,x);
.Table({=
  columns=["form","result"],
  rows=[
    ["ascending coefficients",collected[:coefficients]],
    ["expanded graph",expanded[:expression]],
    ["factor evidence",factored[:factors]]
  ]
});
```

## Walk the integration ladder

```{.rix exec=true}
.Plugin.Load("cas");
x := .calculus.Variable(:x);
Exp := .calculus.Exp();
Log := .calculus.Log();
examples := [
  .cas.Integrate(3*x^2+4,x),
  .cas.Integrate((2*x+3)^4,x),
  .cas.Integrate(Exp(2*x+3),x),
  .cas.Integrate(x^2*Exp(x),x),
  .cas.Integrate(Log(2*x+1),x)
];
.Table({=
  columns=["status","antiderivative","rules","obligations"],
  rows=examples.Map((result)->[
    result[:status],result[:antiderivative],result[:rules],result[:obligations]
  ])
});
```

The logarithm row has a positive-argument obligation. That is the real branch
implemented by the public Calculus `Log`; it is not silently presented as a
global `log(abs(x))` identity.

## Let exact partial fractions do the algebra

```{.rix exec=true}
.Plugin.Load("cas");
rational := .rf`(2*x+3)/(x^2-1)`;
integral := .cas.Integrate(rational);
replay := .cas.CheckIntegral(integral);
{: integral[:antiderivative],integral[:obligations],replay[:accepted] };
```

The RationalFunction service proves the decomposition; CAS integrates the
polynomial and linear-factor terms. The log obligations retain the selected
real branches.

## Unsupported is a useful result

```{.rix exec=true}
.Plugin.Load("cas");
x := .calculus.Variable(:x);
Sqrt := .calculus.Sqrt();
unsupported := .cas.Integrate(Sqrt(x^2+1),x);
{: unsupported[:status],unsupported[:reason],unsupported[:antiderivative] };
```

This integral has a closed form involving inverse hyperbolic functions, but it
is outside the current course ladder. A visible unsupported record is safer
and more educational than a guessed transformation.

## Further work

1. Differentiate each returned antiderivative and compare it with the source.
2. Try repeated linear factors such as `1/(x-1)^2` through `.rf`.
3. Explain why the positive-log obligation matters for `1/x`.
4. List the trigonometric integration rules needed for a first-year calculus
   course before attempting general identity search.
