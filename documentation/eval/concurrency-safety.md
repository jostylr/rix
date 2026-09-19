---
title: "Concurrency safety and host limits"
description: "Implemented admission, effects, recurrence, cancellation, and diagnostics contracts."
---

RiX async entry points await promises and return ordinary RiX values. Explicit
`{$ ... }` scopes permit independent work to overlap. Ordinary recurrence steps
remain ordered, including when their callbacks await I/O. CLI, Web, Notebook, and
other hosts using the same promise-aware evaluator receive these contracts; worker
transport and Notebook engine lifecycle are tracked separately in R2.

## Admission and retained work

A scheduler distinguishes an active execution permit from an outstanding task.
Suspending around nested fan-out releases the permit, while the task remains
outstanding until its body and cleanup settle. Repeated resume requests share one
reservation. Cancellation rejects queued tasks, aborts active cooperative tasks,
and waits for outstanding work rather than mistaking suspension for completion.

Set `context.setEnv("asyncLimits", {...})` before using the context. Omitted keys
use the ceilings below; supplied positive safe integers can lower each ceiling.
A scope's requested concurrency cannot raise its parent or host limit. Invalid
limits are rejected. Limits apply to retained item counts, not the deep byte size
of arbitrary host-supplied values.

| Host field | Ceiling | What is bounded |
|---|---:|---|
| `concurrency` | 64 | Active event-loop task permits |
| `queued` | 4096 | New scheduler admissions, raw stream pulls, lazy pull requests, blocked hot producers |
| `outstanding` | 4096 | Admitted/queued tasks, owner effects, retained resources and finalizers |
| `background` | 128 | Detached tasks, reserved before launch |
| `errors` | 64 | Retained secondary/cleanup/background failures |
| `outputItems` | 10000 | Collected results, recurrence caches, stream chunk/window/capacity, output artifact count |
| `traceEvents` | 2048 | Retained trace events |
| `branchRecords` | 4096 | Fair-admission accounting prefixes |

Ordered collection/stream evaluation retains at most `2L` unpublished promises,
releases published promise references, and separately bounds retained result
items. A resumed task uses its existing outstanding-work reservation. Hot stream
`block` overflow bounds waiting producers as well as buffered values. Limit
failures use `ASYNC_LIMIT_EXCEEDED` with `data.resource` and `data.limit`.

Error and trace truncation is explicit: `asyncDroppedErrors`, background context
`__async_dropped_background_errors__`, and trace `droppedEvents` count omitted
details. The first observed failure remains primary; later failures do not replace
it. Primitive/frozen host errors are normalized with their original value in
`cause`. Resources and cleanup run once, with the existing cleanup grace period.
Hosts must still cooperate with cancellation; a non-cooperative operation may keep
its owner lane or task alive until it returns.

## Capability effects

Registry and SystemContext definitions accept:

```js
systemContext.registerHost("fetchValue", {
  effect: "read",                 // pure, read, write, unknown
  concurrency: "safe",            // safe, serial
  cancellation: "cooperative",    // cooperative, none
  async impl(args, context, evaluate, execution) {
    // Use execution.signal with the host's cancellable I/O API.
    // execution.taskPath identifies the calling source branch.
  },
});
```

Existing truthful `pure: true` functions default to pure/safe. Other definitions
are unknown/serial/non-cooperative by default. Explicit `serial` is honored even
for a pure function. Replacing an implementation or installing an unclassified
native variant cannot silently inherit a previous implementation's safety claim.
The owner serial lane is shared by concurrent descendants and supervised detached
tasks in the same evaluation context. Explicit `safe` allows independent adapter
invocations to overlap; it is a host contract, not a capability permission grant.

An adapter delegating to RiX must await `execution.invoke(callable, args)` or its
evaluator callback before resuming its own effectful state. Delegation releases
and reacquires its owner lease so nested effects can finish. Reactive formula
constructors retain their synchronous evaluator contract. Cancellation signals
reach adapters, but cancellation does not undo a completed write, output,
reactive publication, or request. Synchronous JavaScript cannot be forcibly
interrupted by this event-loop scheduler.

## Async recurrence caches

Index generators, history recurrences, transforms, filters, and predicate limits
use one generation algorithm with sync and async drivers. The async driver awaits
callbacks before committing the step. Positive/negative indexing, slices, lazy
iterator reads, materialization, spread, and async stream terminals consume
concrete values. Concurrent consumers serialize cache advancement. A cancelled
or rejected pull leaves its local generation state uncommitted; a later caller
can retry from the last committed cache. External callback effects are not rolled
back and should be idempotent if a host retries them.

Synchronous evaluation rejects an asynchronous recurrence before a promise enters
its cache. A sequence created by async evaluation can expose already cached
values synchronously; advancing an async recurrence requires an async entry point.
Clones use committed state; restarting a sequence restarts generation. An async
recurrence may read already committed values of its own sequence, not request its
currently pending or future value.

The host runtime exports `ensureLazyIndexAsync`, `pullLazyValueAsync`, and
`materializeLazySequenceAsync` alongside the synchronous helpers. Returned
JavaScript promises are host API results, never stored as RiX sequence entries.

## Provenance and host lifecycle

Structural paths include named/unnamed scopes with source locations, source-order
branches, loop body iterations, detached spawn sites, and cleanup. Failures expose
`asyncTaskPath` and `asyncTaskSegments`; scheduler failures also carry observation
order/time and `asyncScheduler` scalar state. Async traces include path and
scheduler summaries. `.Out` sink events include `taskPath` when evaluated within
an async task. Effects arrive in completion order; assembled collection results
remain in source order.

Detached admission is reserved before work starts. Inherited deadlines keep their
own timer after the spawning scope exits. Error-handler failures join the bounded
supervisor queue rather than becoming unhandled promises. Shutdown prevents new
resource/background acquisitions while draining owned resources. Hosts call
`disposeAsyncResources(context)` for cancellation/close, and
`drainBackgroundTasks(context)` when waiting for completion is intended.

Acceptance tests live in `tests/eval/async-safety.test.js`,
`tests/runtime/async-runtime.test.js`, `tests/runtime/async-lazy-sequence.test.js`,
and `tests/runtime/async-stream.test.js`, alongside the existing async parity,
collection, cancellation, finalization, stream, and reactive-boundary suites.
They use deferred promises/microtask gates for race assertions and avoid relying
on wall-clock completion races.
