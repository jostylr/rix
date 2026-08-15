# ND and Scene3D RiX/host split migration

Status: **implemented**. All five stages now run in pure RiX. The only host
boundary left in this path is target encoding: glTF consumes the public
realized primitive stream and converts coordinates to Float32 and bytes.

The retained values and mathematical transformations belong in RiX. A host is
needed only when an operation touches a target API, external encoder, binary
numeric layout, or interactive surface. The migration preserves the existing
`rix.nd@1`, `rix.nd.projection@1`, and `rix.scene3d@1` contracts while adding
intermediate schemas where a renderer currently consumes private JavaScript
objects.

## Stage 1 — Pure retained Scene3D model

Move `Scene`, `Group`, `Transform`, `Mesh`, `Polyline`, `PointCloud`,
`Material`, lights, and camera constructors to `scene3d.plugin.rix`. Validation,
styles, metadata, coordinate-system declarations, and the exact row-major 4×4
transform representation are ordinary RiX values. This stage contains no
projection or renderer code and keeps glTF consuming the same public scene
schema.

Acceptance criteria:

- the catalog reports `scene3d` as `kind: rix`;
- construction and malformed-value tests pass in Node and RiX Web;
- glTF renders scenes produced by the RiX constructor without a compatibility
  conversion;
- the historical JavaScript constructor code becomes reference-only.

## Stage 2 — Pure ND kernel and Scene3D adapter

Move `Point`, `Polyline`, `Polytope`, `Hypercube`, `Projection`,
`CoordinateProjection`, `CayleyRotation`, `Compose`, and `Project` to RiX.
Matrix composition and affine application stay exact. `ToScene3D` becomes a
small pure adapter that requires `rix.scene3d@1` and constructs retained
`Polyline`/`PointCloud`/`Group` values. It does not project to pixels or call a
renderer.

The former private JavaScript recognition of Cayley projective infinity is now
the RiX expression `value == .Complex[:infinity]`. No new core value was
needed; the projection provenance records whether the projective endpoint was
used.

Acceptance criteria:

- ND and projection values round-trip as portable RiX maps;
- the tesseract example remains exact through 4D rotation and 4D→3D projection;
- `ToScene3D` rejects non-3D results and preserves projection provenance;
- `nd` reports `kind: rix` and depends only on the Scene3D service contract.

## Stage 3 — Pure exact realization

The former `flattenScene3D` work is now the public
`rix.scene3d.realized@1` value. RiX recursively composes exact transform
matrices, realizes vertices, derives unique mesh edges, and expands polylines
and point clouds. No camera normalization, trigonometry, Float32 conversion, or
color encoding occurs here.

This gives glTF and future OBJ/STL renderers one stable primitive stream instead
of making each renderer traverse retained nodes independently.

## Stage 4 — Camera projection as a bounded mathematical service

Camera math is separated from snapshot construction:

- an exact view-matrix camera path remains pure rational/algebraic RiX;
- look-at normalization and perspective `fov` convenience use an explicit
  Numerics/Float policy and return diagnostics describing approximation;
- near/far segment clipping, orthographic fitting, perspective division, and
  depth ordering return `rix.scene3d.projected@1` portable records;
- invalid or degenerate camera frames are rejected explicitly; clipping only
  removes primitives that are provably outside the requested near/far range.

The existing `.scene3d.Snapshot` name can remain as the convenience composition
of `Realize → Project → Graphics`.

## Stage 5 — Pure Graphics snapshot, host renderers downstream

RiX lowers projected points, segments, and faces to core `.Graphics` for
wireframe and deterministic flat-lit snapshots. Lighting policy and color math
are mathematical layout work and can remain RiX when their approximation policy
is explicit.

Host-backed packages remain responsible for:

- WebGL/WebGPU/Canvas surfaces, picking loops, and browser events;
- PNG/GIF rasterization and external processes;
- glTF/GLB binary buffers and Float32 conversion diagnostics;
- filesystem export, native 3D APIs, AR, and device-specific rendering.

## Delivered architecture

`Scene/Group/Transform/... → rix.scene3d@1 → Realize →
rix.scene3d.realized@1 → Project → rix.scene3d.projected@1 → Snapshot →
Graphics → renderer`.

`nd.Project` stays entirely before this pipeline, and `nd.ToScene3D` is only an
explicit three-dimensional adapter. Perspective tangent uses a fixed 24-term
rational continued fraction and records that policy, while camera-frame square
roots record the core rational-square-root policy. Continued-fraction steps
are rounded deterministically to 12 decimal places so the eventual Graphics
number conversion cannot become `Infinity/Infinity`. The historical JavaScript
implementations remain as `*.reference.js` files and are not loaded.
