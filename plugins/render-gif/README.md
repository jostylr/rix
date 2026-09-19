# `.gif`

Expands a core `Slides`, `Timeline`, or `Snapshots` value into ordered PNG
frames and asks an approved host encoder for an animated GIF. It does not
duplicate slide authoring, Graphic rendering, or PNG rasterization.

```rix
.Plugin.Load("gif");
scene := (offset) -> .Graphics.Graphic([240, 120], [
    .Graphics.Circle([40 + offset, 60], 18, {= fill="#2563eb" })
]);
timeline := .Timeline.Sequence({= duration=1, entries=[{: scene, [0, 140] }] });
.gif.Render(timeline);
```

`duration` is seconds per frame for ordinary Slides/Snapshots. A Timeline's
own `duration` is treated as total duration and divided evenly; its exact
`frameDurations` are respected when present. `delays=[...]`
overrides it with one seconds value per frame. GIF delays are recorded as
integer centiseconds; `loop=0` means forever.

Phase 1 accepts frames that resolve to one `Graphic` or graphic `Figure`. It
delegates each to `.png`, then invokes ImageMagick in the CLI host. Browser
hosts install the discoverable contract but report `gif-encoder-unavailable`.
This is an explicit host boundary: the renderer declares `process` and `files`
permissions, uses a temporary directory under `cwd/tmp`, and removes it after
encoding.

Phase 2 adds `none` and ImageMagick-backed `crossfade` transition policies,
explicit transition-frame counts, global/local/adaptive palettes, and
none/Floyd–Steinberg/ordered dithering. Per-slide metadata durations still win
over the default. Scene3D orbit animations are ordinary `Snapshots` containing
projected `scene3d_snapshot` values.

## Retained frames, captions, and evidence

Every GIF now returns assets in a deterministic `animation-<content-id>/`
directory: `manifest.json`, `captions.txt`, `frame-0001.svg` (and following
frames), and `contact-sheet.html`. The CLI writes these alongside the GIF.
The `rix.animation-export@1` manifest includes exact requested durations, actual
centisecond delays/start times, exact state and origin, caption/narration/formula
tracks, retained Graphics, coordinate-lowering diagnostics, and Scene3D
projection/evidence where available. Transition frames are encoder display
interpolations; the source frames and evidence remain distinct.

The portable `gif-frames` target is installed with the plugin and needs no
encoder or rasterizer:

```rix
.Plugin.Load("gif");
scene := t -> .Figure(.Graphics.Graphic([80,40], [
    .Graphics.Circle([10+60*t,20],5,{= fill="#2563eb" })
]), "Exact sampled trajectory");
timeline := .Timeline.Sequence({= entries=[{: scene,[0,1/3,1] }],frameDurations=[1/4,1/2,3/4] });
sheet := .Render(timeline,"gif-frames");
sheet.Get("metadata");
```

Use `.Out("trajectory-frames.html",sheet)` to write the portable contact sheet
and its assets. It also supports a single retained frame. Ordinary GIF requests
still report `gif-encoder-unavailable` when no approved encoder exists; an HTML
file is never silently substituted for a GIF. Figure descriptions and Graphic
text provide a text fallback; author meaningful captions for non-text geometry.

GIF and `gif-frames` default to at most 1,000 retained frames. The `maxFrames`
option accepts integer limits from 1 through 10,000, checked before frame
expansion or rendering. Retained Graphics and evidence are validated before
lowering with a shared export budget of depth 64, 100,000 visited nodes, and
4,000,000 text characters. Cyclic or oversized evidence fails explicitly;
increasing the frame limit does not disable these evidence limits.
