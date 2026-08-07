# `.html`

Renders any portable output value as a standalone semantic HTML document.
It reuses the host's structured-output HTML traversal, embeds Graphics as SVG,
escapes values and titles, and includes a compact default stylesheet.

Use `.html.Render(value, {= title="..." })` or `.Out("report.html", value)`.
The CLI deliberately keeps a final reactive HTML `.Out` on its interactive
page path; other HTML artifacts use this static renderer.
