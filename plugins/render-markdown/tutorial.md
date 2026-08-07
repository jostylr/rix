---
title: Write a Markdown report
description: Preserve document structure and a table in portable Markdown.
theme: Renderers and exporters
status: implemented
---

```rix
.Plugin.Load("markdown");
report := .Fragment([
    .Heading(1, "Exact report"),
    .Paragraph([.Text("The answer is "), .Strong([.Text("exact")]), .Text(".")]),
    .Table(["name", "value"], [["half", 1/2]])
]);
.markdown.Render(report).Get("content");
```
