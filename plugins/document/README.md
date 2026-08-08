# `.document`

Assembles ordinary core output nodes into a deterministic numbered report.
Phase 1 numbers sections, figures, and tables; resolves forward references;
prefixes captions; and attaches a small semantic theme without introducing a
second document tree.

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

IDs begin with a letter and contain letters, digits, colon, underscore, or
hyphen. Duplicate and unresolved IDs are errors. Numbering is based only on
source order and is therefore identical in CLI, Web, and Notebook hosts.

The result schema is `rix.document.report@1`, but the result itself remains a
core `Fragment`. Existing HTML, Markdown, Quarto, LaTeX, and PDF renderers work
without understanding a plugin-specific document node.

