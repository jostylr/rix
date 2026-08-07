# `.canvas`

Traverses core `.Graphics` into a deterministic `rix.canvas-plan@1` JSON plan.
The plan is a portable description of `CanvasRenderingContext2D` operations,
not a second scene type. Browser hosts can execute it with
`paintCanvasPlan(context, plan)` from `canvas-plan.js`.

Use `.canvas.Render(graphic)` or `.Out("name.canvas.json", graphic)`.
