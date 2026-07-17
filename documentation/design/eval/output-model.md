# Structured output, documents, and graphics

::: {.callout-warning title="Design proposal — not implemented"}
This is a proposed portable-output model for RiX. None of the constructors,
methods, interpolation syntax, plugin manifests, or renderers described here
are currently part of the runtime. The examples establish intended source
syntax and contracts; they are not executable yet.
:::

## Goal

RiX should be able to return useful output values—formatted tables, documents,
figures, and diagrams—without making the language depend on one UI, browser,
or file format.

The central separation is:

```text
RiX computation → portable output value → renderer negotiation → host display/export
```

A table remains a table whether it is displayed in a REPL, a notebook, HTML,
SVG, Quarto/PDF, or a saved report. A plot plugin constructs a portable graphic
value; it does not directly draw into a browser DOM. A browser, CLI, or export
host chooses a renderer appropriate to its capabilities.

```mermaid
flowchart LR
  R["RiX values"] --> C[".Table / .Fragment / .Graphic"]
  C --> O["Typed portable output value"]
  P["Plot / geometry / algebra plugins"] --> O
  O --> N["Renderer negotiation"]
  N --> T["text/plain"]
  N --> H["text/html"]
  N --> S["image/svg+xml"]
  N --> D["PDF / Quarto export"]
  N --> W["live widget host"]
```

The output value is the durable semantic object. MIME representations are
rendering products or caches, not the primary value.

## Scope and non-goals

The first output model is deliberately modest.

- It provides portable presentation descriptions and a small layout vocabulary.
- It retains exact RiX values until a renderer needs an approximation.
- It makes static output the default. Live, backend-dependent output is
  explicit through `Widget` values.
- It does **not** turn `Table` into a dataframe or query engine. A future
  `Relation`/dataset value can address data manipulation separately.
- It does **not** put HTML, SVG, Canvas, PDF, DOM, filesystem, or network
  access in the core constructors.

## Standard output capability group

The system context should expose a standard `Output` capability group. Its
members are available through the normal system-object syntax, so all source
calls are capitalized:

```rix
.Table(...)
.Fragment(...)
.Graphic(...)
.Figure(...)
.Grid(...)
.Heading(...)
.Text(...)
```

The parser normalizes system capability names internally, but source examples
use readable Pascal case. Map fields are data keys, not function names, and
remain lowercase:

```rix
.Table({= columns = columns, rows = rows })
```

The initial group should contain the following constructors and generic output
protocols.

| Value / operation | Role |
|---|---|
| `.Text` | Explicit text node, particularly useful in a document fragment. |
| `.Heading` | Structured document heading. |
| `.Fragment` | Ordered document/output children. |
| `.Table` | Semantic, tabular presentation of columns and rows. |
| `.Grid` | General positioned layout cells with spans and rules; suitable for mathematical layouts. |
| `.Graphic` | Portable retained-mode 2D scene. |
| `.Figure` | A graphic, table, or grid with caption, label, and accessibility metadata. |
| `.Render` / `value.Render(...)` | Resolve a renderer for a target or host context. |
| `.Snapshot` / `value.Snapshot(...)` | Produce a static representation where possible. |
| `.Serialize` / `value.Serialize()` | Preserve the portable value for notebooks, reports, and transfer. |

`Widget` and `Scene` are planned extension values. A `Widget` is explicitly
host/runtime-dependent. A `Scene` is a retained 3D scene that can be rendered
interactively or snapshotted to a `Graphic`; it should not be silently treated
as an ordinary 2D graphic.

## What the constructors do

The constructors do more than store an arbitrary input map, but they do not
render. They validate, normalize, and return transparent typed records with
stable invariants.

For example, `.Table` normalizes concise column labels into column descriptors,
checks row shape, records semantic table metadata, and preserves the actual
RiX values in cells:

```rix
.Table(["x", "F(x)"], rows)
```

is conceptually equivalent to:

```rix
.Table({=
    columns = [
        {= id = "x", label = "x" },
        {= id = "fX", label = "F(x)" }
    ],
    rows = rows,
    options = {= }
})
```

The internal representation can be map-like and inspectable, but must be a
semantic `Table` record rather than a map whose interpretation each renderer
has to guess. The same principle applies to `Graphic`, `Grid`, and document
nodes.

The core runtime should supply reliable plain inspection for every output
value, for example `Table: 2 columns × 10 rows` and `Graphic: 600 × 400, 7
scene nodes`. A standard text renderer may show an aligned terminal table.
Rich HTML, SVG, PDF, Canvas, and widget renderers remain plugins or host
adapters.

## Constructor forms and multifunctions

Every standard constructor has a canonical map form and compact overloads.
The map form is the complete, extensible API. Positional forms are conveniences
that normalize to the same canonical record.

```rix
.Heading({= level = 1, content = "Function values" })
.Heading(1, "Function values")

.Graphic({=
    size = [600, 400],
    children = [.Path({= points = points, style = {= stroke = "blue" } })]
})
.Graphic([600, 400], [.Path(points, {= stroke = "blue" })])

.Table({= columns = columns, rows = rows })
.Table(columns, rows)
.Table(columns, rows, {= caption = "Values of F" })
```

These variants should be system multifunctions (or capability shims that
delegate to system multifunctions). Their job is dispatch and normalization;
they all produce the same standard type. The explicit map variant is the
general fallback and makes later additions backward-compatible.

The proposed initial shapes are:

```rix
.Text({= value = text, style = {= } })
.Heading({= level = integer, content = value, id = _, style = {= } })
.Fragment({= children = values, metadata = {= } })
.Table({= columns = columns, rows = rows, caption = _, options = {= } })
.Grid({= columns = columns, rows = rows, rules = [], style = {= } })
.Graphic({= size = [width, height], children = nodes, viewBox = _, metadata = {= } })
.Figure({= content = value, caption = _, label = _, alt = _ })
```

Plain values in a `Fragment` or `Grid` cell are retained as values. A renderer
uses its formatting protocol to display an exact rational, interval,
polynomial, or string without converting it at construction time.

## Output methods and protocols

These are proposed methods, not a commitment to attach renderer code to every
type. Method dispatch invokes generic protocols that renderers and plugins may
extend.

| Applies to | Proposed methods | Meaning |
|---|---|---|
| Every output value | `.Inspect()`, `.With(spec)`, `.Serialize()`, `.Render(target, options)`, `.Snapshot(target, options)` | Inspect, make an immutable presentation variation, preserve, render, or make a static result. |
| `Fragment` | `.Append(value)`, `.Prepend(value)`, `.Flatten()` | Compose output without string concatenation. |
| `Table` | `.Columns()`, `.Rows()`, `.Cell(row, column)`, `.With(spec)`, `.Format(column, spec)` | Query presentation structure and create a changed view. |
| `Grid` | `.Cell(row, column)`, `.With(spec)`, `.WithRule(rule)` | Query or vary non-tabular layout. |
| `Graphic` | `.Bounds()`, `.Transform(transform)`, `.With(spec)` | Inspect and vary a scene without rasterizing it. |
| `Figure` | `.Content()`, `.Caption()`, `.With(spec)` | Access or vary document metadata. |

`Table.With`, `Graphic.With`, and similar methods are immutable transformations:
they create a new output value. A plugin adds renderer or adapter registrations
rather than mutating an already-created value.

### Serialization and static/live distinction

Every portable output value must be serializable and reconstructable without a
renderer. `Table`, `Grid`, `Fragment`, `Graphic`, and `Figure` therefore carry
only semantic values, standard style metadata, and plugin-versioned extension
data.

```text
portable value     → can inspect, serialize, or render statically
Widget             → may require JavaScript and a plugin at viewing time
Scene              → may be live, but must offer a static Graphic snapshot when exported
```

When no rich renderer is installed, a host displays the portable text fallback
instead of failing because an SVG, browser, or graphics library is absent.

## Text interpolation and structured composition

Ordinary quoted strings remain literal:

```rix
"The value is @{x}."       ## literal characters; no interpolation
```

The proposed interpolated-text syntax is `@"..."`:

```rix
message := @"root near @{x}; error @{err}"
```

`@"..."` must be recognized by the tokenizer/parser as a dedicated literal.
Under today’s grammar it would parse as an `@` identifier adjacent to a string,
so reserving it is a deliberate small syntax change. Inside the template,
`@{expression}` is an evaluated hole. Outside a template, existing deferred
code keeps its meaning:

```rix
later := @{; F(x) }
```

The relationship is intentional: the outer template is literal context, and a
hole evaluates/splices a value into that context. Backticks should not be used
for interpolation: they are already reserved for embedded-language literals
and currently do not have an executable renderer path.

An interpolated string is text. If an output value is inserted into one, it
uses its deterministic text representation:

```rix
message := @"Computed @{table}"
```

That is useful for diagnostics, but cannot make `table` an interactive,
exportable table inside a string. Structured output is composed directly:

```rix
report := .Fragment({=
    children = [
        .Text(@"Computed values:"),
        table
    ]
})
```

A future document-template literal may preserve a table or graphic inserted at
a document-level hole. It should be a distinct `Fragment`-producing construct,
not an accidental behavior of text interpolation.

## Realistic uses

### Table of exact function values

This is the baseline dynamic-table use case. `|>>` is the elementwise map
pipe; `|>` would pass the whole array to the function once.

```rix
F := (x) -> x^2 - 2*x + 1
xs := [0, 1, 2, 3, 4]

values := .Table({=
    columns = [
        {= id = "x", label = "x", align = :right },
        {= id = "f", label = "F(x)", align = :right }
    ],
    rows = xs |>> (x) -> [x, F(x)],
    caption = "Selected values of F"
})
```

The stored entries are RiX values, not preformatted decimal strings. A display
or export renderer decides whether to show `1/3`, `0.3333`, LaTex math, or a
host-specific display according to an explicit formatting context.

### A report with a table and figure

Document structure is ordinary output composition. It does not introduce a
second control-flow or loop language.

```rix
curve := .Plot.Function({=
    fn = F,
    domain = [-2, 4],
    axes = {= x = true, y = true },
    label = "F(x)"
})

report := .Fragment({=
    children = [
        .Heading(1, "Quadratic analysis"),
        .Text(@"The vertex occurs at x = @{1}."),
        .Figure({=
            content = curve,
            caption = "Graph of F",
            label = "fig:quadratic",
            alt = "An upward-opening parabola"
        }),
        .Figure({=
            content = values,
            caption = "Sampled values of F",
            label = "tbl:values"
        })
    ]
})
```

`.Plot.Function` belongs to a plotting plugin. Its result is a standard
`Graphic`, so the report itself remains portable.

### Function plot and heat map

The plot plugin owns axes, scales, ticks, curve sampling, discontinuity
handling, and color scales. It returns standard graphics rather than a DOM
object or chart-library object.

```rix
F := (x) -> x^3 - 3*x

curve := .Plot.Function({=
    fn = F,
    domain = [-3, 3],
    size = [720, 420],
    samples = 500,
    style = {= stroke = "#2463a5", width = 2 }
})

H := (x, y) -> .Exp(-(x^2 + y^2))

heat := .Plot.HeatMap({=
    fn = H,
    x = [-3, 3],
    y = [-3, 3],
    resolution = [160, 160],
    colors = .ColorScale("viridis"),
    legend = true
})
```

The heat-map plugin may lower each colored tile to a standard `Graphic`, or it
may retain a portable `HeatMap` extension node that an SVG/Canvas renderer
understands. In either case, it must provide a static snapshot path.

### Synthetic geometry construction

The geometry plugin holds exact geometric objects and constructions. Drawing
is an explicit conversion to a graphic, so a proof/construction remains
separate from its visual presentation.

```rix
A := .Geometry.Point([0, 0])
B := .Geometry.Point([6, 0])
C := .Geometry.Point([2, 4])

ab := .Geometry.Line(A, B)
ac := .Geometry.Line(A, C)
bc := .Geometry.Line(B, C)

bisector := .Geometry.AngleBisector(A, B, C)
D := .Geometry.Intersection(bisector, ac)

diagram := .Geometry.Draw({=
    objects = [ab, ac, bc, bisector, A, B, C, D],
    labels = {= A = "A", B = "B", C = "C", D = "D" },
    size = [640, 420]
})
```

`D` may have exact or interval coordinates. The renderer chooses an
approximation policy only while creating pixels or SVG coordinates.

### 3D scene construction

The 3D plugin produces a retained `Scene` rather than treating WebGL state as
the value. A host with an interactive renderer can orbit the camera; an export
host can ask for an SVG/PNG `Graphic` snapshot.

```rix
surface := .Scene3D.ParametricSurface({=
    fn = (u, v) -> [u, v, .Sin(u) * .Cos(v)],
    u = [-3, 3],
    v = [-3, 3],
    material = {= color = "#4b9cd3", opacity = 0.85 }
})

scene := .Scene3D({=
    objects = [surface],
    camera = {= position = [6, 5, 7], target = [0, 0, 0] },
    lights = [{= type = :directional, direction = [1, -1, -1] }]
})

staticFigure := scene.Snapshot(:svg, {= size = [720, 480] })
```

### Synthetic division: use a grid, not a data table

Synthetic division has mathematical layout—aligned numbers, a vertical bar,
and a horizontal rule—not a table of independent records. It should therefore
use `Grid`, which supports cell spans and rules, rather than overloading
`Table` with layout-specific behavior.

A direct layout can be written with core primitives:

```rix
division := .Grid({=
    columns = [{= width = :auto }, 1, 1, 1, 1],
    rows = [
        [1, 2, -6, 2, -1],
        [_, _, 2, -4, -2],
        [_, 2, -4, -2, -3]
    ],
    rules = [
        {= kind = :vertical, afterColumn = 1, rows = [1, 2] },
        {= kind = :horizontal, aboveRow = 3, columns = [2, 5] }
    ],
    style = {= align = :right, math = true }
})
```

It renders as the familiar calculation:

```text
  1 │  2  -6   2  -1
    │      2  -4  -2
    ├────────────────
    │  2  -4  -2  -3
```

An algebra-layout plugin should make this even easier while returning the same
portable `Grid`:

```rix
division := .Algebra.SyntheticDivision(1, [2, -6, 2, -1])
```

The plugin calculates the intermediate products and sums, adds the standard
grid rules, and can attach explanatory metadata. It does not need HTML/CSS or
an SVG implementation. The same `Grid` can be embedded in a `Figure` or a
report and rendered by terminal, HTML, LaTex, or PDF renderers.

## Plugin contract

Plugins participate in one or more narrowly defined roles:

| Role | Example | Returns / contributes |
|---|---|---|
| Constructor plugin | `Plot`, `Geometry`, `Algebra` | Standard `Graphic`, `Grid`, `Table`, `Scene`, or `Fragment` values. |
| Renderer plugin | `Svg`, `Html`, `Terminal`, `Pdf` | Render handlers for standard values and target MIME types. |
| Host adapter | notebook webview, CLI, PDF exporter | Renderer negotiation, asset storage, display, and export. |
| Widget plugin | interactive 3D viewport | A `Widget` plus an explicit static snapshot implementation. |

Each plugin should declare at least:

```text
id and version
RiX and output-schema compatibility range
capabilities it provides
input/output value types and renderer targets
required permissions (for example: none, files, network, DOM)
serialization/extension schema and snapshot support
```

For example:

```toml
id = "rix-plot"
version = "0.1.0"
requires_rix = ">=0.1"
requires_output_schema = "1"

[provides]
capability_group = "Plot"
constructors = ["Plot.Function", "Plot.HeatMap", "ColorScale"]
output_types = ["Graphic"]

[permissions]
default = []
```

Renderer selection is a protocol dispatch, conceptually:

```text
Render(value, target, options)
  1. choose a renderer that declares support for the value type and target;
  2. supply explicit approximation, styling, and asset options;
  3. return a MIME representation or a clear unsupported-target result.
```

An output plugin may use namespaced extension metadata, but it should never
require every consumer to load its implementation just to inspect or serialize
the base output value.

## Repository and distribution strategy

The initial first-party plugin library should live in the main RiX repository.
The output schema, constructor semantics, test fixtures, and standard plugins
will evolve together during the alpha phase; a monorepo makes those API changes
reviewable and testable as one unit.

Suggested eventual layout:

```text
rix/
  src/                         # language and standard output schema
  plugins/
    output-basic/              # text fallback and shared helpers
    svg/                       # Graphic/Grid/Table → SVG
    html/                      # Fragment/Table/Figure → HTML
    plot/                      # function plots, axes, heat maps
    geometry/                  # constructions → Graphic
    algebra-layout/            # synthetic division and related layouts
    scene3d/                   # Scene construction and snapshots
  hosts/
    cli-output/
    notebook-output/
```

This does not require every host to bundle every plugin. A CLI might load
`output-basic`, `algebra-layout`, and `svg`; a notebook host might additionally
load `plot`, `html`, and `scene3d`.

Separate repositories become useful once a plugin has an independent release
cadence, substantial external/native/browser dependencies, or third-party
ownership. The public plugin contract should be stable before encouraging that
split. Regardless of repository location, a plugin must depend on the shared
output-schema package rather than copy the type definitions.

## Implementation sequence

1. Define the serializable output record schema and base inspection format.
2. Add the `Output` capability group and the map/positional constructor
   multifunctions for `Text`, `Heading`, `Fragment`, `Table`, `Grid`,
   `Graphic`, and `Figure`.
3. Implement serialization and a basic terminal renderer, including grid rules.
4. Add the SVG/HTML renderer plugins and snapshot/renderer negotiation.
5. Build one constructor plugin at a time: algebra layout first, then plotting,
   geometry, heat maps, and 3D scenes.
6. Add the `@"...@{...}..."` interpolated-text syntax after the output types
   and text-format protocol are established.

The synthetic-division plugin is a useful early acceptance test: it exercises
exact values, grid layout, rules, math formatting, embedding in documents, and
multiple renderers without requiring a full plotting stack.
