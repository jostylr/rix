# `.stats`

Provides exact descriptive statistics and certified normal-distribution
functions in RiX. Descriptive input values must be
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
`SampleVariance`, `NormalPDF`, `NormalCDF`, `NormalQuantile`, `Summary`,
`SummaryTable`, `Histogram`,
`HistogramGraphic`, `BoxPlot`, `DistributionSummary`, `SimulationValues`, `SimulationSummary`,
`MeanConfidence`, `ProportionConfidence`, `LinearRegression`, `Predict`,
`RegressionTable`, and `ResidualTable`. `Summary` uses the portable
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
