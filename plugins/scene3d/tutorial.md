---
title: Retained 3D scenes and snapshots
description: Build exact 3D geometry and lower one camera view to portable Graphics.
theme: Graphics and geometry
status: implemented
plugin: scene3d
---

## Keep the scene, choose a view

The retained scene is right-handed and Z-up. Its coordinates remain exact;
`Snapshot` owns the numeric camera boundary and returns an adaptive-result map.

```rix
.Plugin.Load("scene3d");
mesh := .scene3d.Mesh(
    [[-1,-1,0], [1,-1,0], [0,1,0], [0,0,2]],
    [[1,2,3], [1,2,4], [2,3,4], [3,1,4]],
    {= color="#275dad", width=2 }
);
camera := .scene3d.PerspectiveCamera([4,4,3], [0,0,1]);
scene := .scene3d.Scene([mesh], {= camera=camera });
.scene3d.Snapshot(scene, {= size=[520,360], mode="wireframe" })["value"];
```

The browser renders the returned core Graphic. The initial mode is
deliberately called `wireframe`: hidden-line removal is not silently
approximated.

## Add retained lights and request a lit view

Ambient, directional, and point lights remain part of the Scene3D value. The
Phase 1 `lit` snapshot uses deterministic flat Lambert shading and painter's
ordering; it does not claim hidden-surface or shadow certification.

```rix
.Plugin.Load("scene3d");
mesh := .scene3d.Mesh(
    [[-1,-1,0], [1,-1,0], [0,1,0]],
    [[1,2,3]],
    {= color="#4080c0" }
);
scene := .scene3d.Scene([mesh], {=
    camera=.scene3d.PerspectiveCamera([3,3,2], [0,0,0]),
    lights=[
        .scene3d.AmbientLight("#ffffff", 1/4),
        .scene3d.DirectionalLight([1,1,-2], {= intensity=3/4 })
    ]
});
.scene3d.Snapshot(scene, {= size=[360,240], mode="lit" })["value"];
```
