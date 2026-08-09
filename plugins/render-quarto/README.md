# `.quarto`

Renders portable documents or slides to Quarto Markdown (`.qmd`). It adds
front matter, preserves native Markdown constructs, emits Quarto callouts and
labels, and lowers Graphics to inline SVG. Quarto itself is not needed to
produce the source.

Use `.quarto.Render(document, {= title="...", format="html" })` or
`.Out("report.qmd", document)`.

Graphics are inline SVG by default. Set `assets="svg"` or `assets="png"` to
return subsidiary files in the RenderResult, with `assetDir="assets"` as the
default relative directory. PNG assets require a host rasterizer. The CLI
writes returned assets safely alongside the QMD.
