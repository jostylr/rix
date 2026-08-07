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
deliberately called `wireframe`: lighting and hidden-line removal are not
silently approximated.
