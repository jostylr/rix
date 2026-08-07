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
| `exact-algebras/` | host | `exact-algebras` | Exact rational quaternion and octonion values. |
| `plot/` | host | `plot` | Portable plot constructors that lower to core graphics. |
| `float/` | host | `float` | IEEE-754 Float conversion and approximate math. |
| `oracle/` | RiX | `oracle` | Phase 1 rational-betweenness oracle values, procedures, validation, and bounded refinement. |
| `render-svg/` | host | `svg` | Core Graphics to accessible SVG. |
| `render-canvas/` | host | `canvas` | Core Graphics to a serializable Canvas 2D plan. |
| `render-tikz/` | host | `tikz` | Core Graphics to editable TikZ/PGF. |
| `render-png/` | host | `png` | Host-rasterized PNG snapshots. |
| `render-markdown/` | host | `markdown` | Portable documents to Markdown. |
| `render-html/` | host | `html` | Portable output trees to standalone HTML. |
| `render-quarto/` | host | `quarto` | Portable documents to Quarto Markdown. |
| `render-latex/` | host | `latex` | Portable documents and figures to LaTeX/TikZ. |
| `render-pdf/` | host | `pdf` | LaTeX-orchestrated PDF output. |

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
