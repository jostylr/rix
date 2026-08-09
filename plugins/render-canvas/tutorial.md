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

## Repaint without rebuilding semantics

For animation or reactive views, retain the semantic Graphic and generate a
fresh plan only when its inputs change. A browser may then replay the commands
against the same canvas; repainting does not parse RiX or mutate the Graphic.

```rix
.Plugin.Load("canvas");
MakeFrame(offset) -> .Graphics.Graphic([180, 100], [
    .Graphics.Circle([30 + offset, 50], 14, {= fill="#0c7b7f" })
]);
first := .canvas.Render(MakeFrame(0)).Get("content");
second := .canvas.Render(MakeFrame(80)).Get("content");
[first, second];
```

Plan creation and painting are linear in the emitted command count. Hosts
should reuse the canvas element and its context; the Phase 1 executor deliberately
has no hidden scene cache or event state.
