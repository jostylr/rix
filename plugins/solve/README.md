# `solve`

`solve` consumes the existing inert `{# ... }` system carrier. It resolves
declared output roles, accepts exact input values, recognizes affine equality
expressions, and delegates the resulting matrix system to `.linalg`.
The implementation is pure RiX: it consumes the public `.InspectSpec` and
`.SpecRoles` structural records rather than importing or rewriting evaluator IR.

Affine expression operations are exact literals, identifiers, unary minus,
addition, subtraction, multiplication or division by exact scalars, and powers
zero or one. Closed affine inequalities (`<=` and `>=`) and an optional
objective dispatch to `.optimize`; exact equalities continue to dispatch to
`.linalg`. Strict inequalities remain explicit errors because the exact LP
model is closed.

```rix
.Plugin.Load("solve");
S := {#a,b:x,y# x + y == a; x - y == b };
answer := .solve.System(S, {= values={= a=3, b=1 } });
answer.solution;
```

## Solution values

Every Phase 2 entry point returns `rix.solve.solution@1`. Its `kind` is
`:finite`, `:parametric`, `:empty`, `:unbounded`, or `:branch`; the provider's
more specific status is retained separately. Solutions expose `Substitute`,
`Residuals`, `Check`, and `Record`, plus assumptions and provenance.

An underdetermined exact system retains a particular vector, null-space
directions, and explicit parameter names:

```rix
family := .solve.System({#:x,y# x+y==2 },{= parameters=["s"] });
chosen := family.Substitute({= s=3 });
{: family[:kind],chosen,family.Residuals(chosen),family.Check(chosen) };
```

Role overrides continue to flow through the public `.SpecRoles` contract.
Definitions of output variables become equalities, while definitions of known
inputs are resolved independently of statement order. `parameters` names the
free directions; it does not silently infer parameter direction from source
ordering.

## Optimization, Polynomial, and Numerics dispatch

```rix
answer := .solve.System({#:x,y# y=x+1; x>=0; y<=3 },{=
  objective={= x=1 },sense=:max
});
{: answer[:solution],answer[:optimizationresult][:certificate].Verify() };
```

`lowerBounds` and `upperBounds` accept name maps or arrays and pass through to
the exact general LP service. A missing objective means feasibility with a
zero objective.

Univariate exact roots use an isolating interval and return an AlgebraicReal:

```rix
root := .solve.Polynomial(.p`x^2-2`,1:2);
root[:solution].CompareRational(3/2);
```

The interval must contain exactly one root (or an exact rational endpoint
root); RiX checks that with the Polynomial root-count protocol. A symbolic
system can request the same explicit dispatch with `{= polynomial=p,
interval=a:b }`.

General scalar callables use `.solve.Numerical(function,interval,options)` and
the Numerics root-isolation protocol. A mere sign crossing is returned as
`:isolatedAssumed` with the continuity obligation intact; it is not promoted
to a certified algebraic root.

## Validated numerical root boxes and equality feasibility

`RootBoxes(expressions, jacobian, box, options?)` uses checked Numerics
subdivision; `FromBoxes(result)` consumes an existing replayable subdivision.
Both return a Solve solution with `classification=numericalBoxes`,
`purpose=rootFinding`, exact rational root enclosures, retained excluded and
unresolved regions, and `rootExistence=atLeastOne|none|unproved`. `.Check()`
replays the numerical evidence and compares the entire reconstructed Solve
summary with typed, bounded equality. It rejects a supplied point candidate: an
enclosure check does not certify an exact candidate point. Here `certified` concerns enclosure/cover
validity; pending regions do not prove roots. Shared closed faces mean
`distinctRootCount` is deliberately unclaimed.

`BoxFeasibility(expressions, jacobian, box, options?)` separately reports equality
feasibility: `feasible` when a checked unique-root box exists, `infeasible` when
the full cover is excluded, and `unknown` otherwise. Only the first two statuses
have a certified feasibility answer. These APIs reject an `objective` option;
use the separate Optimize service for optimization. They accept scalar and
multidimensional Calculus expression graphs and checked `JacobianResult`
evidence without multivariate Polynomial objects. See the
[geometry tutorial](../geometry/validated-implicit-tutorial.md).

The core Numerics capability `ValidatedClaimEqual(a,b)` compares retained data
using the same typed replay representation and numeric/text/node/depth bounds.
It returns false for unequal or unsupported/oversized data. Runtime extension
methods and outer convenience checker annotations are ignored; nested evidence
is compared. Equality alone is not a mathematical certificate. A root summary that cannot
fit the shared retained-evidence limits is explicitly rejected before return;
reduce its work budget or retain the underlying Numerics subdivision directly.


Bounded optimization dispatch accepts `integer=[:outputName]` or `hessian=H`
in `System` options, reusing the affine constraint compiler and exact domain
bounds. `objective` supplies the linear coefficients; quadratic objectives use
`xᵀHx/2 + cᵀx + constant` and require minimization. Unproved results have kind
`unknown`. `OptimizeBox(objective,constraints,box,options)` delegates strict and
nonlinear constraints to bounded certified range subdivision. See the
[optimization tutorial](../optimize/tutorial.md) for work limits and replay.
