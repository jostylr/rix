# AsyncStream methods

An `AsyncStream` is a linear pull handle. Derived methods are lazy; a terminal method claims and consumes the stream. Documentation examples on this page use `async=true`, so the normal promise-aware RiX evaluator executes their `##@` checks.

## Derived and terminal methods

| Full syntax | Result | Meaning |
|---|---|---|
| `stream.Map((value) -> result)` | `AsyncStream` | Lazily transform values. |
| `stream.Filter((value) -> truthy)` | `AsyncStream` | Lazily retain matching values. |
| `stream.Take(count)` | `AsyncStream` | Stop after `count` values. |
| `stream.Drop(count)` | `AsyncStream` | Skip the first `count` values. |
| `stream.Chunk(size)` | `AsyncStream` | Group non-overlapping arrays of up to `size`. |
| `stream.ChunkBy(predicate)` | `AsyncStream` | End each chunk after a true predicate; flush the final partial chunk. |
| `stream.Merge(other)` | `AsyncStream` | Interleave two linear sources by observed readiness, preserving each source's order. |
| `stream.Timeout(ms)` | `AsyncStream` | Fail if the next upstream demand takes too long. |
| `stream.Debounce(ms)` | `AsyncStream` | Emit the latest value after a quiet interval; flush on completion. |
| `stream.Throttle(ms)` | `AsyncStream` | Emit leading values at least ms apart; drop intervening values. |
| `stream.Latest()` | `AsyncStream` | Keep one most recent pending value while the consumer is busy. |
| `stream.Window(size, step? = 1)` | `AsyncStream` | Produce sliding arrays. |
| `stream.ForEach(callable)` | `null` | Consume for side effects; safe callbacks may overlap inside a structured scope. |
| `stream.Reduce(initial, callable)` | `any` | Consume into an accumulator. |
| `stream.Collect(bound?)` | `Array` | Consume all values, or at most `bound`. |
| `stream.First()` | `any \| null` | Consume the first value and close. |
| `stream.Find(predicate)` | `any \| null` | Consume through the first match and close. |
| `stream.Count(bound?)` | `Integer` | Count all values, or at most `bound`. |

```{.rix exec=true async=true id=async-stream-derived-terminals}
mapped := .Stream([1, 2, 3]).Map((x) -> x * 2).Collect(); mapped.Join() ##@ == "2,4,6";
filtered := .Stream([1, 2, 3, 4]).Filter((x) -> x > 2).Collect(); filtered.Join() ##@ == "3,4";
taken := .Stream([1, 2, 3, 4]).Take(2).Collect(); taken.Join() ##@ == "1,2";
dropped := .Stream([1, 2, 3, 4]).Drop(2).Collect(); dropped.Join() ##@ == "3,4";
chunks := .Stream([1, 2, 3, 4, 5]).Chunk(2).Collect(); chunks.Get(2).Join() ##@ == "3,4";
windows := .Stream([1, 2, 3, 4]).Window(3, 1).Collect(); windows.Get(2).Join() ##@ == "2,3,4";
visited := .Stream([1, 2, 3]).ForEach((x) -> x); visited ##@ == _;
reduced := .Stream([1, 2, 3, 4]).Reduce(0, (acc, x) -> acc + x); reduced ##@ == 10;
bounded := .Stream([1, 2, 3]).Collect(2); bounded.Join() ##@ == "1,2";
first := .Stream([3, 4, 5]).First(); first ##@ == 3;
found := .Stream([3, 4, 5]).Find((x) -> x > 3); found ##@ == 4;
counted := .Stream([3, 4, 5]).Count(); counted ##@ == 3;
```

## Lifecycle methods

| Full syntax | Result | Meaning |
|---|---|---|
| `stream.Close(reason?)` | `null` | Close idempotently without further pulling. |
| `stream.Done()` | `1 \| null` | Test whether the root stream is closed, done, or failed. |
| `stream.Status()` | `Map` | Return `label`, `status`, `pulled`, `finite`, and source-specific lifecycle fields. |
| `stream.CheckTraits()` | `1 \| null` | Validate attached semantic traits. |

```{.rix exec=true async=true id=async-stream-lifecycle}
s := .Stream([1, 2, 3]);
s.Done() ##@ == _;
s.Status().Get("status") ##@ == "open";
s.CheckTraits() ##@ == 1;
s.Close();
s.Done() ##@ == 1;
s.Status().Get("status") ##@ == "closed";
```

```{.rix exec=true async=true id=async-stream-segments}
chunks := .Stream([1,2,3,4,5]).ChunkBy((x) -> x % 2 == 0).Collect();
chunks[1].Join() ##@ == "1,2";
chunks[3].Join() ##@ == "5";
result := {$:2$ .Stream([1,2,3,4]).Chunk(2).Map((xs) -> xs[1]).Collect() };
result.Join() ##@ == "1,3";
merged := .Stream([1,2]).Merge(.Stream([10,20])).Collect();
merged.Filter((x) -> x < 10).Join() ##@ == "1,2";
merged.Filter((x) -> x >= 10).Join() ##@ == "10,20";
```

`.TimerStream(ms, count?)` produces exact integer ticks on demand. A count makes
it finite. `.ReactiveStream(source)` and `.UIStream(hostKey, eventName)` attach
bounded subscriptions only at first demand. UI targets must be provided by the
host. `.HttpStream(url)`, `.FileStream(path)` and `.WebSocketStream(url)` require
explicit host services, resource authorization and the existing NET/FILES
permissions; they add no default network or filesystem access.

Time operators use monotonic milliseconds when they observe a value, so cold
backpressure affects timing. Debounce, Throttle and Latest intentionally discard
values; `.Status()` discloses drop counts and pipeline state. Chunk/window buffers,
prefetch, hot queues and collected output all have host-enforced bounds.
[The operator design record](../../design/eval/async-stream-operators.md) specifies
clock ties, overflow, cancellation, transport byte limits and executable checks.

Only one terminal may claim a stream. Create another cold stream when the same source needs a second traversal. Within `{$:L$ ... }`, safe elementwise stages use structured concurrency while preserving source-order publication, including new regions after stateful barriers.

[Back to the methods overview](../methods-guide.md)
