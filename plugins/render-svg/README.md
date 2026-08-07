# `.svg`

Renders a core `.Graphics.Graphic` or graphic `.Figure` to deterministic,
standalone SVG. Paths, curve commands, transforms, groups, rectangular clips,
text, rectangles, circles, and static/interactive drag-point metadata are
preserved. `alt` adds an accessible title/label.

Use `.svg.Render(graphic, options?)`, generic `.Render(graphic, "svg", options?)`,
or `.Out("name.svg", graphic)` after loading the plugin.
