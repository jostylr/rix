---
title: Summarize and model exact data
description: Compute exact summaries, common hypothesis tests, regressions, certified confidence records, and portable diagnostics.
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

## Analyze interval measurements without midpoint substitution

Generate intervals from stated centers and error bounds, summarize every
admissible point dataset, and make a known-scale z decision over the whole
measurement box.

```rix
.Plugin.Load("stats");
measured := .stats.MeasurementIntervals([10,12,14],[1,1/2,2]);
summary := .stats.IntervalSummary(measured);
test := .stats.IntervalOneSampleZTest(measured,10,2,:greater);
decision := test.Decision(1/20,{= absoluteWidth=1/500,maxWork=400 });
[summary[:meanRange],summary[:minimumRange],summary[:maximumRange],decision[:status]];
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

## Test means and proportions

Test results keep exact sample bookkeeping and certified reference-function
values. The method and assumptions travel with the answer.

```rix
.Plugin.Load("stats");
knownScale := .stats.OneSampleZTest([48,49,50,52,54],50,2,:greater);
student := .stats.OneSampleTTest([2,4,6,8,10],0,:twoSided);
proportion := .stats.OneProportionZTest(60,100,1/2,:greater);
.Fragment([
    knownScale.Table(),
    student.Table(),
    proportion.Table()
]);
```

Use `:less`, `:greater`, or `:twoSided` to state the alternative. A decision
refines the p-value before comparing it with alpha:

```rix
decision := student.Decision(1/20,{= absoluteWidth=1/10000,maxWork=2000 });
[decision[:status],decision[:pValueInterval],decision[:conclusion]];
```

The status is `:reject`, `:failToReject`, or `:unresolved`. The last case is
important: it means the certified p-value enclosure still crosses alpha and
more refinement is needed, not that the null hypothesis was accepted.

For two independent samples the default is Welch's unequal-variance formula.
The current certified Student-t tail kernel has integer degrees of freedom, so
a fractional Welch-Satterthwaite value is retained while its floor is exposed
as `referenceDegreesOfFreedom` for the p-value approximation.

```rix
welch := .stats.TwoSampleTTest([1,2,3,4],[6,8,10,12]);
pooled := .stats.TwoSampleTTest([8,9,10,11],[3,4,5,6],0,{= equalVariance=1 });
paired := .stats.PairedTTest([10,12,13,15],[8,9,11,12]);
[
  welch[:degreesOfFreedom],welch[:referenceDegreesOfFreedom],welch[:pValueStatus],
  pooled[:method],paired[:differences]
];
```

## Compare several groups and categorical counts

One-way ANOVA reports exact sums and mean squares before its certified F tail.
Pearson goodness-of-fit and independence tests retain their expected counts and
cell contributions for inspection.

```rix
.Plugin.Load("stats");
anova := .stats.OneWayANOVA([[1,2,3],[4,5,6],[3,4,5]]);
goodness := .stats.ChiSquareGoodnessOfFit([20,30,50],[25,25,50]);
independence := .stats.ChiSquareIndependence([[12,8,10],[6,14,10]]);
.Fragment([anova.Table(),goodness.Table(),independence.Table()]);
```

Read the `assumptions` field before interpreting a p-value. In particular,
these procedures do not infer that observations were independently sampled or
that normality, equal variance, and expected-count conditions hold.

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
