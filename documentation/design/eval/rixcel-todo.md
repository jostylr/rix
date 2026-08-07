# RiXCel implementation checklist

This checklist is ordered so every milestone leaves a usable, testable layer.
Checked items are implemented in the current RiX repository.

## 0. Portable sheet output

- [x] Add `.Sheet(data, options?)` to the `Output` capability group.
- [x] Adapt RiX tensors, matrices, rank-1 sequences, and rectangular nested sequences.
- [x] Preserve exact RiX values in the output object.
- [x] Support rank-N plane selection with `viewAxes` and `slice`.
- [x] Attach full 1-based indices and canonical `grid[...]` addresses.
- [x] Provide dual spreadsheet/RiX column labels.
- [x] Add deterministic text rendering.
- [x] Add host-neutral HTML rendering with `data-rix-address`.
- [x] Add evaluator tests and runnable examples.
- [x] Document the snapshot/live boundary.

## 1. Renderer and notebook integration

- [x] Add dedicated Sheet styling to RiX Web.
- [x] Render a selected-address indicator such as `C2 · grid[2,3]`.
- [x] Add pointer and keyboard selection without enabling value edits.
- [x] Let formula/source editors insert canonical addresses by activation.
- [x] Add axis selectors for rank greater than two.
- [x] Add static Sheet rendering to the RiX notebook.
- [x] Add accessibility tests for row/column headers and keyboard navigation.

## 2. Binding and widget protocol

- [x] Specify a first-class `Binding`/lens value.
- [x] Capture lvalue identity without exposing renderer-specific references.
- [x] Define `Get`, `Set`, `At`, `Slice`, and subscription behavior.
- [x] Define portable semantic widget events.
- [x] Add a host-owned `Widget` session protocol.
- [x] Make `.Sheet(.Bind(tensor))` an editable tensor view.
- [x] Apply the same interaction protocol to at least one Graphic example.
- [x] Define snapshot and serialization behavior for live widgets.

## 3. RiXCel document runtime

- [x] Specify the versioned `.rixcel` JSON format.
- [x] Define a formula-slot entity separate from immediate `Binding` lenses.
- [x] Store authoritative formula source and rebuild deferred IR from it.
- [x] Give each formula sheet a document-owned isolated execution context.
- [x] Define `sheet:formula` separately from immediate `sheet:set` events.
- [x] Add atomic evaluation epochs with explicit dirty/evaluating/error states.
- [x] Add sparse version-2 persistence with stable sheet, slot, and event IDs.
- [x] Keep imported FormulaSheet graphs sparse with lazy implicit-slot materialization.
- [x] Store source separately from assignment mode.
- [x] Implement implied `:=` and explicit RiX assignment modes.
- [x] Add `grid`, `row`, `col`, and `index` evaluation bindings.
- [x] Add the `near` evaluation binding.
- [x] Add public `FormulaSheet.Near(origin, offsets)` for explicit relative reads.
- [ ] Add `book`, `names`, and `imports` namespaces.
- [x] Record runtime slot-read dependencies.
- [x] Incrementally recompute dirty dependents.
- [x] Detect cycles and report complete address paths.
- [x] Reserve explicit prior-epoch access instead of falling back to stale values during cycles.
- [x] Forbid formula writes to other slots.
- [x] Publish FormulaSheet commits through the shared reactive subscription protocol.
- [x] Retain `.LiveView(source, deferred)` as a deprecated compatibility wrapper.
- [x] Add a general `.ReactiveGraph` with named source and computed nodes.
- [x] Make FormulaSheet a coordinate adapter over the general graph.
- [x] Track computed dependencies dynamically from runtime reads.
- [x] Incrementally propagate changes through transitive dependents.
- [x] Batch graph propagation into atomic evaluation epochs.
- [x] Add `$name` tracked reads/updates and `$$name` reactive-cell declarations/identity reads.
- [x] Add same-cell aliases through `$$alias := $$name`.
- [x] Add atomic `${ ... }` reactive transactions with forward references and rollback.
- [x] Warn when a reactive definition uses a plain untracked read of a reactive name.
- [x] Support uppercase reactive callable bindings such as `$$Scale`.
- [x] Add `$sheet[index]` tracked reads and deferred formula updates.
- [x] Add `$sheet` whole-sheet tracked reads and `$$sheet` identity reads.
- [x] Accept dense tensor-shaped FormulaSheet definitions at rank N.
- [x] Add cosmetic rank-N axis names, coordinate headers, and named slice choices.
- [x] Edit FormulaSheet row/column coordinate labels while retaining numeric headers.
- [x] Render imported blank fields as blank without hiding intentional `_` results.
- [x] Let interactive hosts observe and dispose a direct final reactive output such as `$frag`.
- [ ] Coordinate tracked dependencies that span multiple independent ReactiveGraphs.
- [ ] Define volatile/external-source recomputation policy.
- [x] Add round-trip and migration tests for `.rixcel` documents.

## 4. Standalone RiXCel editor

- [x] Replace the placeholder `apps/cel` package with a RiXCel web app.
- [x] Implement bounded 2D grid-window rendering with row/column navigation.
- [x] Edit formula bodies from FormulaSheet grid cells.
- [x] Add a dedicated formula bar, assignment-mode control, and exact-value display.
- [x] Add document-level undo and redo as event-log cursor movement.
- [x] Add single-cell formula copy/paste with explicit absolute `grid` and relative `near` semantics.
- [x] Add multi-cell copy/paste and fill with atomic batch history events.
- [ ] Add row/column insertion with parsed reference updates.
  - [x] Add tokenizer-aware `grid`/`near` reference rewriting and dynamic-reference detection.
  - [ ] Add shape-changing structural history events with cursor-safe undo/redo.
- [x] Add local persistence and `.rixcel` open/save.
- [x] Preflight imports and edits in a restartable, timed worker with restricted capabilities.
- [x] Move persistent FormulaSheet ownership and visible-plane projection fully into the worker.
- [x] Show dependency, cycle, parse, and runtime diagnostics in the grid.
- [ ] Add browser-level tests for editing and persistence.

## 5. Interchange and embedding

- [x] Import CSV/TSV values.
- [ ] Import `.xlsx` values and sheet structure.
- [x] Preserve unsupported delimited foreign formulas as non-executable metadata.
- [ ] Define and test a limited Excel-formula-to-RiX translator.
- [x] Export computed values to CSV/TSV.
- [ ] Export computed values to `.xlsx`.
- [ ] Embed a RiXCel document as a notebook widget.
- [ ] Publish explicit named sheet exports to notebook RiX code.
- [ ] Detect import cycles across RiX scripts and RiXCel documents.

## 6. Higher-dimensional and advanced behavior

- [x] Provide selectors for hidden axes.
- [x] Add labeled-index lookup while retaining canonical numeric identity.
- [ ] Define materialization from tensor values into formula slots.
- [ ] Define linked tensor-to-sheet views.
- [ ] Design tensor spill ownership and collision rules.
- [ ] Add block formatting and named rank-N regions.
- [x] Test sparse sheets at large logical shapes.
