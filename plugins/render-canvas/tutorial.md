---
title: Build a Canvas repaint plan
description: Lower a Graphics scene to versioned Canvas 2D commands.
theme: Renderers and exporters
status: implemented
---

```rix
.Plugin.Load("canvas");
scene := .Graphics.Graphic([180, 100], [
    .Graphics.Path([[10, 90], [90, 10], [170, 90]], {= stroke="#2563eb", width=3 })
]);
.canvas.Render(scene).Get("content");
```
