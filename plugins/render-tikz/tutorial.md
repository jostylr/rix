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

Coordinates retain the SVG/Canvas top-left orientation. Endpoint-form SVG arc
commands fail visibly until their geometric conversion is defined.

- Browser: complete TikZ source generation; no TeX compilation.
- CLI: no external tools to emit `.tikz`.
- Option: `standalone`.
