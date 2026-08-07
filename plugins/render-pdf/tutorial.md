---
title: Prepare a PDF report
description: Build the portable document consumed by the host PDF pipeline.
theme: Renderers and exporters
status: implemented
plugin: pdf
---

## Inspect the browser contract

PDF reuses the LaTeX/TikZ lowering and delegates only compilation to its host.
The browser can discover the target and preview its portable input, but calling
`.pdf.Render` reports `pdf-toolchain-unavailable` because a web page does not
spawn TeX.

```rix
.Plugin.Load("pdf");
report := .Fragment([
    .Heading(1, "Exact PDF report"),
    .Paragraph(@"One half is @{1/2}.")
]);
[.Renderer.Info("pdf").Get("mime"), report];
```

Use `.pdf.Render(report, {= title="Exact report" })` in a capable host, or
`.Out("report.pdf", report)` with the CLI.

- Browser: contract discovery and portable input preview only.
- CLI: requires `pdflatex`.
- Option: `title`; compilation always uses standalone LaTeX.
