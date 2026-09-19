# Ordered stream stages, clocks and host adapters

Implemented by `runtime/async-stream{,-pipeline,-clock,-adapters}.js`. This record
settles R3 operator behavior. The matching executable contracts are
`tests/runtime/async-stream-pipeline.test.js`, `async-stream-adapters.test.js`,
`async-stream-local-fixtures.test.js` and `tests/eval/async-stream-segments.test.js`.

## Ordered execution and bounded state

Construction remains lazy. A terminal claims all source handles, including each
Merge input. Reusing one root twice in a Merge graph is rejected before any
source starts. Every claimed root closes exactly once after natural exhaustion,
an early bound, undecided filter/chunk boundary, error, cancellation or timeout.
Pending pulls, background Latest pumps, timer waits and callback jobs receive
cancellation; close waits for their cooperative cleanup. The first consumption
error stays primary and bounded cleanup failures are attached. A host JavaScript
operation must cooperate with its abort signal; this layer cannot forcibly stop
arbitrary JavaScript that ignores cancellation.

Consecutive Map/Filter/expected-error stages form an elementwise region. Ordered
cursors connect these regions to Take/Drop/Chunk/ChunkBy/Window and temporal
barriers. Each region independently regains concurrency after a barrier. The
containing scheduler is shared by all regions and terminal callbacks, so its
limit and every ancestor limit still apply. Waiting for an upstream cursor
releases admission; recursive scheduling cannot consume all permits while
waiting for its own producers. Unknown host effects retain the existing single
owner lane; only explicitly safe callbacks overlap.

A region publishes its completed values in source order even when callbacks
finish in another order. Reduce runs in that published order. Callback locators
inside a region retain the source pull index carried into that region; a chunk
carries its final member's source index. Merge input indices are local to each
source. Final terminal locators in segmented pipelines number the merged/transformed output. ForEach
callbacks inside a structured scope may overlap, while outside a scope they run
sequentially. An effect's completion order is distinct from output publication.

Per-region unpublished capacity is the minimum of `2L`, the host queue limit,
and `floor(outstanding / stageCount)`, at least one. Outside a structured scope
it is one. `stageCount` counts source roots and stage descriptors, and is bounded
by `outstanding` (default 4096). Merge nesting is additionally limited to 64.
The total retained entry count in stateful chunk/window buffers is bounded by
`outputItems` (default 10000). Latest holds one value; Merge has one pending pull
or ready record per input. Hot source queues and blocked producers retain their
existing capacity/queue limits. Output and trace event limits still apply.
Every upstream pull charges the owner evaluation budget. A source cursor yields
to host timers every 64 pulls, so a continuously suppressed cold source cannot
starve cancellation or quiet-period timers. These are item counts, not a byte bound on arbitrary nested mathematical values.
HTTP/file/WebSocket adapters additionally enforce byte limits.

## Operator contract

| Operator | Ordering and completion | Retained state / loss |
|---|---|---|
| `ChunkBy(P)` | Evaluate P in source order; a true result ends the chunk **after** the current item. Flush a final partial chunk on completion or upstream Take. Undecided returns `?` and closes. | One bounded chunk; a false predicate cannot grow it beyond the output budget. |
| `Merge(other)` | Start one pull per source. Emit settled results in observed readiness order; same-turn already-ready pulls break ties by input order. Preserve each source's own order. Complete after both sources complete; errors close both. | One pending/ready record per input; no replay or duplicate-root consumption. |
| `Timeout(ms)` | Start a timer for each outstanding downstream demand on its upstream cursor. If the timer wins, raise `ASYNC_STREAM_TIMEOUT` and close. Downstream idle time does not count. | One timer and one pending pull. |
| `Debounce(ms)` | Hold the latest observed input until a quiet interval. A new input resets that interval. Flush the held value immediately on normal completion; discard it on failure/cancellation. | One held value, one lookahead pull and one timer. Replaced held values count as dropped. |
| `Throttle(ms)` | Leading-only: emit the first observed value, then the first observed value at least ms after the last emitted value. No trailing flush. | Values inside the interval are explicitly dropped. |
| `Latest()` | Start a supervised upstream pump at first demand. While downstream is busy, replace the pending slot. After normal completion deliver the final slot then complete. On failure discard it and fail. | One pending value, drop-oldest; count replacements. Yield to host timers after every 64 synchronous upstream values. |

Durations are positive safe-integer milliseconds, at most 2147483647. The clock
is monotonic processing time: values are timed when an operator observes them,
not by a timestamp field inside their payload. Cold backpressure therefore
changes observed timing; use a hot source when production must continue while
its consumer is busy. At an exact deadline, whichever promise reaction settles
first wins. There is no additional event-time or distributed ordering claim.

Hosts can inject `__async_stream_clock__` with `now()`, `setTimeout(fn, ms)` and
`clearTimeout(handle)`; the default uses `performance.now()` and host timers.
Fake-clock tests control every deadline without wall-time sleeps. Throttle
rejects a nonfinite/backward clock reading. All completion and cancellation
paths remove timers and listeners.

## Adapter authority and data

`.TimerStream(ms, count?)` is cold and demand-paced: every demand waits ms and
returns the next exact Integer tick, starting at 1. It does not run a fixed-rate
background interval. Supplying count makes it finite, including count zero.

`.ReactiveStream(source)` subscribes to the explicitly passed source only when
pulled. A reactive node yields its current exact value at each published change;
a graph yields an inert map containing event kind, epoch and changed node names.
`.UIStream(hostKey, eventName)` looks up an EventTarget in the embedding host's
explicit `streams.uiTargets` map. Its default payload is the event type string.
JavaScript hosts can provide a trusted synchronous projection. Neither adapter
reads an ambient document. They unsubscribe on close and default to bounded
error-on-overflow queues. Event callbacks cannot select blocking overflow.

`.HttpStream(url)`, `.FileStream(path)` and `.WebSocketStream(url)` require **both**
an explicit host NET/FILES grant and the current imported script's corresponding
permission, when a script frame exists. Grant revocation is rechecked at first
use. An explicit host `authorize({kind, reference, context})` must also return
true. Source code cannot install a transport service or raise a grant. No
transport service is installed in the default Node or browser adapter. The
editor standard policy withholds all three transport capabilities.

Install `createStreamHostServices(...)` as the `streams` option of an existing
host adapter. Supply fetch/openFile/createWebSocket functions as needed. The
optional Node factory `createNodeStreamHostServices` additionally restricts URL
origins and real file roots, resolving symlinks before checking allowed roots.
Hosts remain responsible for preventing hostile concurrent filesystem changes;
these roots are a read policy, not an operating-system sandbox.

HTTP disables redirects and sends no browser credentials. HTTP/file streams
incrementally decode fatal UTF-8, preserving a character split across chunks;
WebSocket yields one UTF-8 string per text/byte message. Blob messages are not
accepted; the socket requests `binaryType="arraybuffer"`. HTTP failure responses
cancel their bodies. Cancellation also cancels a body/file that arrives after
its owner has stopped. Readers, file iterators and socket listeners close even
when decoding, byte limits or consumer callbacks fail.

Default byte limits are 64 KiB per chunk/message and 16 MiB per stream, with
host-configurable ceilings of 1 MiB and 64 MiB respectively. Exceeding either
raises `ASYNC_STREAM_BYTE_LIMIT`. A generic HTTP/WebSocket source is not declared
finite; use a bounded terminal or Take for Count. File sources are finite.
The portable subscription helper requires synchronous subscription setup and a
synchronously returned cleanup function; cleanup itself may return a promise.

Database cursors/connectors remain a later decision (D8). No database interface,
new permission category or ambient network authority is introduced here.

## Trace and benchmark acceptance

`.Status()` adds pending pulls and close count; segmented pipelines expose
segments, current/max queued and running callbacks, buffered entries, published
outputs, drops, executor and closing reason. `.Trace` records stream-open,
per-region item start/end, source-ordered stream-publish (with outputIndex), and
stream-close events. Records carry structural task paths and scheduler snapshots;
when a task worker pool exists they also carry its bounded snapshot. Eligible
CPU leaves emit worker-dispatch/result/failure events with the same task paths.
The existing trace event limit discloses dropped events.

Run from `rix/`:

```sh
bun test tests/runtime/async-stream.test.js tests/runtime/async-stream-pipeline.test.js tests/runtime/async-stream-adapters.test.js tests/eval/async-stream.test.js tests/eval/async-stream-segments.test.js
bun test tests/runtime/async-stream-local-fixtures.test.js
bun benchmarks/async-streams.js --items=32 --exponent=512 --rounds=2
```

The second command uses only a loopback listener and temporary files under the
repository's tmp directory. Restricted environments must allow that local
listener; a denied listener is a failing check, not a silently skipped fixture.
The benchmark fixes input order, records exact checksums and evaluator steps,
and compares I/O overlap, first publication latency, scheduler overhead and exact
CPU tasks on the event loop versus 1/2/4 workers. Every row asserts checksum
parity; no result depends on a timing threshold. Wall times include startup and
are informational. Small tasks can be much faster on the event loop because
worker initialization and serialization dominate. Use rounds to inspect warmed
behavior and larger exponents to measure a different workload.
