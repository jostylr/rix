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
- Options: `alt`, decimal `precision`, and `rounding` policy.

## Keep exact coordinates enclosed

Exact and certified coordinates are never silently replaced by an
unqualified decimal point. The renderer retains outward decimal bounds and,
when necessary, minimally expands the rendered geometry to contain them.

```rix
.Plugin.Load("svg");
exactScene := .Graphics.Graphic([120, 80], [
    .Graphics.Path([[1/3,1/3],[2/3,2/3]], {=
        stroke="#2563eb",
        width=1/3
    }),
    .Graphics.Circle([(4:5),2], 1/3, {= fill="#0f766e" })
]);
lowered := .svg.Render(exactScene, {= precision=3, rounding="nearest" });
[
    lowered.Get("metadata")["coordinateLowering"]["guarantee"],
    lowered.Get("diagnostics")
];
```

The guarantee is `outward-exact-enclosure`. Float-originated coordinates may
still round messily, but are marked non-certified and never presented as an
exact enclosure.

SVG also validates the complete nested Graphics tree. Unsupported nodes, Path
commands, and style properties fail with a stable path such as
`graphic[2].group[1]`; they are never silently omitted. Generic `.Render` can
use an explicitly requested fallback target, which retains the SVG failure in
its diagnostics.

## Reuse paint and interaction definitions

```rix
.Plugin.Load("svg");
paint := {= gradient={= from="#dbeafe", to="#2563eb", angle=45 },
            mask={= opacity=3/4 } };
decorated := .Graphics.Graphic([120,70], [
    .Graphics.Group([
        .Graphics.Rectangle([5,5],[30,20], paint),
        .Graphics.Rectangle([45,5],[30,20], paint)
    ], {= stroke="#172033", id="boxes" }),
    .Graphics.Path([[10,55],[100,55]], {=
        stroke="#be123c", marker="arrow", markerSize=4
    }),
    .Graphics.Text([60,68], "portable", {= anchor="middle", font="Display" })
]);
.svg.Render(decorated, {=
    fontPolicy="generic",
    viewport={= pan=[4,6], zoom=2 },
    selection={= ids=["boxes"], focus="boxes" }
});
```

The two rectangles share one gradient and one mask definition. The requested
font is mapped to a generic family, and the viewport/selection records remain
available in the render metadata.
