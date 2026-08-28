# Implemented capability recommendations from the problem probes

These contracts were derived from awkward parts of the runnable examples and
are now implemented. The examples remain acceptance tests for their public
surfaces and evidence policies.

## 1. Graph algorithms: first plugin slice

The original `shortest-path.rix` spent most of its code representing a graph,
choosing a sentinel for infinity, and maintaining Dijkstra's work arrays. The
`graph` plugin now standardizes the value and evidence without attempting to be
an all-purpose graph framework.

### Implemented surface

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
pathToE[:vertices].First() == :a && pathToE[:vertices].Last() == :e ##@ == 1;
pathToE[:weight] ##@ == 7;
paths[:certificate].Verify() ##@ == 1;
```

`Weighted` rejects unknown vertices, duplicate vertex identifiers, and
negative weights. Zero-weight edges are ordinary edges;
absence is represented by absence, never by a numeric sentinel. Its portable
record uses `schema="rix.graph@1"` and retains `directed`, `vertices`, and
normalized edges.

`ShortestPaths` returns `schema="rix.graph.shortest-paths@1"`, `source`,
`distances`, `predecessors`, `settledOrder`, `unreachable`, `algorithm`, and a
certificate. Verification checks every edge inequality, source distance zero,
and equality along each predecessor edge. That proves the reported tree gives
shortest distances without asking a verifier to repeat the algorithm.

The first slice also includes `BreadthFirst`, `ConnectedComponents`, and
`TopologicalSort`. Negative weights and Bellman-Ford remain a possible later
slice requiring a negative-cycle witness.

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
evidence costs. Every optimization result now carries these stable fields:

```rix
{=
  status="optimal",
  method=:standardPrimalSimplex,
  certificateStatus=:notAvailable,
  certificate=_,
  diagnostics=["request twoPhase=1 for a portable optimality certificate"]
}
```

The exact two-phase result reports `method=:twoPhaseExactSimplex`,
`certificateStatus=:verified`, and its existing certificate. This is an API
clarification, not fabricated evidence for the faster path. Tests cover the
standard and exact two-phase result families.

## 4. Secure editor plugin preloads

Editor verification supports plugins without granting evaluated source
the ability to load arbitrary plugins. The host should send an approved plugin
identifier list alongside the source. The worker then:

1. resolves only identifiers present in the host policy;
2. loads them before creating the restricted evaluation context;
3. keeps `.Plugin.Load` unavailable to evaluated code; and
4. includes the approved set in the worker/session cache identity.

The source header is a request and useful documentation, but it is not the
authority. Acceptance tests prove that an approved mathematical plugin source
verifies, an unapproved header is rejected before evaluation, permission-bearing
plugins are rejected, and `.Plugin.Load` remains withheld.

## 5. Finite search: a smaller follow-on signal

`four-queens-search.rix` formerly used `probability.CartesianPower`, an
unexpected location that eagerly enumerated 256 assignments. The new
`combinatorics` namespace provides lazy Cartesian powers, permutations, and
combinations plus exact counts. The updated probe enumerates only the 24 column
permutations before testing diagonals. A full constraint solver remains outside
this slice; `solve` already handles linear symbolic constraints.
