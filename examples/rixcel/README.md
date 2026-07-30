# RiXCel sheet-view examples

The first RiXCel slice is the portable `.Sheet(...)` output constructor. Run
the examples from the `rix/` directory:

```sh
bun bin/rix.js examples/rixcel/sheet-views.rix
bun bin/rix.js examples/rixcel/live-sheet.rix
bun bin/rix.js examples/rixcel/formula-sheet.rix
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
- `$name` tracked reads and updates, `$$name` reactive-cell declarations and
  aliases, and atomic `${ ... }` transactions (`reactive-bindings.rix`).
- `$sheet[index]` FormulaSheet dependencies and formula updates without
  exposing internal graph-node names.
- a FormulaSheet graph propagating three editable inputs through an average,
  a locally defined function, an observed `$$frag`, a live Table, and a Graphic
  (`reactive-view.rix`).

The formula example is the first in-memory FormulaSheet prototype. Persistent
source-backed RiXCel documents are listed in the
[implementation checklist](../../documentation/design/eval/rixcel-todo.md).
