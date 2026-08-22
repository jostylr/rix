# `optimize`

`optimize` provides exact linear programs, retaining a fast deterministic
primal-simplex path for standard inequality form:

```text
maximize or minimize cᵀx
subject to A x <= b and x >= 0
```

The Phase 2 path accepts a `relations` array containing `:le`, `:ge`, or `:eq`,
plus exact `lowerBounds` and `upperBounds`. Use `_` for an absent bound; a
variable with both bounds absent is free. Canonicalization shifts finite lower
bounds, reverses upper-only variables, splits free variables, adds finite upper
constraints, normalizes negative right-hand sides, and preserves a map back to
the original coordinates.

```rix
.Plugin.Load("optimize");
program := .optimize.LinearProgram([1,0],[1,1;1,0],[3,2],{=
  relations=[:eq,:le],
  lowerBounds=[0,_],
  upperBounds=[_,_]
});
result := program.Solve();
```

General models use exact two-phase simplex. Artificial variables provide a
Phase I feasibility proof; redundant zero rows are removed before Phase II.
Entering variables use the first improving column and tied leaving rows use the
lowest basic-variable index (Bland's rule), giving a deterministic anti-cycle
policy. All work remains exact Rational arithmetic.

Optimal results include original-coordinate primal values, exact dual values,
a replayable `rix.optimize.certificate@1`, a reusable LU factorization of the
final basis, and exact right-hand-side ranges over which that basis remains
feasible. Infeasible certificates retain the negative Phase I optimum and
tableau; unbounded certificates retain an exact feasible point and improving
ray. `certificate.Verify()` or `.optimize.CheckCertificate(certificate)`
independently replays/checks the relevant claim.

`model.Record()` emits the stable `rix.optimize.linear-program@2` interchange
record and `.optimize.FromRecord(record)` reconstructs the model. This is a RiX
value schema, not a vendor solver format. The former JavaScript implementation
remains only as `optimize.reference.js` for parity comparison.
