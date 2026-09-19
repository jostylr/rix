# Bounded runtime performance measurements

The R4 pass profiles existing behavior before changing it. The runtime remains
exact; no Float/native provider replaces exact arithmetic, and no evidence or
opaque mathematical identity is inferred from a performance cache.

## Concurrent snapshots

An ODE order-four construction CPU profile attributed most sampled time to
`Context.concurrentChild` copying shared values and metadata for every visible
binding. Each independent `deepCopyValue` call previously started a new memo.
The context now uses one memo for a whole child snapshot, and one memo when
snapshotting one captured scope. It retains aliases and cycles within that
snapshot, preserves opaque identity tokens, and copies mutable collection data
away from both the parent and sibling tasks. Memos are never cached between
children or executions. Ordinary cells remain separate and captured bindings
remain read-only; local collection mutations stay isolated.

A retained-allocation fixture makes 32 snapshots of 50 names referencing 256
exact integers. The per-binding reference implementation took 21.86 ms and
about 17.8 MB additional observed live heap; the shared graph memo took 1.16 ms
and about 0.60 MB. These are Bun GC observations, not hard retained-byte quotas.
The reference reproduces the previous per-binding copy cost; it does not claim
that alias identity under that older copying policy was equivalent.

The real ODE fixture `[y,-x]`, Taylor order 4, with derivative caching enabled
fell from 11,047 ms to 2,984 ms async. The sync comparison was approximately
59 ms in both runs. Exact derivative claim keys, partial/total derivative work
and evaluator step counts were unchanged. Async copies and scheduler dispatch
still have costs; this change does not claim parity with the synchronous lane.
Tensor/source/frame graph round trips and concurrent mutation isolation remain
regression checks.

## Reused pure task workers

A dedicated task worker now builds trusted core callable definitions once.
Every request still validates the explicit supported IR/capability subset and
creates a fresh granted `SystemContext`, capture graph, ordinary context,
random state and budget. No plugin registry, imported scope or ambient transport
is reused or transferred. A worker reports completion only after cleanup and
clearing its active slot, including failure paths; a new task can then arrive
immediately without being discarded.

For 16 exact tasks at exponent 128, two rounds on one pool:

| Executor | Before cold / warm | After cold / warm |
|---|---:|---:|
| Owner event loop | 3.11 / 4.44 ms | 3.22 / 4.29 ms |
| One task worker | 4,929 / 4,851 ms | 381 / 8.14 ms |
| Two task workers | 2,586 / 2,528 ms | 395 / 5.44 ms |
| Four task workers | 1,421 / 1,310 ms | 412 / 4.58 ms |

Every executor returned the same exact checksum. Tiny work still favors the
owner: cold module/runtime startup dominates, and IPC/encoding adds overhead.
Pools amortize startup only while their owner keeps them alive; disposal remains
required. Cooperative limits do not interrupt arbitrary host JavaScript inside a
main-thread turn. A worker can be terminated after its cancellation grace period.

## Reproduction

From the RiX checkout, run `bun benchmarks/runtime-snapshots.js`,
`bun benchmarks/ode-construction.js`, and
`bun benchmarks/async-streams.js --items=16 --exponent=128 --rounds=2`.
`benchmarks/runtime-performance-baseline.json` records the before/after fixture
outputs, runtime and limitations. Wall time and observed heap vary with GC,
machine load and warmup; exact checksums and work counts are assertions.
The CPU profile can be reproduced with Bun's `--cpu-prof --cpu-prof-md` flags.
Parser/source limits and recovery are described in
[Source bounds and editor recovery](../../parser/robustness.md).
