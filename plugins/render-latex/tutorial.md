---
title: Export a LaTeX report
description: Combine exact math, a table, and a portable document structure in TeX.
theme: Renderers and exporters
status: implemented
---

```rix
.Plugin.Load("latex");
report := .Fragment([
    .Heading(1, "Exact report"),
    .MathBlock("x^2 - 1 = (x-1)(x+1)"),
    .Table(["root", "value"], [["left", -1], ["right", 1]])
]);
.latex.Render(report).Get("content");
```
