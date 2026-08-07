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

Use `.png.Render(scene, {= scale=2, background="white" })` in a capable host,
or `.Out("diagram.png", scene)` with the CLI.

- Browser: contract discovery and portable input preview only.
- CLI: requires `rsvg-convert` or ImageMagick's `magick`.
- Options: `scale`, `width`, `height`, and `background`.
