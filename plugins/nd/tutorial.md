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
projection. Slicing and projection remain separate concepts.

The projective endpoint of a Cayley parameter is also ordinary RiX code:

```rix
halfTurn := .nd.CayleyRotation(4, 1, 4, .Complex[:infinity]);
halfTurn["matrix"][1];
```

## Parameterize an affine slice and take an exact section

```rix
.Plugin.Load("nd");
plane := .nd.AffineSlice([0,0,1],[[1,0,0],[0,1,0]]);
square2d := .nd.Polyline([[-1,-1],[1,-1],[1,1],[-1,1]],{= closed=1 });
embedded := plane.Parameterize(square2d);
section := .nd.Section(.nd.Hypercube(3,2),.nd.Hyperplane([0,0,1],0));
{: plane.Parameterize([2,3]),embedded[:dimension],section[:points] };
```

`Section` uses only the supplied vertices and edges. The four returned points
are exact; no unrecorded face connectivity is inferred.

## Evaluate fields and inspect fibers

```rix
.Plugin.Load("nd");
sum := .nd.Field(2,1,(p)->[p[1]+p[2]],{= name="sum" });
domain := .nd.Polyline([[-1,1],[0,0],[1,-1],[1,1]]);
fiber := sum.Fiber([0],domain);
samples := sum.Sample([[-1,-1],[-1,1],[1,-1],[1,1]]);
scene := .nd.ToScene3D(samples);
{: sum.Evaluate([2,3]),fiber[:points],scene };
```

Omit the finite domain to get an explicit implicit-preimage record rather than
an unbounded hidden search.

## Explore a projection family

```rix
.Plugin.Load("nd");
family := .nd.ProjectionFamily(3,2,
  (t)->.nd.Compose(
    .nd.CoordinateProjection(3,[1,2]),
    .nd.CayleyRotation(3,1,2,t)
  ),
  (-1):1
);
{: family.At(0)[:matrix],family.At(1/3)[:matrix],family[:parameterDomain] };
```

Every selected projection is dimension-checked and retains the family and
parameter in its provenance.

## Link projections of a bounded four-dimensional cover

```rix
.Plugin.Load("nd");
.Plugin.Load("calculus");
x := .calculus.Variable(:x); y := .calculus.Variable(:y);
z := .calculus.Variable(:z); w := .calculus.Variable(:w);
region := .nd.ImplicitRegion(x^2+y^2+z^2+w^2-1,
  {= x=(-1):1,y=(-1):1,z=(-1):1,w=(-1):1 },{= maxCells=7 });
.nd.LinkedRegions(region,[.nd.CoordinateProjection(4,[1,2,3]),.nd.CoordinateProjection(4,[1,3,4])],
  {= maxVisibleCells=3,size=[280,210],legendOffset=[0,80] });
```

Selecting a visible cell links its retained source ID in both views. Affine
projection preserves enclosure evidence while allowing overlap and dependence
loss. Unresolved cells and the hull of omitted cells remain visible.
