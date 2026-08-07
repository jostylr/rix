---
title: Write a Markdown report
description: Preserve document structure and a table in portable Markdown.
theme: Renderers and exporters
status: implemented
plugin: markdown
---

## Lower document semantics to Markdown

Headings, emphasis, code, math, lists, quotes, and tables stay native where
CommonMark has a matching construct. Graphics are embedded as inline SVG, and
loss of interaction is recorded in diagnostics.

```rix
.Plugin.Load("markdown");
report := .Fragment([
    .Heading(1, "Exact report"),
    .Paragraph([.Text("The answer is "), .Strong([.Text("exact")]), .Text(".")]),
    .Table(["name", "value"], [["half", 1/2]])
]);
.markdown.Render(report).Get("content");
```

Use `.Out("report.md", report)` to write the source with the CLI.

- Browser: complete Markdown generation.
- CLI: no external tools.
- Options: none.
