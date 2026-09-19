---
title: Prepare an animated GIF
description: Turn a deterministic mathematical timeline into host-rasterized GIF frames.
theme: Renderers and exporters
status: implemented
plugin: gif
order: 90
---

## Build the portable timeline

Animation state remains ordinary RiX data. This two-frame derivation changes
the highlighted side of the equation without storing browser or encoder state.

```rix
.Plugin.Load("gif");
frame := (step) -> .Graphics.Graphic([360, 140], [
    .Graphics.Rectangle([0, 0], [360, 140], {= fill="#ffffff" }),
    .Graphics.Text([180, 55], "x² - 1 = (x - 1)(x + 1)", {= anchor=:middle, size=22 }),
    .Graphics.Text([180, 98], step == 1 ?: "difference of squares" ?_ "zeros at -1 and 1", {= anchor=:middle, size=16, fill="#2563eb" })
]);
timeline := .Timeline.Sequence({= duration=2, entries=[{: frame, [1, 2] }] });
[.Renderer.Info("gif").Get("mime"), timeline];
```

Use `.gif.Render(timeline)` in a capable host or
`.Out("derivation.gif", timeline)` with the CLI. The browser can inspect and
preview the timeline but cannot spawn the PNG rasterizer or GIF encoder.

- Inputs: `Slides`, `Timeline`, or `Snapshots` with Graphic frames.
- Options: `duration`, `delays`, `loop`, `width`, `height`, `scale`, and
  `background`.
- CLI tools: `rsvg-convert` or ImageMagick for PNG, then ImageMagick for GIF.

## Keep useful output without an encoder

The same timeline can become a portable HTML contact sheet. Its assets include
one SVG per retained frame plus exact state, caption/semantic tracks, timing,
and coordinate/Scene3D evidence in JSON and text sidecars. Exact per-frame
`frameDurations` are supported; GIF timing is recorded separately in integer
centiseconds.

```rix
.Plugin.Load("gif");
frame := t -> .Figure(.Graphics.Graphic([160,60],[
    .Graphics.Circle([10+140*t,30],5,{= fill="#2563eb" })
]),"Exact trajectory sample","trajectory","A point on an exact trajectory");
timeline := .Timeline.Sequence({= entries=[{: frame,[0,1/3,1] }],frameDurations=[1/4,1/2,3/4] });
sheet := .Render(timeline,"gif-frames");
[sheet.Get("mime"),sheet.Get("metadata")];
```

Write this with `.Out("frames.html",sheet)`. A successful GIF export writes the
same retained SVG/JSON/text assets and a contact sheet next to the animation.
Encoder-generated transitions remain display interpolation rather than extra
certified states.
