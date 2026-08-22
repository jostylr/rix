# `.document`

Assembles ordinary core output nodes into a deterministic numbered report.
It numbers sections, figures, and tables; resolves forward references and
citations; carries a bibliography and an asset manifest; and applies reusable
templates without introducing a second document tree.

```rix
.Plugin.Load("document");
values := .document.Label("tbl-values",
    .Table(["name", "value"], [["half", 1/2]], {= caption="Exact values" })
);
report := .document.Report("A short report", [
    .Paragraph([.Text("See "), .document.Ref("tbl-values"), .Text(".")]),
    values
], {= author="Ada", theme=:compact });
```

The public operations are:

| Operation | Contract |
| --- | --- |
| `Report(title, children, options?)` | Returns a core `Fragment` with a title, optional author, numbered content, and resolved links. |
| `Label(id, value)` | Labels a Heading, Section, Figure, or Table. Native heading/figure IDs are also recognized. |
| `Ref(id, text?)` | Creates an inline forward-reference marker. `Report` resolves it to a core `Link`. |
| `Theme(name?, options?)` | Creates a `plain` or `compact` `rix.document.theme@1` value; `accent` and `density` may be customized. |
| `References(report)` | Returns the resolved ID, kind, number, and display text records. |
| `Bibliography(entries, options?)` | Validates stable citation keys and portable author/title/year/URL records. |
| `Citation(keyOrKeys, options?)` | Creates an inline citation marker resolved by `Report`; supports `prefix` and `suffix`. |
| `AssetManifest(entries)` / `Asset(manifest, id)` | Declares safe relative assets and retrieves one immutable manifest record. |
| `Numbering(options?)` | Selects decimal, Roman, or alphabetic numbering, independent starts, optional section prefixes, and numeric or author-year citations. |
| `Header(value)` / `Footer(value)` | Marks portable output fragments for the corresponding report region. |
| `Template(name, defaults?)` / `ApplyTemplate(template, data)` | Merges immutable defaults with required `title` and `children` slots and creates a report. |
| `TargetMarkup(target, content, fallback?)` | Carries raw target text only inside an explicit target-specific node; ordinary renderers see only the fallback. |

IDs begin with a letter and contain letters, digits, colon, underscore, or
hyphen. Duplicate and unresolved IDs are errors. Numbering is based only on
source order and is therefore identical in CLI, Web, and Notebook hosts.

The result retains the compatible `rix.document.report@1` fragment schema and
sets `documentVersion` to 2. Existing HTML, Markdown, Quarto, LaTeX, and PDF
renderers can consume it as a core Fragment. Phase-2-aware renderers additionally
read its bibliography, assets, theme, numbering, regions, and target-markup
metadata. A target-markup node never injects its raw content into a generic
renderer, which keeps renderer choice from becoming an ambient code-injection
path.

Bibliography and asset records are data, not filesystem or network operations.
Asset paths must be relative and may not contain `..`; a host still decides how
and whether to resolve them. Reports fail on missing citations, missing
references, duplicate labels, duplicate citation keys, and malformed assets.
