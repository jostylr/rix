# `.tikz`

Exports core `.Graphics` paths, cubic/quadratic curves, groups, transforms,
rectangular clips, labels, rectangles, and circles as editable TikZ/PGF.
Coordinates use `x=1pt,y=-1pt` so the scene matches SVG/Canvas orientation.
SVG endpoint-arc commands currently produce an explicit diagnostic instead of
being approximated.

Use `.tikz.Render(graphic)` or `.Out("name.tikz", graphic)`.
