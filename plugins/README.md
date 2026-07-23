# RiX plugins

This directory contains first-party RiX plugin packages and specifications.
An implemented package owns its machine-readable entry point, implementation
files, reference README, and a small tutorial suitable for the RiX Web tutorial
series. A specification-only directory has no discoverable manifest until it
can actually be loaded.

The proposed package architecture, mathematical service relationships, scene
layers, and renderer contracts are specified in
[Plugin System Design Specification](design-spec.md).

| Package | Kind | Public load ID | Purpose |
| --- | --- | --- | --- |
| `draw/` | host | `draw` | Convenient 2D scene authoring helpers. |
| `plot/` | host | `plot` | Portable plot constructors that lower to core graphics. |
| `float/` | host | `float` | IEEE-754 Float conversion and approximate math. |
| `oracle/` | specification | `oracle` (proposed) | Rational-betweenness oracle real numbers based on the project paper. |

Plugin discovery reads only a leading `/** ... **/` metadata header from
`*.plugin.rix` and `*.plugin.rix.js`. A host must explicitly approve a
JavaScript plugin installer. RiX plugins are evaluated only when a user calls
`.Plugin.Load(id)`.

Core output values—such as `.Graphics`, `.Table`, and `.Fragment`—do not live
here. Plugins construct or extend those portable core values. Complete teaching
packages live separately in [`rix/examples/plugins/`](../examples/plugins/README.md).
