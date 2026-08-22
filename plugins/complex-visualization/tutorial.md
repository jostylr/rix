---
title: Color an exact complex function
description: Sample zeros and poles with exact complex arithmetic and emit portable Graphics.
theme: Higher-dimensional visualization
status: implemented
plugin: complex-viz
order: 30
---

## Make poles explicit

The safe rational sampler checks the denominator before division. Its result
distinguishes ordinary values, exact poles, and user-declared unresolved
samples.

```rix
.Plugin.Load("complex-viz");
f := .complexViz.RationalFunction((z) -> z^2 - 1, (z) -> z);
[
    0 |> f,
    .Complex.FromParts(1, 0) |> f,
    .complexViz.Color(.complexViz.Unresolved(:budget))
];
```

## Produce a renderer-neutral picture

This odd grid samples `-1`, `0`, and `1` exactly along the real axis, making
the two zeros and central pole visible in the Graphic metadata.

```rix
.Plugin.Load("complex-viz");
f := .complexViz.RationalFunction((z) -> z^2 - 1, (z) -> z);
.complexViz.DomainColoring({=
    fn=f,
    domain={= re=[-5/2, 5/2], im=[-5/2, 5/2] },
    resolution=[15, 15],
    size=[360, 360]
});
```

The exact octant/three-band convention is stable across SVG and Canvas.

## Color a certified enclosure

```rix
.Plugin.Load("complex-viz");
enclosure := .complex.FromParts(1,1).Refine({= absoluteWidth=1/1000,maxWork=100 });
{: .complexViz.Color(enclosure),
   .complexViz.CayleyColor(.Complex.FromParts(3,4)) };
```

If an enclosure spans more than one documented color cell, `Color` returns the
unresolved gray. It never selects a color from only the midpoint.

## Build Scene3D views

```rix
.Plugin.Load("complex-viz");
surface := .complexViz.Surface({=
  fn=(z)->z^2,height=:magnitudeSquared,
  domain={= re=[-1,1],im=[-1,1] },resolution=[7,7]
});
sphere := .complexViz.RiemannSphere([
  .Complex.FromParts(0,0),.Complex.FromParts(1,0),.Complex.FromParts(0,1)
],{= branchcut=:nonpositiveRealAxis });
{: surface[:metadata],sphere[:metadata] };
```

The surface retains vertex colors plus branch/unresolved metadata. The sphere
uses exact rational inverse-stereographic coordinates until a renderer chooses
its numeric lowering.
