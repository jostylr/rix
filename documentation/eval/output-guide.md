# Structured output and graphics reference

RiX output constructors return portable values. They describe content and
layout semantics; a host decides how to render HTML, SVG, terminal text, or a
future PDF. Use `.Out("relative-path", value)` to hand an artifact to the
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
| `.Graphics.Snapshots` | `[scene, states]` entries and optional columns |

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

## Snapshots and timelines

`.Snapshots` and `.Graphics.Snapshots` materialize `[scene, states]` tuples
into a static row-major grid. A scene is an ordinary callable:

```rix
scene = state -> .Paragraph(@"state = @{state}");
.Snapshots([{: scene, [1, 2, 3]}], 3)
```

`.Timeline.Sequence` accepts the same entries and records ordered frames.
`.Timeline.Render(timeline, frame?)` selects one one-based frame for a static
renderer. See the [RiX Web reactive scenes tutorial](https://rix.ratmath.com/tutorial/reactive-scenes-and-snapshots.html)
for the full workflow and the [plugin contract](../design/interactive-output-plugins.md)
for renderer-extension boundaries.

## Output artifacts

```rix
.Out("report.txt", .Paragraph("Exact result"));
.Out("comic.html", snapshots);
.Out("index.html", $view)
```

Run with `rix --out=out program.rix`. Every declared artifact is written below
`out`. The final HTML artifact can retain its reactive source and host widgets;
earlier HTML artifacts are written as static pages. PDF output is not yet a
built-in backend.
