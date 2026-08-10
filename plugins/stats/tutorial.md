---
title: Summarize exact data
description: Compute rational descriptive statistics and turn them into portable tables and plots.
theme: Algebra and analysis
status: implemented
plugin: stats
order: 20
---

## Keep every summary exact

The statistics plugin is written in RiX. Its linear quantile policy uses the
exact rank `p*(n-1)`, and both variance conventions remain rational.

```rix
.Plugin.Load("stats");
values := [1/3, 2/3, 5/3, 7/3];
summary := .stats.Summary(values);
[summary[:mean], summary[:median], summary[:populationVariance]];
```

## Build portable representations

Tables and plots are core output values. The same histogram and box plot can
therefore be displayed in RiX Web or exported through any compatible renderer.

```rix
.Plugin.Load("stats");
values := [1, 2, 2, 3, 5, 8];
.Fragment([
    .stats.SummaryTable(values),
    .Figure(.stats.HistogramGraphic(values, {= bins=3 }), "Three exact bins"),
    .Figure(.stats.BoxPlot(values), "Linear-interpolation quartiles")
]);
```

`Variance` is the population statistic. Use `SampleVariance` when the values
are a sample; it reports a clear error for fewer than two observations.
