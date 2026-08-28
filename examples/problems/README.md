# Mathematical and computer-science problem probes

These examples are small, executable acceptance tests for RiX as a general
mathematical programming language. Each program states a recognizable problem,
computes a solution, and returns enough evidence to check the answer. Run one
from `rix/` with:

```sh
bun bin/rix.js --no-config examples/problems/exact-linear-system.rix
```

Run all assertions and standalone executions with:

```sh
bun test tests/cli/problems.test.js
```

Each source also carries inline `##@` checks. They run with the program, so a
zero exit status means both evaluation and the stated invariants succeeded.
The restricted editor `verify` command intentionally withholds plugins and is
therefore not the runner for these host-approved plugin examples.

## Coverage and ergonomics

The ease score is about expressing the *problem*, not merely obtaining the
answer: 5 means the RiX model closely matches the mathematics; 1 means the
solution needs substantial general-purpose plumbing.

| Example | Area | Main capability | Ease | What the probe shows |
|---|---|---|---:|---|
| `exact-linear-system.rix` | Linear algebra | `linalg` | 5/5 | Exact LU factorization, reuse, determinant, and a verifiable factorization are direct. |
| `production-planning.rix` | Operations research | `optimize` | 5/5 | A rational linear program maps directly to the plugin and returns a checkable optimality certificate. |
| `bayesian-quality-control.rix` | Probability | `probability` | 5/5 | Finite distributions and Bayes updates stay exact rather than becoming binary floats. |
| `exact-regression.rix` | Statistics | `stats` | 5/5 | Least-squares coefficients, predictions, residuals, and R-squared are exact and compact. |
| `projectile-polynomial.rix` | Algebra/calculus | `poly` | 5/5 | Differentiation and rational critical-point discovery preserve polynomial identity. |
| `triangle-circumcircle.rix` | Geometry | `geometry` | 5/5 | The exact construction and validated circle observations now map directly to the problem. |
| `geometric-series.rix` | Real analysis | `analysis` | 4/5 | The result includes an effective convergence witness, but the proof-oriented API is more elaborate than a numerical sum. |
| `shortest-path.rix` | Graph algorithms | core RiX | 2/5 | Arrays and bounded loops suffice for Dijkstra, but the algorithm needs manual infinity, queue selection, and adjacency-matrix plumbing. |
| `markov-stationary-distribution.rix` | Stochastic processes | `linalg` | 4/5 | Exact linear solving is direct; the user still constructs the stationarity-plus-normalization system manually. |
| `relational-sales-analysis.rix` | Relational data | `data` | 5/5 | Typed relations, grouping, and exact rational aggregates match the problem closely. |
| `rational-approximation-and-radix.rix` | Number representation | `continued-fraction`, `radix` | 5/5 | Certified denominator-bounded approximation and repeating-radix analysis are explicit and exact. |
| `exact-logistic-dynamics.rix` | Dynamical systems | `fractals` | 5/5 | Exact iteration and conservatively stated finite-tail period evidence are compact. |
| `symbolic-resource-system.rix` | Symbolic constraints | `solve` | 5/5 | Definitions, inequalities, an objective, substitution checks, and an LP certificate live in one result. |
| `four-queens-search.rix` | Constraint search | `probability`, core RiX | 3/5 | Finite products and filtering work, but candidate generation is eager and unexpectedly located in probability. |

## Capability conclusions

The probes do not expose a missing primitive in the mathematical plugins they
exercise. Their semantic result and certificate objects make the solutions
shorter and more auditable than hand-written numerical code.

For optimization, the certificate-rich result currently requires the exact
two-phase path (`{= twoPhase=1 }`). The faster standard-form path computes this
example's optimum but does not attach an optimality certificate. That is a
reasonable performance/API distinction, but a more discoverable result field
or diagnostic would make the choice easier for users.

The clearest addition is a graph plugin. A useful first slice would provide a
validated weighted graph value plus `ShortestPaths`, `ShortestPath`, breadth-
first search, connected components, and topological sort. Results should retain
predecessors, traversal order, and optimality/reachability evidence. The
hand-written Dijkstra example is deliberately kept here as the acceptance case
for that future API.

The probes also found a tooling distinction worth keeping visible. Native
`.test.rix` execution can now preload host-approved plugins from a source
header, but the restricted editor worker does not. A future editor protocol
could accept an explicit host-approved plugin set without exposing runtime
`.Plugin.Load`; until then, direct CLI execution plus inline checks is the
appropriate verification path.

The smaller geometry improvement is now implemented as `.geometry.Center()`
and `.geometry.RadiusSquared()`. The updated probe no longer depends on the
circle record's storage layout, and both functions validate the input kind.

The four-queens probe adds a weaker signal for a combinatorics namespace.
`CartesianPower` is useful outside probability, but eager construction and its
current location make finite searches harder to discover and scale. More such
probes should precede a full constraint-solver proposal.

Concrete proposed contracts, staged scope, and acceptance cases are collected
in [`recommendation-sketches.md`](recommendation-sketches.md).
