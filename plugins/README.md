# RiX plugins

This directory contains first-party RiX plugin packages and specifications.
An implemented package owns its machine-readable entry point, implementation
files, reference README, and a small tutorial suitable for the RiX Web tutorial
series. A specification-only directory has no discoverable manifest until it
can actually be loaded.

The proposed package architecture, mathematical service relationships, scene
layers, and renderer contracts are specified in
[Plugin System Design Specification](design-spec.md).
The implementation order and per-plugin phased work are tracked in
[Plugin Implementation TODO](TODO.md).

| Package | Kind | Public load ID | Purpose |
| --- | --- | --- | --- |
| `draw/` | host | `draw` | Convenient 2D scene authoring helpers. |
| `poly/` | RiX | `poly` | Pure-RiX callable semantic polynomials and exact algorithms; aliases `.polynomial` and `.p`. |
| `algebra/` | RiX | `algebra` | Pure-RiX presentation façade for Polynomial division metadata and synthetic Grids; auto-loads `poly` and `ratfun`. |
| `exact-algebras/` | RiX | `exact-algebras` | Pure-RiX exact rational quaternion and octonion values. |
| `plot/` | host | `plot` | Portable plot constructors that lower to core graphics. |
| `float/` | host | `float` | IEEE-754 Float conversion and approximate math. |
| `ball/` | RiX | `ball` | Pure RiX certified rational midpoint-radius balls and nested square-root refinement. |
| `cauchy/` | RiX | `cauchy` | Pure RiX rational sequences with explicit certified tail bounds and moduli. |
| `continued-fraction/` | RiX | `continued-fraction` | Finite and lazy simple continued fractions; callable aliases `.continuedFraction` and `.cf`. |
| `algebraic-real/` | RiX | `algebraic-real` | Square-free integer polynomials with Sturm-certified isolating intervals; callable aliases `.algebraicReal` and `.ar`. |
| `oracle/` | RiX | `oracle` | Phase 1 rational-betweenness oracle values, procedures, validation, and bounded refinement. |
| `numerics/` | RiX | `numerics` | Backend-neutral bounded enclosure, refinement, and sampling protocol orchestration. |
| `linalg/` | RiX | `linalg` | Pure-RiX exact dense linear algebra, vector spaces, coordinate systems, and coordinate-aware tensor transformations. |
| `optimize/` | RiX | `optimize` | Pure-RiX exact standard-form linear programs and deterministic simplex solving. |
| `solve/` | RiX | `solve` | Pure-RiX exact affine matrix and symbolic-system solving over the linear-algebra service. |
| `radix/` | RiX | `radix` | Pure-RiX bounded exact positional expansions and repeating-period analysis. |
| `fraction/` | RiX | `fraction` | Pure-RiX unreduced Fraction arithmetic and classroom/Farey operations; aliases `.frac` and `.f`. |
| `ratfun/` | RiX | `ratfun` | Pure-RiX canonical callable RationalFunctions; aliases `.rationalFunction` and `.rf`. |
| `fracfun/` | host | `fracfun` | Form-preserving FractionFunctions; aliases `.fractionFunction` and `.ff`. See the migration boundary below. |
| `symbolic/` | RiX | `symbolic` | Pure-RiX meta-plugin loading the formal fraction/function workspace. |
| `geometry/` | host | `geometry` | Exact ruler-and-compass constructions, intersections, and Graphics snapshots. |
| `data/` | host | `data` | Immutable typed relations, deterministic transformations, and portable Table views. |
| `stats/` | RiX | `stats` | Exact descriptive statistics, summary Tables, histograms, and box plots; alias `.statistics`. |
| `stern-brocot/` | RiX | `stern-brocot` | Exact Stern–Brocot navigation, visible-tree records, and rational evaluation helpers. |
| `document/` | host | `document` | Numbered portable reports, cross-references, captions, and small themes. |
| `complex-visualization/` | RiX | `complex-viz` | Exact phase/magnitude domain coloring to portable Graphics; mount `.complexViz`. |
| `scene3d/` | host | `scene3d` | Retained exact 3D scenes and deterministic wireframe snapshots. |
| `nd/` | host | `nd` | Exact N-dimensional geometry and projection into retained 3D scenes. |
| `render-terminal-ascii/` | host | `terminal-ascii` | Strict-ASCII fallback for tables, grids, fragments, and simple Graphics. |
| `render-svg/` | host | `svg` | Core Graphics to accessible SVG. |
| `render-canvas/` | host | `canvas` | Core Graphics to a serializable Canvas 2D plan. |
| `render-tikz/` | host | `tikz` | Core Graphics to editable TikZ/PGF. |
| `render-png/` | host | `png` | Host-rasterized PNG snapshots. |
| `render-markdown/` | host | `markdown` | Portable documents to Markdown. |
| `render-html/` | host | `html` | Portable output trees to standalone HTML. |
| `render-quarto/` | host | `quarto` | Portable documents to Quarto Markdown. |
| `render-latex/` | host | `latex` | Portable documents and figures to LaTeX/TikZ. |
| `render-pdf/` | host | `pdf` | LaTeX-orchestrated PDF output. |
| `render-gif/` | host | `gif` | PNG-frame orchestration and host-encoded animated GIF output. |
| `render-gltf/` | host | `gltf` | Browser-safe glTF 2.0 JSON export for retained Scene3D values. |
| `render-csv/` | host | `csv` | Exact scalar Table/relation export to CSV and TSV dialects. |

The shared renderer contract, format matrix, toolchain boundary, and future 3D
targets are documented in [`renderers/README.md`](renderers/README.md).

Plugin discovery reads only a leading `/** ... **/` metadata header from
`*.plugin.rix` and `*.plugin.rix.js`. A host must explicitly approve a
JavaScript plugin installer. RiX plugins are evaluated only when a user calls
`.Plugin.Load(id)`.

RiX code in every plugin `tutorial.md` must use script syntax: each statement,
including the last expression in a code fence, ends with `;`. The RiX Web test
suite parses these tutorial cells and verifies that no host-specific newline
normalization is needed.

Core output values—such as `.Graphics`, `.Table`, and `.Fragment`—do not live
here. Plugins construct or extend those portable core values. Complete teaching
packages live separately in [`rix/examples/plugins/`](../examples/plugins/README.md).

## RiX/host implementation boundary

Most currently implemented computational exact-number and algebra plugins are
written in RiX. `.linalg`, `.optimize`, and `.solve` now form a pure-RiX exact
stack: coordinate-aware dense linear algebra, primal-simplex optimization, and
affine symbolic solving through the public `.InspectSpec`/`.SpecRoles` boundary.
`.fracfun` remains host-backed for private symbolic-tree work. `.float` remains JavaScript
intentionally so that IEEE-754 behavior is an explicit host boundary. The old
JavaScript implementations for converted packages are retained as non-discoverable
`*.reference.js` comparison sources and are not loaded by the catalog.

`.fracfun` is the remaining computational exception. It preserves two symbolic
expression trees (display form and source-domain evaluation form), clones and
combines private symbolic IR, rewrites closures, and records denominator
restrictions. RiX deliberately has no public raw-IR mutation API yet. The host
implementation therefore remains until a versioned symbolic-expression builder
can expose those operations without making evaluator IR a plugin ABI. Its
canonical projections already use the pure-RiX `.poly` and `.ratfun` values.

Visualization packages are split conceptually into mathematical kernels and
output adapters. Geometry constructions/intersections, plot sampling and
refinement, N-dimensional projections, and Scene3D transforms/projections are
domain mathematics and should move to RiX. Lowering those finite results to
core `.Graphics` or portable Scene3D records can also be RiX once the public
value builders are stable. Only target encoding, browser/GPU interaction,
rasterization, and external tool invocation must remain host adapters. Thus
`.geometry`, `.plot`, `.scene3d`, and `.nd` are conversion candidates even
though their current Phase 1 implementations are host plugins; renderer
plugins remain downstream consumers and do not perform domain mathematics.
