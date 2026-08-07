# `.latex`

Renders portable documents and figures to standalone LaTeX. It preserves
headings, paragraphs, inline/display math, lists, quotes, tables, figures,
labels, and code blocks. Core Graphics are lowered to TikZ inside the same
document.

Use `.latex.Render(document)` or `.Out("report.tex", document)`. Producing TeX
does not require an installed compiler.
