# RiXCel architecture

## Status

The first implemented slice is the portable `.Sheet(...)` output value. It
adapts existing tensors, matrices, and sequences into a two-dimensional
snapshot with exact values, rank-N plane selection, canonical RiX addresses,
and host-neutral text/HTML rendering.

RiX Web, the RiX notebook, and live notebook exports now share a host-side
selection enhancer. It provides a dual address indicator, pointer selection,
roving keyboard focus, and semantic select/activate events. Activation inserts
the canonical address in the editable RiX hosts.

The Binding/Widget slice is also implemented: `.Bind(variable)` captures RiX
Cell identity, `.Sheet(.Bind(variable))` creates a live Sheet, and a host-owned
`WidgetSession` routes validated semantic edits. The reactive RiXCel document
and standalone editor remain design and implementation work. See
[the checklist](rixcel-todo.md).

## Vocabulary

RiX already uses **Cell** for the mutable box behind a scope binding. RiXCel
therefore uses distinct internal terms:

- **slot**: a sheet coordinate containing RiX source and presentation metadata;
- **RiX Cell**: a runtime binding box with alias/copy/update semantics;
- **block**: a rectangular or tensor-shaped selection of slots;
- **sheet**: a sparse rank-N collection of slots;
- **sheet view**: a portable 2D presentation of an indexable value or sheet;
- **widget session**: a host-owned interactive rendering connected to state.

User-facing UI may still say “cell,” because that is familiar spreadsheet
language. Runtime and storage code should use `slot` where ambiguity matters.

## Separation of model, output, and interaction

```text
RiX value or RiXCel document
             |
             v
      portable Sheet value
             |
             v
         host renderer
             |
             v
     semantic edit event
             |
             v
   Binding or update function
             |
             +----> refreshed model and Sheet
```

An ordinary `Sheet` follows the existing structured-output rule: it is
immutable and renderer-independent. A live Sheet additionally retains a
runtime-only Binding handle. A renderer still does not write through the Sheet;
it dispatches to a host-owned WidgetSession.

`WidgetSession` owns a live session. Its input is a semantic record, not a DOM
event. The implemented Sheet edit shape is:

```js
{ type: "sheet:set", index: [2, 3], value: exactRixValue }
```

Selection, source-edit, paste, and graphics records remain protocol extensions:

```text
{ kind: select, index: [2,3] }
{ kind: edit, index: [2,3], source: "price * quantity" }
{ kind: paste, range: [[2,3], [8,5]], values: data }
```

The same protocol can support interactive graphics:

```rix
{= kind=:drag, target=:pointA, position=[4,7] }
```

## Portable Sheet schema

The implemented `Sheet` value contains:

- source kind (`tensor`, `matrix`, or `sequence`);
- full rank and shape;
- names for every axis;
- the one or two visible axes;
- fixed indices for hidden axes;
- display row and column headers;
- a rectangular array of visible cell records;
- an address base such as `grid`;
- optional title and presentation options.

Each visible cell record contains:

```text
value    exact RiX value
index    full 1-based rank-N index
address  canonical source-like address, for example grid[2,3,1]
displayAddress  visible alias, for example C2 or R2C3
```

The record intentionally has room to grow. A RiXCel-backed adapter will later
add source, assignment mode, diagnostics, and stable slot identity without
requiring renderers to infer those from the displayed value.

## Address and label convention

Canonical references use tensor-style RiX syntax:

```rix
grid[2,3]
grid[1:10, 2:5]
grid[::, 2]
```

Spreadsheet labels such as `C2` are presentation and navigation aliases. A
host should display both when useful:

```text
C2 · grid[2,3]
```

Formula editing should insert canonical addresses when the user points at a
slot. This avoids introducing `A1:B4` into the RiX grammar, where uppercase
identifiers and colon intervals already have meanings.

For a portable Sheet snapshot, `grid` is only the default `addressBase`. It is
not a hidden variable or a property of the Sheet object. A host can evaluate an
inserted address only when the caller has chosen an address base that resolves
in that RiX context, such as `.Sheet(m, {= address="m" })`. The future RiXCel
document runtime will supply its contextual `grid` binding while evaluating a
slot.

The shared enhancer emits bubbling `rix-sheet-select`,
`rix-sheet-activate`, and `rix-sheet-edit` events. Event details include `address`,
`displayAddress`, the full tensor `index`, and visible `row`/`column`.
Renderers can therefore add host behavior without teaching the portable output
object about CodeMirror, textareas, or the DOM.

Rank-N snapshots also retain `hiddenAxes`, `selectedPlaneKey`, and a frozen
`planes` collection. Rendered axis selectors switch among those plane records
and emit `rix-sheet-plane-change` with the selected slice. This remains a
read-only view operation.

Planned contextual names are:

```rix
row
col
index
near[0,-1]
book[:sales][2,3]
names[:tax_rate]
imports[:rates][:usd][1,1]
```

These names belong to the future RiXCel evaluation environment, not the
portable `Sheet` constructor.

## Data adapters

Four conversions are deliberately different:

1. `.Sheet(value)` creates a read-only snapshot.
2. `.Sheet(.Bind(variable))` creates a live value editor.
3. `RiXCel.From(value)` will materialize literal RiX source into independent
   formula slots.
4. A linked import will create slot formulas that depend on the original value.

The UI must ask which behavior is intended rather than guessing. A live handle
is never persisted. `WidgetSession.snapshot()` creates a detached Sheet with
the current exact plane records, `binding=null`, and `editable=false`.

## Reactive document model

A RiXCel document should be a sparse rank-N collection. A slot will eventually
store at least:

```json
{
  "id": "stable-slot-id",
  "op": ":=",
  "code": "price * quantity",
  "style": {},
  "cache": {
    "value": null,
    "inputHash": null
  }
}
```

Source is authoritative. Cached values are optional and valid only when their
input and runtime hashes match.

The default implied assignment is `:=`. An explicit leading `=`, `~=`, `::=`,
or `~~=` retains its RiX binding meaning; it is not decorative spreadsheet
syntax.

## Dependencies and cycles

Dependencies should be recorded through runtime reads of sheet proxies. This
supports computed references and conditionally changing dependencies.

Evaluation uses a visiting/evaluated state:

1. mark the requested slot as visiting;
2. evaluate its source;
3. when another slot is read, evaluate or reuse it and record the edge;
4. reading a visiting slot reports the complete cycle path;
5. on success, cache the result and mark the slot evaluated.

Normal formula evaluation may read slots but must not write other slots.
Cross-slot writes require a future explicit action/widget mechanism.

## Rank-N editing

Storage is rank-N from the beginning. The first standalone editor can remain
two-dimensional: two axes are shown as the grid, and every additional axis is
represented by a selector, tab, or slider.

A tensor-valued slot does not automatically occupy neighboring slots. It
renders as an embedded value until explicit spill/materialization semantics
are designed.

## Security and imports

RiXCel imports should reuse RiX script capability groups and explicit
import/export contracts. A browser host resolves document-relative resources
through a virtual document resolver rather than granting formulas arbitrary
filesystem or network access.

Imported spreadsheet formulas are data until explicitly translated to RiX.
Unsupported foreign formulas must be preserved as metadata and must not be
executed.
