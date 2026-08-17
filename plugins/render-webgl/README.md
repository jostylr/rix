# RiX WebGL renderer

The `webgl` plugin lowers a retained `.scene3d.Scene` to the deterministic
`rix.webgl-plan@1` interchange schema. The plan contains camera, light,
coordinate-system, draw-call, picking, interaction, and annotation data. It is
JSON-serializable and browser-safe.

```rix
.Plugin.Load("scene3d");
.Plugin.Load("webgl");
scene := .scene3d.Scene([
    .scene3d.Mesh([[0,0,0],[1,0,0],[0,1,0]], [[1,2,3]], {= id="face" })
]);
plan := .webgl.Render(scene).Get("content");
```

JavaScript hosts parse `content` and call `paintWebGLPlan(gl, plan)`. The
executor performs the camera transform, submits triangle/line/point draw calls,
and returns screen-space annotation overlays plus the stable picking table.
Text annotations stay outside the GPU pass so hosts can render accessible DOM
or Canvas labels and apply the retained collision/occlusion policy.

WebGL converts exact coordinates to `Float32`. The renderer reports that
boundary, implementation-dependent line widths, and its portable flat-material
baseline as structured diagnostics.
