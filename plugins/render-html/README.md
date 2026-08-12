# `.html`

Renders any portable output value as a standalone semantic HTML document.
It reuses the host's structured-output HTML traversal, embeds Graphics as SVG,
escapes values and titles, and includes a compact default stylesheet.

Use `.html.Render(value, {= title="..." })` or `.Out("report.html", value)`.
The CLI deliberately keeps a final reactive HTML `.Out` on its interactive
page path; other HTML artifacts use this static renderer.

The renderer recognizes the portable block `style` vocabulary used by
Fragment, Section, Figure, Table options, and ControlPanel: `layout` (`stack`,
`cluster`, `grid`, `split`), one to four `columns`, `gap` (`compact`, `normal`,
`spacious`), `variant` (`plain`, `card`, `hero`, `muted`), `width` (`narrow`,
`content`, `full`), and `align` (`start`, `center`, `stretch`). These become
enumerated `data-rix-*` attributes rather than arbitrary classes or CSS.
For a grid ControlPanel, individual control styles may add integer `row` and
`column` placement. Action shortcuts and Hold key states render as semantic
shortcut metadata, and `.Graphics.Action` renders as an accessible SVG action
group. The static `.html.Render` result does not execute those interactions;
generated reactive pages activate them through the shared browser widget
runtime.
