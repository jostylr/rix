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
- `Field`, exact `Evaluate`/`SampleField`, and finite/implicit `Fiber` values
- `AffineSlice` plus exact parameterization of points or lower-dimensional geometry
- `Hyperplane` and exact edge-defined `Section`
- `ProjectionFamily(...).At(parameter)` with dimension validation and provenance
- `ToPlot` for 2D geometry or sampled 1D scalar fields
- `ToScene3D(geometry, options?)`, which requires an explicit 3D result

Projection provenance stays attached to projected geometry. `ToScene3D` rejects
4D input rather than selecting axes implicitly. Projection, affine slicing,
hyperplane section, and a field fiber are distinct schemas and operations.

The exact kernel is implemented in pure RiX. `ToScene3D` and `ToPlot` are
schema adapters: they do not redo projection or field mathematics. A sampled
2D scalar field lowers to exact `[x,y,f(x,y)]` Scene3D points; a sampled 1D
scalar field lowers to an ordinary Plot line. General implicit fibers remain
records until a later adaptive solver is explicitly requested; finite supplied
domain geometry is filtered exactly.

`Section` currently intersects the vertices and declared edges of finite
geometry with an exact hyperplane. It returns every proved intersection point
but does not invent face topology that the source value did not contain.

See the [3D/ND guide](../../documentation/eval/scene3d-guide.md), the
[browser tutorial](tutorial.md), and the runnable
[`nd-dimension-lab.rix`](../../examples/geometry/nd-dimension-lab.rix),
[`nd-slice-lab.rix`](../../examples/geometry/nd-slice-lab.rix), and
[`tesseract.rix`](../../examples/geometry/tesseract.rix) examples.
