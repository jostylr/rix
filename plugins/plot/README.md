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
| `.plot.Trajectory(solution, options?)` | Time-versus-component ODE paths, retained certified tubes, and visibly uncomputed time. |
| `.plot.PhasePortrait(solution, options?)` | Two state components, projected whole-tube boxes or approximate paths. |
| `.plot.EventTrajectory(result, options?)` | Event-time overlays on the isolation result's own solution. |
| `.plot.EventPhasePortrait(result, options?)` | Evidence-labeled source-segment boxes for event candidates. |
| `.plot.LinkedTrajectory(solution, options?)` | Coordinated time-component panels and an optional phase portrait. |
| `.plot.LinkedEvents(result, options?)` | Linked panels including the isolation result's event overlays. |
| `.plot.Implicit(fn, xDomain, yDomain, options?)` | Sample the boundary `fn(x,y) = level` with marching squares. |
| `.plot.Inequality(fn, xDomain, yDomain, options?)` | Classify and fill cells using `:le`, `:lt`, `:ge`, or `:gt`. |
| `.plot.Contour(fn, xDomain, yDomain, options?)` | Draw one or more scalar-field levels. |
| `.plot.HeatMap(fn, xDomain, yDomain, options?)` | Color scalar-field cells with a discrete color scale. |
| `.plot.VectorField(fn, xDomain, yDomain, options?)` | Draw normalized vectors returned as `[u,v]`. |
| `.plot.ColorScale(options?)` | A portable `rix.color-scale@1` value shared by Plot, Stats, and ComplexViz. |

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

`ColorScale` separates scalar-to-color policy from any renderer. It accepts
`:discrete` palette or `:continuous` HSL modes, optional exact `minimum` and
`maximum` bounds (which must be supplied together), underflow/overflow colors,
and a hue range. Pass the resulting `rix.color-scale@1` map as `colorScale` to
`HeatMap`, `.stats.HistogramGraphic`, or `.complexViz.DomainColoring`; each
consumer retains the same record in its output metadata.

## ODE trajectories

Load `ode` to compute a solution, then pass its `rix.ode.solution@1` record to
`.plot.Trajectory(solution,options?)`. Plot itself does not load or rerun an ODE
solver. The time axis covers the entire requested interval, including a backward
interval; records retain solver traversal order. `component` selects a one-based
state coordinate (default 1), with the corresponding state name as the y label.

Blue rectangles show each accepted certified segment's **whole tube**. Plot
does not interpolate endpoint intervals into a supposedly certified band or
invent a central solution curve. Orange lines show approximate segments using
their existing linear dense-output convention. Gray shading marks uncomputed
time, failed source segments, or omitted time after a display budget is reached.
No line bridges a gap. A failed tube is not drawn as a solution.

`maxSegments` defaults to 1000 and accepts any positive safe integer. It limits
the prefix inspected/drawn, not solver work; truncation is explicit in metadata
and shading. `tickCount` defaults to 5, `maxTicks` to 20 (caller-adjustable), and
`tickDigits` to 3. Tick labels use bounded decimal approximations when inexact
(a trailing `?` marks an inexact prefix); exact labels may retain rational
notation. Retained coordinates and bounds stay rational. Standard
`size`, `margin` (default 64), title and axis labels apply. Linear axes are
required, x-domain cropping is rejected, and a supplied `yDomain` must contain
all displayed enclosures. This prevents a view option from hiding unfinished time.

The `rix.plot@1` metadata records `kind=:trajectory`, per-segment bounds and
source evidence, source method/status, selected component, requested/displayed
intervals, budgets, stable hit identities, and unresolved reasons. The evidence
interpretation is `:retainedSourceEvidence`: Plot trusts the supplied ODE record
and adds **no independent certification**, particularly for externally constructed
or modified records. Certified tubes remain Graphics rectangles, not ordinary
line series. Linked components, event overlays, and Scene3D trajectory adapters
remain separate follow-on work.

### Phase portraits

`.plot.PhasePortrait(solution,{= xComponent=1,yComponent=2 })` plots two distinct
one-based state components, rather than time against one component. Defaults
are components 1 and 2, so a vector IVP is required. A single solution produces
a trajectory portrait, not the entire system's phase flow.

Each blue box is the Cartesian projection of an accepted segment's **whole
certified tube** onto the selected coordinates. It encloses the trajectory but
does not claim every point in the box is reachable, retain cross-coordinate
correlations, or identify a unique curve through the box. Orange paths join
approximate segment endpoints in solver traversal order, including backward
integration. Plot adds no certification to either source.

The same `maxSegments`, `tickCount`, `maxTicks`, `tickDigits`, size, margin, and
label options apply as for `Trajectory`. Both axes must be linear; optional
`xDomain` and `yDomain` must contain the displayed bounds. Constant coordinates
get a nonzero automatic viewing span. Axis labels default to selected state
names. No solver is called and no source record is mutated.

Missing or budget-omitted time is retained in `unresolvedRegions` and marked by
a visible partial-coverage warning, **not shaded in state space**: its location
is unknown. `status=:partial` takes precedence over approximate/enclosed status.
Metadata uses `kind=:phase_portrait`, `rendering=:odeProjectedTubeBoxes`, selected
`xComponent`/`yComponent` in evidence, and exact `xLow`, `xHigh`, `low`, `high`,
`xStart`, `xEnd`, state endpoints, and oriented times in each record. Stable
segment hit IDs remain `trajectory-N`; the warning is `phase-uncomputed`.

### Event overlays

Pass one result from `solution.IsolateEvents()` to
`.plot.EventTrajectory(result,options?)` or
`.plot.EventPhasePortrait(result,options?)`. The plot uses the solution retained
inside that result, so an event cannot accidentally be attached to a different
solution argument. No event analysis or solver is rerun.

Green overlays label `certifiedUniqueEvent`, orange `observedCandidate`, and
amber unresolved candidates. Time plots show event-time bands (a line for an
exact time). Phase plots outline the **whole source segment's** state bounds;
these are not a newly tightened event-state enclosure. Approximate state bounds
remain approximate. Labels and metadata retain the original classification and
evidence; the plot does not verify externally constructed records.

`maxEvents` defaults to 100, is a caller-adjustable positive safe integer, and
counts all candidates. Exceeding it errors rather than silently dropping events.
Events outside the `maxSegments` displayed prefix are not drawn. Metadata
`eventDisplay` reports candidate/displayed counts and the budget;
`eventOverlays` retains each displayed candidate, name, and spatial interpretation.
Exclusions are not event markers, and an unresolved candidate proves neither
existence nor uniqueness. Use separate result views for different event functions.

### Linked component views

`LinkedTrajectory(solution,{= components=[1,2],phaseComponents=[1,2] })`
composes one portable Graphic containing two time plots and a phase portrait.
`components` defaults to `[1]`; `phaseComponents` defaults to `[]` (no phase
panel), or must contain two distinct valid components. At least one panel is
required. `columns` defaults to 2 and `maxPanels` to 8; both are adjustable
positive integers with columns at most maxPanels. `size` applies per panel.
The usual solver-segment and tick display budgets apply separately per panel.

Selecting a segment through the Graphics viewer's pointer or keyboard controls
highlights its peers across every panel. `LinkedEvents(result,options)` also
links the corresponding event overlays, using the result's own solution.
Only explicit links within this Graphic participate: other worksheet outputs
are not coupled. All panels share the viewport's pan/zoom controls. This first
increment supports time scrubbing as well as discrete segment selection.
It never draws a selected exact point inside a certified tube.

The slider visits rational times across increasing physical time, including
backward solutions. `scrubSteps` defaults to 1000; a separate exact-time input
accepts rational times outside that slider grid. Certified queries return the
containing segment's whole tube, not a tightened Taylor query. Approximate
queries use exact rational arithmetic on stored linear endpoints. Shared
endpoints use the first matching segment in solver traversal order, as `At`
does. Missing/omitted/out-of-range times clear marks and report uncomputed.

`maxScrubWork` (10000) counts visited panels and records per query;
`maxScrubDigits` (1000) bounds rational input/intermediate string lengths.
All three limits are adjustable positive safe integers. Exceeding a budget
reports an unavailable query, never extrapolation. No callback, solver,
refinement, or external service runs. Red screen marks are display projections;
exact rational readouts and retained evidence remain authoritative. Metadata
`scrub` stores policy/budgets and `panelViews` stores projection bounds.

Metadata schema `rix.plot.linked-trajectory@1` contains `panels` (each panel's
exact records, evidence, coverage and overlays), `components`, `phaseComponents`,
`columns`, `maxPanels`, and `linkedSelection` arrays of semantic IDs. Panel IDs
are prefixed `panel-N-`; unlinked plots keep their existing IDs. Selection
retains a focused ID and all linked IDs in `rix.selection@1`. Static SVG keeps
the layout and identities, but browser interaction requires the Graphics host.

## Dependencies

It depends on the portable `rix.numerics@1` service and requests no external
permissions. It is deliberately separate from the SVG renderer: plotting
describes a scene; a renderer chooses how to paint it.

See [tutorial.md](tutorial.md).
