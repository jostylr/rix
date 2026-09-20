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

## Float buffers and finite sparse products

The Float plugin now provides explicit copy-owned tensor buffers (`Tensor`,
`ToShaped`, `MatMul`) with 262,144-cell and 4,194,304-product-work ceilings.
They retain approximation status and per-cell conversion/arithmetic diagnostics;
conversion back to Shaped restores ordinary Float methods. They never produce
Rational certificates. The JS bridge copies incoming/outgoing typed arrays, and
serialized/worker consumers must reconstruct a live adapter from ordinary values.
Exact finite sparse `MatMul`/`Apply` stay in the linalg Rational lane, validating
axis compatibility and support/work limits without allocating the ambient grid.

The existing pairwise Float reduction now traverses index ranges instead of
slicing arrays. Its operation tree and binary32/binary64 results remain identical.
For 65,536 inputs, the versioned run measured 5.35→3.28 ms and removes 131,070
temporary arrays / 1,048,576 copied elements per call. A 48×48 typed matrix product
measured 65.38→9.47 ms against an explicit boxed Float scalar reference, with every
result identical. This comparison describes the new adapter boundary; it does not
claim replacement of an existing public dense matrix algorithm. Reproduce with
`bun benchmarks/numeric-adapters.js`; see `benchmarks/numeric-adapters-baseline.json`.

## Retained Canvas and bounded plot inputs

The Canvas host retains a bounded LRU of parsed paths. The counting-path CPU
fixture reduced path construction from 6000 to 200 across 30 style-changing
frames, 32.85→8.70 ms with identical checksum. These are source parsing/replay
measurements, not GPU timings. Conservative dirty regions include complete
antialiased circles/strokes and snap to device pixels; transformations, paths,
text, and viewport changes use full replay. Hosts can explicitly invalidate
same-size canvas resets. OffscreenCanvas execution uses an explicit worker
handler while semantic IDs, hit regions, and exact/accessibility companions stay
in the portable plan. Main-thread Canvas and static SVG remain available.

Real Chromium checks compare dirty/full/worker pixels on a consistent readback
backend, including fractional coordinates and pixel ratios 1.25 and 2, geometry
and style invalidation, resized canvases, and missing-Path2D fallback. Readback
contexts request `willReadFrequently` so browser GPU-to-CPU migration does not
confound byte comparisons. Reproduce with `scripts/check-render-performance-browser.js`
and `scripts/bench-render-performance.js`.

Plot inputs have explicit finite budgets: at most 4096 input rows/cells,
4–1024 retained line samples, 1–1024 heatmap blocks, and stream tails of 2–4096
samples. Min/max buckets retain exact endpoints/extrema and stable source IDs;
heatmaps retain exact block means/extrema/source bounds. Neither claims to
reconstruct discarded data. Stream drop counts and sampling disclosures survive
static SVG, text/audio accessibility, and Canvas plans.

For the versioned 4096-row fixture, bounded line output fell from 5.89 MB to
0.20 MB and HTML rendering from 76.68 ms to 3.00 ms. Reducing heatmap blocks
from 1024 to 64 reduced output from 3.14 MB to 0.20 MB and rendering from
36.03 ms to 1.83 ms. Every case asserts deterministic output on repeated input;
downsampled output intentionally has a different hash from full output.
All source values are still validated. Observed heap deltas do not consistently
fall with output size, so these measurements establish output/replay savings,
not a blanket allocation improvement. Reproduce with `scripts/bench-bounded-plot.js`;
see `benchmarks/bounded-plot-performance.json` and
`scripts/check-bounded-plot-browser.js`.

These limits bound declared work, retained cache source, and pixel counts. They
cannot enforce hard process memory ceilings for JS objects, native paths, GC or
arbitrary host callbacks. No GPU/Wasm/native provider or distributed execution
is introduced by this pass.

## Parse-only documentation checks

The full regression run exposed an additional allocation hotspot: documentation
fences marked `parse=true` created an entire evaluator even when they had no
hidden setup and never executed. Such fences now tokenize/parse directly.
Executable fences and parse fences with hidden setup still construct or reuse
their session normally. Tests verify setup side effects and session isolation.

The 12-cell reference fixture reproducing the removed eager initialization
measured 3749 ms versus 0.47 ms, with identical check-result hashes. This is an
initialization saving, not a parser algorithm speedup; it removes the reason for
the broad tutorial parse check to exceed its timeout. Reproduce using
`bun benchmarks/documentation-parsing.js`; the versioned
`benchmarks/documentation-parsing-baseline.json` records the exact result.
