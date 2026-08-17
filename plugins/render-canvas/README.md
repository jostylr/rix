# `.canvas`

Traverses core `.Graphics` into a deterministic `rix.canvas-plan@1` JSON plan.
The plan is a portable description of `CanvasRenderingContext2D` operations,
not a second scene type. Browser hosts can execute it with
`paintCanvasPlan(context, plan)` from `canvas-plan.js`.

Use `.canvas.Render(graphic)` or `.Out("name.canvas.json", graphic)`.

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
