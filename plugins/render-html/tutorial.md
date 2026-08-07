---
title: Build a standalone HTML report
description: Render portable headings and exact values as semantic HTML.
theme: Renderers and exporters
status: implemented
plugin: html
---

## Produce a static semantic page

The HTML renderer embeds Graphics as SVG and returns a complete document. It
does not include the reactive widget runtime, so interactive content is
preserved statically with a diagnostic.

```rix
.Plugin.Load("html");
report := .Fragment([
    .Heading(1, "Exact report"),
    .Paragraph(@"One third is @{1/3}.")
]);
.html.Render(report, {= title="RiX exact report" }).Get("content");
```

`style` can replace the compact default stylesheet. In a CLI script,
`.Out("report.html", report)` selects this renderer unless the artifact is the
final reactive page.

- Browser: complete static HTML generation.
- CLI: no external tools.
- Options: `title` and `style`.
