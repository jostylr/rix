# `.svg`

Renders a core `.Graphics.Graphic` or graphic `.Figure` to deterministic,
standalone SVG. Paths, curve commands, transforms, groups, rectangular clips,
text, rectangles, circles, and static/interactive drag-point metadata are
preserved. `alt` adds an accessible title/label.

Use `.svg.Render(graphic, options?)`, generic `.Render(graphic, "svg", options?)`,
or `.Out("name.svg", graphic)` after loading the plugin.

Phase 2 coordinate lowering is explicit and outward-safe. `precision` selects
0–30 decimal places and `rounding` is `"nearest"`, `"floor"`, `"ceil"`, or
`"truncate"`. The RenderResult metadata contains a
`rix.svg.coordinate-lowering@1` record with every original exact value, its
lowered text, and outward decimal bounds. Diagnostics report approximations
and distinct exact coordinates that collide after lowering.

Exact rationals, exact intervals, and certified approximations are guaranteed
to remain inside the rendered geometry. When decimalization moves or narrows
geometry, the SVG adds the smallest computed `feMorphology` dilation covering
coordinate, extent, radius, and transform error, and records that radius.
Native JavaScript Float coordinates use ordinary target rounding and do not
claim a certified enclosure.
