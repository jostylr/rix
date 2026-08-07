# `.quarto`

Renders portable documents or slides to Quarto Markdown (`.qmd`). It adds
front matter, preserves native Markdown constructs, emits Quarto callouts and
labels, and lowers Graphics to inline SVG. Quarto itself is not needed to
produce the source.

Use `.quarto.Render(document, {= title="...", format="html" })` or
`.Out("report.qmd", document)`.
