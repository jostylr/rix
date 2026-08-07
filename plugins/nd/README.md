# N-dimensional geometry plugin

`nd` retains exact n-dimensional geometry (`rix.nd@1`) separately from exact
affine projection records (`rix.nd.projection@1`). Load it with
`.Plugin.Load("nd")`.

Implemented operations:

- `Point`, `Polyline`, and edge-defined `Polytope`
- `Hypercube(dimension, size?)`
- `Projection(matrix, offset?, options?)`
- `CoordinateProjection(sourceDimension, oneBasedAxes)`
- `CayleyRotation(dimension, axis1, axis2, t)` using exact rational half-angle coordinates
- `Compose(after, before)` and `Project(geometry, projection)`
- `ToScene3D(geometry, options?)`, which requires an explicit 3D result

Projection provenance stays attached to projected geometry. `ToScene3D` rejects
4D input rather than selecting axes implicitly. Projection is not a synonym for
a slice, section, fiber, or marginalization; those operations remain separate
future work.

See the [3D/ND guide](../../documentation/eval/scene3d-guide.md), the
[browser tutorial](tutorial.md), and the runnable
[`tesseract.rix`](../../examples/geometry/tesseract.rix) example.

