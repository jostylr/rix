---
title: Build a Canvas repaint plan
description: Lower a Graphics scene to versioned Canvas 2D commands.
theme: Renderers and exporters
status: implemented
plugin: canvas
---

## Inspect a repaint plan

The Canvas target returns deterministic `rix.canvas-plan@1` JSON. It is a
sequence of drawing commands, not a replacement for `.Graphics`; a browser
host can repaint it into any `CanvasRenderingContext2D`.

```rix
.Plugin.Load("canvas");
scene := .Graphics.Graphic([180, 100], [
    .Graphics.Path([[10, 90], [90, 10], [170, 90]], {= stroke="#2563eb", width=3 })
]);
.canvas.Render(scene).Get("content");
```

The plan preserves the scene dimensions and reports unsupported nodes through
diagnostics. Use `.Out("diagram.canvas.json", scene)` to save it with the CLI.

- Browser: complete plan generation and optional host painting.
- CLI: no external tools.
- Options: none in the version 1 plan.
