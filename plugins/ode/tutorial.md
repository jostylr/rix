---
title: Approximate trajectories and validated ODE tubes
description: Compare Euler and RK4 demonstrations with a checked Picard enclosure for a scalar initial-value problem.
theme: Numbers and numerics
status: implemented
---

# Approximate trajectories and validated ODE tubes

Use a public Calculus graph for the equation `y'=y`, `y(0)=1`. The problem
record is inert mathematical structure; choosing a solver is a later action.

```{.rix exec=true}
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

```{.rix exec=true}
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

```{.rix exec=true}
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

```{.rix exec=true}
.Plugin.Load("ode");
y := .calculus.Variable(:y);
solution := .ode.IVP(y,0,1,0:1).ValidatedPicard({= steps=4 });
{: solution.At(1/2),solution[:finalState][1],solution[:certified] };
```

## Bounded failure preserves useful work

A deliberately inadequate radius budget cannot validate `y'=100y` over one
large step. The unresolved attempted segment remains in the result.

```{.rix exec=true}
.Plugin.Load("ode");
y := .calculus.Variable(:y);
partial := .ode.IVP(100*y,0,1,0:1).ValidatedPicard({=
  steps=1,maxTubeIterations=1,tubeRadius=1
});
{: partial[:status],partial[:work],partial[:segments][1][:diagnostics] };
```

Increase `maxTubeIterations`, increase `steps`, or both. More work may find a
self-map, but work exhaustion is never reported as nonexistence.

## Further work

1. Compare Euler and RK4 for `y'=t+y` at several fixed step counts.
2. Give the validated solver an interval initial state such as `(99/100):(101/100)`
   and inspect how it propagates measurement uncertainty.
3. Reduce the Picard step count and watch wrapping widen the endpoint.
4. Build a two-state harmonic-oscillator IVP. The record is accepted today;
   execution intentionally reports the pending vector-solver boundary.
5. Sketch an event expression for `y=2` in the problem's `events` field and
   explain why sampling a sign change would not yet certify the event time.
