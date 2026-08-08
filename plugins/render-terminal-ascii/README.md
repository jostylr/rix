# `.terminalAscii`

Provides a deterministic strict-ASCII fallback for portable Tables, Grids,
Fragments, Figures, and simple core Graphics. Load plugin ID `terminal-ascii`
and render through `.terminalAscii.Render(value, options?)`, generic
`.Render(value, "terminal-ascii")`, or the aliases `terminal`, `ascii`, `txt`,
and `text/plain`.

```rix
.Plugin.Load("terminal-ascii");
table := .Table(["name", "exact"], [["half", 1/2], ["third", 1/3]]);
.terminalAscii.Render(table, {= width=60 }).Get("content");
```

Phase 1 deliberately uses only printable ASCII plus newlines. Common
typographic punctuation is transliterated; remaining non-ASCII characters are
replaced with `?` and reported through a `terminal-non-ascii-replaced`
diagnostic.

`width` defaults to 80 characters and accepts integers from 20 through 240.
Tables and grids shrink wide columns and use `~` as the truncation marker. Text
lines are truncated rather than wrapped in Phase 1. Both cases emit
`terminal-width-truncated`. `height` controls Graphic snapshots and defaults to
16 rows, with a range of 4 through 80.

The Graphic fallback rasterizes path segments, circles, rectangles, and text
marks onto a character grid. Unsupported scene nodes remain visible as `?` and
produce `terminal-graphic-node-unsupported`; it is a portable fallback, not a
replacement for SVG, Canvas, or TikZ.

See [tutorial.md](tutorial.md).
