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

The renderer also preserves declarative action metadata: ControlPanel grid
placement and shortcuts, plus accessible `.Graphics.Action` SVG groups. This
plugin is intentionally static, so it reports those interactions as needing a
host widget runtime. A final reactive `.Out` page supplies that runtime and
activates the same portable values without embedding browser callbacks in RiX.

- Browser: complete static HTML generation.
- CLI: no external tools.
- Options: `title` and `style`.
