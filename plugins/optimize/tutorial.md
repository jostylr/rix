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
feasible point and exact direction; the checker verifies that one step along
the ray stays feasible and strictly improves the objective.
