# RiX documentation source

This directory contains the authored source for the RiX documentation site. Quarto renders it to `../docs/`, which is the GitHub Pages deployment directory.

The documentation has three authority levels:

1. Current guides and generated reference: `index.qmd`, `getting-started.qmd`, `language-at-a-glance.qmd`, `status.qmd`, `introduction.md`, `plugin-catalog.md`, `eval/`, and `reference/`. RiX Web's `../rix-web/tutorials/` directory plus each first-party plugin's `tutorial.md` are the learner-facing tutorial authority; `eval/output-guide.md`, `eval/renderer-guide.md`, and `eval/controls-guide.md` are the reference material for output, renderers, and controls.
2. Implementation and design material: `developer-guide.qmd`, selected `parser/` pages, `design/eval/`, `design/plugins.md`, and `rix-rationales.md`.
3. Historical/archive material: dated reports, early phase specs, scratch text, the old parser Pages build, and pre-generated parser HTML. These files preserve design history but are not the current language contract.

Build and preview from the `rix/` directory:

```sh
bun run build:docs
bun run preview:docs
```

These commands use dynamic navigation for low-churn development builds. Use
`bun run build:docs:static` or `bun run preview:docs:static` to have Quarto
pre-render the complete sidebar, breadcrumbs, and previous/next links into each
page. Both modes are generated from `navigation.js`.

Do not edit `../docs/` by hand. The generated runtime catalog at `reference/system-reference.md` is refreshed by `documentation/scripts/generate-reference.js`.

## Site navigation

`navigation.js` is the ordered source of truth for the documentation sidebar
and previous/next links. The build publishes it as `_navigation.json`, and the
browser loads that small manifest into Quarto's stable sidebar shell in the
default dynamic profile. Adding or removing a page therefore does not rewrite
the page list into every generated HTML file. The static profile instead uses a
generated `_quarto-static.yml` so its pre-rendered navigation cannot drift from
the dynamic manifest. Also add or remove the source in `project.render` in
`_quarto.yml`.

The generated HTML retains a link to the overview while the manifest loads or
when JavaScript is unavailable.

## Runnable RiX examples

Runnable examples are fenced blocks marked with `exec=true`; blocks containing
a native `##@` or `##:` RiX check, or a standalone `##` output marker, are also checked
automatically. Quarto renders the source block, while the documentation build
executes it through the normal RiX evaluator and inserts any requested output
below it:

```{.rix exec=true id=example-name}
##SETUP##
x := 7
##SETUP##
x + 1 ##@ == 8
##
```

`##@ expression` is native RiX syntax and evaluates the expression with the preceding result inserted
on the left, so `x ##@ == 7` checks equality and `xs ##@ |> isSorted` can use
a setup-defined predicate. The assertion passes when it returns a non-null
value. A standalone `##` displays the most recent result. A `##SETUP## ...
##SETUP##` block is executed as hidden setup and removed from the displayed
source. In HTML output, a “Show setup code” disclosure provides an escape hatch;
setup is suppressed in PDF output. The older `/*** ... ***/` form remains
accepted for compatibility. Use
`expect-error="text"` for an example that must fail, and `parse=true` for a
parser-only example. Ordinary `##` comments and `###` comments are not
assertions.

Use `async=true` with `exec=true` when an example must run through the
promise-aware evaluator, for example an AsyncStream terminal. Assign an async
terminal result before applying `##@` so the postfix check itself operates on
the resolved RiX value:

```{.rix exec=true async=true}
values := .Stream([1, 2, 3]).Collect();
values.Join() ##@ == "1,2,3";
```

Use native `##: kind` for a checked structural annotation. Optional brackets
check the size: `array[5]`, `set[3]`, `map[2]`, `tuple[2]`, or `shaped[2x2]`.
`##! Debug(...)`, `Trace(...)`, `Info(...)`, and `Dump(...)` are native,
value-preserving diagnostic taps. `Log(...)` is a concise alias for `Dump(...)`.

Run all documentation tests and runnable-example checks directly with:

```sh
bun run docs:verify
```

`bun run build:docs` and `bun run build:docs:static` run this verification
before rendering.
