---
title: "Capstones: from exact computation to a portable result"
description: "Six runnable workflows connecting publication, checked numerics, exact views, coordinates, cancellation, and spreadsheet interchange."
---

These capstones connect implemented features into useful results. Run commands
from the **`rix/` repository directory**, after the workspace's `bun run prep`.
Bun and the checked-out dependencies are required. Each source is linked below;
read and modify that source instead of copying a second version from this page.
Generated method reference chips remain the API reference.

The CLI is the reproducible baseline. Web and Notebook can render portable
output values, but live controls require their installed runtime and plugins.
A static HTML, SVG, or text result remains useful when a live host is unavailable.
No capstone requires RiX-Ed, network access, or a hosted service.

## 1. Publish an exact report and an interactive companion

**Prerequisites:** the [output guide](../eval/output-guide.md) and
[publication workflows](../eval/publication-workflows.md). Start with the existing
[publication project](https://github.com/jostylr/rix/blob/main/examples/publication-workflow/README.md), which
already contains two sources, local SVG media, named inputs, and a Notebook project.

```sh
bun bin/rix.js publish examples/publication-workflow/build.json --out=tmp/capstone-publication
bun bin/rix.js publish examples/publication-workflow/build.json --profile=live --out=tmp/capstone-live
```

Open the report's `document.html` and compare the small and large named inputs.
Inspect `manifest.json`: source hashes, artifact checksums, and diagnostics make
this a repeatable build. The review profile emits HTML, Markdown, Quarto, LaTeX,
and an inert bundle. PDF requires `pdflatex`; an unavailable PDF produces a
readable `.unavailable.txt` artifact rather than an invented successful PDF.
The exact `n/3` source stays rational even when a target chooses a decimal display.

Open a live `document.html`, change the input, and compare the recomputed result
with its initial static content. Use the review profile when scripts or the live
runtime are unavailable. For a bounded failure exercise, add `--watch`, introduce
a syntax error in a source, and confirm the last successful output survives;
repair the source to publish the next complete result. Stop watch when finished.
See the project README for the native and browser Notebook export path.

## 2. Report proved roots, ODE bounds, and unfinished work together

**Prerequisites:** [validated box search](https://github.com/jostylr/rix/blob/main/plugins/numerics/validated-boxes-tutorial.md)
and [ODE tubes](https://github.com/jostylr/rix/blob/main/plugins/ode/tutorial.md). These bundled plugins are loaded by
[the capstone source](https://github.com/jostylr/rix/blob/main/examples/capstones/certified-exploration.rix).

```sh
bun bin/rix.js examples/capstones/certified-exploration.rix
```

The first nonlinear search processes only five boxes: it reports
`budgetExhausted`, six pending boxes, and six unresolved leaves. Resuming with
26 boxes completes this fixture; replay acceptance is displayed beside the report.
A unique box is not necessarily a distinct root: boundary roots may occur in
multiple boxes. Preserve pending and unresolved regions in downstream views.

The same report compares exact-rational RK4 steps (`approximate`) with a checked
Picard tube (`validated`). Rational arithmetic alone does not certify ODE
truncation error. The deliberately too-small tube budget returns `partial` and a
covered interval of `0:0`; it does not prove nonexistence. Increase budgets only
explicitly. This capstone needs no native numerical provider. The Fragment/Table
result renders as static HTML or CLI text without a plotting or worker host.

## 3. Display rounded numbers without replacing exact source

**Prerequisites:** [numeric presentation](../eval/numeric-presentation.md).
The existing [numeric-presentation source](https://github.com/jostylr/rix/blob/main/examples/renderers/numeric-presentation.rix)
contains fractions, a reversed interval, a table, a sheet, a control snapshot,
and a graphic under one presentation policy.

```sh
bun bin/rix.js --out=tmp/capstone-numbers examples/renderers/numeric-presentation.rix
```

Open `numbers.html`, then inspect `numbers-source.txt`. The display of one third
is `0.333`, while the portable JSON retains the exact rational `1/3`. The explicit
mixed-fraction override illustrates a local choice inside the report-wide policy.
The source interval direction also survives formatting. Markdown, Quarto, and
LaTeX are alternative static outputs; the PDF target requires its supported
native backend and reports unavailability when it is missing.

The control is deliberately snapshotted, so the saved report does not imply a
live connection to a future evaluation. Change the rational source and rebuild
to update every format. For positional numeral systems, continue with
[the radix tutorial](https://github.com/jostylr/rix/blob/main/plugins/radix/tutorial.md) and its exact parsing rules.

## 4. Resolve tensor coordinates before choosing a sheet projection

**Prerequisites:** [tensor sheets](../eval/rixcel-tensors.md) and the
[Sheet guide](../eval/sheet-guide.md). Reuse the tested
[sheet-view source](https://github.com/jostylr/rix/blob/main/examples/rixcel/sheet-views.rix).

```sh
bun bin/rix.js examples/rixcel/sheet-views.rix
```

The cube has named `region`, `measure`, and `scenario` axes. Select the Forecast
plane, then resolve South/Cost/Forecast by labels: the result is **11**. Compare
that coordinate with the alternate row-by-depth view. A projection changes what
you see, not the stored coordinates or values. CLI text provides the static
alternative to the browser's address-aware grid; there is no Float conversion.

As a deliberate failure exercise, change `Forecast` in the `.At(...)` selector
to an unknown label. Lookup rejects it instead of guessing an index. Restore the
label before continuing. Large/infinite layouts need an explicit finite window;
[region and window contracts](../eval/rixcel-regions.md) describe those limits.

## 5. Cancel concurrent host work and verify cleanup

**Prerequisites:** basic JavaScript hosting and
[concurrency safety](../eval/concurrency-safety.md). Run the
[host source](https://github.com/jostylr/rix/blob/main/examples/capstones/async-cancellation.mjs) with Bun:

```sh
bun examples/capstones/async-cancellation.mjs
```

The host registers a read capability explicitly as safe for overlap and
cooperative with cancellation. Two admitted branches start before the controller
aborts; both release their listeners and execute `finally` once. The printed
record has `status: "cancelled"`, two started IDs, two cleaned IDs, and a fresh
static result of `1/2`. It uses a deterministic admission gate, not a timer race.

This is a **host JavaScript program**, not source to paste into a RiX editor.
An editor without the registered `.pending` capability cannot run its inner
expression. That is an unavailable-host boundary, not an arithmetic failure.
Ordinary exact expressions or saved static output remain available there.
Cancellation cannot roll back completed writes or forcibly interrupt synchronous
JavaScript. Mark only truly cooperative adapters accordingly; a non-cooperative
adapter may remain active until it returns. The example performs no external I/O.

## 6. Rebuild a spreadsheet from portable source and exchange values

**Prerequisites:** [workbooks](../eval/workbooks.md) and the
[RiXCel example guide](https://github.com/jostylr/rix/blob/main/examples/rixcel/README.md). Reuse both sources:

```sh
bun bin/rix.js examples/rixcel/persistence.rix
bun bin/rix.js examples/rixcel/delimited.rix
```

The first builds a FormulaSheet, exports canonical RiXCel JSON, imports it into a
fresh context, and displays recomputed values: 10, 20, 3, and **23**. Inspect the
printed JSON: formulas are saved source, not trusted serialized closures or cached
executable state. The browser Cel app can open the existing
[`budget.rixcel`](https://github.com/jostylr/rix/blob/main/examples/rixcel/budget.rixcel) fixture and save edits.

The second imports CSV values, displays a sheet, and exports TSV. Its foreign
`=SUM(A1:A2)` formula remains **inert text**. Decimal 4.5 is exact rational input;
CSV/TSV do not preserve a workbook's formula graph, history, or complete metadata.
Use RiXCel/RiXBook for those semantics. See the
[format and validation contract](../design/eval/rixcel-format.md) for version
migration and rejected malformed input. Spreadsheet export capability differs by
host: portable JSON and CSV remain available without a native dialog or XLSX host.
Do not treat an unavailable save dialog as a failed numerical computation.

## Verification and next experiments

`bun test tests/cli/capstones.test.js` checks the actual linked sources for exact
values, static disclosure, interchange, and cleanup. Publication has its existing
CLI and host integration tests; the project manifest remains its single source.
Experiment by lowering a numerical budget, changing a tensor label, choosing a
static publication profile, or changing an exact fraction. Keep the resulting
status and host diagnostics visible in the output you share.
