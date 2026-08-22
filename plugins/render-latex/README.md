# `.latex`

Renders portable documents and figures to standalone LaTeX. It preserves
headings, paragraphs, inline/display math, lists, quotes, tables, figures,
labels, and code blocks. Core Graphics are lowered to TikZ inside the same
document.

Use `.latex.Render(document)` or `.Out("report.tex", document)`. Producing TeX
does not require an installed compiler.

The runnable
[`synthetic-division-publication.rix`](../../examples/renderers/synthetic-division-publication.rix)
example publishes the exact synthetic-division Grid and quotient/remainder
table as standalone TeX.

Phase 2 negotiates only the packages required by the selected figure path.
`figureAsset="tikz"`, `"svg"`, or `"png"` chooses inline TikZ or a delegated
stable asset; `assetDir`, `pageSize`, and `placement` control the portable
source contract. Document reports retain their resolved numbering,
bibliography, regions, and theme accent. Explicit LaTeX target nodes are emitted
only with `rawMarkup="allow"`; the default is their safe fallback.
