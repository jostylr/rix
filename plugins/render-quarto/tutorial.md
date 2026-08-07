---
title: Author a Quarto source document
description: Add front matter and a semantic callout to a QMD report.
theme: Renderers and exporters
status: implemented
plugin: quarto
---

## Generate a QMD source file

Quarto generation is browser-safe text lowering. It preserves Quarto-native
callouts and labels and embeds Graphics as inline SVG; Quarto itself is only
needed when the emitted source is built.

```rix
.Plugin.Load("quarto");
report := .Fragment([
    .Heading(1, "Exact report"),
    .Callout({= variant="note", title="Policy", children=[.Paragraph("Values remain exact until rendering.")] })
]);
.quarto.Render(report, {= title="RiX report", author="RiX", format="html" }).Get("content");
```

Metadata can be supplied directly or under `metadata`. Recognized fields are
`title`, `author`, `date`, and `format`; format defaults to `html`.

- Browser: complete QMD source generation.
- CLI: no external tools to emit `.qmd`.
- Options: `title`, `author`, `date`, `format`, or a `metadata` map.
