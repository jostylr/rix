---
title: Export a portable SVG
description: Render one core Graphics scene as accessible SVG source.
theme: Renderers and exporters
status: implemented
---

```rix
.Plugin.Load("svg");
scene := .Graphics.Graphic([180, 100], [
    .Graphics.Circle([50, 50], 28, {= fill="#0c7b7f" }),
    .Graphics.Text([100, 55], "exact", {= size=16 })
]);
.svg.Render(scene, {= alt="A teal circle labeled exact" }).Get("content");
```
