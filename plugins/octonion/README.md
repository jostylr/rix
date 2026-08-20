# Proposed `octonion` plugin

`octonion` is the planned certified eight-component façade over `.cayley`.
This directory is specification-only. Exact rational octonions are currently
provided by `.exactAlgebras.Octonion`, and structural parsing already preserves
written Octonion parentheses.

The Phase 1 façade will retain:

- all eight exact or certified-real components;
- the written multiplication tree;
- conjugation and the composition norm;
- inverse/nonzero evidence and explicit division conventions;
- certified component-box refinement;
- exact tests for alternativity, Moufang identities, and a concrete
  nonassociative triple.

One-variable real-coefficient power series are meaningful because powers of a
single octonion lie in an associative subalgebra. This does not license general
reassociation. Every algorithm involving independent values must preserve its
parentheses, and API records must retain evaluation order.

The façade will stop short of suggesting that later Cayley–Dickson levels are
division algebras. See [tutorial.md](tutorial.md),
[`../complex/architecture.md`](../complex/architecture.md), and
[`../TODO.md`](../TODO.md).

