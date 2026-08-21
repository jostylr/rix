# `.terminalAscii`

Provides a deterministic strict-ASCII fallback for portable Tables, Grids,
Fragments, Figures, Slides, and simple core Graphics. Load plugin ID `terminal-ascii`
and render through `.terminalAscii.Render(value, options?)`, generic
`.Render(value, "terminal-ascii")`, or the aliases `terminal`, `ascii`, `txt`,
and `text/plain`.

```rix
.Plugin.Load("terminal-ascii");
table := .Table(["name", "exact"], [["half", 1/2], ["third", 1/3]]);
.terminalAscii.Render(table, {= width=60 }).Get("content");
```

The renderer deliberately uses only printable ASCII plus newlines. Common
typographic punctuation is transliterated; remaining non-ASCII characters are
replaced with `?` and reported through a `terminal-non-ascii-replaced`
diagnostic.

`width` defaults to 80 characters and accepts integers from 20 through 240.
The default `wrap=:truncate` policy preserves fixed-height output: Tables and
Grids shrink wide columns and use `~` as the truncation marker. Set
`wrap=:word` (or `wrap=1`) to wrap text, headers, and cells instead. Wrapped
columns preserve their declared left, center, or right alignment and emit the
informational `terminal-width-wrapped` diagnostic rather than a truncation
warning.

Set `pageHeight` from 4 through 200 to enable deterministic pagination. Each
page, including its `--- page i/n ---` header, fits that many lines; metadata
reports `pageHeight` and `pageCount`, and `terminal-paginated` records the
split. Without `pageHeight`, output remains one uninterrupted page. `height`
separately controls Graphic snapshots and defaults to 16 rows, with a range of
4 through 80.

`Slide` and `Slides` values render with plain ASCII slide headers. Deck titles,
slide titles, captions, and content use the same width, wrapping, and pagination
policies—there is no implicit Unicode, color, or terminal-control sequence.

The Graphic fallback rasterizes path segments, circles, rectangles, and text
marks onto a character grid. Unsupported scene nodes remain visible as `?` and
produce `terminal-graphic-node-unsupported`; it is a portable fallback, not a
replacement for SVG, Canvas, or TikZ.

See [tutorial.md](tutorial.md).
