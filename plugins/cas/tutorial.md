---
title: Course-level symbolic forms and integration
description: Normalize exact polynomials and inspect a bounded integration ladder with absolute-value, trigonometric, and quadratic cases.
theme: Algebra and analysis
status: implemented
---

Load one isolated CAS surface. Its dependencies remain ordinary focused RiX
plugins rather than an external computer-algebra process.

## Normalize without losing evidence

```rix
.Plugin.Load("cas");
x := .calculus.Variable(:x);
source := (x+1)*(x-1);
collected := .cas.Collect(source,:x);
expanded := .cas.Expand(source,:x);
factored := .cas.Factor(source,:x);
{: collected[:coefficients],expanded[:operation],factored[:factors].Len() };
```

## Walk the integration ladder

```rix
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

The logarithm row has a positive-argument obligation because `Log(2*x+1)` is
the source function. A reciprocal uses a different, global real primitive:

```rix
.Plugin.Load("cas");
x := .calculus.Variable(:x);
reciprocal := .cas.Integrate(1/x,x);
{: reciprocal[:antiderivative],reciprocal[:obligations],
   .cas.CheckIntegral(reciprocal)[:accepted] };
```

Its result is a public `Log(Abs(x))` graph with the exact obligation `x != 0`,
not a false positivity restriction.

## Add the common trigonometric and quadratic cases

```rix
.Plugin.Load("cas");
x := .calculus.Variable(:x);
Sin := .calculus.Sin();
Cos := .calculus.Cos();
sine := .cas.Integrate(Sin(2*x+1),x);
cosine := .cas.Integrate(Cos(3*x-2),x);
quadratic := .cas.Integrate(.rf`1/(x^2+1)`);
.Table({=
  columns=["source family","antiderivative","last rule"],
  rows=[
    ["affine sine",sine[:antiderivative],sine[:rules].Last()],
    ["affine cosine",cosine[:antiderivative],cosine[:rules].Last()],
    ["irreducible quadratic",quadratic[:antiderivative],quadratic[:rules].Last()]
  ]
});
```

The quadratic rule proves the negative discriminant condition exactly and
retains the completed-square coefficients. Higher trigonometric powers and
products remain outside this bounded rung.

## Let exact partial fractions do the algebra

```rix
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

```rix
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
3. Compare the source-domain obligation for `Log(x)` with the reciprocal-domain
   obligation for `1/x`.
4. Derive the completed-square formula used for `(m*x+n)/(a*x^2+b*x+c)` when
   `4*a*c-b^2 > 0`.
5. List the bounded trigonometric power reductions needed next without
   attempting general identity search.
