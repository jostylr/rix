# `.png`

Rasterizes a core `.Graphics.Graphic`, graphic `.Figure`, or versioned
`rix.scene3d.snapshot@1` to PNG at an
explicit `width`/`height` or integer/rational `scale`. The portable plugin owns
SVG lowering; the host supplies an approved rasterizer. The CLI tries
`rsvg-convert` and then ImageMagick and records the toolchain.

Use `.png.Render(graphic, {= scale=2 })` in a capable host or
`.Out("diagram.png", graphic)` with the CLI. Browser hosts without an adapter
produce `png-rasterizer-unavailable` rather than fake bytes.

Passing the whole Scene3D snapshot, rather than only `snapshot["value"]`, keeps
its schema and source projection record in the PNG result metadata.

PNG inherits SVG's outward-safe coordinate policy. `precision` and `rounding`
are forwarded to `rix.svg.coordinate-lowering@1`; exact intervals and certified
approximations are minimally dilated before rasterization so the pixels do not
claim a narrower result than the source evidence. Float coordinates remain
ordinary approximate raster inputs.

The Phase 1 visual fixture is
[`polynomial-transparency.rix`](../../examples/renderers/polynomial-transparency.rix).
Tests rasterize its translucent polynomial annotation with both librsvg and
ImageMagick when available and compare the results with a version-tolerant
visual threshold.
