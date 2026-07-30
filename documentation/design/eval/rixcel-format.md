# RiXCel document format

RiXCel files use UTF-8 JSON and the `.rixcel` extension. The root `format` and
integer `version` fields identify the schema. Version 1 is a dense, rank-N,
source-authoritative FormulaSheet document.

## Version 1

```json
{
  "format": "rixcel",
  "version": 1,
  "id": "budget",
  "shape": [2, 2],
  "view": {
    "title": "Budget"
  },
  "slots": [
    {
      "id": "budget:slot:1:1",
      "index": [1, 1],
      "source": "10",
      "assignmentMode": ":=",
      "view": {}
    }
  ]
}
```

The fields are:

- `format`: exactly `"rixcel"`.
- `version`: currently `1`.
- `id`: a non-empty, document-owned FormulaSheet identity.
- `shape`: one or more positive safe integers.
- `view`: JSON-safe document presentation metadata.
- `slots`: one record for every coordinate, in canonical row-major order.

Each slot contains:

- `id`: `${documentId}:slot:${index.join(":")}`.
- `index`: the full 1-based rank-N coordinate.
- `source`: authoritative RiX formula body, without the surrounding `@{...}`.
- `assignmentMode`: one of `=`, `:=`, `~=`, `::=`, or `~~=`.
- `view`: JSON-safe slot presentation metadata.

Version 1 is intentionally dense. It requires every coordinate exactly once;
duplicate, missing, out-of-range, or non-canonical slot identities are errors.
A later format version can add sparse storage without making version 1 readers
guess whether an omitted coordinate is empty, missing, or corrupt.

## Runtime reconstruction

Persisted source is authoritative. An importer:

1. parses JSON;
2. migrates supported older drafts;
3. validates shape, coordinates, identities, modes, and JSON metadata;
4. recompiles every `source` as a deferred RiX formula;
5. creates a fresh FormulaSheet graph and isolated execution context; and
6. evaluates the initial atomic epoch, rebuilding dependencies from actual
   slot reads.

Compiled IR, current values, prior values, dependency edges, graph state,
diagnostics, and caches are not stored in version 1. This avoids trusting stale
or host-specific runtime state. A future optional cache must be explicitly
non-authoritative and independently verifiable.

## APIs

RiX code can serialize and rebuild a sheet:

```rix
saved := .RiXCelExport(model);
restored := .RiXCelImport(saved)
```

JavaScript hosts can use:

```js
import {
  exportRixCelDocument,
  stringifyRixCelDocument,
  parseRixCelDocument,
  importRixCelDocument,
} from "rix";
```

`importRixCelDocument` is host-neutral and therefore requires the host's
`compileFormula` and `runFormula` callbacks. `.RiXCelImport` supplies the
standard RiX evaluator callbacks automatically.

## Draft migration

The importer recognizes the pre-version-1 design draft when `version` is `0`
or absent. It maps:

| Draft | Version 1 |
|---|---|
| `kind` | `format` |
| `code` | `source` |
| `op` | `assignmentMode` |
| `style` | `view` |

Missing draft slot IDs are generated from the document ID and full index.
Documents declaring a version newer than the runtime are rejected rather than
silently interpreted.
