---
title: "Async, concurrency, and background tasks"
description: "Semantics, current implementation boundary, and follow-up plan for {$ ... } concurrency scopes and {$$ ... } detached tasks."
toc-depth: 4
---

# Status

This is the normative design and implementation tracker. The current runtime
slice includes syntax and IR, code-block import headers, async host APIs,
grouped FIFO bounded scheduling, nested scope-limit composition, concurrent
arrays/maps/tuples/sets/matrices/tensors, fused `|>>` and `|>?`, ordered
`|>||` and `|>&&`, promise-aware reduce/sort/slice/split/chunk barriers, named
async breaks, lexical function fan-out, group cancellation signals, and
supervised/drainable `{$$ ... }` tasks. `{# ... }` remains the inert
symbolic-system form.

Still planned are bounded lazy-source pull, complete task
snapshot/copy-on-write enforcement, deterministic task RNG streams, worker
execution, stable task-path diagnostics, and capability-level cooperative
abort.

The proposal deliberately separates two operations:

- `{$ ... }` is an **awaited concurrency scope**. It permits explicitly
  independent work to overlap, waits for every required result or an early
  terminal result, and returns an ordinary RiX value.
- `{$$ ... }` is a **supervised background task**. Its statements execute in
  order while the spawning evaluation continues immediately. Its final value
  is discarded.

Neither form exposes JavaScript promises as RiX values. `{$$ ... }` describes
detached control flow, not a guaranteed operating-system thread. A host may run
it on the event loop or in a worker according to the capabilities used by its
body.

# Goals and non-goals

The design must:

- overlap independent collection construction and collection-pipe work;
- retain deterministic source-order results where the existing operation is
  ordered;
- bound admitted work, with a runtime default of 10 concurrent items;
- let an item continue through elementwise pipe stages without waiting for
  unrelated items;
- compose through nested explicit collections and nested concurrency scopes;
- provide cooperative cancellation and a completion-order escape from a named
  concurrency scope;
- keep ordinary statements temporal and sequential;
- let a background task publish results through effects or literal reactive
  updates without returning a promise or task handle;
- preserve the host capability and sandbox boundary.

The first implementation will not:

- infer that arbitrary loop iterations, function arguments, or arithmetic
  operands are independent;
- permit unsynchronized writes to ordinary outer cells;
- promise rollback of files, requests, output, or other completed effects;
- promise CPU parallelism for code running on one JavaScript event loop;
- provide detached-task handles, joins, or promise values;
- spawn detached tasks from reactive formula evaluation.

# Terminology

An **async evaluation** is evaluation by the promise-aware RiX evaluator. It
still awaits operands in language order unless a construct in this document
creates explicit concurrency.

A **concurrency scope** owns a scheduler, cancellation signal, result assembly,
and optional name. It cannot finish while required child work remains active.
This is structured concurrency.

A **source item** is one independently admitted element or entry of an explicit
collection, or one item read from a pre-existing collection by an elementwise
pipe.

A **fused region** is a consecutive sequence of elementwise pipe stages. One
source item retains its concurrency permit until it exits that region, is
filtered out, or supplies a terminal answer. This gives the concurrency limit
the useful meaning “items in flight through this pipeline,” rather than
“individual function calls currently active.”

A **barrier** needs a complete ordered collection or shared accumulator before
it can proceed. A barrier ends one fused region. A later elementwise stage
starts a new region.

A **background task** is runtime-owned work started by `{$$ ... }`. It outlives
the spawning statement but never outlives its host runtime/session.

# Syntax

## Awaited concurrency scopes

```rix
{$ expression }
{$name$ expression }
{$:4$ expression }
{$name:4$ expression }
```

The forms mean:

| Form | Name | Concurrency limit |
|---|---|---|
| `{$ ... }` | anonymous | runtime default |
| `{$jobs$ ... }` | `jobs` | runtime default |
| `{$:4$ ... }` | anonymous | 4 |
| `{$jobs:4$ ... }` | `jobs` | 4 |

The colon follows the existing named/capped loop-header convention. A limit
must be a positive safe integer. There is intentionally no unbounded form in
the initial design. The runtime default is:

```js
defaultAsyncConcurrency: 10
```

A host may override the default for a runtime. An explicit header overrides
the runtime default but cannot escape a stricter containing scope or host cap.

An accepted follow-up extends the header with keyed options:

```rix
{$jobs:limit=10,timeout=5$ expression }
{$:limit=10,timeout=5$ expression }
```

The positional forms remain shorthand: `{$jobs:10,5$ ... }` supplies limit and
timeout, while an omitted positional field such as `{$jobs:,5$ ... }` uses the
default limit. Timeout values are positive safe-integer seconds. The timer uses
a monotonic clock and starts when the scope is entered; nested scopes observe
the earliest active deadline. Timeout parsing and execution are not part of the
current runtime slice.

`{$ ... }` is block-scoped and returns its final statement's value. Statements
inside it execute one at a time. Each statement waits for its own required
concurrent work before the next statement begins.

## Background tasks

```rix
{$$
    statement1
    statement2
}
```

`{$$ ... }` starts one supervised background task and immediately evaluates to
`_`/null in the spawning evaluation. The task's statements execute in order and
implicitly await async capability calls. Its final expression is evaluated but
the value is discarded.

The background block does not make its contents parallel. It may contain an
ordinary concurrency scope:

```rix
{$$
    results := {$:4$ urls |>> Fetch }
    $downloads := results
}
```

Named background tasks, handles, and joins are reserved for a later proposal.

## Async-scope breaks

The typed break syntax gains `$` as a target:

```rix
{!$ value }              // nearest concurrency scope
{!$search! value }       // named concurrency scope
```

An async-scope break is a completion-order race. The first accepted break
requests cancellation of siblings and becomes the scope result after cleanup.
It is intentionally different from ordered `|>||`.

# Awaiting model

Async capability results are implicitly awaited by the async evaluator. RiX
values never contain a raw promise.

Outside an explicit fan-out, evaluation order remains the ordinary RiX order:

```rix
a := Fetch(url1)      // completes before the next statement
b := Fetch(url2)
```

The statement after a concurrency scope waits for the scope:

```rix
results := {$ [Fetch(url1), Fetch(url2)] }
Use(results)          // starts only after both fetches settle successfully
```

The top-level host API must therefore offer an async entry point. The existing
fully synchronous entry point remains valid for scripts that contain no async
capability or async syntax.

# Explicit collection construction

## Fan-out rule

While a concurrency scope is dynamically active, explicit collection
constructors are fan-out points:

- arrays and brace arrays;
- tuples;
- maps;
- sets;
- matrices and tensors;
- finite eager generator output, subject to the generator rules below.

Function argument lists, arithmetic operands, and block statements are not
collection constructors and remain sequential.

Concurrency inheritance is lexical, not dynamic. A function defined outside a
concurrency scope keeps ordinary sequential collection construction when it is
called from inside that scope. A function defined lexically inside `{$ ... }`
retains parallel collection construction on later calls. It captures only that
semantic flag, never a particular scheduler, limit, timeout, or cancellation
signal. When such a function is called outside an active scope, the runtime
creates a temporary scope using the runtime default limit. An outside function
can opt in explicitly by putting its own `{$ ... }` around the intended fan-out.

Collections fully constructed before the scope are already values and are not
re-evaluated. They become ordinary pipe sources.

```rix
existing := [F(), G()]       // already evaluated sequentially
Build() -> [F(), G()]         // defined outside: remains sequential

inside := {$ [F(), G()] }    // F and G overlap
mapped := {$ existing |>> H }
BuildParallel = {$ () -> [F(), G()] }
later := BuildParallel()      // temporary default-limited scope
```

## Nested collections

Nested explicit collections share the containing scheduler and cancellation
signal. Structural parent nodes do not consume permits while waiting for
children.

```rix
{$:2$
    {= a=[F(), G()], b=H() }
}
```

The accepted admission contract is hierarchical round-robin across sibling
branches. For nested branches `[A1, A2, ...]`, `[B1, B2, ...]`, and leaf `C`, a
limit of four admits `A1`, `B1`, `C`, then `A2`. Applied to the map above, its
two top-level value branches offer `F()` and `H()` before the first branch
offers `G()`. This breadth-first fairness prevents a large early subtree from
monopolizing admission. The current scheduler slice still walks nested leaves
depth-first; hierarchical admission is tracked as follow-up work.

Internal slots may resolve in any order, but the map is not published until
every required slot is resolved. Its source key/element order is retained.

A suspended structural parent yields scheduler capacity while nested children
run. This prevents a nested collection from deadlocking when the limit is 1.
The same rule applies to a lexically concurrent function or an explicit nested
async scope: its source-item ticket is temporarily yielded and reacquired after
the structural work completes. An outside-defined sequential function does not
turn its ordinary collections into scheduler fan-out points.

## Map entries

An identifier-key map entry schedules its value expression as one source item.
A computed-key entry evaluates its key and value as one item in ordinary
key-before-value order. Map entry admission follows literal source order.

Async traversal operators use the collection's canonical traversal order. The
implementation must make map traversal order explicit and stable before
shipping ordered async `|>||`; the recommended rule is insertion order, which
matches current runtime storage.

## Generators and lazy sources

A recurrence-dependent generator remains sequential at its generation step.
Independent downstream pipe stages may overlap across generated items.

Lazy and unbounded sources must use bounded pull: at most the effective
concurrency limit may be admitted into a fused region. They must never be fully
materialized merely because evaluation occurs inside `{$ ... }`.

# Async pipe semantics

All pipe operators use the async evaluator inside `{$ ... }`, but only
elementwise operators naturally fuse. Whole-value and structural operations
are barriers.

| Pipe | Existing role | Async behavior |
|---|---|---|
| `|>>` | map | Elementwise fused stage; transformed items retain source order in the result. |
| `|>?` | filter | Elementwise fused predicate; passing items continue immediately; final result retains source order. |
| `|>||` | any/some | Ordered Find terminal; returns the first source-order item whose predicate is truthy. |
| `|>&&` | every/all | Terminal; may request cancellation once a falsy predicate fixes the result; returns the source-order last item if all pass. |
| `|>:` / `|:>` | reduce | Ordered accumulator barrier; upstream work overlaps, reducer calls occur in source order. |
| `|<>` | sort | Full barrier; use a stable async-aware comparator implementation. |
| `|><` | reverse | Full barrier. |
| `|>/` / `|>//` | slice | Full barrier in the first implementation. |
| `|>/|` | split | Full ordered barrier in the first implementation. |
| `|>#|` | chunk | Full ordered barrier in the first implementation. |
| `|>` | whole-value function application | Full barrier; arrays remain one argument and tuples unpack. |
| `||>` | explicit placeholder pipe | Full barrier. |

This classification preserves current value semantics while permitting a
streaming implementation where it is observable only through latency and
effects.

## Fused example

```rix
{$:2$
    [F(), G()]
        |>> H
        |>? J
}
```

`F()` and `G()` start. If `G()` resolves first, that item immediately enters
`H`, then `J`; it does not wait for `F()`. The source item retains one in-flight
permit through `F/G -> H -> J`. The final filtered collection is nevertheless
assembled in source order.

For a longer source at limit 2:

```rix
{$:2$ [F(), G(), K()] |>> H |>? J }
```

`K()` is admitted only after either the `F` item or the `G` item completely
exits the fused `H/J` region. This prevents a wide source from starving its own
downstream stages and makes the limit describe end-to-end work in flight.

## Barriers and later stages

```rix
{$:4$ values |>> F |<> Compare |>> G }
```

The first map is one concurrent region. Sort waits for its complete output.
The second map starts a new concurrent region over the sorted values.

An ordinary pipe also waits for the complete collection:

```rix
{$ [F(), G()] } |> H
```

This calls `H([fResult, gResult])`. To unpack positional results, construct a
tuple:

```rix
{$ {: F(), G() } } |> H
```

## Ordered Find

`|>||` retains its current “first passing input item” result contract. In an
async pipeline, “first” means traversal order, not completion order.

If item 7 passes while item 3 is unresolved, item 7 is remembered but cannot
be returned until all earlier candidates have resolved as failures. Once the
answer is determined, later queued work is discarded and later active work is
cancelled cooperatively.

“Success” means a truthy predicate result. An exception is not implicitly a
miss: by default it fails the scope. Code that wants fallible attempts to count
as misses must convert failures into ordinary RiX values through the language's
soft trial/case mechanisms.

For completion-order behavior, use a named scope break instead:

```rix
{$search:4$
    candidates |>> (candidate) -> {;
        result := Try(candidate)
        IsAnswer(result) ?? {!$search! result} ?: _
    }
}
```

# Scheduler and ordering contract

The effective concurrency limit is the minimum of:

1. the nearest explicit scope limit, if present;
2. inherited containing-scope limits;
3. the runtime default or host maximum;
4. executor-specific limits, such as a worker-pool size.

The scheduler is work-conserving but deterministic about admission:

- source items are admitted in canonical source/traversal order;
- an admitted item retains its permit through its fused region;
- completion order may expose later-ready internal slots, but final ordered
  values retain source order;
- a barrier consumes values in source order even if they arrived out of order;
- nested scopes share the ancestor scheduler rather than creating capacity;
- waiting scope controllers do not hold leaf permits.

For a limit `L`, no more than `L` items execute at once and no more than `2L`
items may be admitted but not yet published. The second bound is an ordered
publication window: it permits useful overlap without allowing a slow early
item to cause unbounded buffering of later completed results. This window and
hierarchical round-robin nested admission remain follow-up scheduler work.

Each nested scope owns a scheduler group. A group's in-flight count includes
all descendant groups, so `{$outer:4$ {$inner:2$ ... } }` can use at most two
slots in `inner` and at most four across `outer`. Cancellation is group-local:
a handled break in `inner` rejects its queued descendants without cancelling
independent `outer` siblings. Running capability work remains cooperative and
is drained before the owning scope returns.

The scheduler must attach a stable path to each item, for example
`scope jobs / map entry a / array index 2 / pipe stage H`. Diagnostics, output,
and suppressed errors use this path.

# Scope, cells, and effects

Each concurrent source item runs in a task-local context forked from the scope
at admission. It receives a stable snapshot of visible ordinary values and the
same callable/capability boundary. Implementations may use immutable sharing or
copy-on-write rather than eagerly deep-copying everything.

Within a source item:

- local assignment and mutation are allowed;
- writes to ordinary cells outside the task are rejected;
- task-local state does not escape except as the returned value;
- reactive writes and host effects follow the special rules below.

Consequently, this is invalid concurrent accumulation:

```rix
total := 0
{$ values |>> (x) -> @total += F(x) }
```

The deterministic form returns values and reduces them:

```rix
total := {$ values |>> F } |>: @+
```

Capability groups remain authority boundaries. `{$ ... }` grants no network,
file, plugin, process, or output permission that the caller did not already
have. A capability may additionally declare:

```js
{
  async: true,
  parallelSafe: true,
  cancellable: true,
  executor: "event-loop", // or "worker"
  effects: ["net"]
}
```

The exact metadata spelling can change during implementation, but the runtime
must distinguish promise-awareness, safe overlap, cooperative cancellation,
executor needs, and effects. A capability not marked parallel-safe executes
through a serialized lane even inside a concurrency scope.

Random work receives a deterministic child stream derived from the parent seed
and stable task path. Completion timing must not change random results.

# Failure, cancellation, and cleanup

## Scope failure

By default, an unhandled child error fails the containing `{$ ... }` scope:

1. stop admitting new source items;
2. request cancellation of active siblings;
3. await sibling cleanup/settlement;
4. throw an annotated error from the scope.

The first fatal error observed by the scheduler is the primary error. Because
observation order depends on timing, two nearly simultaneous failures need not
select the same primary error across runs. Later failures are attached as
suppressed errors with stable task paths and observation timestamps.
Cancellation is not itself reported as a sibling error.

Future `AllSettled`-style behavior should be an explicit operation; it is not
the default collection-construction contract.

## Cooperative cancellation

Every task receives a cancellation signal. The evaluator checks it at least at:

- function/capability call boundaries;
- loop backedges;
- lazy-source pulls;
- pipe-stage transitions;
- worker message boundaries.

I/O capabilities should forward the signal to host APIs such as
`AbortController`. Synchronous JavaScript or native code that neither yields
nor checks the signal cannot be safely interrupted on the event loop. A worker
may be terminated, but termination discards its local state and still cannot
undo completed external effects.

Cancellation never promises rollback. A request may already have been sent, a
file may already have been written, and output may already have been emitted.

Implicit suspension is therefore not an atomic region. Ordinary task-local
state follows snapshot/copy-on-write rules, reactive commits become visible at
their defined publication points, and external effects and output remain in
completion order unless a host explicitly presents them differently.

## Guaranteed finalization

The accepted acquisition postfix `##_` registers guaranteed cleanup while
preserving the acquired value:

```rix
file := Open(path) ##_ Close
```

Registration occurs only after the expression on the left succeeds and belongs
to the nearest block activation. Registered finalizers run sequentially in
LIFO order on normal return, break, error, timeout, cancellation, and host
shutdown. Cleanup is implicitly awaited and finishes before a concurrent item
publishes its result or releases its permit. It is cancellation-shielded within
a host cleanup grace period.

If the body failed, that failure remains primary and cleanup failures are
suppressed. If the body succeeded, the first cleanup failure becomes primary.
Parsing, lowering, and executing `##_` remain follow-up work.

`##!>` catches only a typed operational `fault`, such as timeout or a capability
failure declared recoverable. It does not catch language errors or control
signals. The fault hierarchy and operator implementation remain follow-up work.

## Async-scope break

`{!$...}` is a controlled scope completion rather than an error. Its value is
fully evaluated in the winning task before cancellation begins. The scope then
follows the same stop, cancel, and cleanup sequence and returns that value.

Two nearly simultaneous breaks are resolved by scheduler observation order.
This is intentionally nondeterministic and appropriate only when any winning
answer is acceptable. Ordered selection uses `|>||`.

# Background-task contract

## Spawn and isolation

`{$$ ... }` has an explicit import boundary. An unlisted outer binding is
invisible. A listed ordinary value is deep-copied at spawn, and an ordinary
alias import is rejected. A listed reactive value is an alias so that reactive
publication remains an explicit communication channel. External user functions
must also be listed; their captured ordinary values are validated and
deep-copied. The block also snapshots its source location and allowed capability
frame. It cannot mutate ordinary outer cells. The spawning evaluation receives
null immediately and cannot join or inspect the final value.

The runtime registers the task with a background supervisor. The supervisor:

- assigns an ID and retains source diagnostics;
- enforces a host-configured active-task and queue limit;
- owns cancellation when the session closes;
- reports uncaught task errors as diagnostic events;
- prevents an abandoned task from retaining a closed runtime indefinitely.

Starting a background task requires a `BACKGROUND` script permission. The task
inherits, but does not broaden, the caller's other permissions.

## Host lifecycle

Interactive hosts keep background tasks alive until they finish, are cancelled,
or the session closes. Session close requests cancellation and drains cleanup
for a bounded grace period.

The CLI drains supervised background tasks before normal process exit by
default, so a background file write is not silently truncated merely because
the main expression finished. A host/CLI no-drain mode may instead cancel them
at main completion. This lifecycle choice affects process lifetime, never the
value or statement ordering of the main RiX evaluation.

## Errors

An uncaught background error cannot propagate to the already-continued
spawning expression. It emits a structured diagnostic containing task ID,
spawn location, current task path, and error stack. Hosts may treat background
errors as nonfatal diagnostics or terminate the session by policy.

## Reactive reads and writes

A background task is a one-shot effect, not a persistent reactive formula.
Reactive reads are point-in-time reads and do not retain a dependency after the
task ends.

A reactive assignment performed by a background task:

1. fully evaluates the right-hand side in the task;
2. transfers/copies the resolved value to the graph-owning runtime;
3. commits it as a literal reactive definition on the owner event queue;
4. triggers ordinary reactive propagation there.

The task must not install a formula that closes over task-local cells. `${ ... }`
inside a background task transfers one atomic batch of resolved literal
updates. Multiple background tasks that update the same reactive identity are
serialized by arrival order and are therefore timing-dependent; deterministic
programs should use one writer or distinct identities.

Direct cross-thread access to a `ReactiveGraph` is forbidden. A worker-backed
task communicates through supervisor messages.

The first implementation rejects `{$$ ... }` while evaluating a reactive
formula. Otherwise every recomputation could spawn another external effect.
A later reactive-effect abstraction may define replacement/cancellation rules.

# Async streams

Long-lived or incremental asynchronous data is a separate runtime abstraction,
not a reactive variable containing a promise or stream. An `async_stream`
supports cancellation-aware `Next(signal)` and `Close(reason)`. Cold streams
pull lazily; hot streams push through an explicitly bounded buffer. Async pipe
stages remain lazy until a terminal operation consumes the stream. Reactive
variables may project a latest value or progress snapshot from a stream, but do
not own the stream itself. Syntax and runtime support remain follow-up work.

# Execution model

The language specifies overlap and isolation, not a particular executor:

- promise-returning file/network/timer/plugin work normally uses event-loop
  concurrency;
- CPU-heavy pure RiX work requires a worker pool for true simultaneous
  execution;
- worker execution requires serializable lowered IR, captured values, random
  state, capability descriptors, results, diagnostics, and cancellation;
- host-only or non-serializable capabilities remain on the owner executor;
- worker results and reactive commits cross the boundary as messages.

An event-loop implementation still satisfies ordering and awaiting semantics,
but a long synchronous task can block every sibling. Documentation and
diagnostics should use “concurrent” unless a worker executor actually guarantees
parallel CPU execution.

# IR and runtime shape

The intended lowered forms are conceptually:

```text
ASYNC_SCOPE({ name?, limit? }, DEFER(body))
DETACH({}, DEFER(body))
BREAK({ targetType: "async", targetName? }, value)
```

The async evaluator may plan an expression into internal nodes such as:

```text
ASYNC_SOURCE
ASYNC_STAGE_MAP
ASYNC_STAGE_FILTER
ASYNC_TERMINAL_ANY
ASYNC_TERMINAL_ALL
ASYNC_BARRIER
```

These are evaluator-internal plans, not first-class RiX values. A promise,
scheduler permit, task handle, or partially resolved collection must never
escape into ordinary RiX operations.

The current nested `PMAP(PFILTER(...))` IR does not by itself preserve enough
information to fuse a whole expression after inner evaluation materializes.
Implementation should either:

1. add an async planning pass that flattens a pipe chain before evaluating its
   source; or
2. lower pipe chains under `ASYNC_SCOPE` to an explicit `ASYNC_PIPELINE` plan.

The planning pass is preferred initially because it avoids changing ordinary
sync IR and can classify existing pipe functions as stages or barriers in one
place.

# Examples

## Parallel construction followed by a barrier pipe

```rix
summary := {$
    {= left=Fetch(leftUrl), right=Fetch(rightUrl) }
} |> Summarize
```

Both fetches overlap. `Summarize` receives the completed map.

## End-to-end bounded pipeline

```rix
accepted := {$imports:10$
    paths
        |>> ReadFile
        |>> ParseRecord
        |>? ValidRecord
        |>> Normalize
}
Store(accepted)
```

At most ten path items occupy the fused pipeline. A fast item may reach
`Normalize` while an earlier file is still being read. `accepted` retains path
traversal order among passing records.

## Ordered selection

```rix
answer := {$search:6$
    candidates
        |>> TryCandidate
        |>|| IsAnswer
}
```

This returns the first candidate result in source order that passes `IsAnswer`,
not the fastest passing result.

## Completion race

```rix
answer := {$race:3$
    strategies |>> (strategy) -> {;
        result := strategy(problem)
        IsAnswer(result) ?? {!$race! result} ?: _
    }
}
```

This returns whichever strategy first produces an accepted answer.

## Background publication

```rix
$$status := :idle
$$result := _

{$$
    $status := :working
    value := {$:4$ sources |>> Fetch |>> Decode }
    ${
        $result := value
        $status := :done
    }
}

RenderMainView()
```

`RenderMainView()` begins without waiting for the task. The resolved literal
reactive batch later publishes `result` and `status` together.

# Implementation checklist

## 0. Lock the language contract

- [x] Add parser, lowering, and evaluator design tests that describe the syntax
  before enabling execution.
- [x] Remove stale user-facing references that call `{$ ... }` a mathematical
  system block; keep `{# ... }` as the symbolic-system form.
- [x] Decide and document canonical map traversal order; use insertion order for
  deterministic ordered pipes.
- [x] Add `defaultAsyncConcurrency: 10` and host override plumbing.
- [ ] Add a `BACKGROUND` script permission and sandbox policy tests.

## 1. Parser and IR

- [x] Teach the tokenizer to recognize `{$ ... }`, `{$name$ ... }`,
  `{$:n$ ... }`, and `{$name:n$ ... }` with required following whitespace.
- [x] Recognize `{$$ ... }` before generic `$` sigil handling.
- [x] Add `AsyncContainer` and `DetachedBlock` AST nodes.
- [x] Parse `{!$ value }` and `{!$name! value }` as async-targeted breaks.
- [x] Lower to `ASYNC_SCOPE`, `DETACH`, and `BREAK(targetType="async")`.
- [x] Preserve scope names, limits, and source spans in IR. Stable task paths remain pending.
- [x] Add tokenizer/parser/lowering negative tests for zero, malformed, and
  unsafe concurrency limits.

## 2. Promise-aware evaluation

- [x] Add `evaluateAsync` and `parseAndEvaluateAsync` while retaining the sync
  API for sync-only scripts.
- [ ] Extend registry/system capability entries with async implementations or a
  promise-aware dispatch contract.
- [x] Reuse ordinary eager implementations after asynchronously evaluating
  their arguments.
- [ ] Add async implementations for lazy control, assignment, function-call,
  collection, pipe, diagnostic, and reactive operations that selectively
  evaluate IR.
- [x] Make the CLI, CLI REPL, generated-page host, RiX Web REPL, and tutorial
  runner select/await the async entry point. Notebook host work remains pending.
- [x] Verify that raw promises cannot be assigned, collected, formatted, or
  returned as RiX values.
- [ ] Preserve source annotation and call-stack diagnostics across `await`.

## 3. Scheduler and task contexts

- [x] Add a runtime-owned `TaskScheduler` with ordered admission, bounded
  permits, grouped cancellation, and cleanup draining.
- [x] Give each scheduler group an `AbortSignal` and abort descendant groups
  without aborting their parent.
- [ ] Bound admitted-but-unpublished work to `2L` and use hierarchical
  round-robin admission across nested sibling branches.
- [ ] Attach stable task paths to scheduler entries and diagnostics.
- [x] Implement effective-limit composition for nested scopes. A distinct host
  maximum remains follow-up configuration work.
- [x] Ensure structural parents do not retain leaf permits
  while awaiting children.
- [ ] Add task-local `Context` forks with snapshot/copy-on-write reads and
  rejected ordinary outer writes.
- [ ] Derive deterministic random substreams from stable task paths.
- [x] Add deferred-capability tests that assert admission and
  completion traces without relying on wall-clock timing.

## 4. Concurrent collection construction

- [x] Add async planning/evaluation for arrays, brace arrays, tuples, sets,
  maps, matrices, and tensors.
- [x] Capture parallel-constructor semantics lexically for functions defined
  inside `{$ ... }`; keep outside-defined functions sequential unless they use
  an explicit inner concurrency scope.
- [ ] Classify callable safety and reject unsynchronised ordinary shared writes
  from concurrent functions.
- [x] Preserve source-order result assembly despite completion-order slot fills.
- [x] Implement finite map key/value and insertion-order rules.
- [x] Treat pre-existing collections as data sources without re-evaluation.
- [ ] Add bounded pull for lazy/generator sources and keep recurrence generation
  sequential where values depend on history.
- [x] Test the limit-2 `{= a=[F(), G()], b=H() }` admission scenario exactly.

## 5. Fused async pipes

- [x] Add a planner that flattens supported pipe chains before source evaluation.
- [x] Classify every current pipe operator as elementwise, terminal, or barrier.
- [x] Implement end-to-end permit retention through finite `|>>` and `|>?` stages.
- [x] Preserve collection shape, locators, callback arguments, strings, maps,
  tensors, and source-order result assembly for finite eager sources.
- [x] Implement ordered `|>||`, including buffering a later passing result until
  every earlier candidate fails.
- [ ] Implement `|>&&` cancellation once a falsy result determines the outcome.
- [x] Implement ordered reduce barriers with concurrent upstream stages.
- [x] Implement stable async sort and promise-aware finite structural barriers.
- [x] Test pipelines separated by multiple barriers. Nested barrier expressions
  inside collection entries remain follow-up coverage.
- [ ] Test infinite/lazy sources for strict bounded admission and early terminal
  cancellation.

## 6. Failure and cancellation

- [ ] Thread the implemented group cancellation signals through evaluator
  calls, loops, source pulls, stages, capabilities, and workers.
- [x] Implement fail-fast admission stop followed by queued-sibling cancellation and
  cleanup drain.
- [ ] Attach suppressed cleanup failures in stable task-path order.
- [x] Implement named and unnamed `{!$...}` completion races with queued-sibling cancellation.
- [ ] Specify capability metadata for parallel safety, cancellation, executor,
  and effects; serialize unsafe capabilities through a single lane.
- [ ] Add tests for queued cancellation, cooperative I/O abort, loop
  checkpoints, simultaneous breaks, and uncancellable synchronous code.
- [ ] Verify explicitly that cancellation does not imply effect rollback.

## 7. Background supervisor and reactive publication

- [x] Implement `DETACH` as immediate null plus a supervisor-owned task.
- [ ] Add active-task/queue limits, task IDs, source diagnostics, session-close
  cancellation, and bounded cleanup.
- [ ] Define CLI drain-by-default and host no-drain/cancel behavior.
- [x] Report background errors to the host handler/error queue without retroactively
  failing continued main evaluation.
- [ ] Snapshot ordinary captured values and capability permissions at spawn.
- [ ] Enforce detached import isolation: deep-copy listed ordinary values,
  reject ordinary aliases, alias listed reactive values, and hide unlisted
  bindings.
- [ ] Reject ordinary outer-cell writes and detached spawn during reactive
  formula evaluation.
- [ ] Transfer background reactive updates as resolved literal messages to the
  graph owner; support atomic `${ ... }` batches.
- [ ] Document and test arrival-order conflicts between multiple background
  writers.
- [x] Add a supervisor drain API for hosts without exposing task
  handles as RiX values.

## 8. Worker-backed CPU parallelism

- [ ] Define the serializable IR, closure-value, random-state, capability,
  result, diagnostic, and cancellation message protocol.
- [ ] Add a bounded worker executor for pure/worker-safe RiX tasks.
- [ ] Keep non-serializable and host-owned capabilities on the owner executor.
- [ ] Route reactive commits and output events back through owner messages.
- [ ] Add worker termination and grace-period behavior.
- [ ] Compare event-loop and worker execution for semantic equivalence.

## 8a. Accepted async follow-ups

- [ ] Parse keyed and positional timeout headers and enforce earliest nested
  monotonic deadlines with cancellation and drain.
- [ ] Add typed operational faults and restrict `##!>` to that channel.
- [ ] Parse and lower value-preserving `##_` cleanup registration; run
  finalizers LIFO, sequentially, shielded, and before permit release.
- [ ] Add the separate bounded `async_stream` runtime with lazy async pipes and
  terminal consumers.

## 9. Documentation, observability, and hardening

- [x] Add syntax/reference documentation for the implemented runtime
  slice is implemented.
- [ ] Show scope/task paths, queue state, running count, cancellation reason,
  and executor in trace diagnostics.
- [ ] Tag concurrent output events with task paths and define host presentation
  ordering.
- [ ] Add deterministic stress tests for deep nesting, low limits, barriers,
  cancellation storms, and background shutdown.
- [ ] Add benchmarks for I/O overlap, pipeline latency, scheduler overhead, and
  worker CPU scaling.
- [x] Run `bun test` from `rix/` after every implementation slice.

# Recommended delivery slices

1. **Async foundation:** promise-aware evaluator plus sequential implicit await,
   with no concurrency syntax enabled.
2. **Awaited gather:** `{$ ... }`, bounded explicit arrays/tuples/maps, nested
   constructors, ordered results, and fail-fast cancellation.
3. **Pipeline concurrency:** fused `|>>`/`|>?`, then ordered `|>||`/`|>&&`, then
   barriers.
4. **Structured escape:** named `{!$...}` and complete cancellation diagnostics.
5. **Background effects:** `{$$ ... }`, supervisor lifecycle, and literal
   reactive publication.
6. **True CPU parallelism:** worker-safe tasks after event-loop semantics are
   stable.

Each slice must leave ordinary synchronous RiX behavior unchanged and keep the
existing test suite green.
