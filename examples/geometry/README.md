# Scene3D and nD browser labs

These examples are designed to be pasted or opened as source in RiX-Web. They
use only browser-approved plugins and portable output values:

- `scene3d-studio.rix` — retained meshes, groups, transforms, a bounded exact
  parametric curve, axes, annotations, stable picking IDs, point clouds, three
  light types, exact Cayley orbit-camera/object motion, lit/wireframe snapshots,
  and pipeline diagnostics.
- `nd-dimension-lab.rix` — 4D, 5D, and 6D hypercubes; exact hidden-plane Cayley
  rotations; explicit nD → 3D coordinate projection; live camera and styling.
- `nd-slice-lab.rix` — an exact rotated-tesseract edge/hyperplane section with
  a live `w` slider and an eleven-frame portable timeline.

Condensed versions of the three labs also appear under **Help → Runnable
examples → Spatial labs** in RiX-Web, so no file picker is required.

## What is interactive today

RiX-Web mounts core `ControlPanel` values. Moving a slider or choice replaces
the exact reactive `$$` value and recomputes the named `$view`. Scene3D is
currently retained mathematics rather than a WebGL viewport: interaction
rebuilds a deterministic 2D camera snapshot as a portable core `Graphic`.
That is why the same result can be sent to SVG, PNG, TikZ, PDF, or HTML without
putting 3D decisions in those renderers.

Scene3D's current `lit` mode is deterministic flat Lambert shading with
painter ordering. `wireframe` does not claim hidden-line removal. The nD
plugin currently owns exact affine projections. It intentionally does not call
projection a slice: `nd-slice-lab.rix` demonstrates how a separate producer can
intersect 4D edges with `w = level` exactly before dropping the fourth
coordinate.

## Run the browser programs in the terminal

From the repository root, each program can also be evaluated as portable
terminal output:

```sh
bun rix/bin/rix.js rix/examples/geometry/scene3d-studio.rix
bun rix/bin/rix.js rix/examples/geometry/nd-dimension-lab.rix
bun rix/bin/rix.js rix/examples/geometry/nd-slice-lab.rix
```

The terminal displays the initial reactive state; controls need the browser
host. To render artifacts directly, use the purpose-built companion:

```sh
bun rix/bin/rix.js \
  --out=tmp/spatial-exports \
  rix/examples/geometry/spatial-exports.rix
```

It writes:

- `scene3d-lit.png` — the lit Scene3D mesh snapshot;
- `nd-tesseract.png` — the explicit 4D → 3D wireframe snapshot;
- `nd-slice-sweep.gif` — eleven exact slice states over 4.4 seconds;
- `nd-tesseract.gltf` — the retained projected 3D line scene.

PNG needs either `rsvg-convert` or ImageMagick. GIF needs the PNG toolchain and
ImageMagick's `magick`; the CLI reports a clear unavailable-tool diagnostic if
they are missing. glTF needs no external process.

## Adapt a live state into a custom export

For a particular browser setting, copy the chosen exact slider values into the
corresponding `$$` declarations. Then replace the final `$view` with an output
declaration over the already exposed state:

```rix
.Plugin.Load("png");
.Out("chosen-camera.png", $studioState[:graphic])
```

For a custom slice animation, change `sliceLevels` or the total `duration` in
`spatial-exports.rix`. Every timeline frame must resolve to exactly one
`Graphic` or graphic `Figure` for the phase-1 GIF renderer.
