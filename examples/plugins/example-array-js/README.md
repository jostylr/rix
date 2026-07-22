# `example-array-js`

`example-array-js` is the smallest useful host/JavaScript teaching plugin. It
shows the complete host-approved path without introducing a special value type.

## Purpose

The plugin accepts arrays of Integers and provides a sum, a small text summary,
and a reversed copy. Its commands are deliberately ordinary so the package is
easy to copy as a starting point.

## Install and load

A Node host discovers the package directory, imports the entry file, and
explicitly registers its `install` export as the installer for
`example-array-js`. A user then activates it with:

```rix
.Plugin.Load("example-array-js")
```

In a project host that scans `rix/examples/plugins/example-array-js`, the command surface
is:

```rix
values := [2, 3, 5]
.arrayJs.Sum(values)       ## 10
.arrayJs.Describe(values)  ## "count 3; sum 10"
.arrayJs.Reverse(values)   ## [5, 3, 2]
.arrayJs(values)           ## 10; callable shorthand for Sum
```

## Commands

| Command | Result |
| --- | --- |
| `.arrayJs(values)` | Sum of Integer values. |
| `.arrayJs.Sum(values)` | Same explicit sum operation. |
| `.arrayJs.Describe(values)` | Text containing the count and exact Integer sum. |
| `.arrayJs.Reverse(values)` | New sequence in reverse order. |

## Dependencies

It only depends on the RiX host plugin API and `@ratmath/core`’s `Integer`.
No filesystem, network, or browser capability is requested.

See [tutorial.md](tutorial.md) for the walkthrough and compare the equivalent
RiX implementation in `../example-array-rix/`.
