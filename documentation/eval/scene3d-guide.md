# Retained 3D and n-dimensional projection

RiX keeps three distinct representations instead of treating a display as the
mathematical object:

```text
exact n-dimensional geometry -> explicit projection -> retained Scene3D -> Snapshot Graphic or glTF
```

The bundled `nd`, `scene3d`, and `gltf` plugins implement the first bounded
slice of that pipeline. They are browser-safe and opt-in.

## Scene3D values

`.scene3d.Scene` is an immutable `output` value with schema `rix.scene3d@1`.
Coordinates and 4×4 transforms remain exact RiX integers or rationals until a
camera snapshot or target exporter needs numeric coordinates. The internal
coordinate convention is right-handed and Z-up.

```rix
.Plugin.Load("scene3d");

mesh := .scene3d.Mesh(
    [[0,0,0], [1,0,0], [0,1,0]],
    [[1,2,3]],
    {= color="#275dad", opacity=4/5 }
);
camera := .scene3d.PerspectiveCamera([4,4,3], [0,0,0], {=
    up=[0,0,1], fov=50, near=1/100, far=1000
});
scene := .scene3d.Scene([mesh], {= camera=camera });
```

Initial constructors are:

| Constructor | Contract |
| --- | --- |
| `Scene(children, options?)` | Retained root with `camera`, optional `lights`, and metadata. |
| `Group(children, options?)` | Ordered retained children. |
| `Transform(children, options?)` | Exact flat row-major 4×4 `matrix`, or `translate`/`scale`. |
| `Mesh(vertices, triangles, options?)` | Exact 3-vectors and 1-based triangle indices. |
| `Polyline(points, options?)` | Exact 3-vectors; `closed=1` optionally closes it. |
| `PointCloud(points, options?)` | Exact 3-vectors with display `radius`. |
| `Material(options)` | `color`, `opacity`, and wire width hints. A material may be passed in node options. |
| `AmbientLight(color?, intensity?)` | Retained uniform light contribution. |
| `DirectionalLight(direction, options?)` | Retained exact direction with hexadecimal `color` and exact `intensity`. |
| `PointLight(position, options?)` | Retained exact position with hexadecimal `color` and exact `intensity`. |
| `PerspectiveCamera(position, target, options?)` | `up`, degree `fov`, `near`, and `far`. |
| `OrthographicCamera(position, target, options?)` | Automatic fit, or explicit vertical `scale`. |

The initial schema intentionally contains realized geometry. Parametric and
implicit surfaces will be adaptive producers of meshes rather than adding
unevaluated functions to interchange files.

## Deterministic snapshots

`.scene3d.Snapshot` projects a retained scene into core `.Graphics`. Phase 1
implements explicitly named `wireframe` and `lit` modes. Wireframe clips
perspective segments against the camera's near/far planes. Lit mode uses
deterministic flat Lambert shading and painter's ordering for mesh triangles;
it does not claim certified hidden-surface removal, shadows, triangle clipping,
or tessellation.

```rix
snapshot := .scene3d.Snapshot(scene, {=
    size=[640,480],
    mode="wireframe"
});
graphic := snapshot["value"];
```

Lights remain retained scene nodes and affect only an explicitly requested lit
snapshot. A wireframe snapshot reports that it ignored present lights instead
of silently changing its line rendering.

The result is an adaptive-result map with `value`, `resolved`, `uncertainty`,
`work`, `source`, and `diagnostics`. `value` is a normal Graphic and therefore
works unchanged with SVG, Canvas, TikZ, and PNG.

## Exact n-dimensional projections

`.nd` provides `Point`, `Polyline`, `Polytope`, and `Hypercube` geometry under
schema `rix.nd@1`. A projection is a separate `rix.nd.projection@1` value with
source/target dimensions, exact matrix, exact offset, method, and provenance.
No operation silently discards coordinates.

```rix
.Plugin.Load("nd");

tesseract := .nd.Hypercube(4, 2);
rotation := .nd.CayleyRotation(4, 1, 4, 1/3);
xyz := .nd.CoordinateProjection(4, [1,2,3]);
projected := .nd.Project(tesseract, .nd.Compose(xyz, rotation));
scene := .nd.ToScene3D(projected);
```

`Projection(matrix, offset?, options?)` constructs an exact affine map.
`CoordinateProjection(sourceDimension, axes)` uses 1-based axes.
`CayleyRotation(dimension, axis1, axis2, t)` uses the rational
parameterization `cos=(1-t²)/(1+t²)` and `sin=2t/(1+t²)`; the core Cayley
`Infinity` value denotes the half-turn. `Compose(after, before)` means “apply
before, then after.” `ToScene3D` requires dimension 3 and reports an error if
the caller has not explicitly projected first.

Projection, slice, fiber, and marginalization remain different notions. This
slice implements affine projection; sections/slices and fibers remain future
operations and will not be aliases for `Project`.

## glTF export

The `gltf` renderer accepts `Scene3D`, converts Z-up coordinates to glTF's
right-handed Y-up convention, and writes glTF 2.0 JSON with an embedded base64
buffer. Mesh triangles, line primitives, point primitives, basic colors, and
opacity are exported. Exact positions are rounded to Float32 only here and a
`gltf-float32-approximation` diagnostic records the loss when applicable.

```rix
.Plugin.Load("gltf");
result := .gltf.Render(scene);
.Out("scene.gltf", scene);
```

Phase 1 does not export retained lights, camera nodes, textures, animation, or
GLB. glTF line width is not portable and is reported as an informational
diagnostic.

## Runnable 4D example

From `rix/`:

```bash
bun bin/rix.js --out=tmp/tesseract-out examples/geometry/tesseract.rix
```

This creates `tesseract.svg` from a deterministic wireframe snapshot and
`tesseract.gltf` from the same retained 3D scene. The corresponding RiX Web
tutorials run the browser-safe parts directly.
