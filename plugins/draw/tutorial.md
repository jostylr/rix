---
title: Drawing portable graphics
description: Use the optional draw package to create core graphics scene nodes.
theme: Graphics and geometry
status: implemented
---

Load the drawing conveniences and build a scene from regular `.Graphics` nodes:

```rix
.Plugin.Load("draw");
.Graphics.Graphic([420, 240], [
  .draw.Box([20, 20], [380, 180], {= fill = "#f7fbff", stroke = "#9bb" }),
  .draw.Line([60, 160], [350, 55], {= stroke = "#2563eb", width = 3 }),
  .draw.Circle([200, 110], 24, {= fill = "#facc15" }),
  .draw.Label([190, 115], "P")
]);
```

The important boundary is invisible in the result: `.draw.Circle` simply
returns `.Graphics.Circle`. This makes authored scenes portable to SVG, image,
and future document renderers.

Use the lower-level `.Graphics.Path`, `.Graphics.Text`, and related core
constructors directly when a plugin convenience is not the best fit.

## Draft a labeled construction

Reusable styles, a viewport transform, dimensions, and anchors compose without
creating a second scene format:

```rix
.Plugin.Load("draw");
ink := .draw.Style({= stroke="#1d4ed8", width=2 }, {= fill="none" });
paper := .draw.Style({= stroke="#cbd5e1", width=1 }, {= fill="none" });
view := .draw.Viewport([-2,-1,8,5], [600,360], {= margin=36 });
a := view.Point([0,0]);
b := view.Point([6,0]);
c := view.Point([2,4]);
triangle := .draw.Polygon([a,b,c],ink);
labelBox := .draw.Bounds(triangle);
.Graphics.Graphic([600,360],[
  .draw.Grid([36,36],[528,288],48,paper),
  triangle,
  .draw.Arrow(a,c,ink),
  .draw.Dimension(a,b,"6 units",ink,{= offset=20 }),
  .draw.Label(.draw.Anchor(labelBox,"north",[0,-10]),"Exact triangle",{= anchor="middle",size=15 })
]);
```

`Bounds` uses renderer-independent drafting estimates for labels. A final
renderer still owns exact font metrics.
