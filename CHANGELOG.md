# Changelog

## 0.1.0 — 2026-09-21

Initial public alpha of `@ratmath/rix`, the Rational Interval Expression Language.
The 0.1 line makes no source- or API-compatibility commitment.

### Language and mathematics

- Exact integers, rational numbers, rational intervals, and interval sets,
  with certified approximation and exact numeral-system support from Core 0.6.
- Parser, evaluator, configurable capability groups, collections, functions,
  reactive values, mathematical tensors, and asynchronous execution with
  cancellation and bounded concurrency.
- Optional first-party plugins for algebra, symbolic calculations, validated
  numerics, calculus, ODEs, plotting, geometry, statistics, and data operations.
  Individual plugins document their supported domains and limits.

### Hosts and tools

- Shared JavaScript module API and CLI for Node.js 22+ and Bun 1.4+.
  Installed commands use Node; explicit Bun invocation remains supported.
- Interactive REPL defaults to the curated `full` plugin set. `--plugins=...`
  replaces the default or saved selection, `--plugins=none` suppresses implicit
  preloads, and repeatable `--plugin=ID` flags add plugins. Scripts and embedded
  evaluators remain bare unless plugins are requested.
- Parser/IR utilities, formatting and verification commands, a language server,
  editor execution workers, and portable browser entry points.
- Bundled plugin source and live-page assets are prepared at package-build time;
  installed Node users do not need Bun's text loader or bundler.

### Documents and distribution

- Structured mathematical output, SVG and other graphics formats, HTML,
  Markdown, Quarto, LaTeX, and PDF workflows, plus offline live HTML output.
  Binary formats require the external tools listed in the renderer guide.
- Runnable examples, tutorials, API references, and package installation and
  embedding instructions in the README.
- Requires `@ratmath/core` ^0.6.0. Plugin sources, schemas, styles, examples, and
  prebuilt live assets are included in the npm package. Browser applications,
  native Notebook installers, and the VS Code extension are distributed separately.

### Verification

- Node 22/24/26 and Bun compatibility checks, isolated npm consumer checks,
  browser acceptance checks, and explicit generated-asset freshness checks.
- The release gate runs the complete coverage suite, native RiX tests,
  documentation checks, editor policy validation, and package verification.
  Aggregate tutorial tests use the same two-minute budget locally and in CI.
