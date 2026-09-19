---
title: Exact linear programming
description: Solve a bounded standard-form linear program with pure-RiX exact Rational simplex arithmetic.
theme: Algebra and analysis
plugin: optimize
status: implemented
---

```rix
.Plugin.Load("optimize");
program := .optimize.LinearProgram([3, 2], [1, 1; 1, 0; 0, 1], [4, 2, 3]);
result := .optimize.Solve(program);
{: result.solution, result.objectiveValue, result.status,
   result[:method],result[:certificateStatus],result[:diagnostics] };
```

The fast standard path reports `certificateStatus=:notAvailable` and points to
the exact two-phase option rather than silently omitting evidence.

## Equalities, greater-than constraints, and Phase I

```rix
.Plugin.Load("optimize");
program := .optimize.LinearProgram([1,0],[1,1;1,0],[3,2],{=
  relations=[:eq,:le]
});
result := program.Solve({= twoPhase=1 });

{:
  result[:solution],
  result[:objectivevalue],
  result[:dualsolution],
  result[:method],
  result[:certificateStatus],
  result[:certificate].Verify()
};
```

The exact solution is `(2,1)`. Phase I introduces and then removes artificial
variables; Phase II returns matching primal and dual objective values.
This path reports `method=:twoPhaseExactSimplex` and
`certificateStatus=:verified`.

## Free and bounded variables

```rix
.Plugin.Load("optimize");
free := .optimize.LinearProgram([1],{:1x1: 1},[-1],{=
  relations=[:le],lowerBounds=[_],upperBounds=[_]
}).Solve();

bounded := .optimize.LinearProgram([1],{:1x1: 0},[1],{=
  lowerBounds=[-2],upperBounds=[3]
}).Solve();

{: free[:solution],bounded[:solution] };
```

The free variable is split only inside the canonical model and comes back as
`-1`; the bounded variable is shifted internally and comes back as `3`.

## Inspect certificates and reuse the final basis

```rix
.Plugin.Load("optimize");
model := .optimize.LinearProgram([1,0],[1,1;1,0],[3,2],{=
  relations=[:eq,:le],name="interchange demo"
});
solved := model.Solve({= twoPhase=1 });
record := model.Record();
rebuilt := .optimize.FromRecord(record);

{=
  certificate=solved[:certificate],
  verified=solved[:certificate].Verify(),
  rhsSensitivity=solved[:sensitivity][:rhsranges],
  basisCheck=solved[:basisfactorization].Verify(),
  anotherBasisRhs=solved.BasisSolve([4,1]),
  rebuiltObjective=rebuilt.Solve({= twoPhase=1 })[:objectivevalue]
};
```

Infeasible results have a negative Phase I optimum. Unbounded results carry a
feasible point and exact direction; the checker verifies the direction of every constraint and variable bound,
so all nonnegative steps stay feasible, together with strict objective improvement.


## Integer coordinates with a resumable queue

```rix
.Plugin.Load("optimize");
p := .optimize.LinearProgram([1,1],[2,1;1,2],[4,4]);
partial := .optimize.MixedInteger(p,[1,2],{= maxNodes=1 });
complete := .optimize.ResumeMixedInteger(partial,6);
[partial[:status],partial[:pending],complete[:solution],.optimize.CheckMixedInteger(complete)];
```

Integer axes are one-based coordinate indices. Only those axes are integral;
others remain exact Rational coordinates. The FIFO queue branches on the first
fractional integer coordinate. Each branch carries inherited relaxation bounds.
An exhausted result retains its incumbent, bounds, gap, pending queue and any
relaxations whose iteration limit was reached. `ResumeMixedInteger` extends the
node budget after replay; it does not change the per-relaxation iteration budget.
For an unresolved relaxation, make a new call with a larger `maxIterations`.
An integer unbounded certificate scales the rational ray to integral increments.

## Convex quadratic certificates

```rix
.Plugin.Load("optimize");
q := .optimize.Quadratic([2,0;0,2],[-2,-4],{:1x2: 1,1},[10],{= lowerBounds=[_,_] });
r := .optimize.SolveQuadratic(q);
[r[:solution],r[:objectiveValue],r[:kkt][:residual],.optimize.CheckQuadratic(r)];
```

The objective is `xᵀHx/2 + cᵀx + constant`, minimized. Every principal minor
checks positive semidefiniteness exactly. Bounded active-set enumeration searches
for an exact KKT witness, including primal feasibility, multiplier signs,
stationarity and zero active-constraint residuals. A checked witness establishes
a global optimum. Nonconvex input returns `unsupportedNonconvex`; search
exhaustion returns `unknown`. An exact feasibility certificate can prove an empty
domain, and an improving feasible ray in the nullspace of H proves unboundedness.

## Global boxes and open constraints

```rix
.Plugin.Load("calculus");
.Plugin.Load("optimize");
x := .calculus.Variable(:x);
r := .optimize.Nonlinear(x,[{= expression=x,relation=:gt }],{= x=0:1 },{= maxBoxes=7,tolerance=1/10 });
[r[:status],r[:lowerBound],r[:upperBound],r[:incumbent],.optimize.CheckNonlinear(r)];
```

Each constraint means `expression relation 0`, using `:le`, `:lt`, `:ge`, `:gt`
or `:eq`. This example encloses an infimum of zero while retaining a strictly
positive feasible point. `boundedGap` does not claim that a boundary point is
attained. Midpoint samples supply feasible objective bounds; whole-box certified
ranges supply global bounds. Strict inequalities are never silently closed.
Domain holes, unavailable ranges and depth/evidence limits retain whole
unresolved boxes. The method uses no derivative assumptions and reports no local
optimum. Opaque callables are unsupported; use an existing calculus expression.

### Limits and replay

MILP supports 8 variables and 32 constraints, at most 256 nodes and 4096 simplex
iterations per node. Defaults are 64 nodes and 256 iterations. QP supports 6
variables, 16 source constraints and 16 inequalities including variable bounds;
defaults are 64 active sets, 4096 masks and 512 iterations (maximums 256, 65536,
4096). Box optimization supports 8 variables, 16 constraints, 256 boxes and depth
32; defaults are 63 boxes, depth 16, objective gap 1/1000 and one range partition.
Range partitions are capped at 16. Integer and box queues stop before retained
evidence exceeds the shared replay budget and preserve the unprocessed region.
Inputs and exact components must fit the shared replay bounds (4096 digits per
component). Replay checks are deterministic, bounded and reject altered claims;
a successful check validates an exhausted report, not an optimality claim.

`solve.System` reuses its existing affine compiler: `integer=[:x,:y]` selects
integer outputs; `hessian=...` selects convex quadratic minimization with the
same objective coefficients and domain bounds. Combining these two options is
unsupported. Closed affine constraints use the LP path; strict/nonlinear
constraints use `.solve.OptimizeBox(objective,constraints,box,options)` instead.
Its result can be replayed by `.solve.Check(result)`. When a Solve result has
no proved optimum, its kind is `unknown`, even if it includes an incumbent.
