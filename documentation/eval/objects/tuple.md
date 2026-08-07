# Tuple methods

A tuple is a fixed-arity ordered value. Tuple methods are non-mutating; `Set` returns a new tuple.

## Method reference

| Full syntax | Result | Meaning |
|---|---|---|
| `tuple.Len()` | `Integer` | Return tuple arity. |
| `tuple.Get(index)` | `any \| null` | Read a one-based slot; negative indexes count from the end. |
| `tuple.First()` | `any \| null` | Read the first slot. |
| `tuple.Last()` | `any \| null` | Read the last slot. |
| `tuple.Slice(start?, end?)` | `Tuple` | Copy from inclusive `start` to exclusive `end`. |
| `tuple.Set(index, value)` | `Tuple` | Return a tuple with one slot replaced. |
| `tuple.ToArray()` | `Array` | Copy values into a mutable array. |
| `tuple.Reduce((acc, value, index, tuple) -> next, initial?)` | `any` | Fold slots; default accumulator is a hole-filled mutable tuple of the same arity. |
| `tuple.Iterator()` | `Iterator` | Create a stateful cursor. |
| `tuple.CheckTraits()` | `1 \| null` | Validate attached semantic traits. |

## Checked examples

```{.rix exec=true id=tuple-methods}
t := {: 4, 5, 6 };
t.Len() ##@ == 3;
t.Get(2) ##@ == 5;
t.First() ##@ == 4;
t.Last() ##@ == 6;
t.Slice(2).ToArray().Join() ##@ == "5,6";
t.Set(2, 9).Get(2) ##@ == 9;
t.ToArray().Join() ##@ == "4,5,6";
t.Reduce((acc, value, index) -> acc.Set(index, value * 2)).Get(3) ##@ == 12;
it := t.Iterator(); it.Next(2) ##@ == 5;
t.CheckTraits() ##@ == 1;
```

[Back to the methods overview](../methods-guide.md)
