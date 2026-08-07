# Map methods

A RiX map preserves insertion order and uses string-like keys. Copying methods return a new map; `!` methods mutate the receiver.

## Query and copy/mutation methods

| Full syntax | Result | Meaning |
|---|---|---|
| `map.Len()` | `Integer` | Count entries. |
| `map.IsEmpty()` | `1 \| null` | Test for zero entries. |
| `map.Has(key)` | `1 \| null` | Test key membership. |
| `map.Get(key)` | `any \| null` | Read a value. |
| `map.Keys()` | `Set` | Return keys in insertion order. |
| `map.Values()` | `Set` | Return distinct values. |
| `map.Entries()` | `Array` | Return `{: key, value }` tuples. |
| `map.Set(key, value)` / `map.Set!(key, value)` | `Map` | Add or replace an entry. |
| `map.Remove(key)` / `map.Remove!(key)` | `Map` | Remove an entry. |
| `map.Merge(other)` / `map.Merge!(other)` | `Map` | Merge another map; later values win. |
| `map.Update(key, updater)` / `map.Update!(key, updater)` | `Map` | Call `updater(value, key, map)` and store its result. Missing values are `null`. |
| `map.Default(key, value)` / `map.Default!(key, value)` | `Map` | Insert only when the key is absent. |
| `map.Keep(keys)` / `map.Keep!(keys)` | `Map` | Retain only selected keys. |
| `map.Omit(keys)` / `map.Omit!(keys)` | `Map` | Remove selected keys. |

```{.rix exec=true id=map-query-copy-methods}
m := {= a=1, b=2 };
m.Len() ##@ == 2;
{= }.IsEmpty() ##@ == 1;
m.Has("a") ##@ == 1;
m.Get("b") ##@ == 2;
m.Keys().Values().Join() ##@ == "a,b";
m.Values().Has(2) ##@ == 1;
m.Entries().Get(1).Get(1) ##@ == "a";
m.Set("c", 3).Get("c") ##@ == 3;
m.Remove("a").Has("a") ##@ == _;
m.Merge({= a=9 }).Get("a") ##@ == 9;
m.Update("a", (value) -> value + 1).Get("a") ##@ == 2;
m.Default("c", 3).Get("c") ##@ == 3;
m.Keep(["a"]).Len() ##@ == 1;
m.Omit(["a"]).Has("b") ##@ == 1;
```

```{.rix exec=true id=map-mutation-methods}
m := {= }; m.Set!("a", 1); m.Get("a") ##@ == 1;
m := {= a=1 }; m.Remove!("a"); m.IsEmpty() ##@ == 1;
m := {= a=1 }; m.Merge!({= b=2 }); m.Get("b") ##@ == 2;
m := {= a=1 }; m.Update!("a", (value) -> value + 1); m.Get("a") ##@ == 2;
m := {= a=1 }; m.Default!("b", 2); m.Get("b") ##@ == 2;
m := {= a=1, b=2 }; m.Keep!(["b"]); m.Has("a") ##@ == _;
m := {= a=1, b=2 }; m.Omit!(["b"]); m.Has("a") ##@ == 1;
```

## Callback and traversal methods

| Full syntax | Result | Meaning |
|---|---|---|
| `map.MapValues((value, key, map) -> result)` | `Map` | Transform values while retaining keys. |
| `map.ReduceKeys((acc, key, value, map) -> next, initial?)` | `any` | Fold in key-first callback order. |
| `map.Filter((value, key, map) -> truthy)` | `Map` | Keep matching entries. |
| `map.Any((value, key, map) -> truthy)` | `1 \| null` | Test whether any entry matches. |
| `map.All((value, key, map) -> truthy)` | `1 \| null` | Test whether all entries match. |
| `map.Count(predicate?)` | `Integer` | Count all or matching entries. |
| `map.Reduce((acc, value, key, map) -> next, initial?)` | `any` | Fold in value-first callback order; default accumulator is `{= }`. |
| `map.Iterator()` | `Iterator` | Traverse values in insertion order. |
| `map.CheckTraits()` | `1 \| null` | Validate attached semantic traits. |

```{.rix exec=true id=map-callback-methods}
m := {= a=1, b=2 };
m.MapValues((value) -> value * 10).Get("b") ##@ == 20;
m.ReduceKeys((acc, key, value) -> acc.Push!(key), []).Join() ##@ == "a,b";
m.Filter((value) -> value > 1).Len() ##@ == 1;
m.Any((value) -> value == 2) ##@ == 1;
m.All((value) -> value > 0) ##@ == 1;
m.Count((value) -> value > 1) ##@ == 1;
m.Reduce((acc, value, key) -> acc.Set!(key, value + 1)).Get("a") ##@ == 2;
it := m.Iterator(); it.Next() ##@ == 1;
m.CheckTraits() ##@ == 1;
```

[Back to the methods overview](../methods-guide.md)
