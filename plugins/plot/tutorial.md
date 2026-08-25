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

## Polar and field plots

Polar curves use radians and retain their angle/radius source samples:

```rix
.Plugin.Load("plot");
.plot.Polar(t -> 2, [0,6], {= samples=81,title="A sampled polar circle" });
```

Scalar and vector fields share exact domains and a bounded cell grid:

```rix
.Plugin.Load("plot");
.Fragment([
  .Figure(
    .plot.Implicit((x,y) -> x^2+y^2-1, [-2,2], [-2,2], {=
      grid=[8,6], refineDepth=2, refinementBudget=2000, certifyIntervals=1
    }),
    "An adaptively sampled zero level with certified whole-cell exclusions"
  ),
  .Figure(
    .plot.HeatMap((x,y) -> x-y, [-2,2], [-2,2], {= grid=[24,16] }),
    "A discrete exact-sample heat map"
  ),
  .Figure(
    .plot.VectorField((x,y) -> [-y,x], [-2,2], [-2,2], {= grid=[12,8] }),
    "A normalized rotational vector field"
  )
]);
```

`Contour` adds multiple `levels`; `Inequality` uses `relation=:le` by default.
Inspect the returned Graphic's `metadata.plot` record through a renderer or host
to find the sampling record, evidence counts, stable hit identities, ambiguous
cells, and unresolved regions.
These records distinguish sampled boundary evidence from a certified enclosure.
`refineDepth` is bounded from zero through six; `refinementBudget` caps total
processed cells and must cover the base grid. With `certifyIntervals=1`, interval-compatible functions can
certify whole-cell exclusion or inequality classification. The plotted crossing
itself remains sampled unless a separate mathematical continuity/existence
contract certifies it.
