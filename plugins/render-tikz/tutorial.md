---
title: Export an editable TikZ diagram
description: Turn core Graphics geometry into publication-ready TikZ source.
theme: Renderers and exporters
status: implemented
plugin: tikz
---

## Produce TikZ/PGF source

TikZ generation is browser-safe because it only produces text. The default
result is a `tikzpicture` fragment; pass `standalone=1` when the source should
include a compilable LaTeX document wrapper.

```rix
.Plugin.Load("tikz");
scene := .Graphics.Graphic([180, 100], [
    .Graphics.Rectangle([10, 10], [160, 80], {= stroke="#172033" }),
    .Graphics.Circle([90, 50], 24, {= fill="#be123c" })
]);
.tikz.Render(scene, {= standalone=1 }).Get("content");
```

Repeated styles become reusable `rixStyleN` declarations. Markers and
gradients use fields on the portable Graphics style:

```rix
.Plugin.Load("tikz");
accent := {= stroke="#1d4ed8", width=2, marker="diamond", markerSize=2 };
diagram := .Graphics.Graphic([180,100], [
    .Graphics.Path([[10,80],[60,20],[110,70],[170,25]], accent),
    .Graphics.Rectangle([18,20],[34,45], {=
        stroke="#172033",
        gradient={= from="#dbeafe", to="#2563eb", angle=45 }
    }),
    .Graphics.Rectangle([125,35],[34,30], {=
        stroke="#172033",
        gradient={= from="#dbeafe", to="#2563eb", angle=45 }
    })
]);
.tikz.Render(diagram, {= standalone=1 }).Get("content");
```

## Export a plot as PGFPlots

The plot plugin retains a semantic copy of its resolved data in Graphic
metadata. TikZ recognizes that contract and emits native axes and series:

```rix
.Plugin.Load("plot");
.Plugin.Load("tikz");
measurements := .plot.Line(
    [[0,0],[1,1/2],[2,3/2],[3,7/4]],
    {=
        title="Measured distance",
        xLabel="time (s)",
        yLabel="distance (m)",
        label="interval midpoints",
        stroke="#2563eb",
        style={= marker="square", markerSize=2 }
    }
);
exported := .tikz.Render(measurements, {= standalone=1 });
[exported.Get("content"), exported.Get("metadata")];
```

The generated source contains `\begin{axis}`, `\addplot`, the original resolved
data coordinates, a legend entry, and declarations for PGFPlots and
`plotmarks`. Use `{= preamble=1 }` instead when you want dependency declarations
plus a fragment rather than a complete document.

Coordinates retain the SVG/Canvas top-left orientation. Endpoint-form SVG arc
commands fail visibly until their geometric conversion is defined.

- Browser: complete TikZ source generation; no TeX compilation.
- CLI: no external tools to emit `.tikz`.
- Options: `standalone`, `preamble`, and one-based `frame` for sequences.

## Export a retained 3D snapshot

The renderer accepts the versioned snapshot record directly and retains its
projection and evidence in `metadata.staticFrame`. A sequence can be exported
one frame at a time with the same path.

```rix
.Plugin.Load("scene3d");
.Plugin.Load("tikz");
scene := .scene3d.Scene([.scene3d.Mesh(
    [[0,0,0],[1,0,0],[0,1,0]],[[1,2,3]],{= color="#2563eb" }
)], {= lights=[.scene3d.AmbientLight("#ffffff",1)] });
snapshot := .scene3d.Snapshot(scene,{= mode=:lit,size=[240,160] });
.tikz.Render(snapshot,{= standalone=1 }).Get("metadata");
```

Exact rational coordinate source is preserved, including derived rectangle and
curve coordinates. TeX applies its own final display precision.
