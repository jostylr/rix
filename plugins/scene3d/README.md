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
- `Material({= color?, opacity?, width? })`
- `PerspectiveCamera(position, target, {= up?, fov?, near?, far? })`
- `OrthographicCamera(position, target, {= up?, scale?, near?, far? })`
- `Snapshot(scene, {= camera?, size?, mode? })`

`Snapshot` currently accepts only `mode="wireframe"`. It returns an
adaptive-result map whose `value` is a core Graphic and whose `work`, `source`,
`uncertainty`, and `diagnostics` fields make the boundary inspectable. Lighting,
hidden-surface removal, adaptive surfaces/volumes, texture, and interaction are
not silently approximated; they remain future modes or producers.

See the [3D/ND guide](../../documentation/eval/scene3d-guide.md), the
[browser tutorial](tutorial.md), and the runnable
[`tesseract.rix`](../../examples/geometry/tesseract.rix) example.

