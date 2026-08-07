# `.png`

Rasterizes a core `.Graphics.Graphic` or graphic `.Figure` to PNG at an
explicit `width`/`height` or integer/rational `scale`. The portable plugin owns
SVG lowering; the host supplies an approved rasterizer. The CLI tries
`rsvg-convert` and then ImageMagick and records the toolchain.

Use `.png.Render(graphic, {= scale=2 })` in a capable host or
`.Out("diagram.png", graphic)` with the CLI. Browser hosts without an adapter
produce `png-rasterizer-unavailable` rather than fake bytes.
