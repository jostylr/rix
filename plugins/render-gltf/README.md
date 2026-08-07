# glTF renderer plugin

`gltf` is a browser-safe renderer from `rix.scene3d@1` to glTF 2.0 JSON. Load
it with `.Plugin.Load("gltf")`, call `.gltf.Render(scene)`, or declare
`.Out("scene.gltf", scene)` in a CLI script.

The exporter:

- writes one embedded base64 geometry buffer, so `.gltf` is a single artifact;
- converts right-handed Z-up RiX coordinates to right-handed Y-up glTF;
- emits triangle, line, and point primitives;
- preserves basic material color and opacity; and
- records Float32 rounding and non-portable line widths as diagnostics.

Camera nodes, retained lights, textures, animation, GLB, and scene import are
not part of phase 1. See the [renderer guide](../../documentation/eval/renderer-guide.md),
the [3D/ND guide](../../documentation/eval/scene3d-guide.md), and the
[browser tutorial](tutorial.md).

