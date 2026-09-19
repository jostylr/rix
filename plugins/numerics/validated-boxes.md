# Validated linear systems, interval Newton, and complete box searches

These operations use exact rational interval arithmetic and checked Calculus
graphs. Load `numerics` for linear systems; also load `calculus` to construct
nonlinear expressions and their Jacobian. The
[runnable tutorial](validated-boxes-tutorial.md) covers each operation.

| Operation | Result schema | Replay checker |
|---|---|---|
| `.numerics.IntervalLinearSolve(A,b,options?)` | `rix.numerics.interval-linear-solve@1` | `.numerics.CheckIntervalLinearSolve(result)` |
| `.numerics.IntervalNewtonBox(expressions,jacobian,box,options?)` | `rix.numerics.interval-newton-box@1` | `.numerics.CheckIntervalNewtonBox(result)` |
| `.numerics.SubdivideBoxes(expressions,jacobian,box,options?)` | `rix.numerics.box-subdivision@1` | `.numerics.CheckBoxSubdivision(result)` |
| `.numerics.ResumeBoxes(result,{= maxBoxes=n })` | `rix.numerics.box-subdivision@1` | `.numerics.CheckBoxSubdivision(result)` |

## Linear containment

`A` is a square matrix of dimension 1–16, supplied as nested arrays or a RiX
rank-two Matrix. `b` is a matching array or rank-one Shaped value. Entries may
be exact integers/rationals, closed bounded intervals, single-component closed
bounded interval sets, or finite Balls. Open, disconnected, unbounded, and
nonfinite inputs are rejected. Each reduced rational numerator and denominator,
including interval endpoints and computed elimination values, is limited to
4096 decimal digits. A linear solve exceeding this bound rejects with
`validatedRationalDigitBudgetExceeded`.

The solver constructs an exact rational inverse of the midpoint matrix and
uses it as a preconditioner. It then performs interval Gaussian elimination,
choosing the first remaining row whose pivot interval excludes zero. Every row
operation and back substitution uses exact interval endpoints. Nonzero
interval pivots prove that every point matrix represented by `A` is regular;
`solution` encloses every solution of every point system represented by `A,b`.
The midpoint inverse alone proves neither assertion.

A singular midpoint returns `classification=:singularPreconditioner`. Failure
to find a pivot separated from zero returns `:pivotContainsZero`. Both retain
`certified=_`, `regular=_`, `solution=_`, diagnostics, and all completed work.
Failure does not establish that every represented matrix is singular.

Options:

| Option | Meaning |
|---|---|
| `preconditioner` | Optional exact point matrix of matching dimension; must be nonsingular. |
| `illConditionThreshold` | Positive rational threshold, default `100000000`, for the exact infinity-norm condition estimate of the midpoint matrix. |

An ill-conditioned midpoint is a diagnostic, not a reason to discard a valid
exact interval certificate. `pivots`, `stages`, `triangularMatrix`,
`triangularRhs`, and `preconditioner` retain the proof computation. `residual`
is informative; enclosing zero in a residual alone is not a proof of a solve.

## Checked multidimensional interval Newton

Pass a vector of `n` immutable Calculus expressions and its
`.calculus.JacobianResult(expressions,variables)`. The variable list must match
the normalized variable order of `.numerics.Box(bindings)`. Each of the 1–16
axes is one closed bounded rational interval.

The shared graph boundary checks source identity, derives each partial again,
discharges derivative obligations on the whole box, and requires fully defined
certified function and Jacobian ranges. Incorrect derivatives and unresolved
domains produce `:invalidEvidence` and preserve the current box.

For a box `X` with exact center `c`, the operator encloses every solution of
`J(X) s = f(c)` using the validated linear solver, then forms `N = c - s`.
Every root in `X` lies in `N`. The next root enclosure is `X ∩ N`.

- A function coordinate range excluding zero or a disjoint operator
  coordinate proves `rootExistence=:none`, `classification=:excluded`.
- Strict inclusion of all of `N` in the interior of `X` proves
  `rootExistence=:unique`, `classification=:unique`.
- An exact singleton `N` lying in `X` is also accepted when a separate exact
  graph evaluation proves `f(N)=0` and interval elimination has proved the
  Jacobian family regular. This covers exact boundary roots without a strict
  interior test or a midpoint guess.
- Otherwise the result remains `:contracted`, `:stalled`,
  `:singularPreconditioner`, `:pivotContainsZero`, or `:arithmeticBudgetExceeded`, with
  `rootExistence=:unproved` and the retained box.

The interval-Newton containment/interior criterion follows the
[interval Newton description by R. B. Kearfott](https://interval.louisiana.edu/GLOBSOL/whatisop/node9.html).
For the exact boundary path, the verified point gives existence; regularity of
every matrix in the interval Jacobian gives injectivity on the convex box by
the integral mean-value formula.

`maxIterations` defaults to 2 and accepts 1–32; `maxWork` is its alias for this
single-box operation. Linear-solver options pass through. Graph evaluation
budgets belong under `graphOptions` and follow `GraphRange`'s existing limits;
they are deliberately separate from Newton iterations and subdivision depth.
For example, `{= maxIterations=4, graphOptions={= maxDepth=128 } }` controls
these independently. Exact rational arithmetic can grow in cost even when the
iteration count is small; these limits bound logical work, not elapsed time.
If the validated linear solve or Newton operator reaches the rational digit
limit, `status=:budgetExhausted` retains the current box and
`rootExistence=:unproved`. No approximate replacement is introduced.

`certified=1` means the reported root enclosure or exclusion is justified. A
singular or stalled box can retain certified coverage while existence remains
unproved. Always inspect `rootExistence` or `classification` when asking
whether a root was actually proved.

## Deterministic subdivision and resumption

Subdivision visits boxes in breadth-first order. When a box cannot be
classified, it bisects its widest axis at the exact rational midpoint; ties
use lowercase variable names in locale-independent UTF-16 lexical order.
Duplicate names after lowercasing are rejected. Children receive stable identifiers
`r.0`, `r.1`, and so on. The split covers the complete original node box,
including any region outside a solver's contracted box.

| Option | Default | Accepted values |
|---|---:|---|
| `maxBoxes` (`maxWork` alias) | 64 | 0–4096 processed boxes |
| `maxDepth` | 20 | 0–128 bisections along a branch |
| `minWidth` | 0 | Nonnegative exact rational |
| `method` | `:intervalNewton` | `:intervalNewton` or `:krawczyk` |
| `maxIterations` | 2 | 1–32 iterations per box |
| `graphOptions` | empty map | Existing bounded graph-evaluation options |

`excluded`, `unique`, and `unresolved` together cover the complete input box.
Unvisited work stays in `pending` and also in `unresolved`, explicitly marked
`:unprocessed` with `reason=:workBudgetReached`. A zero work budget retains
the entire input this way. Depth limits, resolution floors, arithmetic digit limits, singular systems,
and invalid evidence never silently discard a region. `nodes` retains all
processed decisions, split coordinates, children, and solver results.

Children are closed and share their split face (`boundaryPolicy=:closedOverlap`).
Consequently two unique leaves can describe the same boundary root. The output
is a complete box cover, not a count of distinct roots. `status=:complete`
means every leaf is classified; `:unresolved` means terminal unresolved leaves
remain; `:budgetExhausted` means pending work remains. `certified=1` certifies
the cover and valid classified leaves; it does not turn unresolved leaves into
root certificates. Invalid domain/derivative evidence sets `certified=_` while
still retaining that region.

`ResumeBoxes` first rechecks the entire retained result, then deterministically
replays from its original expressions and input with the previous processed
count plus the requested additional `maxBoxes` (default 64). This makes a
resumed result equal to a single run with that total budget. The cumulative
budget cannot exceed 4096. Resumption currently replays prior work rather than
restoring an execution stack; `work.processed` and `graphEvaluations` describe
the resulting logical traversal, excluding checker replay and derivative
obligation checks. Only the work budget may be changed during resume; start a
new search to change solver, depth, or precision settings.

## Replay, permissions, and scope

Each result retains the original inputs, options, mathematical conventions,
and `rix.runtime.validated-box-checker@1` evidence. Checkers derive the result
again and compare all mathematical claims, trace entries, nested evidence,
coverage, and work fields. A text value that looks like a rational or interval
cannot substitute for the exact type. Checkers reject cycles and records
exceeding depth 256, 2,000,000 visited values, or a conservative 16 MiB aggregate
serialized-text budget before recomputation. Numeric components also obey the
4096-digit limit. Portable result conversion applies the same bounds. These
are explicit algorithm/data limits, not hard process memory isolation.
Structural runtime extension data
and the outer convenience `checker` annotation are not proof claims.

`checker[:accepted]` means the claimed computation replays, including an
honest unresolved result. `checker[:certified]` additionally requires the
replayed result to be certified. Evidence records are computation inputs, not
signatures or authority over the caller's chosen problem.

The structural schemas are
[`interval-linear-solve`](../../schemas/interval-linear-solve.schema.json),
[`interval-newton-box`](../../schemas/interval-newton-box.schema.json), and
[`box-subdivision`](../../schemas/box-subdivision.schema.json).

All native entry points are in the `Numerics` script capability group:
`IntervalLinearSolve`, `IntervalNewtonBox`, `BoxSubdivide`, `BoxResume`,
`ValidatedBoxCheck`, `RationalBox`, `KrawczykBox`, and `KrawczykCheck`. No host
network or filesystem access is needed for these calculations. The JSON
schemas document record structure; JSON conversion of Calculus expressions
must use the existing mathematical serialization facilities, not a lossy
`JSON.stringify` of live runtime values.

The Ball plugin delegates validated linear work to this same service and adds
exact interval Horner polynomial/derivative adapters. See
[Ball's reference](../ball/README.md#polynomial-and-validated-linear-adapters).
This work introduces neither multivariate polynomial algebra nor Gröbner
elimination.
