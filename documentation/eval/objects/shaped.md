# Shaped methods

Shaped values are rectangular rank-N component storage. They carry no matrix or
mathematical-tensor meaning. Selectors and axis numbers are one-based.

## Method reference

| Full syntax | Result | Meaning |
|---|---|---|
| `shaped.Shape()` | `Tuple` | Return dimension sizes. |
| `shaped.Rank()` | `Integer` | Return the number of axes. |
| `shaped.Size()` | `Integer` | Return total cell count. |
| `shaped.ScalarDomain()` | `String` | Return the declared scalar domain. |
| `shaped.WithScalarDomain(domain)` | `Shaped` | Return a validated copy with the declared domain. |
| `shaped.SetScalarDomain!(domain)` | `Shaped` | Validate and change the receiver's declared domain. |
| `shaped.Get(selectors...)` | `any \| ShapedView` | Read a cell or selection. A selector tuple is also accepted. |
| `shaped.Set(selectors..., value)` | `Shaped` | Return a copy with selected cells assigned. |
| `shaped.Set!(selectors..., value)` | `Shaped` | Mutate selected cells. |
| `shaped.Reshape(shapeTuple)` | `Shaped` | Change shape without changing total size. |
| `shaped.Flatten()` | `Shaped` | Return rank-1 storage in row-major order. |
| `shaped.Transpose()` | `ShapedView` | Swap the axes of rank-2 storage. |
| `shaped.Permute(orderTuple)` | `ShapedView` | Reorder rank-N axes. |
| `shaped.Map((value, indexTuple, shaped) -> result)` | `Shaped` | Transform every cell. |
| `shaped.Fill!(value)` | `Shaped` | Mutate every cell. |
| `shaped.Sum()` | number-like | Sum non-hole cells. |
| `shaped.Mean()` | number-like `\| null` | Return arithmetic mean, or `null` when empty. |
| `shaped.Reduce((acc, value, indexTuple, shaped) -> next, initial?)` | `any` | Fold cells; the default accumulator is hole-filled Shaped storage of the same shape. |
| `shaped.Iterator()` | `Iterator` | Traverse cells in row-major order. |
| `shaped.CheckTraits()` | `1 \| null` | Validate attached semantic traits. |

## Shape, selection, and views

```{.rix exec=true id=shaped-shape-view-methods}
t := {:2x2: 1, 2; 3, 4 };
t.Shape().Get(1) ##@ == 2;
t.Rank() ##@ == 2;
t.Size() ##@ == 4;
t.Get(2, 1) ##@ == 3;
t.Get({: 1, 2 }) ##@ == 2;
t.Set(1, 2, 9).Get(1, 2) ##@ == 9;
t.Reshape({: 4 }).Shape().Get(1) ##@ == 4;
t.Flatten().Get(3) ##@ == 3;
t.Transpose().Get(1, 2) ##@ == 3;
t.Permute({: 2, 1 }).Get(2, 1) ##@ == 2;
```

## Mutation, arithmetic, callbacks, and traversal

```{.rix exec=true id=shaped-math-callback-methods}
t := {:2x2: 1, 2; 3, 4 }; t.Set!(1, 2, 9); t.Get(1, 2) ##@ == 9;
t := {:2x2: 1, 2; 3, 4 }; t.Fill!(5); t.Sum() ##@ == 20;
{:2x2: 1, 2; 3, 4 }.Sum() ##@ == 10;
{:2x2: 1, 2; 3, 4 }.Mean() ##@ == 5/2;
{:2x2: 1, 2; 3, 4 }.Map((value, index) -> value * index.Get(1)).Get(2, 2) ##@ == 8;
reduced := {:2x2: 1, 2; 3, 4 }.Reduce((acc, value, index) -> acc.Set!(index, value * 10));
reduced.Get(2, 1) ##@ == 30;
it := {:2x2: 1, 2; 3, 4 }.Iterator(); it.Next(3) ##@ == 3;
{:1: 1 }.CheckTraits() ##@ == 1;
```

`Transpose` is currently rank-2 only. `Permute` accepts one occurrence of every axis number.

[Back to the methods overview](../methods-guide.md)
