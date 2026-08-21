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

## Phase 2 color and asset policy

PNG logical units use the CSS baseline of 96 DPI. With neither `width` nor
`height`, output pixels are `logicalSize * scale * dpi/96`. Supplying one pixel
dimension preserves the selected region's aspect ratio; supplying both chooses
the exact raster dimensions. The Node adapter writes a deterministic PNG
`pHYs` physical-resolution chunk.

```rix
.png.Render(graphic,{=
    dpi=300,
    scale=1,
    background="white",
    colorProfile="srgb",
    antialiasing="on",
    metadata={= Title="Exact construction",Author="RiX" }
});
```

`background` omitted means preserve alpha; a color string composites onto an
opaque background. `colorProfile` is `"srgb"` (the default), `"native"` (retain
the rasterizer's chunks), or `"none"` (remove PNG color-description chunks).
The adapter normalizes these chunks after rasterization, so the recorded policy
does not depend on whether librsvg or ImageMagick ran. `antialiasing` is
`"on"` or `"off"`; disabling it requires ImageMagick because librsvg does not
expose that switch.

`metadata` accepts at most 32 scalar entries. Keys are validated PNG keywords,
values are bounded UTF-8 text, entries are sorted by key, and deterministic
`iTXt` chunks are written after `IHDR`. The render result repeats the normalized
policy under `metadata` for inspection without parsing bytes.

Use `region=[x,y,width,height]` (or an equivalent map) to crop a logical
rectangle inside the source Graphic before rasterization. A document Fragment
may be rendered directly by selecting a graphic Figure with `figure=1` or
`figure="label"`:

```rix
report := .Fragment([
    .Figure(firstGraphic,"Overview","overview","Overview diagram"),
    .Figure(detailGraphic,"Detail","detail","Detailed diagram")
]);
.png.Render(report,{= figure="detail",region=[20,10,200,120],dpi=144 });
```

The result records the selected figure index, label, caption, alternative text,
source size, logical region, pixel dimensions, alpha policy, and embedded
metadata. Invalid regions and invalid selectors fail before invoking
the host rasterizer.

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
