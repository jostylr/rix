# Bounded implicit sets and linked scene views

Load `scene3d`, `nd`, or `complex-viz` for the adapters below. They use the
existing retained Scene3D, Graphics, affine projection, calculus graph, and
quaternion representations. Exact source coordinates and source claims remain
available after projection. Camera projection, shading, Canvas pixels, and
WebGL Float32 coordinates do not acquire a new mathematical certificate.

## Whole-domain implicit covers

`.ImplicitRegion(expression, box, options?)` and
`.nd.ImplicitRegion(expression, box, options?)` classify a finite rational box
in one through eight named coordinates. The default relation is `eq`, meaning
`expression == level`; `le` and `ge` select closed inequalities. `level`
defaults to zero. A whole-cell checked calculus range can establish inclusion
or exclusion. An equality cell is included only when its entire range is the
level. Remaining cells are subdivided or retained as unresolved.

The deterministic breadth-first subdivision splits the widest axis, breaking
ties by sorted variable name. Both closed child boxes cover the full parent
and overlap at the splitting face. The result always retains the complete
original domain in `inside`, `excluded`, and `unresolved`; `pending` is the
unprocessed subset of `unresolved`. Invalid domains, poles, exhausted work,
width limits, and depth limits never disappear or turn into midpoint proofs.
`certified` describes the checked enclosure/cover evidence. It does not prove
roots or topology in unresolved or pending cells; `topology` is `unproved`.

`.ImplicitRegionCheck(result)` / `.nd.CheckRegion(result)` independently replay
classification and exact splitting. `.ImplicitRegionRefine(result, options)` /
`.nd.RefineRegion(...)` first replay, then deterministically recompute using
only changed work limits. They do not accept changed relations or expressions.

| Option | Default | Bound / meaning |
| --- | --- | --- |
| `maxCells` | 127 | 0–4096 processed cells; zero preserves the initial pending box |
| `maxDepth` | 8 | 0–64 split depth |
| `maxWidth` | 1/16 | Nonnegative exact rational; stop at this largest axis width |
| `maxEvidenceText` | 16777216 | Aggregate retained evidence text budget, at most 16 MiB |
| `graphOptions` | empty map | Existing bounded calculus range options |
| `affine` | absent | Explicit source variables, matrix, offset for a parameter section |

Exact components are limited to 4096 decimal digits. Evidence also has the
shared two-million-node / depth-256 bound. The affine graph adapter is bounded
to 4096 visited nodes and depth 32; it requires name-based variables and rejects
scoped identities rather than collapsing them. An input that cannot itself fit
the evidence budget is rejected. Output exhaustion preserves all remaining
whole regions. These are explicit logical budgets, not process memory isolation.

## Scene3D regions, volumes, and trajectories

- `.scene3d.RegionView(region, options?)` replays a three-coordinate region.
- `.scene3d.ImplicitSurface(expression, box, options?)` creates an equality cover
  and its view. Its meshes are **cell boundaries**, not inferred surface triangles.
- `.scene3d.Volume(expression, box, options?)` retains an explicit closed-set
  cover (`le` by default). `VolumeView(volume, options?)` displays it.
- `.scene3d.Slice(volume, axis, coordinate, options?)` checks the source and
  recomputes its coordinate section inside the original domain. The returned
  `region` has a degenerate exact interval on that axis; `RegionView` displays it.
- `.scene3d.CellBox([xInterval,yInterval,zInterval], options?)` retains the eight
  box corners and twelve boundary triangles. Degenerate faces render without
  inventing a surface normal.

Green cells are included, amber cells unresolved, and gray denotes the
conservative hull of omitted display cells. Excluded cells are hidden unless
`showExcluded=1`. `maxVisibleCells` defaults to 64 and is limited to 1–256.
The optional omitted-cell hull is one further twelve-triangle box. All omitted
cell records remain in metadata, and a visible legend explains the mask.
Use `legendOffset=[x,y]` for an exact screen offset of the region or complex
view legend (for example `[0,94]` in a 240-pixel-tall snapshot).
Display omission appears in snapshot uncertainty even when the omitted source
cell was mathematically classified.

`.scene3d.Trajectory(solution, options?)` consumes existing ODE solution records.
Certified source segments display their whole retained tubes; approximate
segments display endpoint paths labeled as approximate. This adapter retains
source certification claims and does **not** independently re-prove an ODE
solution. `axes` selects three entries: `0` is time, a positive index is a state
coordinate, and `_` is a constant zero coordinate. The default is time/state
for one or two state variables and the first three state coordinates otherwise.

`maxSegments` defaults to 128 (1–1024). Omitted segments and an incomplete time
suffix stay in uncertainty with their full time intervals. No spatial enclosure
is invented for an uncomputed suffix. `.scene3d.EventTrajectory(eventResult,
options?)` overlays candidate events on their original source segment tubes;
that display adds no event existence or uniqueness claim. `maxEvents` defaults
to 128 (1–1024). Exceeding it rejects the overlay rather than silently dropping
candidates. Event source records must match the supplied trajectory.

## ND sections and projections

`.nd.ImplicitSlice(expression, sourceVariables, affineSlice, parameterBox,
options?)` substitutes the existing `AffineSlice` inclusion into a calculus
graph. Columns follow the parameter box's sorted variable names. This is a
parameterized section; it does not project away unsupplied constraints.

`.nd.ProjectRegion(region, projection)` replays the source, then encloses each
cell under the exact affine matrix and offset. Projected cells can overlap and
lose dependence. Their source IDs, classifications, whole source cells, and
`topology=:unproved` remain attached. `.nd.RegionScene(projected, options?)`
checks the projected record and displays a two- or three-coordinate enclosure
(the two-coordinate display uses zero for the third coordinate).

`.nd.LinkedRegions(region, projections, options?)` accepts one through eight
projections and composes snapshots with links for the same visible source cell.
The cell and display budgets above remain in effect.

## Complex graph samples in four coordinates

`.complexViz.Graph4D({= fn, points?, domain?, resolution?, maxSamples? })`
retains `(Re z, Im z, Re f, Im f)` at exact input points. Supply `points` as
coordinate pairs, or a rectangular `domain={= re=[lo,hi],im=[lo,hi] }` and a
grid `resolution` (default `[5,5]`, at least two per axis). `maxSamples` defaults
to 1024 and cannot exceed 4096. Values may be exact complex results, existing
complex enclosure records, `Pole()`, or `Unresolved(reason)`.

`Slice4D(spec, affineSlice, parameters)` samples a two-coordinate input affine
section at explicitly supplied parameter vectors. `Project4D(graph, projection,
options?)` makes a two- or three-coordinate Scene3D view. `Linked4D(graph,
options?)` links input and output panels by stable sample ID. A pole has an
input location and an unknown output location: the latter is retained in
uncertainty and the visible legend, with no fabricated output point.

`maxVisibleSamples` defaults to 256 (1–1024); all omitted records survive.
Enclosure samples remain boxes. `coverage=:sampledInputsOnly` and
`unsampledCertified=_` are deliberate: these samples prove no behavior between
sample points, graph connectivity, or branch topology. Existing `DomainColoring`
and `Surface` also now have a `maxSamples` budget (default 4096, hard maximum
16384); surface grids require two or more rows and columns.

## Unit rotations and linked selections

`.scene3d.UnitQuaternion([w,x,y,z])` also accepts the existing Quaternion facade
or a quaternion record's `components`. Each component must be an exact rational,
and the sum of four squares must equal one. `QuaternionTransform(children,q,
options?)` emits the existing exact rigid-transform matrix and preserves its
quaternion evidence through realization, picking, snapshots, and WebGL. An
optional translation is exact; a second matrix or scale is rejected.

`QuaternionBlend(first,last,t)` uses a rational Cayley curve for `0 <= t <= 1`.
It passes both supplied endpoint representatives and has exact unit norm.
It is not SLERP and does not claim constant angular speed. Antipodal quaternion
representatives return `status=:unsupported, reason=:antipodalCayleyPole`;
there is no silent sign flip or substituted rotation path.

`.LinkedViews(views, groups, options?)` accepts core Graphics/Plot graphics and
versioned Scene3D snapshots. `.scene3d.LinkedViews(...)` also snapshots raw
scenes. A group contains selectors such as `{= panel=1,id="cell.r.0" }` (panels
are one-based). A string ID alone must identify exactly one panel. The result
namespaces IDs as `panel.1.original`, transitively merges overlapping groups,
and uses the existing selection host. Selection means explicit retained-object
correspondence; it never changes a mathematical claim. Objects outside the
camera projection retain empty semantic groups, not invented screen positions.

Composition accepts 1–16 panels, up to 4096 selectors total, and 256 per group.
`columns` is 1–16 and `gap` is an exact nonnegative rational (default 16).
Bounded portable metadata is checked before composition and export: depth 64,
100000 nodes, and 4000000 text characters. Cycles and oversized evidence reject
explicitly. SVG embeds escaped inert source evidence; Canvas and WebGL JSON
carry source metadata and picking provenance. TikZ static-frame metadata and
GIF JSON/text sidecars preserve the same evidence and visible uncertainty labels.
Output JSON saves the linked graphic and its exact interval evidence.

The native region functions belong to `Geometry`; `LinkedViews` belongs to
`Graphics`. No new host permissions are introduced.
