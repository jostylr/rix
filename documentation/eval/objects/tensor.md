# Tensor methods

Tensors are rectangular rank-N exact collections. Selectors and axis numbers are one-based.

## Method reference

| Full syntax | Result | Meaning |
|---|---|---|
| `tensor.Shape()` | `Tuple` | Return dimension sizes. |
| `tensor.Rank()` | `Integer` | Return the number of axes. |
| `tensor.Size()` | `Integer` | Return total cell count. |
| `tensor.Get(selectors...)` | `any \| TensorView` | Read a cell or selection. A selector tuple is also accepted. |
| `tensor.Set(selectors..., value)` | `Tensor` | Return a copy with selected cells assigned. |
| `tensor.Set!(selectors..., value)` | `Tensor` | Mutate selected cells. |
| `tensor.Reshape(shapeTuple)` | `Tensor` | Change shape without changing total size. |
| `tensor.Flatten()` | `Tensor` | Return a rank-1 tensor in row-major order. |
| `tensor.Transpose()` | `TensorView` | Swap the axes of a rank-2 tensor. |
| `tensor.Permute(orderTuple)` | `TensorView` | Reorder rank-N axes. |
| `tensor.Map((value, indexTuple, tensor) -> result)` | `Tensor` | Transform every cell. |
| `tensor.Fill!(value)` | `Tensor` | Mutate every cell. |
| `tensor.Sum()` | number-like | Sum non-hole cells. |
| `tensor.Mean()` | number-like `\| null` | Return arithmetic mean, or `null` for an empty tensor. |
| `tensor.Dot(other)` | number-like | Dot two equal-length rank-1 tensors. |
| `tensor.MatMul(other)` | `Tensor` | Multiply compatible rank-2 tensors. |
| `tensor.Reduce((acc, value, indexTuple, tensor) -> next, initial?)` | `any` | Fold cells; default accumulator is a hole-filled mutable tensor of the same shape. |
| `tensor.Iterator()` | `Iterator` | Traverse cells in row-major order. |
| `tensor.CheckTraits()` | `1 \| null` | Validate attached semantic traits. |

## Shape, selection, and views

```{.rix exec=true id=tensor-shape-view-methods}
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

```{.rix exec=true id=tensor-math-callback-methods}
t := {:2x2: 1, 2; 3, 4 }; t.Set!(1, 2, 9); t.Get(1, 2) ##@ == 9;
t := {:2x2: 1, 2; 3, 4 }; t.Fill!(5); t.Sum() ##@ == 20;
{:2x2: 1, 2; 3, 4 }.Sum() ##@ == 10;
{:2x2: 1, 2; 3, 4 }.Mean() ##@ == 5/2;
{:3: 1, 2, 3 }.Dot({:3: 4, 5, 6 }) ##@ == 32;
product := {:2x3: 1, 2, 3; 4, 5, 6 }.MatMul({:3x2: 7, 8; 9, 10; 11, 12 });
product.Get(2, 2) ##@ == 154;
{:2x2: 1, 2; 3, 4 }.Map((value, index) -> value * index.Get(1)).Get(2, 2) ##@ == 8;
reduced := {:2x2: 1, 2; 3, 4 }.Reduce((acc, value, index) -> acc.Set!(index, value * 10));
reduced.Get(2, 1) ##@ == 30;
it := {:2x2: 1, 2; 3, 4 }.Iterator(); it.Next(3) ##@ == 3;
{:1: 1 }.CheckTraits() ##@ == 1;
```

`Transpose` is currently rank-2 only. `Permute` accepts one occurrence of every axis number.

[Back to the methods overview](../methods-guide.md)
