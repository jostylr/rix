---
title: Export Scene3D as glTF
description: Produce browser-safe glTF 2.0 JSON with an embedded geometry buffer.
theme: Renderers and exporters
status: implemented
plugin: gltf
---

## Inspect an embedded glTF asset

The exporter converts RiX's right-handed Z-up coordinates to glTF's
right-handed Y-up coordinates. Geometry is rounded to Float32 only at this
export boundary.

```rix
.Plugin.Load("gltf");
.Plugin.Load("scene3d");
mesh := .scene3d.Mesh(
    [[0,0,0], [2,0,0], [0,2,0], [0,0,2]],
    [[1,2,3], [1,2,4], [2,3,4], [3,1,4]],
    {= color="#0c7b7f", opacity=4/5 }
);
scene := .scene3d.Scene([mesh]);
.gltf.Render(scene).Get("content");
```

The browser can generate and inspect the complete `.gltf` JSON because its
binary buffer is embedded as a data URI. CLI scripts can write it with
`.Out("scene.gltf", scene)`.
