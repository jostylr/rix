# `.stats`

Provides exact descriptive statistics and certified normal-distribution
functions in RiX. Descriptive input values must be
`Integer` or `Rational`, and no operation converts them to binary floating
point.

```rix
.Plugin.Load("stats");
values := [1/3, 2/3, 5/3, 7/3];
.stats.Summary(values);
```

The public operations are `Count`, `Mean`, `Quantile`, `Median`, `Variance`,
`SampleVariance`, `NormalPDF`, `NormalCDF`, `NormalQuantile`, `Summary`,
`SummaryTable`, `Histogram`,
`HistogramGraphic`, and `BoxPlot`. `Summary` uses the portable
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

`NormalQuantile` uses certified monotone bisection with a Chebyshev starting
bracket. Probabilities must be certifiably inside `0:1`; unresolved endpoints
produce structured `:unknown` evidence.
