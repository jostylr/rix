# One retained publication plan

`.document.Publish(output, options)` attaches a validated `rix.publication-plan@1`
record to the existing output tree. Children and exact values are shared, and
`.document.EncodeJSON` persists the plan separately from the content. Use
`.document.PublicationPlan(options)` to reuse normalized options. Existing numeric
presentation policies compose with this layout metadata.

```{.rix exec=true}
.Plugin.Load("document");
.Plugin.Load("latex");
table := .document.Label("measurements",.Table(["x","exact value"],[[1,1/3],[2,2/3],[3,1]]));
report := .document.Report("Exact measurements",[.Paragraph("A retained report"),table]);
report := .document.Publish(report,{= columns=2,theme=:compact,longTableRows=3,index=[{= term="Measurements",label="measurements"}] });
.document.DecodeJSON(.document.EncodeJSON(report))[:value];
```

| Option | Supported values and limits |
|---|---|
| `profile` | `article`; `slides` requires explicit `.Slide(content,title)` / `.Slides(...)` |
| `pageSize` | `letterpaper` (default), `a4paper`, `a5paper` |
| `slideSize` | `wide` (16:9 default), `standard` (4:3) |
| `theme` | Existing `plain` or `compact` |
| `columns` | 1–4, default 1; article prose only |
| `floats` | `inline` default, `top`, `bottom`, `page`; target placement hints |
| `longTableRows` | 1–1000, default 40; longtable threshold / Beamer chunk size |
| `repeatTableHeaders` | 0 or 1, default 1 |
| `runningRegions` | 0 or 1, default 1; existing document Header/Footer records |
| `bibliography` | `retained`: use existing Bibliography/Citation nodes |
| `index` | Up to 500 `{= term="...",label="..." }` entries, sorted deterministically |
| `requires` | Up to 16 names: `svg`, `png`, `tikz`, `audio`, `video`, `pdf`, `tagged-pdf`, `pdf-a`, `embedded-fonts`, `color-managed` |

Index targets must exist; duplicate labels fail. Semantic traversal is bounded
at 20,000 nodes and depth 64. Unknown plan versions/options fail. Requiring a
capability does not install a tool or establish conformance: render diagnostics
report requirements the target cannot promise. Imports execute nothing.

LaTeX/PDF use article or Beamer from this plan. Long article tables leave columns,
repeat headers on each page, and retain pre-numbered captions. Beamer tables
split at the row budget using frame continuation. Prose can use `multicol`;
headers/footers use `fancyhdr` with a 512-character textual limit and a truncation
diagnostic. Running slide regions fall back to frame navigation. Plain/compact
styles choose existing colors and spacing. Render metadata lists packages,
chosen figure assets and document class. SVG assets require the existing host
conversion path; TikZ/PNG are explicit renderer options. No PDF/A, tagged PDF,
font embedding or print-color conformance is claimed by a successful compile.

HTML has responsive columns, sequential slides, printable table headers and a
linked index. Markdown retains sequential flow. Quarto emits HTML articles or
RevealJS decks; tables/figures preserve original anchors alongside Quarto's
cross-reference prefixes. Header/footer repetition and precise float placement
vary by target and are disclosed. Exact sources and evidence remain in the tree
and source sidecar; page layout cannot certify the underlying mathematics.

## Books and sites

```{.rix exec=true}
.Plugin.Load("document");
.Plugin.Load("quarto");
first := .Fragment([.Heading(1,"Introduction","intro"),.Paragraph(.Link("chapters/detail.qmd#detail","Details"))]);
second := .Fragment([.Heading(1,"Details","detail"),.Paragraph(.Link("../index.qmd#intro","Introduction"))]);
project := .document.Project([{= path="index.qmd",title="Introduction",value=first },{= path="chapters/detail.qmd",title="Details",value=second }],{= type=:book,title="Exact study" });
.quarto.Render(project)[:metadata];
```

A project contains 1–256 unique safe `.qmd` paths and ordinary retained outputs.
Book projects begin with `index.qmd`; `website` and `default` are also supported.
Ordinary `.Link` nodes express cross-document references, validated before
rendering. `.quarto.Render(project,{= assets=:svg })` returns every page, stable
per-document figure directories and `_quarto.yml` in its asset list. Source
creation performs no filesystem access. CLI output writes returned assets;
Notebook shares the project YAML builder. Paths cannot escape the project.
Compile the saved project with an installed Quarto toolchain.

`examples/renderers/publication-plan.rix` exports one report and one explicit
deck to HTML, QMD, TeX, PDF and inert exact JSON sidecars. Actual article/Beamer
compilation, multipage repeated headers, RevealJS and a linked book are acceptance
fixtures. See [portable assets](output-assets.md) for moved/offline packaging and
[the execution plan](https://github.com/jostylr/ratmath/blob/main/WORK_PLAN.md) for deferred publishing guarantees.
