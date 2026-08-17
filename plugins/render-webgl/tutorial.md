---
title: Execute a retained Scene3D scene with WebGL
description: Lower exact retained 3D geometry to a versioned browser-safe GPU plan.
theme: Renderers and exporters
status: implemented
plugin: webgl
---

## Executable WebGL Scene3D plans

Load the retained 3D scene model and its WebGL host renderer.

```rix
.Plugin.Load("scene3d");
.Plugin.Load("webgl");
```

Create a pickable scene and inspect the versioned plan.

```rix
scene := .scene3d.Scene([
    .scene3d.Mesh(
        [[0,0,0],[1,0,0],[0,1,0]],
        [[1,2,3]],
        {= color="#2563eb", id="triangle", label="Exact triangle" }
    ),
    .scene3d.Annotation([0,0,0], "origin", {= id="origin" })
]);
rendered := .webgl.Render(scene, {= width=640, height=480 });
[rendered.Get("target"), rendered.Get("mime"), rendered.Get("metadata")];
```

The result content is `rix.webgl-plan@1` JSON. A browser host passes that plan
to `paintWebGLPlan`; the return value includes projected annotation overlays and
the picking table keyed by the retained Scene3D IDs.
