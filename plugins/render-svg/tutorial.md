---
title: Export a portable SVG
description: Render one core Graphics scene as accessible SVG source.
theme: Renderers and exporters
status: implemented
plugin: svg
---

## Render the retained scene

SVG runs entirely in the browser. The renderer traverses the same retained
scene that Canvas, TikZ, and PNG consume. Supplying `alt` adds accessible title
and label markup to the root SVG.

```rix
.Plugin.Load("svg");
scene := .Graphics.Graphic([180, 100], [
    .Graphics.Circle([50, 50], 28, {= fill="#0c7b7f" }),
    .Graphics.Text([100, 55], "exact", {= size=16 })
]);
.svg.Render(scene, {= alt="A teal circle labeled exact" }).Get("content");
```

Use generic `.Render(scene, "image/svg+xml", options)` when a target is chosen
from data, or `.Out("diagram.svg", scene)` in a CLI script.

- Browser: complete source generation.
- CLI: no external tools.
- Option: `alt` for the accessible description.
