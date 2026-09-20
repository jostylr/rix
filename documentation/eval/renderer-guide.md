# Renderer plugins

RiX renderer plugins turn retained `.Graphics` scenes and portable document
values into target artifacts. They are deliberately downstream of evaluation:
a renderer does not run user expressions, solve geometry, or refine a
mathematical value.

```text
domain value -> portable Graphic/document -> renderer -> RenderResult -> host artifact
```

## Loading and discovery

Renderers are ordinary opt-in plugins. Load one target, load a configured
group, or declare the plugins in a script header:

```rix
.Plugin.Load("svg");
.Plugin.Load("markdown");

targets := .Renderer.List();
svg := .Renderer.Info("image/svg+xml");
```

```rix
/**
plugins: [terminal-ascii, svg, canvas, tikz, png, markdown, html, quarto, latex, pdf, gif, gltf, csv]
**/
```

The CLI also accepts `--plugins=renderers`, and `rix setup
--plugins=renderers` can make the group part of the local CLI configuration.
`.Renderer.Info(target)` reports the canonical target, MIME type, extension,
accepted input kinds, aliases, and determinism claim.

## Rendering and export

The generic and target-specific calls are equivalent:

```rix
result := .Render(graphic, "svg", {= alt="An exact construction" });
same := .svg.Render(graphic, {= alt="An exact construction" });
source := result.Get("content");
```

`.Out` asks the CLI host to select a loaded renderer from the filename's
longest matching extension. It writes original binary bytes rather than the
RiX-visible base64 representation:

```rix
.Out("diagram.svg", graphic);
.Out("diagram.canvas.json", graphic);
.Out("report.pdf", report);
```

Run a program containing those declarations with `rix --out=out program.rix`.
Paths must remain relative to the output directory. Renderer-supplied assets
are subject to the same validation.

## RenderResult contract

Every successful renderer returns an immutable RiX map:

| Field | Meaning |
| --- | --- |
| `target` | Canonical target actually selected after negotiation. |
| `mime` | MIME type of the primary artifact. |
| `extension` | Preferred extension without a leading dot. |
| `encoding` | `utf8` for text and `base64` for RiX-visible binary content. |
| `content` | Text source or base64. The host retains original binary bytes. |
| `assets` | Relative-path subsidiary artifacts with MIME, encoding, and content. |
| `diagnostics` | Structured `level`, `code`, `message`, and optional scene `path`. |
| `deterministic` | The adapter's repeatability claim for the same options and toolchain. |
| `toolchain` | External implementation used, or `_` for a portable renderer. |

The generic call accepts `fallback` or `fallbacks` in its options map. A
fallback is never silent: the result contains `renderer-fallback` plus any
diagnostics accumulated while negotiating earlier candidates.

## Target matrix

| Plugin | Inputs | Extension and MIME | Browser | CLI requirement |
| --- | --- | --- | --- | --- |
| `terminal-ascii` | Table, Grid, Fragment, simple Graphic | `.txt`, `text/plain` | Full | None |
| `svg` | Graphic, graphic Figure | `.svg`, `image/svg+xml` | Full | None |
| `canvas` | Graphic, graphic Figure | `.canvas.json`, `application/vnd.rix.canvas+json` | Full | None |
| `tikz` | Graphic, graphic Figure | `.tikz`, `text/x-tikz` | Source generation | None |
| `png` | Graphic, graphic Figure | `.png`, `image/png` | Contract only | `rsvg-convert` or `magick` |
| `markdown` | Document/output trees | `.md`, `text/markdown` | Full | None |
| `html` | Any portable output | `.html`, `text/html` | Full | None |
| `quarto` | Documents and slides | `.qmd`, `text/x-quarto` | Source generation | None |
| `latex` | Documents, figures, slides | `.tex`, `text/x-tex` | Source generation | None |
| `pdf` | Documents, figures, static slides | `.pdf`, `application/pdf` | Contract only | `pdflatex` |
| `gif` | Slides, Timeline, Snapshots | `.gif`, `image/gif` | Contract only | PNG rasterizer plus ImageMagick |
| `gltf` | retained Scene3D | `.gltf`, `model/gltf+json` | Full | None |
| `csv` | Table, data Relation | `.csv`/`.tsv`, `text/csv`/`text/tab-separated-values` | Full | None |

“Full” means the browser can produce the target content. Source targets do not
compile or open their downstream application. Contract-only targets can be
loaded and inspected in a browser, but rendering reports a toolchain error
because browsers do not spawn rasterizers or TeX.

## Graphics targets

### Terminal ASCII

Terminal ASCII provides a strict seven-bit fallback for tables, grids,
fragments, and simple Graphics. It is useful in logs, terminals, diffs, and
hosts that cannot display richer output; unsupported scene detail is reported
rather than silently invented.

Learn interactively in the [Terminal ASCII tutorial](https://rix.ratmath.com/tutorial/plugin-terminal-ascii.html).

### SVG

SVG traverses paths and curve commands, groups, transforms, rectangular clips,
text, rectangles, circles, and drag-point metadata. Output is standalone and
deterministic. The `alt` option adds an accessible `<title>` and `aria-label`.

```rix
.Plugin.Load("svg");
.svg.Render(graphic, {= alt="A teal construction" });
```

Learn interactively in the [SVG renderer tutorial](https://rix.ratmath.com/tutorial/plugin-svg.html).

### Canvas

Canvas returns versioned `rix.canvas-plan@1` JSON. It is an execution plan for
`CanvasRenderingContext2D`, not another scene model. JavaScript hosts can paint
it with `paintCanvasPlan(context, plan)` from the Canvas plugin. There are no
target options in version 1.

Learn interactively in the [Canvas renderer tutorial](https://rix.ratmath.com/tutorial/plugin-canvas.html).

### TikZ

TikZ emits editable TikZ/PGF. Coordinates use `x=1pt,y=-1pt` so orientation
matches SVG and Canvas. Set `standalone=1` to wrap the picture in a compilable
document; the default is a `tikzpicture` fragment. Endpoint-form SVG arc
commands currently fail visibly because their geometric conversion is not yet
defined.

Versioned `rix.scene3d.snapshot@1` records and `Timeline.Render` values are
accepted directly. For a Timeline, Slides, or Snapshots sequence, `frame=2`
selects the second retained frame (default 1). `metadata.staticFrame` preserves
exact state, origin, semantic tracks, and Scene3D projection/evidence. Exact
rational coordinates remain in the editable source; large expressions request
the `xfp` package while TeX supplies final display precision.

```rix
.tikz.Render(graphic, {= standalone=1 });
```

Learn interactively in the [TikZ renderer tutorial](https://rix.ratmath.com/tutorial/plugin-tikz.html).

### PNG

PNG first lowers a Graphic to SVG and asks the host for an approved rasterizer.
`scale` multiplies the Graphic dimensions; explicit `width` and `height`
override the corresponding scaled dimensions, and `background` requests a
background color. Dimensions must be finite and positive after host rounding.

```rix
.png.Render(graphic, {= scale=2, background="white" });
```

The CLI tries `rsvg-convert`, then ImageMagick's `magick`, and records the
chosen toolchain. A browser render fails with `png-rasterizer-unavailable`.
See the [PNG host-boundary tutorial](https://rix.ratmath.com/tutorial/plugin-png.html).

### GIF

GIF expands `Slides`, `Timeline`, or `Snapshots` deterministically, delegates
each Graphic frame to PNG, and then asks the CLI host to encode the ordered
PNGs. `duration` is measured in seconds, `delays` supplies one seconds value
per frame, and the RenderResult records integer-centisecond delays and loop
count. Exact Timeline `frameDurations` are respected. Frames must resolve to a
single Graphic, graphic Figure, or versioned Scene3D snapshot.

```rix
.gif.Render(timeline, {= duration=1/2, loop=0 });
```

Each successful GIF also returns retained SVG frames, exact JSON evidence,
captions/timing text, and an HTML contact sheet in a deterministic asset
directory. These preserve exact state and requested duration separately from
the GIF's quantized timing and display interpolation.

The browser reports `gif-encoder-unavailable` for binary encoding. The portable
`.Render(timeline,"gif-frames")` contact-sheet target needs no external tools,
works with a single retained frame, and can be written with
`.Out("frames.html",result)`. See the [GIF tutorial](https://rix.ratmath.com/tutorial/plugin-gif.html).

### glTF

glTF accepts the retained `rix.scene3d@1` scene rather than a projected
Graphic. It converts RiX's right-handed Z-up coordinates to glTF's
right-handed Y-up convention and embeds a base64 geometry buffer in glTF 2.0
JSON. Mesh triangles, lines, points, basic colors, and opacity are supported.
Exact positions become Float32 at this explicit export boundary. Cameras,
lights, textures, animation, and GLB remain follow-up work.

Learn interactively in the [glTF renderer tutorial](https://rix.ratmath.com/tutorial/plugin-gltf.html).

### CSV and TSV

CSV exports portable Tables and `.data` Relations with exact scalar text.
Choose TSV through the `.tsv` extension or target alias. Nested output and
presentation layout are rejected because delimited data is a data interchange
format, not a document renderer.

Learn interactively in the [CSV renderer tutorial](https://rix.ratmath.com/tutorial/plugin-csv.html).

## Document targets

### Markdown

Markdown preserves headings, emphasis, code, math, lists, quotes, tables,
media links, and code/math blocks. Graphics become inline SVG. Interactive
controls and timelines use their static representation and report loss of
interaction through diagnostics. It has no target-specific options.

Learn interactively in the [Markdown renderer tutorial](https://rix.ratmath.com/tutorial/plugin-markdown.html).

### HTML

HTML produces a standalone semantic document with embedded Graphics SVG. The
`title` option sets the document title; `style` replaces the compact default
stylesheet. Static HTML preserves output semantics but does not include the
RiX reactive widget runtime. The CLI reserves a final reactive HTML `.Out` for
its interactive page path; other HTML artifacts use this static renderer.

```rix
.html.Render(report, {= title="Exact report" });
```

Learn interactively in the [HTML renderer tutorial](https://rix.ratmath.com/tutorial/plugin-html.html).

### Quarto

Quarto emits `.qmd` with YAML front matter and CommonMark-oriented content.
Options may be supplied directly or beneath `metadata`; recognized metadata is
`title`, `author`, `date`, and `format`. The default format is `html`. Quarto
callouts and labels remain native, while Graphics become inline SVG.

Learn interactively in the [Quarto renderer tutorial](https://rix.ratmath.com/tutorial/plugin-quarto.html).

### LaTeX

LaTeX preserves document structure, math, tables, figures, labels, and code.
Graphics lower to TikZ. `title` sets an optional title and `standalone`
controls whether a complete document or body fragment is returned; standalone
defaults to true. Producing `.tex` does not require TeX.

Learn interactively in the [LaTeX renderer tutorial](https://rix.ratmath.com/tutorial/plugin-latex.html).

### PDF

PDF is the LaTeX/TikZ lowering followed by a host compiler. It accepts `title`
and always requests standalone LaTeX. The CLI invokes `pdflatex` with
non-interactive, halt-on-error settings, returns the original PDF bytes, and
records `pdflatex` as its toolchain. Browser rendering fails with
`pdf-toolchain-unavailable`.

See the [PDF host-boundary tutorial](https://rix.ratmath.com/tutorial/plugin-pdf.html).

## Diagnostics and unsupported content

Renderers do not silently discard unsupported structures. Target limitations,
lost interaction, fallback selection, and absent host tools appear as
diagnostics or a failed render negotiation. Important codes include:

| Code | Meaning |
| --- | --- |
| `renderer-unavailable` | No loaded renderer matched a requested candidate. |
| `unsupported-input` | The target does not accept the portable value kind. |
| `renderer-fallback` | An explicitly allowed fallback produced the result. |
| `png-rasterizer-unavailable` | The host has no PNG rasterizer adapter. |
| `pdf-toolchain-unavailable` | The host has no LaTeX compiler adapter. |
| `html-static-interaction` | Static HTML retained markup without a live widget runtime. |
| `gltf-float32-approximation` | Exact Scene3D coordinates were rounded to Float32. |
| `gltf-line-width-portability` | glTF lines cannot portably retain authored width. |

## Complete CLI example

`examples/renderers/all-formats.rix` sends one retained Graphic to all four 2D
targets and one document tree to all five document targets:

```bash
bun bin/rix.js --out=tmp/renderer-example-out examples/renderers/all-formats.rix
```

The example and its binary outputs are exercised by the CLI renderer tests.

## 3D boundary

The retained `rix.scene3d@1` schema, versioned wireframe and flat-lit snapshots,
and glTF JSON exporter are implemented. Scene3D owns cameras and projection.
Canvas, TikZ, PNG, and GIF frame export accept the versioned snapshot directly;
SVG can render its `value` Graphic. Browser Scene3D supports retained orbit,
projection, picking, and annotation controls. Static snapshots preserve their
projection and approximation evidence; they do not claim certified visibility.
OBJ/MTL, STL, PLY, USD/USDZ, and GLB remain later format work. See the complete
[3D and n-dimensional guide](scene3d-guide.md).

## Repeated Canvas frames and large finite inputs

The Canvas host can reuse a bounded `createCanvasPathCache` and
`createCanvasPainter` from the Canvas plugin's `retained-canvas.js` module.
`paint(plan)` reports full, dirty or unchanged replay; call `invalidate()` after
an external same-size canvas reset and `dispose()` when the view closes.
Dirty repaint is conservative: transforms, paths, text and viewport changes
use full replay. Parsed paths are keyed by geometry, so style changes reuse
paths without reusing stale paint state.

An explicit `createCanvasWorkerHandler` can paint on OffscreenCanvas where the
host provides it. The host owns worker startup/disposal and main-thread or SVG
fallback. Accessibility text and semantic hit IDs travel beside the raster;
pixels do not replace the exact source. Browser support is detected at use time.

For finite large inputs, `.plot.BoundedLine`, `.plot.StreamLine` and
`.plot.HeatMapData` bound retained output. Downsampled endpoints/extrema retain
source IDs, and heatmap blocks retain exact means, extrema and source bounds.
Discard counts and aggregation disclosures remain visible in static output;
these operations do not reconstruct omitted data or start background readers.
See the [runnable capstones](../tutorial/capstones.md), the
[Plot tutorial](https://rix.ratmath.com/tutorial/plugin-plot.html), and the
[measured limits](../design/eval/runtime-performance.md).
