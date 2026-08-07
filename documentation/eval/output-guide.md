# Structured output and graphics reference

RiX output constructors return portable values. They describe content and
layout semantics; a host decides how to render HTML, SVG, terminal text, PDF,
or another loaded target. Use `.Out("relative-path", value)` to hand an artifact to the
`rix --out=directory` host.

## Composition and document blocks

| Constructor | Purpose | Compact form |
| --- | --- | --- |
| `.Fragment` | Ordered block-output children | `.Fragment([children])` |
| `.Text` | Explicit inline text | `.Text(value)` |
| `.Paragraph` | Block of inline text/content | `.Paragraph(content)` |
| `.Heading` | Heading level and inline content | `.Heading(level, content)` |
| `.Section` | Titled structural block | map form |
| `.List` / `.ListItem` | Ordered or unordered semantic list | map form |
| `.Quote` / `.Callout` | Quote or typed note/tip/warning | map form |
| `.CodeBlock` / `.MathBlock` | Literal code or display math | map form |
| `.Figure` | Captioned output value | `.Figure(content, caption?)` |
| `.Slide` / `.Slides` | Presentation frame/deck | map form |

Inline constructors for use inside Paragraph and Heading are `.Emphasis`,
`.Strong`, `.Code`, `.Math`, `.Link`, and `.LineBreak`. A Fragment may contain
blocks such as Paragraph, Figure, Table, Grid, Sheet, Graphic, ControlPanel,
Snapshots, or another Fragment.

```rix
.Fragment([
    .Heading(2, "Result"),
    .Paragraph([.Text("The value is "), .Math("x^2 + 1")]),
    .Callout({= variant="tip", children=[.Paragraph("Values stay exact.")] })
])
```

## Tables, grids, sheets, and media

| Constructor | Required fields / shorthand | Notes |
| --- | --- | --- |
| `.Table` | `columns`, `rows` | Semantic table with labeled columns. |
| `.Grid` | `columns`, `rows`, optional `rules` | Mathematical cell grid; rules add separators. |
| `.Sheet` | data or Binding | Tensor-aware display; a Binding enables editable host views. |
| `.Asset` | `ref`, `mime` | Portable media reference. |
| `.Image`, `.Audio`, `.Video` | `asset`, accessibility fields | Hosts validate and resolve media URLs. |

Use `.Figure` to give any of these a caption. For browser/print comparison
grids driven by scenes, use `.Snapshots` instead of manually flattening a
table of unrelated HTML.

## Graphics

`.Graphics` is RiX’s renderer-facing 2D scene namespace.

| Constructor | Core fields |
| --- | --- |
| `.Graphics.Graphic` | `size`, `children` |
| `.Graphics.Group` | `children`, optional `style` |
| `.Graphics.Path` | points or path commands, optional `style` |
| `.Graphics.Transform` | `children`, translate/rotate/scale map |
| `.Graphics.Text` | position, text, optional style |
| `.Graphics.Rectangle` / `.Graphics.Circle` | geometry and optional style |
| `.Graphics.Clip` | `children`, rectangular bounds |
| `.Graphics.DragPoint` | reactive `$$` target, radius, style, label |
| `.Graphics.Snapshots` | `[scene, states]` entries materialized as an ordered snapshot list |

```rix
.Graphics.Graphic({=
    size=[360, 220],
    children=[
        .Graphics.Circle({= center=[180, 110], radius=40, style={= fill="#0c7b7f" } }),
        .Graphics.Text({= point=[180, 110], text="exact", style={= fill="white" } })
    ]
})
```

The Plot plugin returns a compatible Graphic. Load it with `.Plugin.Load("plot")`
and use `.plot.Polynomial(coefficients, domain, options)`.

## Renderer plugins

Renderers are opt-in target adapters over the portable values above. They do
not solve geometry or reevaluate expressions.

```rix
.Plugin.Load("svg");

available := .Renderer.List();
info := .Renderer.Info("image/svg+xml");
result := .Render(graphic, "svg", {= alt="An exact diagram" });
source := result.Get("content");

## Equivalent target convenience:
same := .svg.Render(graphic);
```

Initial targets are `svg`, `canvas`, `tikz`, `png`, `markdown`, `html`,
`quarto`, `latex`, and `pdf`. A render result records the actual target, MIME,
extension, encoding/content, subsidiary assets, diagnostics, determinism, and
external toolchain. Binary content is exposed to RiX as base64 while a host
retains the original bytes.

Canvas produces a versioned, serializable drawing plan over the same Graphics
tree. PNG rasterizes SVG through an approved host adapter. LaTeX lowers
graphics to TikZ, and PDF compiles that result. In the CLI, PNG uses
`rsvg-convert` or ImageMagick and PDF uses `pdflatex`; browser hosts report an
unavailable-toolchain diagnostic unless they deliberately install an adapter.

The optional `.scene3d` plugin now provides the initial retained
`rix.scene3d@1` schema. Its deterministic wireframe `Snapshot` applies a
perspective or orthographic camera and returns core Graphics; 2D renderers do
not infer cameras or meshes. The optional `.nd` plugin provides exact explicit
affine projections into 3D, and `.gltf` exports retained scenes as embedded
glTF 2.0 JSON. See [3D scenes and n-dimensional projection](scene3d-guide.md).

## Snapshots and timelines

`.Snapshots` and `.Graphics.Snapshots` materialize `[scene, states]` tuples
into an ordered list. Every snapshot retains an immutable one-based
`origin={= entry=..., state=..., ordinal=... }` record. A scene receives that
record as its optional second argument, so it can generate its own headings,
captions, or metadata:

```rix
scene = (state, origin) -> .Paragraph(@"snapshot @{origin[:ordinal]}: state @{state}");
.Snapshots([{: scene, [1, 2, 3]}])
```

`.Timeline.Sequence` accepts the same entries and records ordered frames.
Each timeline frame uses the same `state`, `origin`, and `content` record.
`.Timeline.Render(timeline, frame?)` selects one one-based frame for a static
renderer. A grid or comic-strip renderer can group the flat list later by
`origin["entry"]` and `origin["state"]`. See the [RiX Web reactive scenes tutorial](https://rix.ratmath.com/tutorial/reactive-scenes-and-snapshots.html)
for the full workflow and the [plugin contract](../design/interactive-output-plugins.md)
for renderer-extension boundaries.

## Output artifacts

```rix
.Out("report.md", report);
.Out("diagram.svg", graphic);
.Out("diagram.png", graphic);
.Out("report.tex", report);
.Out("report.pdf", report);
.Out("comic.html", snapshots);
.Out("index.html", $view)
```

Run with `rix --out=out program.rix`. Every declared artifact is written below
`out`. The final HTML artifact can retain its reactive source and host widgets;
earlier HTML artifacts are written as static pages. When a loaded renderer
matches an extension, `.Out` writes its text or original binary bytes and any
validated relative assets. See the full [renderer plugin reference and format
matrix](renderer-guide.md).
