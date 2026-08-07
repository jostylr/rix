---
title: Author a Quarto source document
description: Add front matter and a semantic callout to a QMD report.
theme: Renderers and exporters
status: implemented
---

```rix
.Plugin.Load("quarto");
report := .Fragment([
    .Heading(1, "Exact report"),
    .Callout({= variant="note", title="Policy", children=[.Paragraph("Values remain exact until rendering.")] })
]);
.quarto.Render(report, {= title="RiX report", format="html" }).Get("content");
```
