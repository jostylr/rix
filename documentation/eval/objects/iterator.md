# Iterator methods

An `Iterator` is a stateful traversal handle. Its source collection is not mutated when the cursor moves.

## Method reference

| Full syntax | Result | Meaning |
|---|---|---|
| `iterator.Next(step? = 1)` | `any \| null` | Move first, then return the destination value. Steps may be positive, zero, or negative. |
| `iterator.Peek(offset? = 0)` | `any \| null` | Read relative to the cursor without moving. |
| `iterator.Done()` | `1 \| null` | Test whether an advancing read crossed an end. |
| `iterator.Index()` | `Integer \| null` | Return `0` before traversal, the current index, or `null` when done. |
| `iterator.Reset(index?)` | `Iterator` | Reset to `0`, or position an indexable source directly at `index`. |
| `iterator.CheckTraits()` | `1 \| null` | Validate attached semantic traits. |

## Checked examples

```{.rix exec=true id=iterator-methods}
it := [10, 20, 30].Iterator();
it.Index() ##@ == 0;
it.Next() ##@ == 10;
it.Peek(1) ##@ == 20;
it.Index() ##@ == 1;
it.Next(2) ##@ == 30;
it.Done() ##@ == _;
it.Next() ##@ == _;
it.Done() ##@ == 1;
it.Index() ##@ == _;
it.Reset(2); it.Peek() ##@ == 20;
it.Reset(); it.Next() ##@ == 10;
it.CheckTraits() ##@ == 1;
```

The initial cursor is `0`, before the first one-based item. `Next(0)` at that initial position returns `null`; after traversal begins it rereads the current item.

[Back to the methods overview](../methods-guide.md)
