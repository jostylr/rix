---
title: Retained 3D scenes and snapshots
description: Build exact 3D geometry and lower one camera view to portable Graphics.
theme: Graphics and geometry
status: implemented
plugin: scene3d
---

## Keep the scene, choose a view

The retained scene is right-handed and Z-up. Its coordinates and composed
transforms remain exact. `Realize` exposes that exact primitive stream,
`Project` records the camera approximation policy, and `Snapshot` lowers the
projected records to core Graphics.

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

You can inspect either intermediate contract directly:

```rix
realized := .scene3d.Realize(scene);
projected := .scene3d.Project(scene);
[realized["schema"], projected["approximation"]];
```

## Sample an exact curve and preserve interaction identity

`ParametricCurve` evaluates a bounded number of exact RiX samples and retains
the sampling contract in node metadata. `Axes` is an ordinary group of labeled
Scene3D leaves. Any leaf can carry a stable `id`; the projected picking map
connects it to every visible segment, face, point, or annotation it produced.

`OrbitCamera` uses the rational Cayley parameter `turn`, avoiding trigonometric
approximation in the retained camera position. Try changing `turn` to `1/2`,
`-1/3`, or `.Complex[:infinity]` for the projective half-turn.

```rix
.Plugin.Load("scene3d");
curve := .scene3d.ParametricCurve(
    t -> [2*t-1, 2*t^2-1, t],
    0:1,
    {= samples=17, color="#7c3aed", width=3, id="curve", label="exact parabola" }
);
axes := .scene3d.Axes({= length=2, id="basis" });
note := .scene3d.Annotation([1,1,1], "t = 1", {= id="endpoint", color="#7c3aed" });
camera := .scene3d.OrbitCamera([0,0,1/2], {=
    radius=5, height=2, turn=1/3, projection="perspective", fov=48
});
scene := .scene3d.Scene([axes, curve, note], {= camera=camera });
snapshot := .scene3d.Snapshot(scene, {= size=[520,360] });
[snapshot["value"], snapshot["picking"], camera["orbit"]];
```

The first array item renders as Graphics. The second is portable interaction
metadata, while the third is the reusable `rix.scene3d.orbit@1` description.
Pointer events themselves belong to the browser host rather than the retained
scene.

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
