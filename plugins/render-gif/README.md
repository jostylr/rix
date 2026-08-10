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
own `duration` is treated as total duration and divided evenly. `delays=[...]`
overrides it with one seconds value per frame. GIF delays are recorded as
integer centiseconds; `loop=0` means forever.

Phase 1 accepts frames that resolve to one `Graphic` or graphic `Figure`. It
delegates each to `.png`, then invokes ImageMagick in the CLI host. Browser
hosts install the discoverable contract but report `gif-encoder-unavailable`.
This is an explicit host boundary: the renderer declares `process` and `files`
permissions, uses a temporary directory under `cwd/tmp`, and removes it after
encoding.
