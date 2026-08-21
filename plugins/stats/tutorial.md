---
title: Summarize and model exact data
description: Compute exact summaries and regressions, certified confidence records, and portable diagnostics.
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

## Use the compatibility normal helpers

The distribution functions return refinable reals. `NormalQuantile` is kept
distinct from the exact sample `Quantile` operation.

First-class probability laws and simulation live in `.probability`; these
scalar helpers remain available for existing statistics worksheets.

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

## Confidence records

Confidence procedures return semantic records whose endpoints remain
certified expressions. The method name states which normal-theory formula was
used.

```rix
.Plugin.Load("stats");
meanInterval := .stats.MeanConfidence([3,4,5,6,7], 95/100);
proportionInterval := .stats.ProportionConfidence(17, 25, 95/100);
[meanInterval, proportionInterval];
```

## Exact simple linear regression

Coefficients and residuals are exact for exact inputs. Only diagnostics that
require square roots become certified refinable values.

```rix
.Plugin.Load("stats");
model := .stats.LinearRegression([1,2,3,4], [3,5,7,9]);
.Fragment([
    .stats.RegressionTable(model),
    .stats.ResidualTable(model),
    .Paragraph(@"The fitted value at x=5 is @{.stats.Predict(model,5)}.")
]);
```

Probability simulations retain their provenance when summarized.

```rix
.Plugin.Load("probability");
.Plugin.Load("stats");
run := .probability.Dice(2,6).Simulate(20, {= seed=42 });
summary := .stats.SimulationSummary(run);
theory := .stats.DistributionSummary(.probability.Dice(2,6));
[summary[:mean], summary[:sourceFamily], summary[:sourceSeed], summary[:sourceSamplingPolicy], theory[:mean], theory[:variance]];
```
