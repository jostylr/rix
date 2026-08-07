---
title: Prepare a PDF report
description: Build the portable document consumed by the host PDF pipeline.
theme: Renderers and exporters
status: implemented
---

The CLI export form is `.Out("report.pdf", report)`. This tutorial returns the
portable report because browser hosts intentionally do not spawn TeX.

```rix
.Plugin.Load("pdf");
report := .Fragment([
    .Heading(1, "Exact PDF report"),
    .Paragraph(@"One half is @{1/2}.")
]);
report;
```
