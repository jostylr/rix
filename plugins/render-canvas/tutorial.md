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
- Options: `pixelRatio`, `viewport`, `selection`, and portable `assets`.

## Preserve interaction semantics

```rix
.Plugin.Load("canvas");
interactivePlan := .canvas.Render(.Graphics.Graphic([100,60], [
    .Graphics.Rectangle([10,10],[30,20], {= fill="#2563eb", id="box" }),
    .Graphics.Text([50,50], "measurement", {= id="label" })
]), {=
    pixelRatio=2,
    viewport={= origin=[10,5], pan=[4,6], zoom=2 },
    selection={= ids=["box"], focus="box" },
    assets=[{= id="texture", path="images/texture.png", mime="image/png" }]
});
interactivePlan.Get("metadata");
```

The serialized plan includes hit-test bounds and an accessibility text/object
tree. A browser uses the exported host helpers for pointer inversion, hit
testing, loading declared images, and repainting only the listed dirty regions.

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
