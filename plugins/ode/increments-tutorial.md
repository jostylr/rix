---
title: Higher-order equations, exact solutions, embedded steps, and bounded shooting
description: Separate exact formulas and certified enclosures from local-error numerical trajectories.
theme: Numbers and numerics
status: implemented
---

## Reduce an equation explicitly

For `y''=-y`, derivative coordinates give `y'=v`, `v'=-y`. The reduction
records which initial value belongs to each derivative; it does not eliminate
variables.

```rix
.Plugin.Load("ode");
y := .calculus.Variable(:y);
higher := .ode.HigherOrder(-y,0,[1,0],0:1,{= stateNames=[:y,:v] });
problem := .ode.ReduceHigherOrder(higher);
[higher[:correspondence],problem[:rhs],problem.PrepareTaylor({= order=4 })[:work]];
```

## Retain an exact affine formula

For `y'=2y+3t+4`, `y(0)=1`, the formula is
`(15/4) exp(2t) - (3/2)t - 11/4`. Its coefficients and checked derivatives
verify the equation and initial condition. Nonlinear equations return an
explicit unsupported result.

```rix
.Plugin.Load("ode");
t := .calculus.Variable(:t); y := .calculus.Variable(:y);
exact := .ode.IVP(2*y+3*t+4,0,1,0:1).Exact();
[exact[:expression],exact[:coefficients],.ode.CheckExact(exact),
 .ode.IVP(y^2,0,1,0:1).Exact()[:status]];
```

## Keep local error distinct from a certificate

The fifth-order endpoint of Dormand–Prince is exact for this cubic-time RHS.
Its zero embedded estimate still does not constitute a general global error
proof. The retained trajectory says `:approximate`.

```rix
.Plugin.Load("ode");
t := .calculus.Variable(:t);
flow := .ode.IVP(t^3,0,0,0:1).DormandPrince({= initialSteps=2 });
[flow[:finalState],flow[:status],flow[:certified],flow[:work][:rhsEvaluations],flow[:errorModel]];
```

## Bound time dependency and disclose exhaustion

On `[0,1]`, `t^2/2-t^3/3` lies in `[0,1/6]`. The Bernstein enclosure proves
this without replacing time with its midpoint. A deliberately short model
budget retains a wider certified natural enclosure.

```rix
.Plugin.Load("ode");
a := .ode.TimePolynomialRange([0,0,1/2,-1/3],0:1);
b := .ode.TimePolynomialRange([0,0,1/2,-1/3],0:1,{= maxTerms=2 });
[a[:range],.ode.CheckTimePolynomialRange(a),b[:status],b[:range],b[:certified]];
```

## Shoot over a whole initial family

For `y''=0`, `y(0)=0`, `y(1)=1`, use initial slope `s` in `[0,2]`.
The terminating Lie series gives the exact terminal map `y(1)=s`. Interval
Newton proves the unique parameter `s=1`; the associated vector flow encloses
the full retained parameter box.

```rix
.Plugin.Load("ode");
y := .calculus.Variable(:y); v := .calculus.Variable(:v); s := .calculus.Variable(:s);
boundary := .ode.BVP([v,.calculus.Constant(0)],0,[.calculus.Constant(0),s],0:1,
    y-1,{= s=0:2 },{= stateNames=[:y,:v] });
shot := .ode.Shoot(boundary,{= order=3,boxOptions={= maxBoxes=1 },
    flowOptions={= order=3,steps=2,maxSubintervals=1 } });
[shot[:status],shot[:unique].Len(),shot[:unresolved].Len(),.ode.CheckShooting(shot)];
```

## Preserve the unresolved family

The bounded shooting provider cannot prove a terminating terminal series for
`y'=y`. It keeps all of `[0,3]` unresolved, with no certificate inferred from a
numerical trial.

```rix
.Plugin.Load("ode");
y := .calculus.Variable(:y); s := .calculus.Variable(:s);
boundary := .ode.BVP(y,0,s,0:1,y-2,{= s=0:3 });
shot := .ode.Shoot(boundary);
[shot[:status],shot[:unresolved],shot[:certified]];
```
