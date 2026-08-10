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

The exact octant/three-band convention is stable across SVG and Canvas. It is
intentionally discrete; a future continuous phase map will be an explicit
approximate rendering policy.
