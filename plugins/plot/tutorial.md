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

Exact interval measurements and declared symmetric errors use different APIs
so the retained evidence cannot be confused:

```rix
.Plugin.Load("plot");
.Fragment([
  .Figure(
    .plot.Interval([[0,1:2],[1,2:4],[2,3:5]], {= title="Exact interval values" }),
    "Each vertical extent is an exact RationalInterval"
  ),
  .Figure(
    .plot.ErrorBand([[0,2,1/2],[1,3,1/4],[2,4,3/4]]),
    "Caller-declared symmetric error radii"
  )
]);
```

Both results are portable Graphics. Their metadata keeps lower, center, and
upper series plus stable hit identities; `Interval` reports exact-interval
evidence while `ErrorBand` labels its bounds as declared.

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

## Plot an ODE trajectory

```{.rix exec=true}
.Plugin.Load("ode");
.Plugin.Load("plot");
y := .calculus.Variable(:y);
problem := .ode.IVP(y,0,1,0:1);
solution := problem.AdaptiveValidatedTaylor({= order=3,steps=2,maxSubintervals=1 });
.plot.Trajectory(solution,{= maxSegments=1,title="One certified segment; the rest omitted" });
```

The blue box is a retained whole-segment enclosure. Gray time is omitted by
`maxSegments=1`, not solved or extrapolated by the plot. Raise `maxSegments` to
show the remaining stored segments. Passing `problem.RK4()` instead produces
orange approximate paths. Plotting does not improve or independently check
solver evidence. For a vector solution, use `{= component=2 }` to select its
second coordinate. Backward solutions work without sorting or changing their
stored trajectory. Tick-label approximations do not change the exact metadata.

## Plot a phase portrait

A phase portrait removes time from the axes: here position `x` is horizontal
and velocity `v` is vertical for the oscillator `x'=v`, `v'=-x`.

```{.rix exec=true}
.Plugin.Load("ode");
.Plugin.Load("plot");
x := .calculus.Variable(:x);
v := .calculus.Variable(:v);
problem := .ode.IVP([v,-x],0,[1,0],0:1,{= stateNames=[:x,:v] });
solution := problem.ValidatedTaylor({= steps=4,order=3,maxSubintervals=1 });
.plot.PhasePortrait(solution,{= xComponent=1,yComponent=2,title="Oscillator: certified position/velocity boxes" });
```

Blue boxes enclose each accepted segment in both coordinates. They do not say
that every point in a box is reachable, or trace a certified ellipse. Replace
the solver call with `problem.RK4({= steps=16 })` for an orange **approximate**
path. Swap `xComponent` and `yComponent` to exchange axes.

Try adding `maxSegments=1` to the plot options. The visible warning reports
missing time coverage; no gray spatial region is invented for unknown states.
The retained metadata still gives the exact omitted time interval. Increase
`maxSegments` to show more stored segments; this does not rerun the solver.
Backward solutions retain their integration order in the segment records.

## Mark an event

```{.rix exec=true}
.Plugin.Load("ode");
.Plugin.Load("plot");
y := .calculus.Variable(:y);
event := .ode.Event(y-1/2,{= name=:half,direction=:rising });
problem := .ode.IVP(.calculus.Constant(1),0,0,0:1,{= events=[event] });
solution := problem.ValidatedTaylor({= steps=1,order=3,maxSubintervals=1 });
result := solution.IsolateEvents()[1];
.plot.EventTrajectory(result,{= title="A certified crossing of y=1/2" });
```

The green line marks a certified unique event. With `problem.RK4()` instead,
the orange overlay is only an observed candidate. For vector solutions,
`EventPhasePortrait(result)` marks the source segment's entire state box, not
an exact crossing point. `maxEvents` limits overlay work; `maxSegments` still
limits displayed trajectory coverage. The plot consumes existing evidence and
does not strengthen it.

## Link time plots and a phase portrait

```{.rix exec=true}
.Plugin.Load("ode");
.Plugin.Load("plot");
x := .calculus.Variable(:x);
v := .calculus.Variable(:v);
problem := .ode.IVP([v,-x],0,[1,0],0:1,{= stateNames=[:x,:v] });
solution := problem.ValidatedTaylor({= steps=4,order=3,maxSubintervals=1 });
.plot.LinkedTrajectory(solution,{= components=[1,2],phaseComponents=[1,2],columns=2,scrubSteps=2000 });
```

Select a blue segment box in any panel using the Graphics selection controls
or keyboard. The corresponding solver segment highlights in all three panels.
The selection links whole certified enclosures, not a guessed point on the
solution. For approximate solvers the linked objects are approximate segments.
`components` chooses time plots; `phaseComponents` optionally adds one phase
portrait. `columns` arranges the panels; `size` sets each panel's dimensions.
`maxPanels` (default 8) and `maxSegments` are adjustable display budgets.

If your problem declares an event, use
`.plot.LinkedEvents(solution.IsolateEvents()[1],options)` to link both segments
and event overlays across the same panels. Static exports retain all panels
and evidence but do not provide browser selection controls. This is segment
selection plus a time scrubber. Move the **Trajectory time** slider, or enter
an exact time such as `1/3` in **Exact trajectory time**. The red mark moves
through each time plot and displays the corresponding phase bounds. For
certified segments these are the whole retained tube bounds, not tightened
Taylor bounds at that time; approximate segments use exact arithmetic on their
stored linear interpolation. The readout labels this distinction explicitly.

Try `maxSegments=1` and scrub past the displayed prefix: the readout says
uncomputed/omitted and clears old markers. `scrubSteps` controls slider
resolution, while exact time entry is not restricted to its grid.
`maxScrubWork` (default 10000) and `maxScrubDigits` (default 1000) bound each
query. Budget failures are visible and do not call a solver or extrapolate.

Choose **Panel to zoom**, then use **Zoom panel in**, **Zoom panel out**, or
**Reset panel**. Scrolling over a panel zooms that panel around the pointer;
the other panels keep their views. Scrub again after zooming: the selected time
is still shared, and its marker follows the panel's zoom. A clipped marker has
not disappeared mathematically—the exact readout remains available. Reset the
panel to see its full original view.

`panelMinZoom` (default `1/8`), `panelMaxZoom` (default `64`), and
`panelZoomStep` (default `3/2`) configure these controls. Try
`panelMaxZoom=128,panelZoomStep=2`. The main Graphics toolbar still changes the
whole composed view. Panel zoom changes display only, including axes and labels;
it does not request tighter enclosures or recompute tick positions.

## Share a color policy

One portable scale can drive a heat map, a statistics graphic, and a complex
magnitude coloring without becoming renderer state:

```rix
.Plugin.Load("plot");
.Plugin.Load("stats");
scale := .plot.ColorScale({=
  colors=["#172554","#38bdf8","#f8fafc"],minimum=0,maximum=4
});
.Fragment([
  .plot.HeatMap((x,y)->x^2+y^2,[-1,1],[-1,1],{= grid=[8,8],colorScale=scale }),
  .stats.HistogramGraphic([1,2,2,3,4],{= bins=3,colorScale=scale })
]);
```
