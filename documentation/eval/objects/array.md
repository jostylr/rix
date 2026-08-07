# Array methods

RiX arrays are mutable, one-based sequences. A method without `!` returns a new array; the `!` spelling mutates and returns the receiver unless the method is an extractor such as `Pop!`.

## Query methods

| Full syntax | Result | Meaning |
|---|---|---|
| `array.Len()` | `Integer` | Count slots, including holes. |
| `array.IsEmpty()` | `1 \| null` | Test whether there are no slots. |
| `array.Get(index)` | `any \| null` | Read a one-based index; negative indices count from the end. |
| `array.First()` | `any \| null` | Read the first value. |
| `array.Last()` | `any \| null` | Read the last value. |
| `array.Includes(value)` | `1 \| null` | Test value membership. |
| `array.IndexOf(value)` | `Integer \| null` | Return the first one-based matching index. |
| `array.LastIndexOf(value)` | `Integer \| null` | Return the last one-based matching index. |
| `array.HasAt(index)` | `1 \| null` | Test whether an in-range slot contains a non-hole value. |
| `array.Slice(start?, end?)` | `Array` | Copy from inclusive `start` to exclusive `end`. |
| `array.Join(separator? = ",")` | `String` | Format and join the elements. |
| `array.DropFirst(count? = 1)` | `Array` | Copy without the first `count` values. |
| `array.DropLast(count? = 1)` | `Array` | Copy without the last `count` values. |

```{.rix exec=true id=array-query-methods}
a := [10, 20, 20, 30];
a.Len() ##@ == 4;
[].IsEmpty() ##@ == 1;
a.Get(2) ##@ == 20;
a.Get(-1) ##@ == 30;
a.First() ##@ == 10;
a.Last() ##@ == 30;
a.Includes(20) ##@ == 1;
a.IndexOf(20) ##@ == 2;
a.LastIndexOf(20) ##@ == 3;
[1,,3].HasAt(2) ##@ == _;
a.Slice(2, 4).Join("-") ##@ == "20-20";
a.Join(":") ##@ == "10:20:20:30";
a.DropFirst(2).Join() ##@ == "20,30";
a.DropLast(2).Join() ##@ == "10,20";
```

`Slice` uses an exclusive end. Bracket slicing, such as `a[2:4]`, is a separate inclusive selector syntax.

## Copying and mutating methods

| Non-mutating syntax | Mutating syntax | Meaning |
|---|---|---|
| `array.Push(values...)` | `array.Push!(values...)` | Append values. |
| `array.Unshift(values...)` | `array.Unshift!(values...)` | Prepend values. |
| `array.Set(index, value)` | `array.Set!(index, value)` | Replace a clamped one-based slot. |
| `array.Insert(index, value)` | `array.Insert!(index, value)` | Insert before an index. |
| `array.RemoveAt(index)` | `array.RemoveAt!(index)` | The copy form shortens; the mutation form leaves a hole. |
| `array.Concat(items...)` | `array.Concat!(items...)` | Append collections or plain values. |
| `array.Reverse()` | `array.Reverse!()` | Reverse order. |
| `array.Sort()` | `array.Sort!()` | Sort with RiX's built-in value ordering. |
| `array.Distinct()` | `array.Distinct!()` | Keep first occurrences. |
| `array.Flatten(depth? = 1)` | `array.Flatten!(depth? = 1)` | Flatten arrays, tuples, or sets by `depth`. |
| `array.Swap(i, j)` | `array.Swap!(i, j)` | Exchange two existing slots. |
| `array.Move(indexOrInterval, targetIndex)` | `array.Move!(indexOrInterval, targetIndex)` | Remove one value or an inclusive interval and reinsert it. |

```{.rix exec=true id=array-copy-methods}
[1, 2].Push(3, 4).Join() ##@ == "1,2,3,4";
[2, 3].Unshift(1).Join() ##@ == "1,2,3";
[1, 2].Set(2, 9).Join() ##@ == "1,9";
[1, 3].Insert(2, 2).Join() ##@ == "1,2,3";
[1, 2, 3].RemoveAt(2).Join() ##@ == "1,3";
[1, 2].Concat([3, 4], 5).Join() ##@ == "1,2,3,4,5";
[1, 2, 3].Reverse().Join() ##@ == "3,2,1";
[3, 1, 2].Sort().Join() ##@ == "1,2,3";
[1, 2, 2, 3].Distinct().Join() ##@ == "1,2,3";
[1, [2, [3]]].Flatten(2).Join() ##@ == "1,2,3";
[10, 20, 30].Swap(1, 3).Join() ##@ == "30,20,10";
[1, 2, 3, 4].Move(1, -1).Join() ##@ == "2,3,4,1";
```

```{.rix exec=true id=array-mutation-methods}
a := [2]; a.Push!(3); a.Join() ##@ == "2,3";
a := [2]; a.Unshift!(1); a.Join() ##@ == "1,2";
a := [1, 2]; a.Set!(2, 9); a.Join() ##@ == "1,9";
a := [1, 3]; a.Insert!(2, 2); a.Join() ##@ == "1,2,3";
a := [1, 2, 3]; a.RemoveAt!(2); a.HasAt(2) ##@ == _;
a := [1]; a.Concat!([2, 3]); a.Join() ##@ == "1,2,3";
a := [1, 2, 3]; a.Reverse!(); a.Join() ##@ == "3,2,1";
a := [3, 1, 2]; a.Sort!(); a.Join() ##@ == "1,2,3";
a := [1, 2, 2]; a.Distinct!(); a.Join() ##@ == "1,2";
a := [1, [2, 3]]; a.Flatten!(); a.Join() ##@ == "1,2,3";
a := [1, 2, 3]; a.Swap!(1, 3); a.Join() ##@ == "3,2,1";
a := [1, 2, 3, 4]; a.Move!(2:3, 1); a.Join() ##@ == "2,3,1,4";
```

Positive `targetIndex` in `Move` inserts before that position after removal. A negative target inserts after the position counted from the new end.

## Extractors and callbacks

| Full syntax | Result | Meaning |
|---|---|---|
| `array.Pop!()` | `any \| Hole` | Remove and return the last value. |
| `array.Shift!()` | `any \| Hole` | Remove and return the first value. |
| `array.Map((value, index, array) -> result)` | `Array` | Transform every value. |
| `array.Filter((value, index, array) -> truthy)` | `Array` | Keep matching values. |
| `array.Any((value, index, array) -> truthy)` | `1 \| null` | Test whether any value matches. |
| `array.All((value, index, array) -> truthy)` | `1 \| null` | Test whether all values match. |
| `array.Count(predicate?)` | `Integer` | Count all or matching values. |
| `array.Find(predicate)` | `any \| null` | Return the first matching value. |
| `array.FindIndex(predicate)` | `Integer \| null` | Return the first matching index. |
| `array.Reduce((acc, value, index, array) -> next, initial?)` | `any` | Fold values; the default accumulator is `[]`. |
| `array.Iterator()` | `Iterator` | Create an independent stateful cursor. |
| `array.CheckTraits()` | `1 \| null` | Validate attached semantic traits. |

```{.rix exec=true id=array-callback-methods}
a := [1, 2, 3]; a.Pop!() ##@ == 3; a.Join() ##@ == "1,2";
a := [1, 2, 3]; a.Shift!() ##@ == 1; a.Join() ##@ == "2,3";
[10, 20].Map((value, index) -> value + index).Join() ##@ == "11,22";
[1, 2, 3, 4].Filter((value) -> value > 2).Join() ##@ == "3,4";
[1, 2, 3].Any((value) -> value == 2) ##@ == 1;
[1, 2, 3].All((value) -> value > 0) ##@ == 1;
[1, 2, 3, 4].Count((value) -> value > 2) ##@ == 2;
[1, 2, 3].Find((value) -> value > 1) ##@ == 2;
[1, 2, 3].FindIndex((value) -> value > 1) ##@ == 2;
[1, 2, 3].Reduce((acc, value) -> acc.Push!(value * 10)).Join() ##@ == "10,20,30";
it := [7, 8].Iterator(); it.Next() ##@ == 7;
[1].CheckTraits() ##@ == 1;
```

[Back to the methods overview](../methods-guide.md)
