---
title: Export a LaTeX report
description: Combine exact math, a table, and a portable document structure in TeX.
theme: Renderers and exporters
status: implemented
plugin: latex
---

## Produce standalone TeX

LaTeX source generation runs entirely in the browser. Document structure stays
semantic and embedded `.Graphics` scenes lower through the shared TikZ
renderer.

```rix
.Plugin.Load("latex");
report := .Fragment([
    .Heading(1, "Exact report"),
    .MathBlock("x^2 - 1 = (x-1)(x+1)"),
    .Table(["root", "value"], [["left", -1], ["right", 1]])
]);
.latex.Render(report, {= title="Exact roots", standalone=1 }).Get("content");
```

Set `standalone=0` for a body fragment. Use `.Out("report.tex", report)` to
write a complete source document from the CLI.

- Browser: complete TeX source generation; no compilation.
- CLI: no external tools to emit `.tex`.
- Options: `title` and `standalone`.
