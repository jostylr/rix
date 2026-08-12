# RiX renderer plugins

RiX renderers are target adapters over portable output values. Mathematical
and authoring plugins produce `.Graphics`, document, table, or retained
`Scene3D` values. They never emit SVG, TeX, or pixels as their primary
semantic result.

## Implemented contract

The host owns one `RendererRegistry`. Loading a renderer plugin registers a
canonical target, MIME and extension aliases, accepted input kinds, a
determinism claim, and a render function. The public interfaces are:

```rix
.Plugin.Load("svg");

targets := .Renderer.List();
svgInfo := .Renderer.Info("image/svg+xml");
result := .Render(graphic, "svg", {= alt="An exact construction" });
source := result.Get("content");

## The per-target convenience is equivalent.
same := .svg.Render(graphic, {= alt="An exact construction" });
```

A RiX-visible render result contains:

| Field | Meaning |
| --- | --- |
| `target` / `mime` / `extension` | The actual negotiated representation. |
| `encoding` / `content` | UTF-8 text or base64 for binary content. The host retains the original bytes. |
| `assets` | Subsidiary relative-path artifacts. |
| `diagnostics` | Structured level, code, message, and optional scene path. |
| `deterministic` | Whether the adapter claims repeatable output for the same request and host toolchain. |
| `toolchain` | External implementation used, when applicable. |

The generic request accepts a target/MIME alias and an options map. A
`fallback` or `fallbacks` option may name allowed alternatives. Negotiated
fallbacks are always recorded in diagnostics; unsupported input is never
silently omitted.

`.Out(path, value)` uses the loaded renderer matching the path extension. This
is the normal export form:

```rix
/**
plugins: [svg, png, markdown, quarto, latex, pdf, gif]
**/

.Out("diagram.svg", graphic);
.Out("diagram.png", graphic);
.Out("report.md", report);
.Out("report.qmd", report);
.Out("report.tex", report);
.Out("report.pdf", report);
```

[`examples/renderers/all-formats.rix`](../../examples/renderers/all-formats.rix)
is a runnable CLI example covering the common 2D and document targets from one
Graphic and one document tree. Specialized terminal, data, animation, and 3D
fixtures live beside it.

## Current targets

| Target plugin | Inputs | Result | Host requirements |
| --- | --- | --- | --- |
| `.terminalAscii` | Tables, Grids, Fragments, simple `Graphic` values | Strict seven-bit plain text | None |
| `.svg` | `Graphic`, graphic `Figure` | Standalone accessible SVG | None |
| `.canvas` | `Graphic`, graphic `Figure` | Versioned JSON `CanvasRenderingContext2D` plan | None; painting needs a browser Canvas |
| `.tikz` | `Graphic`, graphic `Figure` | TikZ/PGF source | None; TeX is only needed to compile it |
| `.png` | `Graphic`, graphic `Figure` | PNG bytes at explicit size/scale | CLI uses `rsvg-convert`, then ImageMagick as fallback |
| `.markdown` | Portable document/output trees | CommonMark-oriented `.md` with inline SVG | None |
| `.html` | Any portable output value | Standalone semantic HTML with inline SVG | None |
| `.quarto` | Portable documents and slides | `.qmd` with front matter | None; Quarto is only needed for a final build |
| `.latex` | Portable documents, figures, and slides | Standalone `.tex`, with graphics lowered to TikZ | None; TeX is only needed to compile it |
| `.pdf` | Portable documents, figures, and static slide content | PDF bytes through the LaTeX renderer | CLI requires `pdflatex` |
| `.gif` | `Slides`, `Timeline`, `Snapshots` with Graphic frames | Animated GIF bytes with explicit centisecond delays | CLI uses PNG plus ImageMagick |
| `.gltf` | Retained `Scene3D` | glTF 2.0 JSON with embedded buffer | None |
| `.csv` | Core `Table` and `.data` Relation | CSV or TSV with exact scalar text | None |

Canvas is an execution target, not another scene model. Its plan traverses the
same `.Graphics` tree as SVG and TikZ and can be repainted with
`paintCanvasPlan(context, plan)` from `render-canvas/canvas-plan.js`.

PNG, PDF, and GIF separate portable lowering from host execution. Browser hosts can
load their contracts but receive `png-rasterizer-unavailable` or
`pdf-toolchain-unavailable`, or `gif-encoder-unavailable` unless they deliberately supply an adapter. The
CLI supplies approved process/file adapters and records the chosen toolchain.

## 2D, 3D, and document boundary

The format family does not change the semantic ownership:

```text
domain value -> bounded refinement -> portable scene/document -> renderer -> artifact
```

For 2D, `.Graphics` is the portable retained scene. SVG, Canvas, TikZ, and PNG
all consume it. PDF consumes it either as a standalone TikZ figure or inside a
document.

For 3D, RiX has the initial retained `rix.scene3d@1` schema described in
[`../design-spec.md`](../design-spec.md). Renderer plugins do not encode
meshes, cameras, materials, lights, or uncertainty as ad-hoc `.Graphics`
metadata. The first glTF JSON target is implemented; the broader target family
is:

| 3D target | Role |
| --- | --- |
| glTF | Implemented JSON interchange for realized mesh/line/point geometry and basic material color/opacity. |
| GLB | Planned binary scene interchange including broader hierarchy, cameras, textures, and animation. |
| OBJ + MTL | Simple editable mesh interchange with explicit loss diagnostics. |
| STL | Manufacturing-oriented triangle surface export; drops color, cameras, hierarchy, and semantics visibly. |
| PLY | Geometry/point-cloud interchange with optional vertex attributes. |
| USD / USDZ | Rich scene/AR exchange when a suitable host toolchain is available. |

Static 3D publication does not wait for every interchange target. The
implemented `Scene3D` wireframe snapshot owns camera projection and returns a
`.Graphics` scene for SVG/TikZ/PDF or raster lowering. Hidden-surface decisions
remain a later snapshot mode. The 2D renderer never performs those 3D
decisions.

## Design rules

1. Renderers consume already-materialized portable values and do not evaluate
   user expressions or solve domain mathematics.
2. Exact values remain exact until a target-specific formatting policy makes
   approximation explicit.
3. Interactive values provide a static representation; lost interaction is a
   diagnostic.
4. External process, filesystem, DOM, native, or network needs belong to the
   host adapter and plugin permissions.
5. Subordinate formats are delegated rather than reimplemented: PDF uses
   LaTeX/TikZ; document Markdown uses SVG for graphics; PNG rasterizes SVG.
6. Asset names are relative, stable, and validated by the `.Out` host.
7. Same-input reproducibility claims include the target options and named
   toolchain.
