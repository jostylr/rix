# `.markdown`

Renders portable document/output trees as CommonMark-oriented Markdown.
Semantic headings, inline emphasis/code/math, lists, quotes, tables, media
links, and code/math blocks remain native Markdown. Graphics are embedded as
portable inline SVG, and interactive controls/timelines report static fallback
diagnostics.

Use `.markdown.Render(document)` or `.Out("report.md", document)`.

Phase 2 accepts `assets="inline"`, `"svg"`, or `"png"`, plus a safe relative
`assetDir`. External figures are returned as deterministic RenderResult assets.
Resolved references and themes are recorded in metadata. Explicit Markdown
target nodes require `rawMarkup="allow"`; `"fallback"` is the default and
`"deny"` rejects them.
