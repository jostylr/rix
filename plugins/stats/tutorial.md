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

## Use a certified normal distribution

The distribution functions return refinable reals. `NormalQuantile` is kept
distinct from the exact sample `Quantile` operation.

```rix
.Plugin.Load("stats");
values := [
  .stats.NormalPDF(0),
  .stats.NormalCDF(1),
  .stats.NormalQuantile(975/1000)
];
values.Map((value) -> .numerics.Refine(value, {=
  absoluteWidth=1/1000,
  maxWork=12000
}));
```

Pass optional mean and exact positive Rational standard deviation arguments
for another normal distribution, for example `.stats.NormalCDF(12,10,2)`.
