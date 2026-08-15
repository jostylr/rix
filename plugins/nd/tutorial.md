---
title: Project a tesseract exactly
description: Rotate 4D geometry with a rational Cayley parameter and explicitly project it to a 3D scene.
theme: Graphics and geometry
status: implemented
plugin: nd
---

## Four dimensions are not implicitly three

`CoordinateProjection` names the information being discarded. The Cayley
rotation and affine projection remain exact; only the final camera snapshot is
numeric.

```rix
.Plugin.Load("nd");
.Plugin.Load("scene3d");
tesseract := .nd.Hypercube(4, 2);
rotation := .nd.CayleyRotation(4, 1, 4, 1/3);
xyz := .nd.CoordinateProjection(4, [1,2,3]);
projected := .nd.Project(tesseract, .nd.Compose(xyz, rotation));
camera := .scene3d.OrthographicCamera([4,4,3], [0,0,0]);
scene := .nd.ToScene3D(projected, {=
    camera=camera,
    style={= color="#7c3aed", width=2 }
});
.scene3d.Snapshot(scene, {= size=[560,400] })["value"];
```

Calling `ToScene3D` on the original 4D value fails and asks for an explicit
projection. Slicing and projection are kept as separate concepts; phase 1
implements the affine projection path.

The projective endpoint of a Cayley parameter is also ordinary RiX code:

```rix
halfTurn := .nd.CayleyRotation(4, 1, 4, .Complex[:infinity]);
halfTurn["matrix"][1];
```
