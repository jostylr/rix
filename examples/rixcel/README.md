# RiXCel sheet-view examples

These examples cover portable `.Sheet(...)` views, reactive formulas, exact
value interchange, and source-backed persistence. Run them from the `rix/` directory:

```sh
bun bin/rix.js examples/rixcel/sheet-views.rix
bun bin/rix.js examples/rixcel/live-sheet.rix
bun bin/rix.js examples/rixcel/formula-sheet.rix
bun bin/rix.js examples/rixcel/persistence.rix
bun bin/rix.js examples/rixcel/delimited.rix
bun bin/rix.js examples/rixcel/reactive-bindings.rix
bun bin/rix.js examples/rixcel/reactive-view.rix
```

The CLI prints a deterministic text representation. RiX Web and notebook hosts
can call `renderOutputHtml` to render the same value as an address-aware grid.

`sheet-views.rix` demonstrates:

- a conventional rank-2 matrix view;
- dual spreadsheet/RiX column labels;
- a selected depth plane from a rank-3 tensor;
- alternate visible tensor axes;
- a live `.Sheet(.Bind(prices))` view in RiX Web and the notebook
  (`live-sheet.rix`).
- a formula-backed sheet with dependency evaluation and an update epoch
  (`formula-sheet.rix`).
- a versioned source-backed JSON round trip that recompiles formulas and
  dependencies (`persistence.rix`), plus a standalone canonical
  [`budget.rixcel`](budget.rixcel) document.
- CSV/TSV value interchange with headers and inert foreign-formula metadata
  (`delimited.rix`).
- `$name` tracked reads and updates, `$$name` reactive-cell declarations and
  aliases, and atomic `${ ... }` transactions (`reactive-bindings.rix`).
- `$sheet[index]` FormulaSheet dependencies and formula updates without
  exposing internal graph-node names.
- a FormulaSheet graph propagating three editable inputs through an average,
  a locally defined function, an observed `$$frag`, a live Table, and a Graphic
  (`reactive-view.rix`).

`.RiXCelExport(model)` produces canonical sparse version-3 JSON (with v0–2 migration) and
`.RiXCelImport(json)` validates, migrates, recompiles, and evaluates it in a
fresh FormulaSheet context. The format is specified in
[`rixcel-format.md`](../../documentation/design/eval/rixcel-format.md);
the standalone browser editor can open, save, recover, and replay that history.
For current capabilities and limits, see [workbooks](../../documentation/eval/workbooks.md),
[tensor views](../../documentation/eval/rixcel-tensors.md), and
[regions and finite windows](../../documentation/eval/rixcel-regions.md). The
[six-workflow capstone tutorial](../../documentation/tutorial/capstones.md) connects
these examples to publication, exact-number views, and safe interchange. The
[implementation checklist](../../documentation/design/eval/rixcel-todo.md) is historical
planning context, not the user-facing feature reference.
