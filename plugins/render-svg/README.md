# `.svg`

`{= optimize=1 }` enables conservative deterministic source optimization after
certified coordinate lowering. It compacts path syntax, uses equivalent
horizontal/vertical commands without removing vertices, and shares identical
gradient definitions through references while retaining every definition ID.
Style, semantic IDs, marker vertices, exact coordinate metadata, and diagnostics
are unchanged. `metadata.optimization` reports the `rix.svg.optimization@1`
schema and counts. Optimization is opt-in so editable source remains stable by
default.

Renders a core `.Graphics.Graphic` or graphic `.Figure` to deterministic,
standalone SVG. Paths, curve commands, transforms, groups, rectangular clips,
text, rectangles, circles, and static/interactive drag-point metadata are
preserved. `alt` adds an accessible title/label.

Phase 2 also supports inherited group styles, stable `id`/`class` attributes,
deduplicated linear gradients, dot/stripe/grid patterns, opacity masks, and
arrow/circle/square/diamond path markers. Definition IDs are hashes of their
normalized specifications, so identical definitions are reused and remain
stable when unrelated siblings are inserted. Text uses `fontPolicy="system"`
(the default), `"generic"`, or `"none"`; substitutions and omissions are
reported.

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

The renderer also returns the shared `rix.viewport@1` and `rix.selection@1`
records in metadata. These are the same records used by Canvas, allowing a host
to preserve pan, zoom, focus, and selected semantic IDs when switching targets.

Unsupported scene features are never dropped. Unknown Graphics node kinds,
unknown Path commands, and style properties outside the documented Graphics
style contract raise an `UnsupportedRenderError` with a stable scene path and
an `svg-unsupported-*` code. The renderer registry can use that failure to try
an explicitly requested fallback; a successful fallback retains the SVG
failure as a structured diagnostic. SVG-backed PNG uses the same validation
before invoking its rasterizer.
