# Notebook async runs and pure task workers

The shared Notebook engine exposes `await engine.executeDocumentAsync(source,
options)`. Cells and inline expressions run in document order. `flow`, `refresh`,
`singleton`, static/live blocks, explicit publication selection and observed
reactive outputs keep their existing meaning. A publication value is concrete
before it is rendered. The synchronous `executeDocument` embedding API remains
available.

Starting another ordinary async run cancels and disposes the previous run.
`isolated: true` gives an export its own lifetime without replacing the editor
result. Call `await disposeNotebookRun(run)` when that export finishes. Engine
`reset()` cancels and disposes all owned runs; `dispose()` also closes a worker
pool that the engine owns. Cleanup results report failures, including a cleanup
grace timeout. An uncooperative host JavaScript promise cannot be forcibly
stopped on the main thread; it must honor its supplied abort signal. Its late
result cannot become a current Notebook result.

Each async document defaults to a cumulative 2,000,000-step / 30-second budget,
including every cell, refresh context and inline expression. Hosts can supply
`maxSteps`, `maxTimeMs`, `signal` and `cleanupGraceMs` (default 250 ms). Evaluation
budgets are removed after execution, so retained reactive views do not expire
when the initial run deadline passes. Interactive native and browser workbenches
await this path and reject stale generations before rendering.

## Separate worker protocol

`rix.task-worker/1` is independent of `rix.execution/1`, the existing editor
execution worker protocol. A host creates a `TaskWorkerPool` with a local
`workerFactory`. Notebook builds package a module worker alongside their static
assets. Other hosts can bundle `runtime/task-worker-entry.js` for their runtime;
Bun can load that module directly. No worker is needed for synchronous execution.

The initial worker subset includes exact arithmetic, comparisons, inert
collections, indexing and seeded interval sampling. A small explicit list of
core numeric system calls is supported. The scheduler sends eligible collection
leaves to the pool while retaining its admission and ordering rules. Functions,
plugin closures, custom scalar capabilities, imports, files/network access,
reactive handles and unsupported IR stay on the owner executor. A `pure` host
annotation alone never makes a callback transferable. Replaced registry
implementations and added method variants invalidate builtin provenance.

Requests contain versioned IR, captures, exact seeded random state, range policy,
explicit numeric capability grants, task identity and remaining budgets. Captures
use the inert output JSON codec; Shaped and Matrix values carry logical view cells,
shape and scalar domain. Exact integers, rationals and reversed intervals retain
their values. Custom extension methods and mathematical identities that need
owner services are rejected. Accessors and callable capture data are not run.
Worker capability sets are reconstructed from the grant list; host authority
and ambient file/network handles are never transferred.

Default pool limits are two workers, 64 queued tasks, 250,000 steps per task,
5 seconds per task and 50 ms cancellation grace. Configuration ceilings are 64
workers, 4,096 queued tasks, 10,000,000 steps, 60 seconds and 5 seconds grace.
The wire format allows at most 1 MB per message, 64 nesting levels and bounded
node/edge/digit counts. Structured errors preserve the owner task path and worker
source position. Successful and failed worker steps charge the owner budget.

Cancellation removes queued work or sends a cancellation message to an active
worker. A worker that misses its grace deadline is terminated and replaced.
Task IDs and worker identity reject stale replies. A result is decoded and checked
against the owner's cancellation/deadline before random state or output is
committed. `snapshot()` reports active, queued, completed and terminated workers.
Always `await pool.dispose()` when its owning session closes.

## Owner-side reactive publication

Workers return values; reactive graph references never leave their owner. A
host `runTask(task, { context, signal, commit(value) { ... } })` callback can
publish to explicitly chosen owner targets after all stale/budget checks. The
callback is synchronous. `graph.replaceValues([{ name, value }, ...], metadata)`
validates the complete literal batch and publishes source and computed updates
in a single graph epoch. Duplicate or unknown targets reject the batch before
any value changes. Computed targets retain their node identity and become literal
definitions. No worker response can choose a different graph or target.

Coverage includes real-worker/event-loop exact and random equivalence, permuted
Shaped storage, capability/capture rejection, deterministic bounded bursts,
worker replacement after cancellation, stale publication suppression, atomic
reactive batches and Notebook rerun/resource cleanup.

Pure worker definitions are reused within a worker, while grants, captures, RNG
state and budgets are fresh per request. Completion follows cleanup so immediate
reuse is safe after either a result or an error. See the
[measured cold/warm costs](../design/eval/runtime-performance.md); small tasks
still often cost less on the owner executor.
