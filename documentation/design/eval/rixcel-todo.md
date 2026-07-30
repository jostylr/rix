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
- [ ] Apply the same interaction protocol to at least one Graphic example.
- [x] Define snapshot and serialization behavior for live widgets.

## 3. RiXCel document runtime

- [ ] Specify the versioned `.rixcel` JSON format.
- [ ] Define a formula-slot entity separate from immediate `Binding` lenses.
- [ ] Store authoritative formula source and rebuild deferred IR from it.
- [ ] Give each formula sheet a document-owned isolated execution context.
- [ ] Define `sheet:formula` separately from immediate `sheet:set` events.
- [ ] Add atomic evaluation epochs with explicit dirty/evaluating/error states.
- [ ] Implement sparse rank-N sheets with stable sheet and slot IDs.
- [ ] Store source separately from assignment mode.
- [ ] Implement implied `:=` and explicit RiX assignment modes.
- [ ] Add `grid`, `row`, `col`, `index`, and `near` evaluation bindings.
- [ ] Add `book`, `names`, and `imports` namespaces.
- [ ] Record runtime slot-read dependencies.
- [ ] Incrementally recompute dirty dependents.
- [ ] Detect cycles and report complete address paths.
- [ ] Reserve explicit prior-epoch access instead of falling back to stale values during cycles.
- [ ] Forbid formula writes to other slots.
- [ ] Define volatile/external-source recomputation policy.
- [ ] Add round-trip and migration tests for `.rixcel` documents.

## 4. Standalone RiXCel editor

- [ ] Replace the placeholder `apps/cel` package with a RiXCel web app.
- [ ] Implement virtualized 2D grid rendering.
- [ ] Add formula bar, assignment-mode control, and exact-value display.
- [ ] Add copy, paste, fill, undo, and redo.
- [ ] Add row/column insertion with parsed reference updates.
- [ ] Add local persistence and `.rixcel` open/save.
- [ ] Run evaluation in a worker with capability restrictions.
- [ ] Show dependency, cycle, parse, and runtime diagnostics in the grid.
- [ ] Add browser-level tests for editing and persistence.

## 5. Interchange and embedding

- [ ] Import CSV/TSV values.
- [ ] Import `.xlsx` values and sheet structure.
- [ ] Preserve unsupported foreign formulas as non-executable metadata.
- [ ] Define and test a limited Excel-formula-to-RiX translator.
- [ ] Export computed values to CSV/TSV and `.xlsx`.
- [ ] Embed a RiXCel document as a notebook widget.
- [ ] Publish explicit named sheet exports to notebook RiX code.
- [ ] Detect import cycles across RiX scripts and RiXCel documents.

## 6. Higher-dimensional and advanced behavior

- [ ] Provide tabs/selectors/sliders for hidden axes.
- [ ] Add axis labels and labeled-index lookup.
- [ ] Define materialization from tensor values into formula slots.
- [ ] Define linked tensor-to-sheet views.
- [ ] Design tensor spill ownership and collision rules.
- [ ] Add block formatting and named rank-N regions.
- [ ] Test sparse sheets at large logical shapes.
