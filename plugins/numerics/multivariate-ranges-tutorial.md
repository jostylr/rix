---
title: Rational boxes, certified ranges, and Krawczyk classification
description: Runnable examples of Jacobian, affine, multivariate Taylor, and nonlinear Krawczyk enclosures.
theme: Numbers and numerics
status: implemented
---

# Rational boxes and dependency-aware certified ranges

Load Calculus and Numerics, then make a named Cartesian product. Every axis
must be one closed bounded rational interval.

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");

box := .numerics.Box({= length=(99/10):(101/10), scale=(49/50):(51/50) });
{: box[:schema], box[:variables], box[:dimension] };
```

## A checked Jacobian enclosure

The gradient is a transformation collection, not an unverified list supplied
by the caller. The checker derives each partial derivative again.

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");

x := .calculus.Variable(:x);
y := .calculus.Variable(:y);
f := x*y+x^2;
gradient := .calculus.GradientResult(f,[:x,:y]);
result := .numerics.JacobianRange(
  f,gradient,{= x=0:1, y=0:1 },{= maxSubboxes=4 }
);
{: result[:range], result[:work], result[:checker][:accepted] };
```

Increase `maxSubboxes` to 8 or 16. The widest-axis rule is deterministic, so
the same request produces the same exact evidence record.

## See correlation directly

Ordinary interval evaluation forgets that repeated `x` values must agree.
Affine arithmetic gives every input axis one reusable symbol.

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");

x := .calculus.Variable(:x);
difference := .numerics.AffineRange(x-x,{= x=(-3):5 });
parabola := .numerics.AffineRange(x*(1-x),{= x=0:1 });
{: difference[:range], parabola[:range], parabola[:checker][:accepted] };
```

The first result is exactly `{0}`. The second is `[0,1/2]`: it encloses the
true `[0,1/4]` while retaining much more dependency information than naive
interval multiplication.

## A Hessian remainder

Taylor models need both checked derivative collections. The gradient supplies
the centre-linear term and the Hessian bounds every second-order remainder.

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");

x := .calculus.Variable(:x);
y := .calculus.Variable(:y);
f := x*y+x^2;
gradient := .calculus.GradientResult(f,[:x,:y]);
hessian := .calculus.HessianResult(f,[:x,:y]);
result := .numerics.TaylorModelRange(
  f,gradient,hessian,{= x=0:1, y=0:1 },{= maxSubboxes=2 }
);
{: result[:range], result[:partitions][1][:remainder],
   .numerics.CheckMultivariateRange(result)[:accepted] };
```

Inspect `gradientRanges`, `hessianRanges`, and `obligationChecks` on each
partition. If any derivative is wrong or a domain condition is not proved on
the complete box, the strategy returns `unknown` rather than a certificate.

## Certify a nonlinear system with Krawczyk

Use a vector of public Calculus expressions and its checked Jacobian. The
circle/diagonal system has the positive solution
`x=y=1/sqrt(2)` in the selected box.

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");

x := .calculus.Variable(:x);
y := .calculus.Variable(:y);
system := [x^2+y^2-1,x-y];
jacobian := .calculus.JacobianResult(system,[:x,:y]);
result := .numerics.Krawczyk(
  system,jacobian,{= x=(1/2):1,y=(1/2):1 },{= maxIterations=4,trace=1 }
);
{: result[:classification],result[:rootExistence],result[:box],
   result[:checker][:accepted] };
```

Strict operator inclusion is the uniqueness theorem, not a sample-based
guess. The same service can exclude a complete box or remain honestly
unresolved when its rational midpoint preconditioner is singular:

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");
x := .calculus.Variable(:x);
y := .calculus.Variable(:y);
excludedSystem := [x^2+1,y];
singularSystem := [x^2,y];
excluded := .numerics.Krawczyk(
  excludedSystem,.calculus.JacobianResult(excludedSystem,[:x,:y]),
  {= x=1:2,y=(-1):1 }
);
unresolved := .numerics.Krawczyk(
  singularSystem,.calculus.JacobianResult(singularSystem,[:x,:y]),
  {= x=(-1):1,y=(-1):1 }
);
{: excluded[:classification],excluded[:rootExistence],
   unresolved[:classification],unresolved[:diagnostics] };
```

## Further work

1. Replace `f` with `x-y`, compare `GraphRange` and `AffineRange`, and explain
   which repeated-coordinate dependencies remain.
2. Model an area measurement `width*height` with rational error bars centred
   at physical measurements. Compare 1, 4, and 16 Jacobian subboxes.
3. Use `x*(1-x)` and find how many affine subboxes are needed before its hull
   becomes visibly close to `[0,1/4]`.
4. Replace the polynomial with `1/x`, first using a positive box and then a box
   crossing zero. Compare how the Jacobian and affine strategies fail closed.
5. Add a third variable to `x*y+z^2`. Generate its gradient and Hessian, then
   inspect the stable variable order in the box and derivative collections.
6. Change the Krawczyk circle box to `(-1):1` on both axes. Explain why the
   singular midpoint preconditioner is an algorithmic limitation rather than a
   proof that no roots exist.
