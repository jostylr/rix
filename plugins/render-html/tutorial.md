---
title: Build a standalone HTML report
description: Render portable headings and exact values as semantic HTML.
theme: Renderers and exporters
status: implemented
---

```rix
.Plugin.Load("html");
report := .Fragment([
    .Heading(1, "Exact report"),
    .Paragraph(@"One third is @{1/3}.")
]);
.html.Render(report, {= title="RiX exact report" }).Get("content");
```
