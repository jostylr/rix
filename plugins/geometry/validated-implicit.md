# Validated implicit geometry and parameter constructions

`TraceImplicit(expression, gradient, box, options?)` covers a bounded two-variable
rational box with excluded cells, checked local graph charts, and unresolved
cells. Construct the scalar expression with Calculus and its evidence with
`calculus.GradientResult(expression, variables)`. This operates on expression
graphs and numerical boxes; it introduces no multivariate polynomial objects.

A trace has schema `rix.geometry.implicit-trace@1`. Its immutable `.Check()`
method independently replays the original expression, derivative identities,
domain obligations, interval evaluations, chart hypotheses, and full box cover.
`.Refine(options)` checks the existing claim and replays its original problem
with the merged options. Native hosts can use `evaluateImplicitTrace`,
`checkImplicitTrace`, and `refineImplicitTrace` from the RiX entry point.

## What a chart proves

On each cell, the original expression and both checked derivatives must be
defined throughout the closed box. A function range excluding zero excludes
all roots in that cell. Otherwise, the algorithm tries `y(x)`, then `x(y)`.
A dependent derivative strictly separated from zero proves monotonicity.
Uniform opposite signs on the two dependent boundary faces prove existence
for every independent parameter by continuity. Together these facts prove
exactly one dependent coordinate per parameter on that cell. Nonstrict face
signs allow a chart that lies on the original boundary.

The result retains those face ranges, the gradient ranges, and domain checks.
A parametric interval Newton step contracts only the dependent coordinate to
an exact `rootBox`; `slope` encloses the ratio of the negative independent
partial to the dependent partial. Neither a midpoint evaluation nor a drawn
coordinate is a root certificate. Boundary charts retain the same derivative
ratio evidence without claiming a continuation outside the input domain.

Every refinement splits the **whole original cell** into two closed children.
The shared face remains in both. A checked chart splits its independent
parameter; other cells split their widest axis, with a deterministic tie rule.
No region outside a contracted root enclosure is silently discarded.

`certified` means that the retained enclosure and complete-cover evidence is
valid. It does **not** prove roots or topology in unresolved or pending cells.
Only `regularArc` records assert `oneRootPerParameter` and `localGraph`.
`singularOrTangentUnknown` and `boundaryTopologyUnknown` explicitly leave
local topology undecided. Even a complete trace asserts only local charts;
it does not count connected components, stitch a global contour, or deduplicate
roots on shared faces. The region plot draws boxes, not a sampled contour.

## Options and exhaustion

| Option | Default | Bound and meaning |
| --- | --- | --- |
| `maxBoxes` (`maxWork` alias) | 128 | Integer 0–4096; retained cell decisions |
| `maxDepth` | 12 | Integer 0–128; closed binary splits |
| `maxWidth` | 0 | Exact nonnegative rational; positive values refine chart parameter widths |
| `maxEvidenceText` | 16777216 | Integer 0–16777216; conservative serialized-text accounting units |
| `graphOptions` | empty map | Existing checked graph evaluation options |

Evidence accounting includes typed tags, JSON escaping, both retained copies
of leaves, every pending region, and a reserve for counters/checker metadata.
A unit is one conservative JSON UTF-16 code unit, not a compressed byte or a
hard process-memory guarantee. The common replay limits also apply: two million
visited values, depth 256, and 4096 decimal digits in each exact rational
numerator/denominator, including interval endpoints.

When work or aggregate evidence is exhausted, `status` is `budgetExhausted`.
Every remaining full box appears in `pending` and `unresolved`, with
`workBudgetReached` or `outputEvidenceBudgetExceeded`. A proposed cell result
that would exceed the output budget is not admitted; its original box remains
pending. `work.attempted` includes that one extra evaluation, while `processed`
counts admitted decisions. An input/evidence budget too small to retain even
the original problem is rejected with `implicitInputEvidenceBudgetExceeded`.
Arithmetic limits retain an unresolved original cell. Invalid derivative or
domain evidence also retains the cell but sets `certified` false.

## Intersections and Solve

`geometry.IntersectionBoxes(expressions, jacobian, box, options?)` delegates to
validated multidimensional Newton subdivision. Supply checked
`calculus.JacobianResult` evidence. Regular intersections can have unique-root
boxes; singular or tangent intersections remain unresolved unless a checked
exclusion applies. This returns `rix.numerics.box-subdivision@1` and is accepted
by `plot.CertifiedRegions` and `solve.FromBoxes`.

`solve.RootBoxes` and `solve.FromBoxes` describe root enclosures;
`solve.BoxFeasibility` answers equality feasibility with `feasible`,
`infeasible`, or `unknown`. These operations do not optimize an objective and
reject an `objective` option. Root counts across overlapping boxes are not
claimed. An optimization problem belongs to the separate Optimize service.

## Retained parameter changes

`ParameterConstruction(builder, [x,y], {= maxHistory=32 })` invokes a RiX
callback on two exact rational parameters. The callback returns a replayable
interval Newton unique-root result, a complete subdivision containing a unique
root, or a complete implicit trace containing a checked chart. That policy
intentionally requires a fully resolved cover for a subdivision or trace.
`maxHistory` is an integer between zero and 256.

`ParameterDrag(state, [x,y])` replays prior accepted evidence and checks the
proposal. Success sets `status=accepted`. A failed constraint preserves
`lastCertified` and the last accepted `parameter`, while retaining the requested
parameter, proposal, bounded history, and repair diagnostics. Callback failure
reports `constructionCallbackRejected`; unproved constraints report
`constraintsUnproved`. Before any success the state remains `unresolved`.

Store the state in a reactive node and pass it to `ParameterHandle($$state)`.
The retained drag event converts display coordinates to exact rational
parameters, then validates the proposal before replacing the state. The
handle accepts `coordinateSystem`, `label`, and `style` options. Its default
view is `[-2,-2,2,2]` in a 400-by-400 graphic. A callback exception cannot replace
the retained target. Snapshot publication lowers the handle to an inert circle;
it never invokes or serializes the active callback. Callback execution itself
uses the host's ordinary RiX execution policy, not a new hard isolation boundary.

See [the executable tutorial](validated-implicit-tutorial.md).
