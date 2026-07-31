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
`WidgetSession` routes validated semantic edits.

The same host-owned protocol now supports interactive Graphics.
`.Graphics.DragPoint($$point)` retains a reactive node identity and dispatches
validated `graphic:position` records without putting DOM state in the scene.

The first formula-backed prototype is implemented separately as
`.FormulaSheet(...)`. It owns deferred formulas, evaluates them in an isolated
sheet context, records `grid[...]` dependencies, detects complete cycle paths,
incrementally recomputes transitive dependents, and atomically commits
successful epochs. It is a coordinate adapter over the general
`.ReactiveGraph(...)` runtime, exposed as `formulaSheet.Graph()`. Named scalar
computations can therefore join the same graph as formula slots.
`.Sheet(formulaSheet)` stages current results and editable formula source for
display. Dense rank-N `.rixcel` documents now round-trip authoritative source
through a versioned JSON format. Sparse storage and the standalone editor
remain implementation work. See [the format](rixcel-format.md) and
[the checklist](rixcel-todo.md).

## Vocabulary

RiX already uses **Cell** for the mutable box behind a scope binding. RiXCel
therefore uses distinct internal terms:

- **slot**: a sheet coordinate containing RiX source and presentation metadata;
- **RiX Cell**: a runtime binding box with alias/copy/update semantics;
- **block**: a rectangular or tensor-shaped selection of slots;
- **sheet**: a logical rank-N collection of slots;
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
   Binding or formula model
             |
             +----> refreshed model and Sheet
```

An ordinary `Sheet` follows the existing structured-output rule: it is
immutable and renderer-independent. A live Sheet additionally retains a
runtime-only Binding handle. A formula-backed Sheet retains a runtime-only
FormulaSheet handle but is currently a read-only result view. A renderer does
not write through the Sheet; live value edits dispatch to a host-owned
WidgetSession, and future formula edits will dispatch to a formula-document
session.

`WidgetSession` owns a live session. Its input is a semantic record, not a DOM
event. The implemented Sheet edit shape is:

```js
{ type: "sheet:set", index: [2, 3], value: exactRixValue }
```

Selection, source-edit, and paste records remain protocol extensions:

```text
{ kind: select, index: [2,3] }
{ kind: edit, index: [2,3], source: "price * quantity" }
{ kind: paste, range: [[2,3], [8,5]], values: data }
```

The implemented Graphic position record is:

```js
{ type: "graphic:position", targetId: "graph:pointA", position: [4, 7] }
```

## Portable Sheet schema

The implemented `Sheet` value contains:

- source kind (`tensor`, `matrix`, or `sequence`);
- full rank and shape;
- names for every axis;
- optional cosmetic labels for every coordinate on an axis;
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
coordinateLabels  cosmetic labels aligned with the full numeric index
coordinateLabel   joined label path for renderers and semantic events
```

The record intentionally has room to grow. FormulaSheet owns
formula, value, dependency, state, and diagnostic records separately from its
portable result view. Its persistent adapter stores editable source, assignment
mode, view metadata, and stable document slot identity without requiring
renderers to infer those from the displayed value.

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

Formula editing inserts canonical addresses when the user points at a
slot. This avoids introducing `A1:B4` into the RiX grammar, where uppercase
identifiers and colon intervals already have meanings.

For a portable Sheet snapshot, `grid` is only the default `addressBase`. It is
not a hidden variable or a property of the Sheet object. A host can evaluate an
inserted address only when the caller has chosen an address base that resolves
in that RiX context, such as `.Sheet(m, {= address="m" })`. FormulaSheet
evaluation supplies its own contextual `grid` binding while evaluating a slot.

The shared enhancer emits bubbling `rix-sheet-select`,
`rix-sheet-activate`, and `rix-sheet-edit` events. Event details include `address`,
`displayAddress`, the full tensor `index`, and visible `row`/`column`.
Renderers can therefore add host behavior without teaching the portable output
object about CodeMirror, textareas, or the DOM.

Rank-N snapshots also retain `hiddenAxes`, `selectedPlaneKey`, and a frozen
`planes` collection. Rendered axis selectors switch among those plane records
and emit `rix-sheet-plane-change` with the selected slice. This remains a
read-only view operation.

The prototype supplies `grid`, `row`, `col`, `index`, and `near`. Planned
namespaces include:

```rix
row
col
index
near[0,-1]
book[:sales][2,3]
names[:tax_rate]
imports[:rates][:usd][1,1]
```

These names belong to FormulaSheet/RiXCel evaluation, not the portable `Sheet`
constructor.

## Data adapters

Four conversions are deliberately different:

1. `.Sheet(value)` creates a read-only snapshot.
2. `.Sheet(.Bind(variable))` creates a live value editor.
3. `.FormulaSheet(formulas)` creates formula slots from deferred RiX bodies.
4. `RiXCel.From(value)` will materialize literal RiX source into independent
   formula slots.
5. A linked import will create slot formulas that depend on the original value.

The UI must ask which behavior is intended rather than guessing. A live handle
is never persisted. `WidgetSession.snapshot()` creates a detached Sheet with
the current exact plane records, `binding=null`, and `editable=false`.

## Two execution models

RiXCel must keep immediate Binding views and formula-backed sheets as different
entities.

### Immediate Binding view

`.Sheet(.Bind(value))` evaluates editor input immediately in the host RiX
context, then writes the resulting value through the Binding. A reference to
the edited tensor reads the last committed value:

```text
evaluate source -> exact value -> binding.set(index, value) -> refreshed view
```

This is deliberately not dependency evaluation. Referring to the current
tensor while calculating a replacement is valid because the write has not
happened yet.

### Formula-backed RiXCel sheet

A RiXCel sheet owns formula slots and an isolated execution context. The
implemented dense rank-N model is constructed from deferred formulas:

```rix
model := .FormulaSheet([
    [@{1},                 @{ grid[1,1] + 1 }],
    [@{ grid[1,2] * 2 },   @{ grid[2,1] + 1 }]
], {= id="model" });

model[2,2]             # 5
model.GetFormula(1,2)  # deferred formula value
model.SetSource(1,1, "10", ":=")
.Sheet(model)
```

The prototype exposes `GetFormula`, `SetFormula`, `GetSource`, `SetSource`,
`GetAssignmentMode`, `Recalculate`, `Slot`, and `Graph`. Every formula runs
with `grid`, `row`, `col`, and `index` in an isolated context; caller locals
and explicit outer lookup are unavailable. `SetSource` stores authoritative
source and assignment mode separately, rebuilds deferred IR through the
FormulaSheet-owned compiler, then invalidates that slot and its transitive
dependents. `SetFormula` remains a lower-level deferred-value entry point.
`Recalculate` explicitly evaluates the full graph. A failed epoch keeps the
last committed values while attaching diagnostics to involved slots.

The persistent document slot needs at least:

```text
id              stable identity
source          authoritative editable RiX source
deferred        parsed/lowered deferred RiX, rebuilt from source
assignmentMode  implied := or an explicit RiX assignment mode
value           result for the current committed evaluation epoch
lastGoodValue   optional prior successful result for UI diagnostics
state           clean, dirty, evaluating, or error
dependencies    slot identities read during the last successful evaluation
diagnostics     parse, cycle, or runtime diagnostics
view            presentation metadata
```

The implemented version-1 `.rixcel` JSON format persists the document ID,
shape, canonical slot IDs, formula source, assignment mode, and JSON-safe view
metadata. It does not persist compiled IR, values, dependencies, graph state,
or diagnostics. `.RiXCelImport` validates and recompiles all source before a
fresh initial epoch reconstructs those runtime records. See
[RiXCel document format](rixcel-format.md).

Deferred syntax such as `@{ ... }` is the programmatic formula representation.
Stored source is now authoritative for source edits and deferred IR is rebuilt
from it. A deferred value
captured from an arbitrary caller scope is not the formula context; the sheet
evaluates its lowered formula inside a document-owned context containing
`grid`, `row`, `col`, `index`, and eventually `names` and explicit imports.

Formula editing uses a different semantic event from Binding value editing.
This event and its WidgetSession route are implemented:

```js
{ type: "sheet:formula", index: [2, 3], source: "price * quantity", assignmentMode: ":=" }
```

The WidgetSession passes the edited body and mode to the FormulaSheet. The
model stores both fields, compiles the body, begins a new evaluation epoch,
invalidates the edited slot and its transitive dependents, and recomputes them
in dependency order. Runtime reads replace each computed node's dependency
edges after a successful evaluation, so conditional formulas can change their
active dependency set.

During an epoch, `grid[index]` always requests the current epoch's value. If it
reads a slot already marked `evaluating`, evaluation reports the complete cycle
path. It must not silently fall back to `lastGoodValue`. If recurrence is
wanted later, prior-epoch access should be explicit through a separate name
such as `previous[index]`.

The formula document commits a successful epoch atomically. On failure it keeps
the formula and diagnostics; `lastGoodValue` may be displayed as stale, but is
never presented as the current formula result.

The same graph also supports named reactive scalars:

```rix
graph := model.Graph();
average := graph.Derive("average", @{
    (grid[1,1] + grid[1,2]) / 2
});
scaled := graph.Derive("scaled", @{ average * grid[1,3] });
```

`.ReactiveGraph()` creates the same runtime without a sheet. `Source(name,
value)` adds an originating value, `Derive(name, deferred)` adds a computed
node, and reads of either kind inside a deferred formula record graph edges.
The verbose string API uses canonical lowercase RiX user-identifier names.
Syntax-created dollar bindings preserve the language's uppercase/lowercase
namespace distinction. FormulaSheet graphs reserve `grid`, `row`, `col`,
`index`, and `near` for their contextual bindings. `near[offset,...]` resolves
relative to the current slot, then performs the same tracked numeric read as
`grid[index,...]`.
A source or definition update finds the old transitive dependent closure,
evaluates each dirty computation at most once, replaces successful dynamic
edges, and emits one commit after every staged value succeeds. Direct `.Set`
writes to computed nodes and nested epochs are rejected; `$name := expression`
and host `ReplaceValue` operations replace a computed definition while keeping
its node identity.

Dollar bindings lower ordinary RiX syntax into this runtime:

```rix
${
    $$source1 := 2;
    $$source2 := 3;
    $$target1 := $source1 + $source2;
    $$target2 := $target1 * 4
}
```

`$$name := expression` lowers to a deferred ReactiveGraph cell declaration.
`$name` lowers to a tracked graph read and `$name := expression` replaces the
existing cell definition without replacing its identity. Plain `name` lowers
through ordinary retrieval and peeks at a reactive cell without recording an
edge. `$$alias := $$name` installs another binding for the same node.

`${ ... }` lowers to a reactive transaction. Declarations are installed as one
batch so forward references are available during evaluation; updates and the
transitive dependent closure run in one epoch. Failed batches remove new nodes,
restore previous formulas and edges, and publish no commit. Bare `$` and `$$`
remain callable-self references when they are not immediately adjacent to a
RiX identifier or `{`. Uppercase identifiers therefore support reactive
functions such as `$$Scale := x -> x * $factor`. `Scale(args)` calls the
current definition without tracking the function identity, `$Scale(args)`
tracks it, and `$Scale := x -> ...` replaces the definition while preserving
identity.

A FormulaSheet coordinate lowers through the same graph:

```rix
values := .FormulaSheet({:1x2: @{2}, @{3}});
$$total := $values[1,1] + $values[1,2];
$values[1,1] := @{5}
```

`$values[1,1]` resolves the coordinate node and records an edge without
exposing its internal `slot_...` name. An indexed assignment replaces that
node's deferred formula. Tensor-shaped FormulaSheet construction supports
dense rank-N formula grids; rectangular nested arrays remain a rank-2
convenience.

`$values` without an index is a whole-sheet tracked read. It returns the
FormulaSheet itself while recording an edge to every formula slot, so this
defines a document that changes after any coordinate changes:

```rix
$$frag := .Fragment([
    .Sheet($values),
    .Text($total)
]);
$frag
```

Plain `.Sheet(values)` deliberately adds no whole-sheet dependency. `$$values`
returns the FormulaSheet identity, and `$values[index]` remains the narrow form
for computations that depend on one coordinate.

FormulaSheet, Binding, and ReactiveNode expose the same JavaScript subscription
boundary. When an interactive host evaluates a direct final reactive read such
as `$frag`, evaluation supplies the node identity as host metadata while the
RiX result remains the current portable Fragment value. The host renders that
value, subscribes to the node, and replaces the rendered output after commits:

```text
sheet:formula or graphic:position
                |
                v
        reactive model commit
                |
                v
        reactive Fragment node
                |
                v
       host redraw and remount
```

A draggable Graphic point now replaces its reactive definition through this path and
refreshes its dependent lines, tables, functions, and scene nodes.
`.LiveView(source, deferred)` remains a deprecated lower-level compatibility
constructor for old code that wants an explicit wrapper and isolated
derivation. New code names a reactive output and returns `$name`. Dependencies
spanning multiple independent ReactiveGraphs remain a future protocol extension.

## Reactive document model

RiXCel version 1 is a dense rank-N collection. A slot stores:

```json
{
  "id": "budget:slot:2:3",
  "index": [2, 3],
  "source": "price * quantity",
  "assignmentMode": ":=",
  "view": {}
}
```

Source is authoritative. Compiled IR, current values, dependencies, and caches
are rebuilt rather than trusted. A future sparse version can add omitted-slot
semantics explicitly.

The default implied assignment is `:=`. An explicit leading `=`, `~=`, `::=`,
or `~~=` is parsed away from the authoritative formula body and retained as the
slot's assignment mode; it is not decorative spreadsheet syntax. A separate
mode argument that disagrees with the prefix is rejected.

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

## Standalone host

`apps/cel` is now the first standalone RiXCel host. It reuses the portable
Sheet renderer, FormulaSheet runtime, and WidgetSession rather than owning a
second formula engine. The initial shell provides:

- formula editing with modes and exact-value feedback;
- native `.rixcel` open/save and browser-local recovery;
- CSV/TSV value import and export; and
- document-snapshot undo and redo.

The current grid is a dense, ordinary DOM table. Virtualization, structural
row/column edits, copy/fill operations, worker isolation, and inline diagnostic
decoration remain separate milestones.

## Security and imports

RiXCel imports should reuse RiX script capability groups and explicit
import/export contracts. A browser host resolves document-relative resources
through a virtual document resolver rather than granting formulas arbitrary
filesystem or network access.

Imported spreadsheet formulas are data until explicitly translated to RiX.
Unsupported foreign formulas must be preserved as metadata and must not be
executed.
