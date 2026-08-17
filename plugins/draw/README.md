# `draw`

`draw` is an optional authoring layer for intrinsic 2D graphics. It does not
introduce a separate drawing value: every command returns a core `.Graphics`
scene node that any renderer may understand.

## Load and use

```rix
.Plugin.Load("draw");

scene := .Graphics.Graphic([600, 320], [
  .draw.Line([0, 0], [100, 50], {= stroke = "steelblue", width = 2 }),
  .draw.Circle([10, 2], 0.5, {= fill = "gold" }),
  .draw.Label([20, 3], "P", {= size = 16 })
]);
```

`scene` is a `.Graphics` value; the CLI can provide text fallback while a web
host may render it as SVG. The renderer never needs to know that `draw` made
the children.

## Commands

| Command | Core value produced |
| --- | --- |
| `.draw.Line(from, to, style?)` | `.Graphics.Path` |
| `.draw.Polyline(points, style?)` | Open `.Graphics.Path` |
| `.draw.Polygon(points, style?)` | Closed `.Graphics.Path` |
| `.draw.Arrow(from, to, style?, options?)` | Grouped shaft and arrowhead paths |
| `.draw.Arc(center, radius, startDegrees, endDegrees, style?, samples?)` | Sampled portable path |
| `.draw.Ellipse(center, radii, style?, samples?)` | Closed sampled path |
| `.draw.Dimension(from, to, text?, style?, options?)` | Extension lines, arrows, and label group |
| `.draw.Grid(origin, size, step?, style?)` | Group of horizontal and vertical paths |
| `.draw.Label(position, text, style?)` | `.Graphics.Text` |
| `.draw.Box(origin, size, style?)` | `.Graphics.Rectangle` |
| `.draw.Circle(center, radius, style?)` | `.Graphics.Circle` |

Each command also accepts one `{= ... }` options map with the positional names
shown above.

`Style(base, overrides?)` merges reusable style maps. `Viewport(domain, size,
options?)` creates a data-to-screen transform whose `Point`/`Apply` method maps
coordinates; `ViewportPoint` provides the equivalent namespace call. A domain
is `[xmin,ymin,xmax,ymax]`, and options include `margin` and `flipY`.

`Bounds(value)` computes a drafting bound for point collections and ordinary
Path, Circle, Rectangle, Text, Group, or Graphic values. `Anchor(value,
name, offset?)` returns `center`, cardinal, or corner anchors such as
`"northwest"`. Text bounds are deliberately drafting estimates, since final
font metrics remain renderer-owned.

## Dependencies

The package depends only on core graphics constructors and `@ratmath/core` for
metadata. It requests no host permissions.

See [tutorial.md](tutorial.md).
