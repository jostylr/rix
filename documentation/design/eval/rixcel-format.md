# RiXCel document format

RiXCel files use UTF-8 JSON and the `.rixcel` extension. The root `format` and
integer `version` fields identify the schema. Version 3 is a sparse, rank-N,
source-authoritative event log. Version 0 drafts, dense version 1 and sparse version 2 documents
remain readable and migrate to version 3 in memory.

## Version 3

```json
{
  "format": "rixcel",
  "version": 3,
  "id": "budget",
  "initialShape": [1000, 1000],
  "shape": [1000, 1000],
  "view": {
    "title": "Budget",
    "axes": ["region", "measure"]
  },
  "defaultSlot": {
    "source": "_",
    "assignmentMode": ":=",
    "view": { "blank": true }
  },
  "events": [
    {
      "id": "budget:event:1",
      "sequence": 1,
      "type": "slot:set",
      "index": [1, 2],
      "source": "grid[1,1] * 2",
      "assignmentMode": ":=",
      "view": {},
      "command": "document.SetSource(1, 2, \"grid[1,1] * 2\", \":=\")"
    }
  ],
  "cursor": 1,
  "drafts": []
}
```

The root fields are:

- `format`: exactly `"rixcel"`.
- `version`: currently `3`.
- `id`: a non-empty document-owned sheet identity.
- `initialShape`: base dimensions before structural events.
- `shape`: active dimensions after the first `cursor` events; validated against history.
- `view`: JSON-safe presentation metadata before replayed view events.
- `defaultSlot`: source, assignment mode, and view metadata inherited by every
  coordinate that has no active edit event. `_` is RiX's null value.
- `events`: the append-only edit history, including redo events beyond the
  current cursor.
- `cursor`: the number of active events. Undo and redo move this cursor rather
  than cloning full documents or deleting history.
- `drafts`: failed/uncommitted formula text and diagnostics. Drafts survive
  local recovery but do not affect current values or dependency evaluation.

A million-cell empty logical sheet is therefore approximately the same size as
a twenty-cell empty sheet. The imported FormulaSheet graph also stays sparse;
individual implicit slots are materialized only when evaluated or rendered.

## Events and executable RiX commands

`slot:set` is the basic editing event:

```json
{
  "id": "budget:event:12",
  "sequence": 12,
  "type": "slot:set",
  "index": [4, 7],
  "source": "near[0,-1] * tax",
  "assignmentMode": ":=",
  "view": {},
  "command": "document.SetSource(4, 7, \"near[0,-1] * tax\", \":=\")"
}
```

The structured fields are authoritative. The `command` is a canonical,
validated rendering of the same edit and is executable when the target
FormulaSheet is bound as `document`. Keeping both forms makes logs safely
machine-replayable and human-auditable. A host operation that captures a
one-time result should store a literal RiX source value. A live formula keeps
its original formula source.

Cosmetic coordinate labels use `view:axis-label` events with canonical commands
such as:

```rix
document.SetAxisLabel(2, 1, "Revenue")
```

Multi-cell paste and fill use one `slot:batch` event containing ordered slot
edits rather than one history event per cell. Its canonical command is an
executable RiX block of `SetSource` calls, so one undo step reverts the entire
operation. Structural edits use the `axis:insert` event described below.

## Replay and branching

Readers apply `events[0:cursor]` in order over `defaultSlot` and the initial
document `view`. Events after `cursor` are redo history. Appending an edit after
undo truncates that inactive redo suffix and assigns the next canonical event
identity.

Original slot IDs derive from their base (pre-insertion) coordinate:

```text
${documentId}:slot:${originalIndex.join(":")}
```

Event IDs are:

```text
${documentId}:event:${sequence}
```

## Failed drafts

A worker-rejected parse, cycle, timeout, or runtime edit is stored separately:

```json
{
  "index": [1, 1],
  "source": "grid[1,2]",
  "assignmentMode": ":=",
  "kind": "cycle",
  "message": "Formula cycle: grid[1,1] -> grid[1,2] -> grid[1,1]",
  "command": "document.SetSource(1, 1, \"grid[1,2]\", \":=\")"
}
```

The current committed event prefix remains valid and supplies last-good values.
Interactive hosts can restore the draft into the formula bar and mark the slot
without executing the failed source during document recovery.

## Runtime reconstruction

An importer:

1. parses JSON;
2. migrates supported older versions;
3. validates shape, event identities, commands, modes, coordinates, and JSON
   metadata;
4. replays the active event prefix;
5. compiles the resulting authoritative slot sources;
6. creates a fresh sparse FormulaSheet graph and isolated execution context;
7. materializes edited slots plus implicit slots reached by runtime reads; and
8. evaluates the initial atomic epoch, rebuilding dependencies from actual
   reads.

Compiled IR, current values, prior values, dependency edges, graph state, and
caches are never trusted from the document.

## Worker boundary

The standalone editor keeps its persistent FormulaSheet and visible-plane
projector in a restricted Web Worker. Dynamic JavaScript/module registration,
plugin management, streams, and retry capabilities are withheld. The main
thread retains only the event log and interactive DOM. It submits a complete
candidate log for each commit, allowing a replacement worker to reconstruct
the session after a timeout or termination.

The graph produced by `.RiXCelImport` is sparse and implicit default slots are
created lazily. Projection requests bound row and column counts, so a large
logical plane creates only the currently visible DOM cells.

## APIs

RiX code continues to use:

```rix
saved := .RiXCelExport(model);
restored := .RiXCelImport(saved)
```

JavaScript hosts can additionally create and manipulate event logs:

```js
import {
  createRixCelDocument,
  appendRixCelEvent,
  setRixCelCursor,
  setRixCelDraft,
  materializeRixCelDocument,
} from "@ratmath/rix";
```

## Version 1 migration

Version 1 stored one dense slot record for every coordinate. Import validates
that dense schema exactly, then converts every non-default slot to a
`slot:set` event. Draft version 0 fields (`kind`, `code`, `op`, and `style`) are
first migrated to version 1 and then to version 3. Newer unsupported versions
are rejected.

## Delimited interchange

CSV and TSV remain value interchange formats rather than document formats.
Foreign formulas beginning with `=` remain inert metadata. Import converts the
result to a version 3 event log; export emits current computed values only.

## Atomic structural events (version 3)

`{ "type":"axis:insert", "axis":1, "coordinate":2, "count":1 }` inserts
before a one-based coordinate (or appends at axis length + 1). Axes are rank-N;
count is 1–1,000,000, the resulting shape product must remain a safe integer, and
history is capped at 10,000 events. `initialShape` and the base `view` never change;
each prefix derives its current shape, labels, slice coordinates and formulas.
Versions 0–2 have no structural events and migrate with their old shape as the base.
Legacy command strings are regenerated from authoritative source during migration.

Sparse replay rewrites literal `grid[...]` and `near[...]` references with the
existing tokenizer. Dynamic references, aliases of `grid`/`near`, and reference-
dependent implicit defaults reject insertion rather than silently changing targets.
Unresolved drafts must be fixed or removed before a structural edit or structural
undo/redo. Quoted strings and comments are preserved. Canonical commands use RiX
string delimiters rather than JavaScript escape syntax, including multiline source.

Original cell IDs follow their pre-insertion coordinates. Newly inserted cells use
an insertion-event identity plus their creation coordinate. This rule also applies
to untouched implicit cells, without allocating IDs for the entire grid. Runtime
export preserves imported structural history and appends edits; computed caches
are never serialized. Host candidates compile/evaluate privately before replacing
the visible model, so a failed edit leaves the committed sheet intact.

`sheet.InsertAxis(axis, coordinate, count=1)` returns a new FormulaSheet, leaving
the old sheet unchanged. Its canonical event command rebinds `document` explicitly.
`replayRixCelDocument` returns sparse `{document, view, slots}` for host adapters;
`materializeRixCelDocument` is the existing explicitly dense compatibility API.

```{.rix exec=true}
sheet := .FormulaSheet([[@{ 2/3 }, @{ grid[1,1]*3 }]]);
oldid := sheet.Slot(1,2).id;
sheet := sheet.InsertAxis(2,2);
sheet[1,3] ##@ == 2;
sheet.Slot(1,3).id ##@ == oldid;
saved := .RiXCelExport(sheet);
.RiXCelImport(saved)[1,3] ##@ == 2;
```
