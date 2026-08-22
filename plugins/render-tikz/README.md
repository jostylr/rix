# `.tikz`

Exports core `.Graphics` paths, cubic/quadratic curves, groups, transforms,
rectangular clips, labels, rectangles, and circles as editable TikZ/PGF.
Coordinates use `x=1pt,y=-1pt` so ordinary scenes match SVG/Canvas orientation.
Plots carrying `rix.plot@1` semantic metadata lower to native PGFPlots
`axis`, `addplot`, coordinates, ticks, marks, labels, and legends instead of
screen-coordinate paths.

Use `.tikz.Render(graphic)` or `.Out("name.tikz", graphic)`.

## Styles

Equivalent styles are emitted once as `rixStyleN` definitions and reused by
every matching node or series. In addition to the shared `stroke`, `fill`,
`width`, `opacity`, and `dash` fields, TikZ understands:

| Field | Values |
| --- | --- |
| `marker` | `"circle"`, `"openCircle"`, `"square"`, `"openSquare"`, `"triangle"`, `"openTriangle"`, `"diamond"`, `"openDiamond"`, `"cross"`, `"plus"`, or `"none"` |
| `markerSize` | Marker radius in points. |
| `gradient` | `{= from="#dbeafe", to="#2563eb", angle=45 }`. |

Plot styles belong in the plot's `style` map, for example
`{= style={= marker="square", markerSize=2 } }`.

## TeX dependencies

The default result is a fragment and reports its requirements in
`result.Get("metadata")` under the `rix.tikz.dependencies@1` schema. It also
emits an informational `tikz-package-requirements` diagnostic. Choose one of:

- `standalone=1` for a complete document with all required declarations;
- `preamble=1` for package/library declarations followed by the fragment;
- neither option when the surrounding document owns its preamble.

PGFPlots output pins `compat=1.18`. Marker output requests the `plotmarks` TikZ
library. SVG endpoint-arc commands still produce an explicit diagnostic instead
of being approximated.
