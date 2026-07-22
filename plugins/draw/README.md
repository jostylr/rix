# `draw`

`draw` is an optional authoring layer for intrinsic 2D graphics. It does not
introduce a separate drawing value: every command returns a core `.Graphics`
scene node that any renderer may understand.

## Load and use

```rix
.Plugin.Load("draw")

scene := .Graphics.Graphic([600, 320], [
  .draw.Line([0, 0], [10, 5], {= stroke = "steelblue", width = 2 }),
  .draw.Circle([5, 2], 0.5, {= fill = "gold" }),
  .draw.Label([5, 3], "P", {= size = 16 })
])
```

`scene` is a `.Graphics` value; the CLI can provide text fallback while a web
host may render it as SVG. The renderer never needs to know that `draw` made
the children.

## Commands

| Command | Core value produced |
| --- | --- |
| `.draw.Line(from, to, style?)` | `.Graphics.Path` |
| `.draw.Polygon(points, style?)` | Closed `.Graphics.Path` |
| `.draw.Label(position, text, style?)` | `.Graphics.Text` |
| `.draw.Box(origin, size, style?)` | `.Graphics.Rectangle` |
| `.draw.Circle(center, radius, style?)` | `.Graphics.Circle` |

Each command also accepts one `{= ... }` options map with the positional names
shown above.

## Dependencies

The package depends only on core graphics constructors and `@ratmath/core` for
metadata. It requests no host permissions.

See [tutorial.md](tutorial.md).
