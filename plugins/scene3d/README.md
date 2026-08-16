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
- `Axes({= origin?, length?, negative?, labels?, id? })`
- `Annotation(position, text, {= id?, label?, color?, size?, anchor?, weight? })`
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
triangle clipping, certified hidden-surface removal, adaptive surfaces/volumes,
texture, and pointer event handling are not silently approximated; they remain
future modes or host behavior.

Phase 2 has begun with exact bounded parametric-curve sampling, reusable axes,
projected text annotations, rational Cayley orbit-camera descriptions, and
stable leaf picking IDs. Add `id="object.name"` to a mesh, polyline, point
cloud, curve, or annotation. `Realize(scene)["picking"]` maps IDs to retained
primitives; `Project` and `Snapshot` map them to visible projected primitive
indices. A leaf ID must be unique within its scene.

`OrbitCamera` stores the reusable `rix.scene3d.orbit@1` description on the
camera. `turn` is the Cayley parameter, so rational values produce an exact
camera position; `.Complex[:infinity]` denotes the half-turn. Parametric
surfaces and direct WebGL/raster lowering remain later Phase 2 work.

See the [3D/ND guide](../../documentation/eval/scene3d-guide.md), the
[browser tutorial](tutorial.md), and the runnable
[`scene3d-studio.rix`](../../examples/geometry/scene3d-studio.rix) and
[`tesseract.rix`](../../examples/geometry/tesseract.rix) examples.
