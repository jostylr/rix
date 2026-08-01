# RiX documentation source

This directory contains the authored source for the RiX documentation site. Quarto renders it to `../docs/`, which is the GitHub Pages deployment directory.

The documentation has three authority levels:

1. Current guides and generated reference: `index.qmd`, `getting-started.qmd`, `language-at-a-glance.qmd`, `status.qmd`, `introduction.md`, `plugin-catalog.md`, `tutorial/`, `eval/`, and `reference/`.
2. Implementation and design material: `developer-guide.qmd`, selected `parser/` pages, `design/eval/`, `design/plugins.md`, and `rix-rationales.md`.
3. Historical/archive material: dated reports, early phase specs, scratch text, the old parser Pages build, and pre-generated parser HTML. These files preserve design history but are not the current language contract.

Build and preview from the `rix/` directory:

```sh
bun run build:docs
bun run preview:docs
```

Do not edit `../docs/` by hand. The generated runtime catalog at `reference/system-reference.md` is refreshed by `documentation/scripts/generate-reference.js`.

## Runnable RiX examples

Runnable examples are fenced blocks marked with `exec=true`; blocks containing
an explicit `##@` assertion or standalone `##` output marker are also checked
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

`##@ expression` evaluates the expression with the preceding result inserted
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

Use `##: kind` for a checked structural annotation. Optional brackets check
the size: `array[5]`, `set[3]`, `map[2]`, `tuple[2]`, or `tensor[2x2]`.

Run the checker directly with:

```sh
bun run docs:examples
```
