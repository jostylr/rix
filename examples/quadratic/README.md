# Quadratic rebasing

This example is the RiX version of the quadratic exploration formerly under
`apps/quadratic`. It rewrites

```text
f(x) = x² - 3x + 2
```

around `x = 1/2`, using exact rational arithmetic:

```text
f(x) = (x - 1/2)² - 2(x - 1/2) + 3/4
```

`quadratic.rix` demonstrates the same facts as the prototype, with `a`, `b`,
`c`, and `center` kept as exact RiX values:

- two exact synthetic-division stages;
- the centered polynomial and its tangent line;
- the coefficient relationship `[a, b + 2ad, f(d)]`;
- an optional portable parabola and tangent graphic through the plot plugin.

Run the example from the repository root:

```sh
bun rix/bin/rix.js rix/examples/quadratic/quadratic.rix
```

The graphical companion loads the optional Plot capability:

```sh
bun rix/bin/rix.js rix/examples/quadratic/quadratic-plot.rix
```

The runner approves the repository's built plugins when they are explicitly
requested, so `--plugin=plot` can preload Plot before the program runs. The
companion also loads Plot itself, so the command above works directly.

`quadratic-page.rix` is the browser version. It declares an output artifact
with `.Out`, and `--out` is the host-owned destination for that artifact:

```sh
bun rix/bin/rix.js --out=rix/examples/quadratic/out rix/examples/quadratic/quadratic-page.rix
```

Open `rix/examples/quadratic/out/index.html` in a browser. The page has exact
sliders for `a`, `b`, `c`, and `center`; moving one recomputes the centered
form and both synthetic-division displays. It also plots the quadratic and
its centered linear part, marking the selected center on the x-axis and the
exact point `(center, f(center))`. The output directory contains only the
artifacts declared by the program plus the shared browser runtime assets.
The plot window is fixed at `[-6, 6] × [-256, 256]`, which covers every slider
combination and keeps the origin centered. Pick a color and use **Freeze
quadratic** to retain that exact curve while exploring another; each frozen
curve retains its selected color.
The generated directory also includes `comic.html`: three fixed quadratics by
three shared centers, laid out as a portable snapshot grid. It is the same
scene/state model intended for future PDF export. The bundled runner does not
yet write PDF files; it writes the declared HTML artifacts.
For an interactive page, make `.Out("page.html", $view)` the program's final
expression; this keeps the page connected to the named reactive view.

Run its RiX test program:

```sh
bun rix/bin/rix.js test rix/examples/quadratic
```

Change `a`, `b`, `c`, or `center` in `quadratic.rix` to explore another exact
quadratic and another rational center. `RebaseAt(d)` can be reused for
additional centers without changing the polynomial definition.
