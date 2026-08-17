---
title: Plotting a polynomial
description: Build a portable graphics scene with the plot plugin.
theme: Graphics and geometry
status: implemented
---

Load the optional plugin and plot a cubic:

```rix
.Plugin.Load("plot");
graph := .plot.Polynomial([1, 0, -4, 1], [-3, 3], {= size = [560, 760] });
```

`graph` is still core `.Graphics`, so it can be placed in a document without
locking the document to a browser chart library:

```rix
.Figure(graph, "A cubic polynomial", "fig:cubic");
```

The package chooses sensible sampling and axes for this early convenience API.
For geometry diagrams or exact retained shapes, use `.Graphics` directly or
load `.draw` alongside it.

## Plot functions and exact data

Function results pass through the shared Numerics contract, so an algorithm
real such as `Sin(x)` can be refined without converting the whole plot to a
browser float:

```rix
.Plugin.Load("plot");
sine := .plot.Function(
  x -> .numerics.Sin(x),
  [-3,3],
  {= samples=41,tolerance=1/10000,title="Sine",xLabel="x",yLabel="sin(x)",label="certified samples" }
);
sine;
```

The data commands share the same fitted/fixed view, scales, labels, ticks, and
style options:

```rix
.Plugin.Load("plot");
observations := [[1,2],[2,5/2],[3,7/4],[4,3]];
.Fragment([
  .Figure(.plot.Scatter(observations,{= label="observations" }),"Exact rational samples"),
  .Figure(.plot.Step(observations,{= stroke="#b45309" }),"A step presentation")
]);
```
