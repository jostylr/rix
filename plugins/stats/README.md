# `.stats`

Provides exact descriptive statistics, undergraduate hypothesis tests, and
certified distribution functions in RiX. Descriptive input values must be
`Integer` or `Rational`, and no operation converts them to binary floating
point.

Distribution values and simulation now belong to the separate `.probability`
plugin. The three scalar normal helpers here remain as compatibility and
analysis conveniences; new probability code should prefer
`.probability.Normal(mean,standardDeviation)`.

```rix
.Plugin.Load("stats");
values := [1/3, 2/3, 5/3, 7/3];
.stats.Summary(values);
```

The public operations are `Count`, `Mean`, `Quantile`, `Median`, `Variance`,
`SampleVariance`, `Correlation`, `NormalPDF`, `NormalCDF`, `NormalQuantile`, `Summary`,
`SummaryTable`, `Histogram`,
`HistogramGraphic`, `BoxPlot`, `DistributionSummary`, `SimulationValues`, `SimulationSummary`,
`MeasurementIntervals`, `IntervalMean`, `IntervalSummary`,
`IntervalOneSampleZTest`, `IntervalOneSampleTTest`, `IntervalPairedTTest`,
`IntervalTwoSampleTTest`, `IntervalOneWayANOVA`, `IntervalCorrelationTest`,
`IntervalRegressionSlopeTest`, `IntervalTestDecision`, `IntervalTestTable`,
`MeanConfidence`, `MeanTConfidence`, `PairedMeanDifferenceConfidence`,
`MeanDifferenceConfidence`, `ProportionConfidence`, `OneSampleZTest`, `TwoSampleZTest`,
`OneProportionZTest`, `TwoProportionZTest`, `OneSampleTTest`, `PairedTTest`,
`TwoSampleTTest`, `CorrelationTest`, `RegressionSlopeTest`, `OneWayANOVA`, `ChiSquareGoodnessOfFit`,
`ChiSquareIndependence`, `TestDecision`, `TestTable`, `LinearRegression`,
`Predict`, `RegressionTable`, and `ResidualTable`. `Summary` uses the portable
`rix.stats.summary@1` schema; histograms use `rix.stats.histogram@1`.

Phase 1 quantiles use exact linear interpolation at rank `p*(n-1)` (the
common R-7/NumPy-linear convention with zero-based rank). Population variance
divides by `n`; sample variance divides by `n-1` and requires two observations.
The mean and quantiles of exact inputs therefore remain exact Rationals.

`SummaryTable` returns a core `Table`. `HistogramGraphic` and `BoxPlot` return
ordinary core `Graphic` values, so SVG, Canvas, TikZ, PNG, and document
renderers can consume them without knowing about statistics. A constant
dataset becomes one zero-width semantic histogram bin and a centered box plot.
`Count([])` is zero; other summaries reject an empty dataset explicitly.
When Plot is loaded, `HistogramGraphic(...,{= colorScale=scale })` accepts the
portable `rix.color-scale@1` value returned by `.plot.ColorScale`. Bin counts
select colors while the unchanged scale is retained in Graphic metadata; the
statistics plugin does not depend on a renderer or on Plot internals.

The normal functions accept any certified refinable real for the value,
location, or probability. An optional exact positive Rational standard
deviation selects a location-scale distribution:

```rix
.stats.NormalPDF(3, 2, 5/2);
.stats.NormalCDF(3, 2, 5/2);
.stats.NormalQuantile(975/1000, 2, 5/2);
```

`NormalPDF` and `NormalCDF` use direct request-sized Rational bounds rather
than generic arithmetic-expression precision routing. `NormalQuantile` shares
one certified `sqrt(2*pi)` interval, tightens its Chebyshev starting bracket
with small powers-of-two probes, and then contracts by certified interval
Newton with bisection fallback. Probabilities must be certifiably inside `0:1`;
unresolved endpoints produce structured `:unknown` evidence.

## Phase 2 inference

`MeanConfidence` returns a `rix.stats.confidence@1` record. It uses a certified
normal critical value and either sample variance or an explicitly supplied
exact `knownStandardDeviation`. `ProportionConfidence` returns a Wilson-score
interval, including sensible boundary behavior for zero or all successes.
These are normal-theory procedures, not exact finite-sample coverage claims;
their formulas are nevertheless evaluated with certified Numerics values.

The common undergraduate hypothesis-test surface is:

```rix
.stats.OneSampleZTest(values,nullMean,knownPopulationStandardDeviation,alternative);
.stats.TwoSampleZTest(first,second,firstKnownScale,secondKnownScale,nullDifference,alternative);
.stats.OneProportionZTest(successes,trials,nullProportion,alternative);
.stats.TwoProportionZTest(firstSuccesses,firstTrials,secondSuccesses,secondTrials,alternative);
.stats.OneSampleTTest(values,nullMean,alternative);
.stats.PairedTTest(first,second,nullDifference,alternative);
.stats.TwoSampleTTest(first,second,nullDifference,{= equalVariance=0,alternative=:twoSided });
.stats.OneWayANOVA([firstGroup,secondGroup,thirdGroup]);
.stats.ChiSquareGoodnessOfFit(observedCounts,expectedCounts,{= estimatedParameters=0 });
.stats.ChiSquareIndependence(contingencyTable);
```

Alternatives are `:twoSided`, `:less`, and `:greater`. Every operation returns
an immutable `rix.stats.test@1` record containing the estimate, null value,
standard error where applicable, test statistic, reference distribution,
degrees of freedom, p-value, assumptions, and method identity. `test.PValue()`
returns the refinable p-value, `test.Decision(alpha)` returns a certified
`rix.stats.test-decision@1` record, and `test.Table()` returns a portable table.
`Decision` says `:unresolved` instead of guessing if the refined p-value still
straddles alpha.

The z and proportion procedures use their usual normal references. One-sample,
paired, and equal-variance two-sample t procedures use certified integer-degree
Student-t tails. The default two-sample t procedure is Welch's unequal-variance
test. When the Welch-Satterthwaite degrees of freedom are fractional, the
current certified elementary tail kernel uses their floor as an explicitly
recorded integer-degree approximation; inspect `degreesOfFreedom`,
`referenceDegreesOfFreedom`, `pValueStatus`, and `pValueQualification`. Set
`equalVariance=1` only when the pooled-variance assumption is justified.

`MeanTConfidence`, `PairedMeanDifferenceConfidence`, and
`MeanDifferenceConfidence` use certified Student-t tails to bracket a critical
value and deliberately use the bracket's upper endpoint, widening rather than
narrowing the reported interval. `CorrelationTest` is the usual Pearson
correlation t procedure; `RegressionSlopeTest` applies its equivalent to a
simple regression result.

## Interval measurements

`MeasurementIntervals(centers,errors)` constructs exact closed measurement
intervals. `IntervalSummary` reports mean, possible minimum, and possible
maximum ranges that enclose every point dataset consistent with those
measurements; its midpoint summary is labeled and never substituted silently.

The interval-test family computes certified outer bounds for the statistic and
p-value over the whole measurement box:

```rix
.stats.IntervalOneSampleZTest(values,nullMean,knownPopulationStandardDeviation,alternative);
.stats.IntervalOneSampleTTest(values,nullMean,alternative,{= maxBoxes=64 });
.stats.IntervalPairedTTest(first,second,nullDifference,alternative,{= maxBoxes=64 });
.stats.IntervalTwoSampleTTest(first,second,nullDifference,{= equalVariance=0,alternative=:twoSided,maxBoxes=64 });
.stats.IntervalOneWayANOVA([firstGroup,secondGroup],{= maxBoxes=64 });
.stats.IntervalCorrelationTest(x,y,alternative,{= maxBoxes=64 });
.stats.IntervalRegressionSlopeTest(x,y,nullSlope,alternative,{= maxBoxes=64 });
```

The z-test extrema are analytic. The other procedures use exact
`RationalInterval` arithmetic plus bounded subdivision of the closed
measurement box. Increasing `maxBoxes` can remove dependency overestimation
but never discards a possible point dataset. `measurementWidth` may stop
splitting once every coordinate is at most that wide. A zero-containing
variance denominator is reported with an infinite statistic endpoint and a
safely widened p-value range instead of an unsafe division.

The default two-sample interval test is Welch. Because the scalar
implementation uses an integer reference degree, its p-value enclosure covers
every integer degree from `min(n1-1,n2-1)` through `n1+n2-2`; this includes
every possible Welch-Satterthwaite floor. Use `equalVariance=1` for the pooled
test.

Every interval test decision is one of `:rejectForAllMeasurements`,
`:failToRejectForAllMeasurements`, `:measurementDependent`, or `:unresolved`.
This separates bounded measurement uncertainty from sampling uncertainty.

```rix
measurements := .stats.MeasurementIntervals([10,12,14],[1,1/2,2]);
zTest := .stats.IntervalOneSampleZTest(measurements,10,2,:greater);
tTest := .stats.IntervalOneSampleTTest(measurements,10,:greater,{= maxBoxes=128 });
[.stats.IntervalSummary(measurements)[:meanRange],zTest.Decision()[:status],tTest.PValueBounds()];
```

One-way ANOVA uses the standard fixed-effects F statistic. The chi-square
procedures use Pearson statistics. Assumption labels are data, not claims that
the plugin has verified independence, normality, equal variances, or adequate
expected cell counts. Expected goodness-of-fit values are counts and must sum
exactly to the observed total.

`LinearRegression(x,y)` fits the exact simple least-squares line. Its slope,
intercept, fitted values, residuals, SSE, and R-squared stay exact. Square-root
standard errors are certified refinable values. `RegressionTable` and
`ResidualTable` are portable core Tables.

`DistributionSummary` consumes a univariate probability distribution record
and retains its family, support, parameters, theoretical moments, and
exact/certified metadata. Missing Cauchy moments remain missing.

`SimulationValues` and `SimulationSummary` consume
`rix.probability.simulation@1` records when the simulated values are exact
scalars. The summary retains the source family, count, seed, and sampling
policy so an approximate simulation cannot be mistaken for exact data.
