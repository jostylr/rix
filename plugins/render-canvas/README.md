# `.canvas`

Traverses core `.Graphics` into a deterministic `rix.canvas-plan@1` JSON plan.
The plan is a portable description of `CanvasRenderingContext2D` operations,
not a second scene type. Browser hosts can execute it with
`paintCanvasPlan(context, plan)` from `canvas-plan.js`.

Use `.canvas.Render(graphic)` or `.Out("name.canvas.json", graphic)`.

Phase 2 plans retain the compatible `rix.canvas-plan@1` schema and add
`phase=2`, logical and backing-store dimensions, a positive device pixel
ratio, shared `rix.viewport@1`/`rix.selection@1` records, semantic hit regions,
dirty regions, deferred asset declarations, and a DOM/text accessibility
companion. `invertCanvasPoint` maps CSS pointer coordinates back through the
viewport, while `hitTestCanvasPlan` returns the topmost stable semantic ID.
`loadCanvasAssets` requires an explicit host callback, so the evaluator never
gains ambient filesystem or network access.

A `rix.scene3d.snapshot@1` result is also accepted directly. Canvas consumes
its projected Graphic while preserving the Scene3D source and picking maps in
the plan's `scene3d` field:

```rix
snapshot := .scene3d.Snapshot(scene, {= size=[640,480] });
.canvas.Render(snapshot);
```

Reactive hosts should retain the Graphic, regenerate a plan only after a
semantic change, and replay it into the same canvas context. Plan creation and
painting are linear in command count. The browser integration tests exercise
the public executor with serialized rectangle and circle commands.

## Retained host rendering and workers

Import `createCanvasPainter` from `retained-canvas.js` (also re-exported by
`canvas.plugin.rix.js`). One painter owns one 2D context:

```js
const painter = createCanvasPainter(canvas.getContext('2d'));
painter.paint(plan);       // {mode: 'full'|'dirty'|'unchanged', commands, dirty?}
painter.paint(nextPlan);
painter.dispose();
```

SVG path strings use an LRU `Path2D` cache keyed by geometry, so paint style
changes reuse paths and geometry changes invalidate them. Defaults retain at
most 512 paths and one million source code units. Cache statistics expose hits,
misses, entries, retained source length and evictions. Cache limits can be
lowered or raised to 4096 entries/four million code units. Native path memory is
browser-owned; these bounds do not claim process memory isolation.

For flat rectangles/circles under an identity viewport, edits/removals clear
and clip the union of old/new padded bounds and replay intersecting marks in
original order. Stroke padding includes antialias margins; the dirty union
also includes every circle/stroked mark and snaps outward to device pixels so
clips do not cut their antialiased rasterization. Paths, text,
transforms, clips and changed viewport/dimensions conservatively repaint the
whole scene with cached paths. Unchanged visual commands skip painting;
accessibility/hit-region companions remain the current plan's data, which the
host must refresh independently of the visual return mode. Metadata never
gets replaced by downsampled pixels. A private snapshot detects callers'
in-place edits. Dimension changes invalidate retained state. Call
`painter.invalidate()` after context restoration or an external same-size
canvas reset (canvas setters do not expose a reset generation).

Preflight rejects plans before clearing the previous frame: 100,000 commands,
8192 per backing dimension, 16,777,216 pixels, device ratio at most 16, one
million code units per path/four million total path and text code units,
100,000 per text mark, 256 save levels, and finite geometry/styles. These are
cooperative host limits. `maxCommands` may lower the command budget. Retained
painting uses approximate browser coordinates; exact/evidence source records
and semantic/accessibility companions remain in the portable plan.

OffscreenCanvas is opt-in host execution. A host should test
`canvas.transferControlToOffscreen`, `Worker`, and worker-side 2D/`Path2D`
support **before transferring** its visible canvas. In its explicitly created
module worker:

```js
import { createCanvasWorkerHandler } from './retained-canvas.js';
self.onmessage = createCanvasWorkerHandler({postMessage: value => self.postMessage(value)});
```

Send `{type:'init', canvas: offscreen}` with the canvas transfer list, then
`{type:'paint', id, plan}`. Replies are `{type:'painted', id, result,
accessibility, hitRegions}` or `{type:'error', id, message}`. Hosts keep semantic
DOM/accessibility and pointer mapping on the main thread and correlate reply
IDs to the newest requested frame. Send `{type:'dispose'}` before terminating.
This handler performs no ambient I/O and starts no workers itself. Unsupported
workers use the same main-thread painter; missing Canvas/Path2D uses the
existing static SVG renderer and text companion. If a worker fails after
transfer, replace the transferred canvas element before main-thread fallback.

`bun scripts/bench-render-performance.js` reproduces the versioned
`benchmarks/render-performance-baseline.json`. Its CPU-only instrumented host
isolates source parsing/replay: 200 paths ×100 points ×30 style-changing frames
reduced path construction from 6000 to 200 while retaining the same checksum.
Timings are illustrative, not browser/GPU claims. Real Chromium pixel, worker,
and fallback acceptance is in `scripts/check-render-performance-browser.js`.
