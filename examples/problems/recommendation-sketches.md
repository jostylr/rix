# Capability recommendations derived from the problem probes

These sketches turn the awkward parts of the runnable examples into proposed
contracts. They are intentionally small enough to implement and test in one
slice. Names and record fields are provisional until that slice is accepted.

## 1. Graph algorithms: first plugin slice

The current `shortest-path.rix` spends most of its code representing a graph,
choosing a sentinel for infinity, and maintaining Dijkstra's work arrays. A
graph plugin should first standardize the value and evidence, not attempt to be
an all-purpose graph framework.

### Proposed surface

```rix
.Plugin.Load("graph");
graph := .graph.Weighted(
    [:a,:b,:c,:d,:e],
    [
      [:a,:b,4], [:a,:c,1], [:c,:b,2],
      [:b,:d,1], [:c,:d,5], [:c,:e,8], [:d,:e,3]
    ],
    {= directed=0 }
);
paths := .graph.ShortestPaths(graph, :a);
pathToE := .graph.ShortestPath(paths, :e);

paths[:distances][:e] ##@ == 7;
pathToE[:vertices] ##@ == [:a,:c,:b,:d,:e];
pathToE[:weight] ##@ == 7;
paths[:certificate].Verify() ##@ == 1;
```

`Weighted` should reject unknown vertices, duplicate vertex identifiers, and
negative weights in this first slice. Zero-weight edges must be ordinary edges;
absence is represented by absence, never by a numeric sentinel. Its portable
record would use `schema="rix.graph@1"` and retain `directed`, `vertices`, and
normalized edges.

`ShortestPaths` would return `schema="rix.graph.shortest-paths@1"`, `source`,
`distances`, `predecessors`, `settledOrder`, `unreachable`, `algorithm`, and a
certificate. Verification checks every edge inequality, source distance zero,
and equality along each predecessor edge. That proves the reported tree gives
shortest distances without asking a verifier to repeat the algorithm.

Phase one should also include `BreadthFirst`, `ConnectedComponents`, and
`TopologicalSort`, because they reuse the graph value and cover the most common
unweighted/directed cases. Negative weights and Bellman-Ford belong in a later
slice with a negative-cycle witness.

## 2. Geometry: validated circle observations

This recommendation is implemented by the probes: `.geometry.Center(circle)`
and `.geometry.RadiusSquared(circle)` now validate the geometry kind and expose
the two exact observations used by `triangle-circumcircle.rix`. Namespace
functions are preferable today because all geometry records currently share a
generic map runtime type.

An eventual subtype-aware method system could additionally provide
`circle.Center()` and `circle.RadiusSquared()`. That should wait for a general
method-dispatch design rather than adding circle-specific runtime exceptions.

## 3. Optimization: make certificate availability explicit

The standard-form and exact two-phase paths intentionally have different
evidence costs, but users currently discover that distinction by inspecting
whether `result[:certificate]` exists. Every optimization result should instead
carry these stable fields:

```rix
{=
  status="optimal",
  method=:standardPrimalSimplex,
  certificateStatus=:notAvailable,
  certificate=_,
  diagnostics=["request twoPhase=1 for a portable optimality certificate"]
}
```

The exact two-phase result would report `method=:exactTwoPhase`,
`certificateStatus=:verified`, and its existing certificate. This is an API
clarification, not a request to fabricate evidence for the faster path. Tests
should assert the fields for optimal, infeasible, unbounded, and budget-limited
outcomes before the result schema is versioned.

## 4. Secure editor plugin preloads

Editor verification should support plugins without granting evaluated source
the ability to load arbitrary plugins. The host should send an approved plugin
identifier list alongside the source. The worker then:

1. resolves only identifiers present in the host policy;
2. loads them before creating the restricted evaluation context;
3. keeps `.Plugin.Load` unavailable to evaluated code; and
4. includes the approved set in the worker/session cache identity.

The source header is a request and useful documentation, but it must not be the
authority. Acceptance tests should prove that an approved geometry source
verifies, an undeclared/unapproved plugin is rejected before evaluation, and a
loaded plugin cannot add permissions or expose `.Plugin.Load` transitively.

## 5. Finite search: a smaller follow-on signal

`four-queens-search.rix` can use `probability.CartesianPower`, but a programmer
would not naturally look in probability for candidate generation. If more
examples repeat this pattern, consider a small `combinatorics` namespace for
lazy products, permutations, and combinations. A full constraint solver is not
yet justified: the symbolic `solve` plugin already handles linear constraints,
while this probe only establishes a discoverability and eager-enumeration cost.
