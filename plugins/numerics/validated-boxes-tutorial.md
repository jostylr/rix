---
title: Validated linear systems and complete nonlinear box searches
description: Replay exact interval solves, prove roots with checked derivatives, and resume a bounded search without losing regions.
theme: Numbers and numerics
status: implemented
---

# Enclose a family of linear systems

Every matrix entry may vary independently in its interval. The returned
solution contains every corresponding point-system solution.

```{.rix exec=true}
.Plugin.Load("numerics");
result := .numerics.IntervalLinearSolve([[2:3,1],[1,3:4]],[1,2]);
{: result[:solution], result[:regular],
   .numerics.CheckIntervalLinearSolve(result)[:accepted] };
```

If a pivot could be zero, the solver keeps an unresolved record rather than a
midpoint answer. Here the scalar coefficient can be zero.

```{.rix exec=true}
.Plugin.Load("numerics");
result := .numerics.IntervalLinearSolve([[0:2]],[1]);
{: result[:classification], result[:certified], result[:solution] };
```

# Prove one root inside a nonlinear box

The positive circle/diagonal intersection lies in the chosen box. Calculus
provides derivative transformations that Numerics checks again.

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");
x := .calculus.Variable(:x);
y := .calculus.Variable(:y);
equations := [x^2+y^2-1,x-y];
jacobian := .calculus.JacobianResult(equations,[:x,:y]);
result := .numerics.IntervalNewtonBox(
  equations,jacobian,{= x=(1/2):1,y=(1/2):1 },{= maxIterations=4 }
);
{: result[:rootExistence], result[:box],
   .numerics.CheckIntervalNewtonBox(result)[:accepted] };
```

# Preserve the unfinished search

The four roots of this system are `(±1,±1)`. The first short run deliberately
exhausts its budget. Both the pending queue and every classified region remain
in the result. Resuming extends the same deterministic search.

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");
x := .calculus.Variable(:x);
y := .calculus.Variable(:y);
equations := [x^2-1,y^2-1];
jacobian := .calculus.JacobianResult(equations,[:x,:y]);
first := .numerics.SubdivideBoxes(
  equations,jacobian,{= x=(-3/2):(3/2),y=(-3/2):(3/2) },
  {= maxBoxes=5,maxDepth=12 }
);
continued := .numerics.ResumeBoxes(first,{= maxBoxes=26 });
{: first[:status],first[:pending].Len(),continued[:unique].Len(),
   continued[:unresolved].Len(),.numerics.CheckBoxSubdivision(continued)[:accepted] };
```

Unique boxes can share a boundary root, so their number is not a distinct-root
count. Unresolved leaves and pending work must stay visible in any report.

# Use Ball inputs with the same proof service

Polynomial coefficients are in descending degree order. Horner evaluation
encloses the whole input Ball; derivative bounds are derived from exact
coefficient differentiation.

```{.rix exec=true}
.Plugin.Load("ball");
argument := .ball(3/2,1/2);
polynomial := .ball.Polynomial([1,0,-2],argument);
derivative := .ball.DerivativeBound([1,0,-2],argument);
linear := .ball.LinearSolve([[.ball(5/2,1/2),1],[1,.ball(7/2,1/2)]],[1,2]);
{: polynomial.Interval(),derivative[:absoluteBound],linear[:certified],
   .numerics.CheckIntervalLinearSolve(linear[:linear])[:accepted] };
```

See the [full contract and work limits](validated-boxes.md) before building an
automated search. The standalone example is
[`examples/newton/validated-boxes.rix`](../../examples/newton/validated-boxes.rix).
