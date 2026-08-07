# Renderer CLI example

From the `rix/` directory, run:

```bash
bun bin/rix.js --out=tmp/renderer-example-out examples/renderers/all-formats.rix
```

The output directory will contain:

```text
diagram.svg
diagram.canvas.json
diagram.tikz
diagram.png
report.md
report.html
report.qmd
report.tex
report.pdf
```

SVG, Canvas-plan JSON, TikZ, Markdown, HTML, Quarto, and LaTeX source need no
external programs. PNG requires `rsvg-convert` or ImageMagick's `magick`.
PDF requires `pdflatex`. Quarto itself is only needed if you later build the
emitted `.qmd` into another format.

The source deliberately sends one `.Graphics.Graphic` to every implemented 2D
renderer and embeds that same value in one portable document tree. It is also
executed by `tests/cli/renderer-export.test.js` when the binary toolchains are
installed. There is no pretend 3D export in this example: glTF/GLB and related
targets will follow the retained `Scene3D` value model.
