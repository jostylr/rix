# Set methods

A RiX set stores distinct values in insertion order. The non-`!` methods return a new set; their `!` partners mutate the receiver.

## Method reference

| Full syntax | Result | Meaning |
|---|---|---|
| `set.Len()` | `Integer` | Count distinct values. |
| `set.IsEmpty()` | `1 \| null` | Test for zero values. |
| `set.Has(value)` | `1 \| null` | Test membership. |
| `set.Values()` | `Array` | Return values in insertion order. |
| `set.Add(value)` / `set.Add!(value)` | `Set` | Insert a value if absent. |
| `set.Remove(value)` / `set.Remove!(value)` | `Set` | Remove a value. |
| `set.Union(other)` / `set.Union!(other)` | `Set` | Combine values from both sets. |
| `set.Intersect(other)` / `set.Intersect!(other)` | `Set` | Keep values in both sets. |
| `set.Diff(other)` / `set.Diff!(other)` | `Set` | Remove values found in `other`. |
| `set.SymDiff(other)` / `set.SymDiff!(other)` | `Set` | Keep values found in exactly one set. |
| `set.SubsetOf(other)` | `1 \| null` | Test the subset relation. |
| `set.SupersetOf(other)` | `1 \| null` | Test the superset relation. |
| `set.Disjoint(other)` | `1 \| null` | Test whether no value is shared. |
| `set.Filter((value, valueAgain, set) -> truthy)` | `Set` | Keep matching values. |
| `set.Any((value, valueAgain, set) -> truthy)` | `1 \| null` | Test whether any value matches. |
| `set.All((value, valueAgain, set) -> truthy)` | `1 \| null` | Test whether all values match. |
| `set.Count(predicate?)` | `Integer` | Count all or matching values. |
| `set.Reduce((acc, value, valueAgain, set) -> next, initial?)` | `any` | Fold values; default accumulator is `{| |}`. |
| `set.Iterator()` | `Iterator` | Create a stateful cursor. |
| `set.CheckTraits()` | `1 \| null` | Validate attached semantic traits. |

The second callback argument repeats the value. This keeps the callback shape compatible with collections that provide a key or index.

## Copying and relationship examples

```{.rix exec=true id=set-copy-query-methods}
s := {| 1, 2 |};
s.Len() ##@ == 2;
{| |}.IsEmpty() ##@ == 1;
s.Has(2) ##@ == 1;
s.Values().Join() ##@ == "1,2";
s.Add(3).Has(3) ##@ == 1;
s.Remove(2).Has(2) ##@ == _;
s.Union({| 2, 3 |}).Len() ##@ == 3;
s.Intersect({| 2, 3 |}).Values().Join() ##@ == "2";
s.Diff({| 2 |}).Values().Join() ##@ == "1";
s.SymDiff({| 2, 4 |}).Values().Join() ##@ == "1,4";
s.SubsetOf({| 1, 2, 3 |}) ##@ == 1;
s.SupersetOf({| 1 |}) ##@ == 1;
s.Disjoint({| 3, 4 |}) ##@ == 1;
```

## Mutation and callback examples

```{.rix exec=true id=set-mutation-callback-methods}
s := {| 1 |}; s.Add!(2); s.Has(2) ##@ == 1;
s := {| 1, 2 |}; s.Remove!(1); s.Has(1) ##@ == _;
s := {| 1 |}; s.Union!({| 2 |}); s.Len() ##@ == 2;
s := {| 1, 2 |}; s.Intersect!({| 2, 3 |}); s.Has(2) ##@ == 1;
s := {| 1, 2 |}; s.Diff!({| 2 |}); s.Has(2) ##@ == _;
s := {| 1, 2 |}; s.SymDiff!({| 2, 3 |}); s.Has(3) ##@ == 1;
s := {| 1, 2, 3 |}; s.Filter((value) -> value > 1).Len() ##@ == 2;
s.Any((value) -> value == 2) ##@ == 1;
s.All((value) -> value > 0) ##@ == 1;
s.Count((value) -> value > 1) ##@ == 2;
s.Reduce((acc, value) -> acc.Add!(value * 10)).Has(20) ##@ == 1;
it := s.Iterator(); it.Next() ##@ == 1;
s.CheckTraits() ##@ == 1;
```

[Back to the methods overview](../methods-guide.md)
