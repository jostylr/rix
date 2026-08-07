# LazySequence methods

A lazy sequence generates and caches values on demand. It is not itself a cursor: call `Iterator()` for an independent traversal position.

## Method reference

| Full syntax | Result | Meaning |
|---|---|---|
| `sequence.Len()` | `Integer` | Return a known eventual length without forcing all values; error if still unknown. |
| `sequence.IsEmpty()` | `1 \| null` | Generate at most the first output to determine emptiness. |
| `sequence.Get(index)` | `any \| null` | Generate through a positive one-based index; a negative index materializes a finite source. |
| `sequence.First()` | `any \| null` | Generate and return the first value. |
| `sequence.Last()` | `any \| null` | Materialize a known finite source and return its last value. |
| `sequence.Materialize()` | `Array` | Evaluate a known finite sequence completely. |
| `sequence.Iterator()` | `Iterator` | Create a cursor sharing the source cache. |
| `sequence.CheckTraits()` | `1 \| null` | Validate attached semantic traits. |

## Checked examples

```{.rix exec=true id=lazy-sequence-methods}
s := [3 |+ 3 |^ 5];
s.Len() ##@ == 5;
s.IsEmpty() ##@ == _;
s.Get(3) ##@ == 9;
s.First() ##@ == 3;
s.Last() ##@ == 15;
s.Materialize().Join() ##@ == "3,6,9,12,15";
unbounded := [1 |+ 1];
unbounded.Get(100) ##@ == 100;
it := unbounded.Iterator(); it.Next(3) ##@ == 3;
s.CheckTraits() ##@ == 1;
```

`Last`, negative indexing, and `Materialize` require a known finite sequence. A predicate-bounded source becomes known only after generation reaches its terminating value.

[Back to the methods overview](../methods-guide.md)
