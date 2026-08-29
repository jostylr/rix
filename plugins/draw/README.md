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
| `.draw.From(value, options?)` | Adapt a drawable protocol or supported geometry record to Graphics. |
| `.draw.Trim(path, start, end)` | Point-based path trimmed to fractional arc-length bounds. |
| `.draw.Marker(path, at, marker?, style?)` | Circle, label, or reusable symbol placed by fractional arc length. |
| `.draw.Symbol(name, children, options?)` | Portable reusable `rix.draw.symbol@1` scene fragment. |
| `.draw.UseSymbol(symbol, position, options?)` | Translated instance of a reusable symbol. |
| `.draw.PlaceLabels(labels, options?)` | Deterministic collision-aware label group with layout metadata. |

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

## Constraint-aware authoring

`From` is a schema adapter and does not import `.geometry`. It accepts the
small `rix.draw.geometry@1` protocol (`kind` plus ordinary coordinate fields)
and the structurally equivalent `rix.geometry@1`, intersection, and uncertain
point records. Points, segments, polygons, and circles lower directly;
unsupported finite geometry and unresolved intersections become a visible red
diagnostic group instead of disappearing. Every unresolved adapter result
retains `rix.draw.adapter-result@1` metadata with the source uncertainty.

`Trim` and `Marker` measure a point-based path by segment length. Their
fractions are bounded to `[0,1]`, and zero-length paths fail explicitly.
`Symbol` stores only portable Graphics children and an anchor; `UseSymbol`
creates an ordinary Graphics transform, so no global symbol registry or hidden
renderer state is required.

`PlaceLabels` tries a deterministic list of offsets using drafting text bounds.
Its `rix.draw.label-layout@1` metadata reports every chosen position and any
labels that could not be separated. Exact font collision remains a renderer
responsibility, but unresolved drafting collisions stay inspectable.

## Dependencies

The package depends only on core graphics constructors and `@ratmath/core` for
metadata. It requests no host permissions.

See [tutorial.md](tutorial.md).
