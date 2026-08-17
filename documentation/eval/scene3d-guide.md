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

Available constructors are:

| Constructor | Contract |
| --- | --- |
| `Scene(children, options?)` | Retained root with `camera`, optional `lights`, and metadata. |
| `Group(children, options?)` | Ordered retained children. |
| `Transform(children, options?)` | Exact flat row-major 4×4 `matrix`, or `translate`/`scale`. |
| `Mesh(vertices, triangles, options?)` | Exact 3-vectors and 1-based triangle indices. |
| `Polyline(points, options?)` | Exact 3-vectors; `closed=1` optionally closes it. |
| `PointCloud(points, options?)` | Exact 3-vectors with display `radius`. |
| `ParametricCurve(curve, domain, options?)` | Bounded exact sampling to a retained polyline; `samples` defaults to 33. |
| `ParametricSurface(surface, uDomain, vDomain, options?)` | Exact midpoint-tested refinement to a conforming triangle mesh, bounded by `maxDepth` and `maxCells`. |
| `Axes(options?)` | Reusable X/Y/Z polylines with optional projected labels and prefixed picking IDs. |
| `Annotation(position, text, options?)` | Retained 3D text lowered to a projected core Graphics text mark. |
| `AnnotationPolicy(options?)` | Screen offset/leader behavior plus retained collision, priority, and occlusion requests. |
| `Interaction(options?)` | Portable event, cursor, tooltip, selection, and payload intent for an identified leaf. |
| `Material(options)` | `color`, `opacity`, and wire width hints. A material may be passed in node options. |
| `AmbientLight(color?, intensity?)` | Retained uniform light contribution. |
| `DirectionalLight(direction, options?)` | Retained exact direction with hexadecimal `color` and exact `intensity`. |
| `PointLight(position, options?)` | Retained exact position with hexadecimal `color` and exact `intensity`. |
| `PerspectiveCamera(position, target, options?)` | `up`, degree `fov`, `near`, and `far`. |
| `OrthographicCamera(position, target, options?)` | Automatic fit, or explicit vertical `scale`. |
| `OrbitCamera(target, options?)` | Perspective or orthographic camera with exact Cayley `turn` and reusable `rix.scene3d.orbit@1` metadata. |

The schema intentionally contains realized geometry. `ParametricCurve`
therefore evaluates its function at construction and records the domain,
sample count, and exact policy as metadata. `ParametricSurface` likewise
evaluates its two-argument function at construction. It doubles a conforming
grid until its exact midpoint-deviation test meets `tolerance` or a bound
stops refinement, then records `rix.scene3d.surface-sampling@1` metadata with
the chosen depth, work, `resolved`, and `limitedBy`. The midpoint test is a
deterministic sampling policy, not a certificate over unsampled points.
Implicit surfaces remain a future bounded producer rather than adding an
unevaluated function to interchange files.

## Orbit descriptions, annotations, and picking

Every mesh, polyline, point cloud, curve, or annotation accepts optional
`id`, `label`, and `metadata` fields. IDs must be unique among realized leaves.
They survive exact hierarchy realization and camera projection:

```rix
curve := .scene3d.ParametricCurve(
    t -> [t, t^2, 0],
    0:1,
    {= samples=9, id="parabola", label="y = x²" }
);
note := .scene3d.Annotation([1,1,0], "endpoint", {= id="endpoint" });
camera := .scene3d.OrbitCamera([0,0,0], {=
    radius=5, height=2, turn=1/3, projection="orthographic", scale=4
});
scene := .scene3d.Scene([.scene3d.Axes({= id="basis" }), curve, note], {=
    camera=camera
});
realizedPicking := .scene3d.Realize(scene)["picking"];
snapshot := .scene3d.Snapshot(scene, {= size=[640,480] });
projectedPicking := snapshot["picking"];
```

`realizedPicking["parabola"]` identifies the exact retained primitive.
`projectedPicking["parabola"]["indices"]` lists its visible projected segment
records, which a browser host can associate with its own hit-testing layer.
The picking map is also returned by `Project`. It deliberately describes
identity without embedding DOM, Canvas, or WebGL event state in the scene.
An identified leaf may attach a `.scene3d.Interaction(...)` value. Its portable
events and presentation hints survive both picking maps for a host to
interpret; callbacks and browser objects never enter the scene.

Annotations may attach `.scene3d.AnnotationPolicy(...)`. Exact screen offsets
and leader lines lower to core Graphics. Priority, collision, and occlusion
requests remain in the projected record so capable hosts can implement them;
the portable snapshot does not falsely claim collision or occlusion handling.

`OrbitCamera` places the camera around the Z axis. Its `turn` is the rational
Cayley parameter, with `.Complex[:infinity]` denoting the half-turn. The
resulting camera retains an `orbit` field with schema `rix.scene3d.orbit@1`, so
an interactive host can update the parameter without guessing how the camera
was constructed.

## Deterministic snapshots

`.scene3d.Snapshot` projects a retained scene into core `.Graphics`. Phase 1
implements explicitly named `wireframe` and `lit` modes. Wireframe clips
perspective segments against the camera's near/far planes. Lit mode uses
deterministic flat Lambert shading and painter's ordering for mesh triangles;
it does not claim certified hidden-surface removal, shadows, triangle clipping,
or certified tessellation.

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

The result has `type="scene3d_snapshot"`, schema
`rix.scene3d.snapshot@1`, and the adaptive-result fields `value`, `resolved`,
`uncertainty`, `work`, `source`, and `diagnostics`. `value` is a normal Graphic.
Canvas and PNG also accept the whole snapshot directly so its source and
picking provenance survive target lowering.

```rix
.Plugin.Load("canvas");
canvasPlan := .canvas.Render(snapshot);

.Plugin.Load("png");
pngBytes := .png.Render(snapshot); # requires a host rasterizer
```

## WebGL display

The browser-safe `webgl` renderer consumes the retained Scene3D value rather
than the projected Graphic. It emits deterministic `rix.webgl-plan@1` JSON
containing camera and light descriptors, triangle/line/point draw calls,
picking IDs, interaction policies, and annotation overlays.

```rix
.Plugin.Load("webgl");
plan := .webgl.Render(scene, {= width=640, height=480 });
```

A JavaScript host executes the parsed plan with `paintWebGLPlan(gl, plan)`.
The return value includes screen coordinates for accessible DOM or Canvas text
overlays. Exact Scene3D coordinates cross to Float32 only during GPU execution,
and the plan reports that approximation as a diagnostic.

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

glTF exports Scene3D picking IDs into node `extras.rix.pickid`. It does not
export annotations because core glTF 2.0 has no portable text primitive, and
reports `gltf-annotations-not-exported` instead of silently turning text into
a point. Retained lights, camera nodes, textures, animation, and GLB also remain
future work. glTF line width is not portable and is reported as an
informational diagnostic.

## Runnable 4D example

From `rix/`:

```bash
bun bin/rix.js --out=tmp/tesseract-out examples/geometry/tesseract.rix
```

This creates `tesseract.svg` from a deterministic wireframe snapshot and
`tesseract.gltf` from the same retained 3D scene. The corresponding RiX Web
tutorials run the browser-safe parts directly.
