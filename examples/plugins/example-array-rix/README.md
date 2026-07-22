# `example-array-rix`

`example-array-rix` is a minimal teaching plugin written in RiX itself. It has the same
feature set as `example-array-js`, but uses separate, prefixed command names so
both examples can be loaded together.

## Purpose

It demonstrates a pure RiX plugin source file: discovery reads its header, and
`.Plugin.Load` evaluates it only when needed. The source registers three
ordinary host commands with `.Host.Register`.

## Install and load

Make the package directory available to the host’s plugin catalog, then run:

```rix
.Plugin.Load("example-array-rix")
values := [2, 3, 5]
.arrayRixSum(values)       ## 10
.arrayRixDescribe(values)  ## "count 3; sum 10"
.arrayRixReverse(values)   ## [5, 3, 2]
```

## Commands

| Command | Result |
| --- | --- |
| `.arrayRixSum(values)` | Sum of Integer values using `Reduce`. |
| `.arrayRixDescribe(values)` | Interpolated text containing count and sum. |
| `.arrayRixReverse(values)` | New reversed sequence. |

## Dependencies

There are no JavaScript imports or special permissions. It relies only on the
standard array methods `Reduce`, `Len`, and `Reverse`, plus RiX text templates.

See [tutorial.md](tutorial.md) and compare the host-approved JavaScript package
in `../example-array-js/`.
