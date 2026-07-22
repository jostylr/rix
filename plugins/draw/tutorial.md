---
title: Drawing portable graphics
description: Use the optional draw package to create core graphics scene nodes.
---

# Drawing portable graphics

Load the drawing conveniences, then build a scene out of regular graphics
nodes:

```rix
.Plugin.Load("draw")
.Graphics.Graphic([420, 240], [
  .draw.Box([20, 20], [380, 180], {= fill = "#f7fbff", stroke = "#9bb" }),
  .draw.Line([60, 160], [350, 55], {= stroke = "#2563eb", width = 3 }),
  .draw.Circle([200, 110], 24, {= fill = "#facc15" }),
  .draw.Label([190, 115], "P")
])
```

The important boundary is invisible in the result: `.draw.Circle` simply
returns `.Graphics.Circle`. This makes authored scenes portable to SVG, image,
and future document renderers.

Use the lower-level `.Graphics.Path`, `.Graphics.Text`, and related core
constructors directly when a plugin convenience is not the best fit.
