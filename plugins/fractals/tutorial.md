---
title: Explore deterministic chaos and escape-time fractals
description: Keep RiX dynamics mathematical, then lower selected results to portable Graphics.
theme: Chaos and fractals
status: implemented
plugin: fractals
order: 31
---

## Inspect an exact logistic orbit

The orbit record retains exact values. Period detection reports only what its
finite repeated-tail check establishes.

```rix
.Plugin.Load("fractals");
logistic := .fractals.Logistic(4);
orbit := .fractals.Orbit(logistic, 1/2, 6);
{= values=orbit[:values], period=.fractals.DetectPeriod(orbit, 4) };
```

## Build a bifurcation diagram

Sampling and burn-in happen in RiX. The second call only maps the mathematical
points into a portable Graphic.

```rix
.Plugin.Load("fractals");
data := .fractals.LogisticBifurcation([5/2,4], {=
    parameterSamples=81,
    discard=60,
    keep=30
});
.fractals.BifurcationGraphic(data, {= size=[640,360], stateDomain=[0,1] });
```

## Draw a cobweb without choosing a renderer

```rix
.Plugin.Load("fractals");
data := .fractals.Cobweb(.fractals.Logistic(7/2), [0,1], 1/5, 24);
.fractals.CobwebGraphic(data, {= size=[480,480] });
```

## Separate Mandelbrot mathematics from color

`boundedByBudget` is a finite observation, while every `escaped` cell carries
an exact escape comparison. The palette can change without recomputing the
grid.

```rix
.Plugin.Load("fractals");
grid := .fractals.Mandelbrot({=
    domain={= re=[-2,1], im=[-3/2,3/2] },
    resolution=[48,48],
    maxIterations=48
});
.fractals.EscapeGraphic(grid, {= size=[480,480] });
```

The resulting Graphic can be sent unchanged to SVG, Canvas, PNG, TikZ, or a
document pipeline.
