# `plot`

`plot` is a pure-RiX optional package for creating portable 2D plots. It keeps
exact samples exact, asks `.numerics` to refine algorithm-real results, and
lowers its work to a core `.Graphics` scene rather than an opaque chart widget.

## Load and use

```rix
.Plugin.Load("plot")

.plot.Polynomial([1, 0, -4, 1], [-3, 3], {= size = [640, 360] })
```

The result can be embedded in a `.Figure` or a document template and rendered
to SVG by a web or notebook host.

## Commands

| Command | Result |
| --- | --- |
| `.plot.Polynomial(coefficients, xDomain, options?)` | A `.Graphics` scene containing axes and the sampled curve. |
| `.plot.PolynomialPOI(coefficients, xDomain, options?)` | Exact proof-carrying intercept/root/vertex records for supported linear and quadratic cases. |
| `.plot.Function(fn, xDomain, options?)` | Sample a one-variable function through the Numerics contract. |
| `.plot.Parametric(fn, parameterDomain, options?)` | Plot a function returning `[x,y]`. |
| `.plot.Scatter(data, options?)` | Point marks for `[x,y]` rows. |
| `.plot.Line(data, options?)` | Connected data rows. |
| `.plot.Bar(data, options?)` | Bars with a zero baseline. |
| `.plot.Step(data, options?)` | Horizontal-then-vertical step path. |
| `.plot.Polar(fn, angleDomain, options?)` | Polar curve whose function returns a radius. |
| `.plot.Interval(data, options?)` | Exact interval-valued rows written as `[x, low:high]`. |
| `.plot.ErrorBand(data, options?)` | Symmetric declared-error rows written as `[x, estimate, error]`. |
| `.plot.Implicit(fn, xDomain, yDomain, options?)` | Sample the boundary `fn(x,y) = level` with marching squares. |
| `.plot.Inequality(fn, xDomain, yDomain, options?)` | Classify and fill cells using `:le`, `:lt`, `:ge`, or `:gt`. |
| `.plot.Contour(fn, xDomain, yDomain, options?)` | Draw one or more scalar-field levels. |
| `.plot.HeatMap(fn, xDomain, yDomain, options?)` | Color scalar-field cells with a discrete color scale. |
| `.plot.VectorField(fn, xDomain, yDomain, options?)` | Draw normalized vectors returned as `[u,v]`. |

Coefficients are in descending-power order. The options map controls output
size, sample count, margin, fixed or fitted vertical domain, additional series,
ticks, marks, labels, and styling; the second positional argument is the
visible x domain. Sampling and fitted coordinates stay exact until a renderer
chooses its target representation. General plots accept fitted or explicit
`xDomain`/`yDomain`, linear or `:log10` scales, `tickCount`, title and axis
labels, legend labels, styles, and a discontinuity threshold. Function and
parametric plots expose split paths and an `unresolved` metadata count when a
sample cannot be resolved or a likely jump is detected.

`preferencesKey="name"` gives browser hosts an opt-in identity for separately
persisting 2D navigation and audio-trace choices. `audio={= ... }` carries
renderer-neutral defaults into `rix.audio-trace@1`: `tempo` is bounded from 1
through 60 samples per second, `frequency=[low,high]` uses audible Hz values,
and `cuePalette` may override `exact`, `certifiedEnclosure`, `approximate`,
`unresolved`, `conjectural`, and `general` cue frequencies. A non-audio
renderer can ignore these preferences without changing the retained plot.

Plot Graphics also retain their resolved view, source-coordinate series, ticks,
marks, and labels as semantic `rix.plot@1` metadata. Portable renderers may
ignore it and paint the ordinary Graphics children; `.tikz` uses it to emit
editable PGFPlots axes and series.

`Interval` and `ErrorBand` retain three semantic series (lower, center, upper)
and draw one closed band plus those boundary/center paths. Interval rows carry
the exact `RationalInterval` and `evidenceLevel=:exactInterval`; an error-band
row records `evidenceLevel=:declaredError` because its radius is caller-supplied
rather than certified by Plot. Input x values must increase strictly so the
closed band cannot silently self-intersect. The stable `interval-region`,
`interval-lower`, `interval-upper`, and `interval-center` hit identities (and
their `error_band-*` counterparts) are ordinary Graphics `hitId` values, so
Canvas and SVG hosts can inspect the same retained plot without changing it.

Field functions receive two arguments, `(x,y)`. Their common `grid=[columns,rows]`
option describes cells, so the sampler evaluates `(columns+1) × (rows+1)`
vertices. The semantic metadata records the domain, sampling method and budget,
exact/enclosed/approximate/unresolved evidence counts, stable cell or vector
identities, unresolved and ambiguous regions, legends, and color scales. The
implicit/contour and inequality boundaries are explicitly described as
sampled-sign classifications; they are not presented as certified crossings
between grid vertices.

`Implicit`, `Contour`, and `Inequality` accept `refineDepth` from `0` through
`6` and a `refinementBudget` through `50000`; an explicit budget must be at
least the base grid's cell count. Their adaptive quadtree subdivides mixed
cells and cells whose center disagrees with all four corners.
The default depth is zero, preserving uniform-grid cost. Setting
`certifyIntervals=1` requires a field function that accepts rational intervals.
Its interval image can certify whole-cell exclusion for implicit levels or
whole-cell inside/outside status for inequalities; drawn edge intersections
remain sampled evidence. The retained refinement policy reports processed and
leaf cells, subdivision count, depth, budget stops, evaluation counts, shared
cache hits, unique sampled points, and the largest sampled cell range. Sibling
cells and successive contour levels reuse the same exact point cache.

`continuity=:continuous` is an explicit caller contract. When exact endpoint
values straddle a contour level, RiX records intermediate-value-theorem proof
that a boundary point exists on that edge, while the interpolated point and
drawn segment remain sample evidence. `discontinuityThreshold` marks steep
sampled cells as `:suspected_discontinuity` and prioritizes them for refinement;
this is a heuristic warning, not proof that the function is discontinuous.
`labelContours=1` places at most one deterministic midpoint label per level,
bounded by `contourLabelLimit`.

`Implicit` accepts `level` (default `0`); `Contour` accepts `levels`; `Inequality`
accepts `relation` and `level`; `HeatMap` accepts `colors` and `colorDomain`, or
`colorMode=:continuous` with a two-value `hueRange` (one-degree HSL quantization);
and `VectorField` accepts `vectorScale`. All field families lower to ordinary
rectangles and paths with `hitId` values, so SVG, Canvas, and TikZ share the same
scene and selection identities. Text-only renderers return a deterministic plot
summary including domain, grid, unresolved regions, ambiguous sampled boundary
regions, adaptive work, budget exhaustion, interval classifications, and
evidence status. The structured text projection consumes proof-bearing records:
an IVT edge-existence proof is described separately from the sampled location
of its displayed contour segment.

## Dependencies

It depends on the portable `rix.numerics@1` service and requests no external
permissions. It is deliberately separate from the SVG renderer: plotting
describes a scene; a renderer chooses how to paint it.

See [tutorial.md](tutorial.md).
