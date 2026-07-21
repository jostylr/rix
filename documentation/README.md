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
