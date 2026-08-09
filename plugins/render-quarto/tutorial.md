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

## Emit subsidiary figure assets

Inline SVG remains the portable default. For a project that manages figures
as files, choose deterministic external SVG assets. A capable CLI host can also
choose `assets="png"`.

```rix
.Plugin.Load("svg");
.Plugin.Load("quarto");
figure := .Graphics.Graphic([120, 80], [
    .Graphics.Circle([60, 40], 24, {= fill="#0c7b7f" })
]);
document := .Fragment([.Figure(figure, "An external circle", "circle", "Circle")]);
result := .quarto.Render(document, {= assets="svg", assetDir="figures" });
[result.Get("content"), result.Get("assets")];
```

Asset names are stable in encounter order (`figure-1.svg`, `figure-2.svg`,
and so on), and `.Out` writes them beside the QMD under `assetDir`.
