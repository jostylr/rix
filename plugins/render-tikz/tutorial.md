---
title: Export an editable TikZ diagram
description: Turn core Graphics geometry into publication-ready TikZ source.
theme: Renderers and exporters
status: implemented
---

```rix
.Plugin.Load("tikz");
scene := .Graphics.Graphic([180, 100], [
    .Graphics.Rectangle([10, 10], [160, 80], {= stroke="#172033" }),
    .Graphics.Circle([90, 50], 24, {= fill="#be123c" })
]);
.tikz.Render(scene).Get("content");
```
