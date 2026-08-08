---
title: Assemble a numbered report
description: Combine prose, an exact table, and a plot with portable cross-references.
theme: Data and documents
status: implemented
plugin: document
---

## Resolve references over a template and output nodes

The core `@"""…"""` language creates portable prose. `.document.Ref` can appear
inside an interpolation even when the labeled figure or table comes later.

```rix
.Plugin.Load("document");
.Plugin.Load("plot");
intro := @"""
h1: Results #results

p: The exact values are in @{.document.Ref("tbl-values")}. The fitted plot is @{.document.Ref("fig-curve")}.
""";
values := .document.Label("tbl-values", .Table(
    ["x", "x² - 1"],
    [[-1, 0], [0, -1], [1, 0]],
    {= caption="Selected exact values" }
));
curve := .document.Label("fig-curve", .Figure(
    .plot.Polynomial([1, 0, -1], [-2, 2]),
    "A fitted polynomial view"
));
report := .document.Report("Exact polynomial report", [intro, values, curve], {=
    author="RiX",
    theme=.document.Theme(:compact, {= accent="#275dad" })
});
report;
```

The report is still a core Fragment. Load any document renderer to export the
same numbered links and captions.

```rix
.Plugin.Load("markdown");
.markdown.Render(report).Get("content");
```
