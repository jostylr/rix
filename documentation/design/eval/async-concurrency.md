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
supervised/drainable `{$$ ... }` tasks. It also includes timeout headers,
typed operational-fault recovery, LIFO `##_` cleanup, a `2L` ordered
publication window, task-local ordinary snapshots/write rejection, and strict
detached import capture. It also includes first-class linear `async_stream`
values, cold and hot source infrastructure, lazy stream stages, explicit
terminals, structured stream consumption, and prefix method lifting.
`{# ... }` remains the inert symbolic-system form.

The event-loop implementation now also supplies bounded pull for legacy lazy
sources when an explicit async terminal consumes them, ordered early
cancellation for both `|>||` and `|>&&`, loop/pull/stage cancellation
checkpoints, promise-aware script imports and selective control forms, and
deterministic seeded random substreams per source branch. Still planned are
async callbacks inside recurrence generators, capability safety/serialization
metadata, worker execution, and complete structural task-path diagnostics.

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

Keyed options add an optional timeout:

```rix
{$jobs:limit=10,timeout=5$ expression }
{$:limit=10,timeout=5$ expression }
```

The positional forms remain shorthand: `{$jobs:10,5$ ... }` supplies limit and
timeout, while an omitted positional field such as `{$jobs:,5$ ... }` uses the
default limit. The anonymous forms `{$:10,5$ ... }` and `{$:,5$ ... }` work the
same way. Timeout values are positive safe-integer seconds. The timer uses a
monotonic clock and starts when the scope is entered; nested scopes observe the
earliest active deadline. A timeout stops admission, aborts cooperative
capabilities, drains admitted work, and then runs cleanup under its separate
grace period.

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

The settled admission contract is hierarchical round-robin across sibling
branches. For nested branches `[A1, A2, ...]`, `[B1, B2, ...]`, and leaf `C`, a
limit of four admits `A1`, `B1`, `C`, then `A2`. Applied to the map above, its
two top-level value branches offer `F()` and `H()` before the first branch
offers `G()`. This breadth-first fairness prevents a large early subtree from
monopolizing admission. The scheduler batches ready admissions and tracks
hierarchical prefix counts so sibling subtrees receive a leaf opportunity
before a subtree consumes additional permits.

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

Lazy and unbounded sources use bounded pull when consumed by `|>_`, `|>||`, or
`|>&&`: no more than the `2L` admission/publication window is outstanding, and
an early result closes the adapter. They are never fully materialized merely
because evaluation occurs inside `{$ ... }`. Arithmetic lazy generators may be
constructed either before or inside the scope and consumed there.
Promise-returning generator source/stage callbacks remain a separate runtime
extension because synchronous `lazy_sequence` caches cannot contain promises.

# Async pipe semantics

All pipe operators use the async evaluator inside `{$ ... }`, but only
elementwise operators naturally fuse. Whole-value and structural operations
are barriers.

| Pipe | Existing role | Async behavior |
|---|---|---|
| `|>>` | map | Elementwise fused stage; transformed items retain source order in the result. |
| `|>?` | filter | Elementwise fused predicate; passing items continue immediately; final result retains source order. |
| `|>!` | expected-error value handler | Elementwise fused recovery stage. Canonical `{: :error, ...args }` values call the handler with `args`; returning null drops that item. Other values pass through. |
| `|>_` | ForEach/drain with callback | Consuming terminal. Calls the callback for every item, discards callback results, awaits exhaustion, and returns null. |
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

The tokenizer recognizes `|>_` and `|>!` before their shorter `|>` prefix.
Both operators use the same callback convention as other elementwise pipes.
For `|>_`, that is `(value, locator, source)`; the return value is deliberately
ignored and no output collection is allocated. Outside a concurrency scope it
drains sequentially. Inside `{$:L$ ... }`, each handler holds one item permit
until it settles, fail-fast cancellation applies, and the terminal waits for
every admitted handler before returning null. Streams and lazy sources are
pulled only as downstream capacity becomes available. A callback-free `Drain`
terminal remains a possible convenience API, distinct from `|>_`.

`|>!` handles expected failures represented as values, not thrown failures.
Only a tuple whose leading value is `:error` is intercepted:

```rix
{: :error, :timeout, url } |>! ((kind, resource) -> Cached(resource))
```

The leading tag is removed and the remaining entries become positional handler
arguments. A non-null recovery value continues through later stages. Null is
an internal skip signal: a fused collection/stream item is removed and later
stages are not called for it; a scalar pipeline short-circuits and evaluates to
RiX null. The sentinel is never observable as a value or collection hole.
Non-error values pass unchanged, and language errors, operational faults,
breaks, and cancellation propagate normally.

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
        IsAnswer(result) ?: {!$search! result} ?_ _
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
item to cause unbounded buffering of later completed results. Finite eager
work, async streams, and explicitly consumed legacy lazy sources enforce this
window. Hierarchical round-robin admission also applies to nested branches.

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

After `.RANDOMSEED`, concurrent work receives a deterministic child stream
derived in stable source-branch creation order. Completion timing does not
change random results. Unseeded randomness and a host-injected random function
retain their host-defined behavior.

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

The acquisition postfix `##_` registers guaranteed cleanup while
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
The current runtime implements this for top-level scripts, ordinary and async
blocks, concurrent items, and supervised background blocks.

`##!>` evaluates its left side once and catches only a typed operational
`fault`, such as timeout or a capability failure declared recoverable. It calls
the handler with a fault record and returns the handler's recovery value. It
does not catch language errors, `.Error`, breaks, or ordinary cancellation;
handler failures propagate.

## Expected-value retry

`.Retry` repeatedly evaluates deferred work when, and only when, it returns a
canonical expected-error tuple. The short form supplies the total number of
attempts:

```rix
.Retry(3, @{ Fetch(url) })
```

The policy-map form adds a delay in seconds, multiplicative backoff, and an
optional allow-list matched against the first value after `:error`:

```rix
.Retry(
    {= attempts=4, delay=1, backoff=2, kinds=[:timeout, :unavailable] },
    @{ Fetch(url) }
)
```

`attempts` is a positive safe integer. `delay` and `backoff` are finite
non-negative numbers; their defaults are 0 and 1. Success returns immediately.
An unlisted error kind also returns immediately, and exhaustion returns the
final error tuple so a following `|>!` can recover or skip it. Thrown errors and
control flow are never retried. Cancellation or the containing scope's earliest
deadline interrupts a pending backoff and prevents another attempt.

Retries for one source item are sequential and retain that item's concurrency
permit. Every attempt has its own block activation, so its `##_` finalizers are
fully drained before the next attempt begins. The finalizer failure contract is
unchanged. Deterministic jitter is reserved for a later policy extension.
`Retry` belongs to the `Async` capability group.

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

The runtime registers the task with a background supervisor. The implemented
supervisor retains the task, reports uncaught errors, and owns cancellation and
resource disposal when its host session closes. The complete supervisor will
also:

- assigns an ID and retains source diagnostics;
- enforces a host-configured active-task and queue limit;
- prevents an abandoned task from retaining a closed runtime indefinitely.

Starting a background task requires a `BACKGROUND` script permission. The task
inherits, but does not broaden, the caller's other permissions.

## Host lifecycle

Interactive hosts keep background tasks alive until they finish, are cancelled,
or the session closes. RiX Web reset/page disposal and the exported runtime
disposal API request cancellation, close task-owned streams, and drain cleanup
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

## Value and pull contract

`async_stream` is an ordinary first-class RiX runtime value, but it is neither a
promise nor a materialized collection. It is a descriptive, linear handle over
an internal asynchronous resource protocol equivalent to:

```text
Next(cancellationSignal) -> { done, value }
Close(reason)
```

Promises used by `Next` remain inside the promise-aware evaluator. Formatting
prints the stream label, lifecycle state, and pull count without pulling or
materializing it. Streams may be asynchronous, non-restartable, non-cacheable,
and unbounded; they therefore do not reuse `lazy_sequence`.

The built-in `.Stream(collection, label?)` adapter creates a cold finite stream.
Hosts can construct a stream from a synchronous iterable, async iterable, HTTP
body reader, file-chunk reader, database cursor, or paged API through the same
runtime protocol. Pulling supplies backpressure: a cold source is not asked for
another value merely because a stream handle was created or formatted.

## Lazy stages and terminals

Receiver-first methods `Map`, `Filter`, `Take`, `Drop`, `Chunk`, and `Window`
return derived streams without pulling. Derived handles share one idempotent
root lifecycle and cannot be consumed independently. `stream |>> F` and
`stream |>? P` are polymorphic spellings of lazy `Map` and `Filter` stages.
Ending `{$ ... }` with a stream returns the handle; it never implicitly drains
it.

Consumption begins only at an explicit terminal:

- `ForEach(F)` performs an effect for each item and returns null;
- `Reduce(initial, F)` folds in source order;
- `Collect()` requires natural completion, while `Collect(n)` is bounded;
- `First()` and `Find(P)` stop and close early;
- `Count()` requires a known-finite stream, while `Count(n)` is bounded.

`Close(reason?)`, `Done()`, and `Status()` expose lifecycle control and
inspection without exposing promises as RiX values. Stateful stages remain
source ordered. The current implementation overlaps the safe `Map`/`Filter`
region; stateful stage pipelines use ordered sequential pulls until segmented
concurrent regions are implemented.

Prefix method lifting makes receiver transformations concise:

```rix
stream |>> ..DecodeText("utf8")
```

`..Method(args...)` is a callable equivalent to
`(value) -> value.Method(args...)`. It is prefix-only; the rejected `obj..name`
form remains rejected, and an ordinary lambda is always equivalent.

## Structured consumption and lifecycle

Outside `{$ ... }`, terminals pull and transform sequentially. Inside
`{$:L$ ... }`, safe elementwise work uses the containing scheduler: at most `L`
items execute at once, no more than `2L` items are admitted but unpublished,
and values publish in source order. Pull requests are created only behind an
available scheduler permit. Nested scopes inherit the earliest timeout and the
stricter limit; early terminals cancel and drain their child group.

Normal exhaustion, bounded completion, `First`/`Find`, transformation or source
fault, fatal error, timeout, cancellation, background shutdown, and explicit
host disposal all close the root exactly once. A source can additionally be
registered with block cleanup:

```rix
stream := OpenCustomStream() ##_ ..Close
```

Operational source and overflow failures use the typed `fault` channel and can
be recovered with `##!>`. Fatal language errors and cancellation propagate.
If both consumption and close fail, the consumption failure remains primary
and close failure is suppressed.

## Hot sources and reactive projection

The host hot-stream infrastructure uses a bounded queue with explicit
`:drop_oldest`, `:drop_latest`, `:error`, or producer-aware `:block` overflow.
It defines FIFO delivery, completion, fault propagation, cancellation of a
pending pull, exact-once unsubscribe, and blocked-producer release. The initial
public `.Stream` adapter is cold; WebSocket, UI, timer, and reactive-event
capabilities can expose the hot constructor as their host contracts mature.

A stream is an ordered event sequence; a reactive binding is current state.
The bridge is explicit supervised consumption rather than formula restart:

```rix
{$$ <latest=latest>
    .Stream([:connecting, :ready, :done])
        .ForEach((item) -> ($latest := item))
}
```

Reactive graph identity still crosses a detached boundary only through an
explicit reactive alias import. Reactive formula recomputation never silently
opens or restarts a stream.

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
        IsAnswer(result) ?: {!$race! result} ?_ _
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
- [x] Add a `BACKGROUND` script permission and sandbox policy tests.

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
- [x] Recognize `|>_` and `|>!` before `|>` and lower them to `PFOREACH` and
  `PEXPECT`.

## 2. Promise-aware evaluation

- [x] Add `evaluateAsync` and `parseAndEvaluateAsync` while retaining the sync
  API for sync-only scripts.
- [x] Make registry/system capability dispatch promise-aware and pass the
  containing cancellation signal to host calls.
- [x] Reuse ordinary eager implementations after asynchronously evaluating
  their arguments.
- [x] Add selective async implementations for assignment, calls, blocks,
  imports, case, loop, trial, hole-coalescing, destructuring, collections, and
  pipes. Promise-aware generator callbacks and some diagnostic/reactive host
  extensions remain tracked separately.
- [x] Make the CLI, CLI REPL, generated-page host, RiX Web REPL, and tutorial
  runner select/await the async entry point. Notebook host work remains pending.
- [x] Verify that raw promises cannot be assigned, collected, formatted, or
  returned as RiX values.
- [x] Preserve source annotations and scheduler failure metadata across
  `await`. Complete structural paths for every nested operation remain below.

## 3. Scheduler and task contexts

- [x] Add a runtime-owned `TaskScheduler` with ordered admission, bounded
  permits, grouped cancellation, and cleanup draining.
- [x] Give each scheduler group an `AbortSignal` and abort descendant groups
  without aborting their parent.
- [x] Bound finite eager admitted-but-unpublished work to `2L`.
- [x] Use hierarchical round-robin admission across nested sibling branches.
- [x] Attach stable scheduler task IDs, observation order, and timestamps to
  failures.
- [ ] Replace fallback task IDs with complete structural task paths in every
  evaluator admission and diagnostic.
- [x] Implement effective-limit composition for nested scopes. A distinct host
  maximum remains follow-up configuration work.
- [x] Ensure structural parents do not retain leaf permits
  while awaiting children.
- [x] Add task-local ordinary snapshots and reject captured-cell writes.
- [x] Isolate captured composites by deep task snapshot so local mutation
  cannot change the surrounding ordinary value.
- [ ] Finish callable/capability concurrency-safety classification.
- [x] Derive deterministic seeded random substreams in stable source-branch
  creation order.
- [x] Add deferred-capability tests that assert admission and
  completion traces without relying on wall-clock timing.

## 4. Concurrent collection construction

- [x] Add async planning/evaluation for arrays, brace arrays, tuples, sets,
  maps, matrices, and tensors.
- [x] Capture parallel-constructor semantics lexically for functions defined
  inside `{$ ... }`; keep outside-defined functions sequential unless they use
  an explicit inner concurrency scope.
- [ ] Classify callable/capability safety beyond the implemented captured-cell
  write rejection.
- [x] Preserve source-order result assembly despite completion-order slot fills.
- [x] Implement finite map key/value and insertion-order rules.
- [x] Treat pre-existing collections as data sources without re-evaluation.
- [x] Add bounded pull and early close for pre-existing lazy/generator sources
  consumed by async terminals; recurrence generation remains sequential.
- [ ] Add promise-returning callbacks to the legacy recurrence-generator
  protocol without allowing promises into its synchronous cache.
- [x] Test the current limit-2 `{= a=[F(), G()], b=H() }` structural-parent
  behavior without consuming permits.
- [x] Assert the settled `F, H, G` hierarchical order for that scenario.

## 5. Fused async pipes

- [x] Add a planner that flattens supported pipe chains before source evaluation.
- [x] Classify every current pipe operator as elementwise, terminal, or barrier.
- [x] Implement end-to-end permit retention through finite `|>>` and `|>?` stages.
- [x] Preserve collection shape, locators, callback arguments, strings, maps,
  tensors, and source-order result assembly for finite eager sources.
- [x] Implement ordered `|>||`, including buffering a later passing result until
  every earlier candidate fails.
- [x] Implement `|>&&` cancellation once a source-ordered falsy result
  determines the outcome.
- [x] Implement ordered reduce barriers with concurrent upstream stages.
- [x] Implement stable async sort and promise-aware finite structural barriers.
- [x] Test pipelines separated by multiple barriers. Nested barrier expressions
  inside collection entries remain follow-up coverage.
- [x] Test infinite/lazy sources for bounded lookahead and early terminal
  cancellation.
- [x] Add terminal `|>_` with ordinary callback arguments, result discard,
  bounded stream/lazy drain, null result, and fail-fast cancellation.
- [x] Add `|>!` expected-error tuple recovery with positional tail arguments,
  scalar short-circuit, and collection/stream item skipping without holes.
- [x] Add `.Retry` with count/policy forms, kind filtering, cancellable backoff,
  per-attempt cleanup, and permit retention.

## 6. Failure and cancellation

- [x] Thread group cancellation signals through evaluator and capability-call
  boundaries.
- [x] Add cancellation checkpoints to event-loop loops, lazy source pulls, and
  stage/evaluator boundaries.
- [ ] Add worker message-boundary checkpoints with the worker executor.
- [x] Implement fail-fast admission stop followed by queued-sibling cancellation and
  cleanup drain.
- [x] Preserve body failure as primary and attach later cleanup failures as
  suppressed errors.
- [ ] Give every cleanup and scheduler error a complete structural task path.
- [x] Implement named and unnamed `{!$...}` completion races with queued-sibling cancellation.
- [ ] Specify capability metadata for parallel safety, cancellation, executor,
  and effects; serialize unsafe capabilities through a single lane.
- [x] Test queued cancellation and cooperative I/O abort.
- [ ] Add focused tests for a loop checkpoint after suspension, simultaneous
  breaks, and uncancellable synchronous work.
- [x] Verify explicitly that cancellation does not imply effect rollback.

## 7. Background supervisor and reactive publication

- [x] Implement `DETACH` as immediate null plus a supervisor-owned task.
- [x] Add session-close cancellation, task-owned resource disposal, and bounded
  cleanup; RiX Web invokes it on reset and page disposal.
- [ ] Add active-task/queue limits, task IDs, and complete source diagnostics.
- [x] Define and implement CLI drain-by-default plus exported host/session
  disposal for cancel-and-drain behavior.
- [x] Report background errors to the host handler/error queue without retroactively
  failing continued main evaluation.
- [x] Snapshot explicitly imported ordinary values at spawn.
- [x] Enforce detached import isolation: deep-copy listed ordinary values,
  reject ordinary aliases, alias listed reactive values, and hide unlisted
  bindings.
- [x] Reject ordinary outer-cell writes and detached spawn during reactive
  formula evaluation.
- [ ] Transfer background reactive updates as resolved literal messages to the
  graph owner; support atomic `${ ... }` batches.
- [x] Document and test arrival-order conflicts between multiple background
  writers on the owner event loop.
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

## 8a. Settled async runtime additions

- [x] Parse keyed and positional timeout headers and enforce earliest nested
  monotonic deadlines with cancellation and drain.
- [x] Add typed operational faults and restrict `##!>` to that channel.
- [x] Parse and lower value-preserving `##_` cleanup registration; run
  finalizers LIFO, sequentially, shielded, and before permit release.
- [x] Add first-class linear `async_stream` values with hidden async pull and
  exact-once close protocols.
- [x] Add cold iterable adapters, lazy map/filter/take/drop/chunk/window stages,
  explicit terminals, lifecycle methods, and prefix method lifting.
- [x] Integrate safe elementwise terminals with `L` execution, the `2L`
  publication window, inherited cancellation, timeouts, and cleanup.
- [x] Add bounded hot-source queues with all four settled overflow policies.
- [x] Add explicit supervised stream-to-reactive publication examples and
  reject detached stream copying.
- [x] Cancel long-lived detached stream pulls and close their sources during
  host/session disposal.
- [ ] Add built-in HTTP, file, database, WebSocket, UI, timer, and reactive-event
  capabilities on top of the implemented host stream adapters.
- [ ] Segment stateful stream pipelines so later elementwise regions can regain
  structured concurrency; add `ChunkBy`, `Merge`, `Timeout`, `Debounce`,
  `Throttle`, and `Latest` only after those semantics are proven.

## 9. Documentation, observability, and hardening

- [x] Add syntax/reference documentation for the implemented runtime slice.
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
