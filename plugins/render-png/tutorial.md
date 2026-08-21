---
title: Prepare a PNG snapshot
description: Build the portable Graphics value used by the host PNG rasterizer.
theme: Renderers and exporters
status: implemented
plugin: png
---

## Inspect the browser contract

PNG lowers the retained Graphic to SVG and then asks its host for a rasterizer.
The browser can load and inspect this contract, but it does not pretend to
spawn `rsvg-convert` or ImageMagick. Calling `.png.Render` here therefore
reports `png-rasterizer-unavailable`.

```rix
.Plugin.Load("png");
scene := .Graphics.Graphic([180, 100], [
    .Graphics.Circle([90, 50], 32, {= fill="#0c7b7f" })
]);
[.Renderer.Info("png").Get("mime"), scene];
```

Use `.png.Render(scene, {= scale=2, dpi=144, background="white" })` in a capable host,
or `.Out("diagram.png", scene)` with the CLI.

- Browser: contract discovery and portable input preview only.
- CLI: requires `rsvg-convert` or ImageMagick's `magick`.
- Size options: `scale`, `dpi`, `width`, and `height`.
- Color options: `background`, `colorProfile="srgb"|"native"|"none"`, and
  `antialiasing="on"|"off"`.
- Asset options: a scalar `metadata` map, `region=[x,y,width,height]`, and a
  document `figure` index or label.

## Prepare a reproducible asset policy

This cell is browser-safe because it constructs and displays the policy rather
than attempting host process execution:

```rix
policy := {=
    dpi=300,
    background="white",
    colorProfile="srgb",
    antialiasing="on",
    metadata={= Title="Circle construction",Author="RiX" },
    region=[40,10,100,80]
};
[scene,policy];
```

At 300 DPI with the default scale, that 100-by-80 logical region becomes
313-by-250 pixels after outward-independent nearest integer sizing. Supplying
only `width` or only `height` preserves the crop's aspect ratio.

## Select a Figure from a document

```rix
report := .Fragment([
    .Figure(scene,"Whole scene","whole","A teal circle"),
    .Figure(.Graphics.Graphic([80,60],[
        .Graphics.Circle([40,30],20,{= fill="#be123c" })
    ]),"Detail","detail","A red detail circle")
]);
[report,"CLI: .png.Render(report,{= figure=\"detail\",dpi=144 })"];
```

A capable host can rasterize either Figure without flattening the whole
document. The PNG result retains the selected label, caption, alternative text,
source dimensions, and normalized byte policy.

The repository's `polynomial-transparency.rix` fixture overlays a half-opacity
annotation on a quadratic curve. Host tests render that same SVG through
librsvg and ImageMagick and compare the visible result with a tolerant metric,
so toolchain upgrades need not preserve incidental PNG bytes.
