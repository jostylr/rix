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
| `triangle-circumcircle.rix` | Geometry | `geometry` | 4/5 | The construction is natural and exact, although consumers inspect generic record fields for the center and squared radius. |
| `geometric-series.rix` | Real analysis | `analysis` | 4/5 | The result includes an effective convergence witness, but the proof-oriented API is more elaborate than a numerical sum. |
| `shortest-path.rix` | Graph algorithms | core RiX | 2/5 | Arrays and bounded loops suffice for Dijkstra, but the algorithm needs manual infinity, queue selection, and adjacency-matrix plumbing. |

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

A smaller geometry improvement would be named `Center()` and
`RadiusSquared()` accessors for circles. Direct record access is stable enough
for this example, but it is less discoverable than the plugin's construction
methods.
