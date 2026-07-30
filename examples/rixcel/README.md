# RiXCel sheet-view examples

The first RiXCel slice is the portable `.Sheet(...)` output constructor. Run
the examples from the `rix/` directory:

```sh
bun bin/rix.js examples/rixcel/sheet-views.rix
bun bin/rix.js examples/rixcel/live-sheet.rix
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

Formula-backed RiXCel documents are listed in the
[implementation checklist](../../documentation/design/eval/rixcel-todo.md).
