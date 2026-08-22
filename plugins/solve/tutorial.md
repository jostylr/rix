---
title: Solving exact linear systems
description: Turn an inert symbolic system into a named exact affine solution.
theme: Algebra and analysis
plugin: solve
status: implemented
---

```rix
.Plugin.Load("solve");
system := {#a,b:x,y# x + y == a; x - y == b };
answer := .solve.System(system, {= values={= a=3, b=1 } });
answer.solution;
```

## Explore a parametric family

```rix
.Plugin.Load("solve");
family := .solve.System({#:x,y# x+y==2 },{= parameters=["s"] });
chosen := family.Substitute({= s=3 });
{: family[:kind],family[:directions],chosen,family.Residuals(chosen),family.Check(chosen) };
```

The particular solution is `(2,0)` and the retained null direction is
`(-1,1)`, so `s=3` gives `(-1,3)`.

## Mix definitions, constraints, and an objective

```rix
.Plugin.Load("solve");
answer := .solve.System({#:x,y# y=x+1; x>=0; y<=3 },{=
  objective={= x=1 },sense=:max
});
{:
  answer[:kind],
  answer[:solution],
  answer.Check(),
  answer[:optimizationresult][:certificate].Verify()
};
```

The output definition is normalized to an equality and the inequalities go to
the exact two-phase LP solver. No direction is inferred from statement order.

## Exact and assumption-dependent scalar roots

```rix
.Plugin.Load("solve");
exact := .solve.Polynomial(.p`x^2-2`,1:2);
numerical := .solve.Numerical((x)->x^2-2,1:2,{=
  absoluteWidth=1/100,maxWork=20
});

{:
  exact[:solution],exact.Check(),
  numerical[:status],numerical[:isolation],numerical[:assumptions]
};
```

The Polynomial path returns an exact AlgebraicReal after a Sturm root-count
check. The arbitrary callable path retains `:continuityOrTrustedRootCount` and
does not claim certification from finite evaluations alone.
