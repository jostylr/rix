---
title: Vector trajectories, adaptive estimates, and validated ODE tubes
description: Compare fixed and adaptive demonstrations with checked Picard/Taylor enclosures and honest or certified event candidates.
theme: Numbers and numerics
status: implemented
---

Use a public Calculus graph for the equation `y'=y`, `y(0)=1`. The problem
record is inert mathematical structure; choosing a solver is a later action.

```rix
.Plugin.Load("ode");
y := .calculus.Variable(:y);
problem := .ode.IVP(y,0,1,0:1,{=
  stateNames=[:y],units={= t=:seconds,y=:dimensionless }
});
{: problem[:schema],problem[:stateNames],problem[:interval] };
```

## Euler and RK4 are demonstrations, not certificates

Both methods retain exact rational step arithmetic here. Exact arithmetic does
not make the discretization exact: neither result includes a proved truncation
bound.

```rix
.Plugin.Load("ode");
y := .calculus.Variable(:y);
problem := .ode.IVP(y,0,1,0:1);
euler := problem.Euler({= steps=4 });
rk4 := problem.RK4({= steps=1 });
.Table({=
  columns=["method","status","final state","formal order","certified"],
  rows=[
    [euler[:method],euler[:status],euler[:finalState][1],euler[:errorModel][:formalOrder],euler[:certified]],
    [rk4[:method],rk4[:status],rk4[:finalState][1],rk4[:errorModel][:formalOrder],rk4[:certified]]
  ]
});
```

Euler returns `625/256`; one classical RK4 step returns `65/24`. They can be
compared with known values or a certified real, but the ODE result itself stays
`:approximate`.

## Validate existence, uniqueness, and a tube

The Picard method searches for a complete interval tube on each segment. It
checks both the right-hand-side range and the symbolically derived state
derivative over that tube.

```rix
.Plugin.Load("ode");
y := .calculus.Variable(:y);
problem := .ode.IVP(y,0,1,0:1);
validated := problem.ValidatedPicard({=
  steps=4,maxTubeIterations=8,maxSubintervals=2
});
first := validated[:segments][1];
.Table({=
  columns=["status","classification","first tube","first endpoint","uniqueness"],
  rows=[[
    validated[:status],validated[:classification],first[:tube],
    first[:stateEnd][1],first[:uniqueness]
  ]]
});
```

`validated.At(1/2)` returns the complete certified tube covering one half. It
does not pretend to be a point value:

```rix
.Plugin.Load("ode");
y := .calculus.Variable(:y);
solution := .ode.IVP(y,0,1,0:1).ValidatedPicard({= steps=4 });
{: solution.At(1/2),solution[:finalState][1],solution[:certified] };
```

## Solve a vector system

The same APIs preserve coordinate order for the harmonic oscillator. RK4 is
still approximate; ValidatedPicard checks the entire two-by-two Jacobian and a
box contraction.

```rix
.Plugin.Load("ode");
x := .calculus.Variable(:x);
y := .calculus.Variable(:y);
oscillator := .ode.IVP([y,-x],0,[1,0],0:1/2,{= stateNames=[:x,:y] });
rk := oscillator.RK4({= steps=2 });
tube := oscillator.ValidatedPicard({= steps=4,maxSubintervals=2 });
{: rk[:finalState],tube[:finalState],tube[:segments][1][:contractionBound] };
```

## Adapt steps without overclaiming

Step doubling gives a useful local estimate but not a global proof.

```rix
.Plugin.Load("ode");
y := .calculus.Variable(:y);
adaptive := .ode.IVP(y,0,1,0:1).AdaptiveRK4({=
  initialSteps=1,tolerance=1/10000,maxAttempts=100
});
{: adaptive[:status],adaptive[:work],adaptive[:errorModel] };
```

## Keep event claims honest

An approximate sign change is an observed candidate. A validated range that
misses zero is a proof that no event occurs on that segment.

```rix
.Plugin.Load("ode");
y := .calculus.Variable(:y);
half := .ode.Event(y-1/2,{= name=:half,direction=:rising });
observed := .ode.IVP(.calculus.Constant(1),0,0,0:1,{= events=[half] }).RK4({= steps=4 }).IsolateEvents()[1];
excluded := .ode.IVP(.calculus.Constant(0),0,1,0:1,{= events=[.ode.Event(y)] }).ValidatedPicard({= steps=2 }).IsolateEvents()[1];
{: observed[:candidates],excluded[:exclusions] };
```

## Tighten the tube and certify one event

The second-order solver first proves the Picard existence tube, then encloses
the total derivative and recenters a Taylor remainder on every segment. For
`y'=1`, the remainder is exactly zero, so the half-height event contracts to an
exact time.

```rix
.Plugin.Load("ode");
y := .calculus.Variable(:y);
half := .ode.Event(y-1/2,{= name=:half,direction=:rising });
taylor := .ode.IVP(.calculus.Constant(1),0,0,0:1,{= events=[half] }).ValidatedTaylor2({= steps=1,maxSubintervals=2 });
eventResult := taylor.IsolateEvents(half,{= eventWidth=1/100000 })[1];
{: taylor[:wrappingControl],taylor.At(1/2),eventResult[:candidates][1] };
```

The event proof is not inferred merely from a tube containing zero. It retains
the endpoint range checks, the checked identity
`g_t + grad(g) dot f`, and every interval-Newton contraction.

## Bounded failure preserves useful work

A deliberately inadequate radius budget cannot validate `y'=100y` over one
large step. The unresolved attempted segment remains in the result.

```rix
.Plugin.Load("ode");
y := .calculus.Variable(:y);
partial := .ode.IVP(100*y,0,1,0:1).ValidatedPicard({=
  steps=1,maxTubeIterations=1,tubeRadius=1
});
{: partial[:status],partial[:work],partial[:segments][1][:diagnostics] };
```

Increase `maxTubeIterations`, increase `steps`, or both. More work may find a
self-map, but work exhaustion is never reported as nonexistence.

Fixed Taylor stepping likewise stops at its first unresolved tube. It keeps
that failed segment so its diagnostics remain inspectable.

```{.rix exec=true}
.Plugin.Load("ode");
y := .calculus.Variable(:y);
partial := .ode.IVP(10*y,0,1,0:1).ValidatedTaylor2({= steps=2,maxSubintervals=1 });
partial[:work][:attemptedSteps]==1 ?: 1 ?_ .Error("Fixed stepping must stop on failure");
partial[:segments].Len()==1 ?: 1 ?_ .Error("Failed segment evidence must be retained");
{: partial[:status],partial[:work][:stopReason],partial[:segments][1][:diagnostics] };
```

## Adapt a certified trajectory

A single step for `y'=y` on `[0,1]` fails the strict contraction test because
`h L = 1`. The adaptive method halves that step, validates smaller segments,
and carries their certified endpoint intervals forward.

```{.rix exec=true}
.Plugin.Load("ode");
y := .calculus.Variable(:y);
solution := .ode.IVP(y,0,1,0:1).AdaptiveValidatedTaylor2({=
  steps=1,maxAttempts=32,maxSubintervals=1
});
solution[:certified]==1 ?: 1 ?_ .Error("Expected certified completion");
solution[:work][:rejectedSteps]>0 ?: 1 ?_ .Error("Expected a rejected full step");
{: solution[:coveredInterval],solution[:finalState],solution[:work] };
```

For a vector equation with known solution `(t^2/2,t^2)`, a local remainder
budget forces smaller steps even when a Picard tube is already available.

```{.rix exec=true}
.Plugin.Load("ode");
t := .calculus.Variable(:t);
solution := .ode.IVP([t,2*t],0,[0,0],0:1,{= stateNames=[:x,:y] })
  .AdaptiveValidatedTaylor2({= steps=1,remainderTolerance=1/16,maxAttempts=40,maxSubintervals=1 });
solution[:certified]==1 ?: 1 ?_ .Error("Expected certified vector flow");
{: solution.At(1/2),solution[:finalState],solution[:work][:rejectedSteps] };
```

That tolerance bounds the local remainder, while `finalState` carries the
accumulated enclosure. Exhausting attempts retains only the accepted prefix
as the trajectory and stores failed candidates in `work.attempts`.

```{.rix exec=true}
.Plugin.Load("ode");
y := .calculus.Variable(:y);
partial := .ode.IVP(y,0,1,0:1).AdaptiveValidatedTaylor2({= steps=1,maxAttempts=2,maxSubintervals=1 });
partial[:status]==:partial ?: 1 ?_ .Error("Expected a partial trajectory");
{: partial[:coveredInterval],partial.At(1/4),partial[:work][:stopReason] };
```

## Higher-order certified flow

```{.rix exec=true}
.Plugin.Load("ode");
y := .calculus.Variable(:y);
problem := .ode.IVP(y,0,1,0:1/2);
second := problem.ValidatedTaylor({= order=2,steps=2,maxSubintervals=1 });
fourth := problem.ValidatedTaylor({= order=4,maxOrder=8,steps=2,maxSubintervals=1 });
fourth[:certified]==1 ?: 1 ?_ .Error("Expected a certified fourth-order trajectory");
fourth[:finalState][1].Width()<second[:finalState][1].Width()
  ?: 1 ?_ .Error("Expected tighter fourth-order enclosure for this example");
{: fourth[:finalState],fourth.At(1/4),fourth[:wrappingControl][:order] };
```

Each segment uses start-point derivative bounds and a highest-derivative bound
over a Picard existence tube. Try `order=3` or raise `maxOrder` explicitly.
`AdaptiveValidatedTaylor` adds the existing attempt/minimum-step controller;
`remainderTolerance` bounds only the local highest-order remainder. Stored
interval uncertainty and wrapping remain. `rangeOptions` configures range work
and semantic precision, while `derivativeOptions` configures derivative checking.
Unsupported symbolic/domain cases report errors rather than fabricated enclosures.

## Integrating backward in time

Knowing the state at a later time can also define an IVP. The equation is
unchanged; we take negative time steps. Here `y'=1` and `y(1)=1` give `y(0)=0`.

```{.rix exec=true}
.Plugin.Load("ode");
backward := .ode.IVP(.calculus.Constant(1),1,1,1:0)
    .ValidatedTaylor({= order=3,steps=2,maxSubintervals=1 });
backward[:certified]==1 ?: 1 ?_ .Error("Expected a certified backward trajectory");
backward.At(3/4)==(3/4:3/4) ?: 1 ?_ .Error("Expected backward dense output");
{: backward[:problem][:direction],backward[:coveredInterval],backward[:finalState][1] };
```

The interval `1:0` retains its orientation; `0:1` with initial time 1 is rejected.
The same convention works for Euler, RK4, Picard and adaptive methods. Certified
methods use the magnitude of the step for contraction and remainder tests, but
retain its sign in the integration formula. Event `:rising` means rising with
increasing physical time, even when the solver is moving backward. Backward
integration may amplify uncertainty; it is not guaranteed to undo numerical error.

## Exercises

1. Compare Euler and RK4 for `y'=t+y` at several fixed step counts.
2. Give the validated solver an interval initial state such as `(99/100):(101/100)`
   and inspect how it propagates measurement uncertainty.
3. Reduce the Picard step count and watch wrapping widen the endpoint.
4. Compare the vector RK4 oscillator against its validated component boxes.
5. Change an event direction and observe which endpoint sign changes qualify.
6. Explain why a validated event range containing zero still needs an
   existence or interval-Newton argument.
7. Compare `ValidatedPicard` and `ValidatedTaylor2` endpoint widths on
   `y'=y` as the number of segments changes.
