# Scene3D plugin

`scene3d` is RiX's first retained 3D interchange layer. Load it with
`.Plugin.Load("scene3d")`. Values use schema `rix.scene3d@1`, right-handed Z-up
coordinates, and exact RiX integers/rationals until snapshot or export.

Implemented constructors:

- `Scene(children, options?)`
- `Group(children, options?)`
- `Transform(children, {= matrix?, translate?, scale? })`
- `Mesh(vertices, triangles, options?)` with 1-based triangle indices
- `Polyline(points, {= closed?, color?, width?, opacity?, material? })`
- `PointCloud(points, {= radius?, color?, opacity?, material? })`
- `ParametricCurve(curve, domain, {= samples?, id?, label?, ...style })`
- `ParametricSurface(surface, uDomain, vDomain, {= tolerance?, maxDepth?, maxCells?, id?, interaction?, ...style })`
- `Axes({= origin?, length?, negative?, labels?, id? })`
- `Annotation(position, text, {= id?, label?, policy?, color?, size?, anchor?, weight? })`
- `AnnotationPolicy({= offset?, leader?, priority?, collision?, occlusion? })`
- `Interaction({= events?, cursor?, tooltip?, selection?, payload? })`
- `Material({= color?, opacity?, width? })`
- `AmbientLight(color?, intensity?)`
- `DirectionalLight(direction, {= color?, intensity? })`
- `PointLight(position, {= color?, intensity? })`
- `PerspectiveCamera(position, target, {= up?, fov?, near?, far? })`
- `OrthographicCamera(position, target, {= up?, scale?, near?, far? })`
- `OrbitCamera(target, {= radius?, height?, turn?, projection?, fov?, scale? })`
- `Realize(scene)` and `Project(scene, options?)`
- `Snapshot(scene, {= camera?, size?, mode? })`

`Snapshot` accepts `mode="wireframe"` and `mode="lit"`. Lit snapshots use
deterministic flat Lambert shading and painter's ordering over retained mesh
triangles. It returns an
adaptive-result map whose `value` is a core Graphic and whose `work`, `source`,
`uncertainty`, and `diagnostics` fields make the boundary inspectable. Shadows,
triangle clipping, certified hidden-surface removal, implicit surfaces/volumes,
texture, and pointer event handling are not silently approximated; they remain
future modes or host behavior.

Phase 2 includes exact bounded parametric-curve sampling, reusable axes,
projected text annotations, rational Cayley orbit-camera descriptions, and
stable leaf picking IDs. Add `id="object.name"` to a mesh, polyline, point
cloud, curve, or annotation. `Realize(scene)["picking"]` maps IDs to retained
primitives; `Project` and `Snapshot` map them to visible projected primitive
indices. A leaf ID must be unique within its scene.

`ParametricSurface` evaluates an exact two-argument function on a conforming
grid. It doubles the grid resolution until midpoint deviation meets
`tolerance`, or until `maxDepth` or `maxCells` stops refinement. The mesh
metadata contains a `rix.scene3d.surface-sampling@1` record with the chosen
depth, cell/evaluation counts, maximum observed error, `resolved`, and
`limitedBy`. This is deterministic geometric sampling, not a certificate over
unsampled points.

`Interaction` is portable intent rather than a browser callback. Attach it to
an identified leaf with `interaction=...`; retained and projected picking maps
preserve its events, cursor, tooltip, selection policy, and data payload for a
host to interpret. `AnnotationPolicy` adds an exact screen offset and optional
leader line to portable snapshots, and preserves priority, collision, and
occlusion requests for renderers with those capabilities. Core Graphics
snapshots do not claim collision or occlusion resolution.

`OrbitCamera` stores the reusable `rix.scene3d.orbit@1` description on the
camera. `turn` is the Cayley parameter, so rational values produce an exact
camera position; `.Complex[:infinity]` denotes the half-turn. Parametric
surface meshes are retained and snapshot through the same pipeline.

`Snapshot` is a versioned `rix.scene3d.snapshot@1` value. Pass it directly to
`.canvas.Render(snapshot)` for a `rix.canvas-plan@1` with picking provenance or
to `.png.Render(snapshot)` in a raster-capable host. For retained interactive
display, `.webgl.Render(scene)` creates an executable `rix.webgl-plan@1` with
draw calls, camera/light descriptors, stable picking and interaction data, and
accessible host annotation overlays. Exact coordinates remain retained until
the WebGL executor's explicit Float32 boundary.

See the [3D/ND guide](../../documentation/eval/scene3d-guide.md), the
[browser tutorial](tutorial.md), and the runnable
[`scene3d-studio.rix`](../../examples/geometry/scene3d-studio.rix) and
[`tesseract.rix`](../../examples/geometry/tesseract.rix) examples.
