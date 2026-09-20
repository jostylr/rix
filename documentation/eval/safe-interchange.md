# Exact relation documents and frozen real snapshots

Relation files keep the column IDs, labels, types, nullability and ordered rows.
They distinguish missing cells from empty strings, retain large integers and
rational values exactly, and retain descending interval orientation.

```{.rix exec=true}
.Plugin.Load("data");
r := .data.Relation([{= id="value",type=:Rational },"note"], [[1/3,"one third"],[_,"missing"]]);
json := .data.EncodeJSON(r);
copy := .data.DecodeJSON(json);
.data.EncodeJSON(copy) ##@ == json;
.data.EncodeJSON(.data.ParseCSV(.data.RenderCSV(r))) ##@ == json;
.data.EncodeJSON(.data.ParseJSONLDocument(.data.RenderJSONLDocument(r))) ##@ == json;
.data.TableView(copy);
```

`EncodeJSON` writes one `rix.data.relation-document@1` object. The document
JSONL pair includes a schema header followed by one row array per line;
existing `ParseJSONL(schema,text)` stays a bounded row source. The CSV pair
writes RFC-style quoted fields: a `rix.data.csv@1` metadata record, column IDs,
then exact JSON-encoded cells. Use the ordinary `.csv` exporter for conventional
human-readable CSV. Do not remove the metadata row from an interchange file.
All three document readers reject malformed or incomplete rows. Maximums are
2,000,000 characters, 10,000 rows, 256 columns, 100,000 nested nodes, depth 64,
and 4,096 digits per exact component. Maps cannot use reserved `$` tag keys.
Real cells use `$real` with the envelope below and load as fresh frozen subjects.
Use one mathematical graph document when multiple values need shared identity.

## Standalone real snapshots

```{.rix exec=true}
.Plugin.Load("numerics");
source := .ExpressionReal(.numerics.Sqrt(2));
text := .RealExportJSON(source);
frozen := .RealImportJSON(text);
.RealImportInfo(frozen)[:verification] ##@ == :unavailable;
.RealImportInfo(frozen)[:interval];
```

`RealExportJSON` accepts a mathematical real or its Expression constant wrapper.
It emits deterministic key ordering and canonical exact tags. Suggested suffix:
`.rixreal.json`. Ordinary live adapters export an opaque snapshot with no recipe;
export does not guess a provider from closures. `RealImportJSON` never executes
source, invokes checkers, loads plugins, resolves names or requests external data.
Every import has a fresh opaque runtime identity. A containing `.MathEncodeJSON`
graph preserves repeated references within that document. Output JSON retains the
same envelope, allowing tables and document metadata to carry it.

Saved certification is a declaration. `RealImportInfo` reports the retained
status separately from its local verification, which always starts
`:unavailable`. Even a previously replayed envelope must be checked again after
loading. Unknown subject/recipe families stay useful frozen snapshots.
Unsupported, unavailable or version-mismatched recipes retain the enclosure.
Malformed supported structures, descending real enclosures, noncanonical
scalars and inconsistent achieved widths are rejected. Limits are 2,000,000
characters, 8,192 nodes, depth 64, 4,096 digits per exact component and 128 evidence
entries. No envelope field can register an executable provider.

## Explicit recipe refinement

The initial installed registry has one adapter:

| Field | Required value |
|---|---|
| `provider` | `numerics` |
| `providerVersion` | `2` |
| `algorithm` | `semantic-enclosure` |
| `algorithmVersion` | `1` |
| `checker` | `rix.real.numerics-replay@1` |

Its recipe `kind` is `expression`. The recipe `graph` must exactly match the
expression subject's graph (or the named-constant subject converted to a
`namedConstant` graph node). Explicit requirements must match all five fields.
The adapter calls only already-loaded, permitted `.numerics` and `.oracle`
capabilities. A missing capability remains a frozen result.

Supported graph nodes are exact `constant`, `namedConstant` pi/e, `negate`,
`add`, `subtract`, `multiply`, `divide`, bounded Integer `power`, and unary
`call`. Calls use existing stable IDs `rix.function.sqrt@1`, `exp@1`, `log@1`,
`sin@1`, `cos@1`, `tan@1` (each with the `rix.function.` prefix). Their required
branches are respectively `nonnegative`, `real`, `positive`, `real`, `real`,
`poleFree`. Providers must still establish each domain; a branch label is no
proof. Graphs have at most 128 nodes, depth 32, and powers between -64 and 64.
Unknown semantic IDs or branch choices stay opaque.

Use async evaluation for `.RealRefineImported(real,{= width=1/1000,maxCalls=256,
maxIterations=256 })`. Import and inspection remain synchronous. Budgets are
positive, at most 4,096 calls/iterations, and split between provider refinement
and a fresh deterministic replay. Construction has the separate graph/power bounds. Successful checking requires equal exact
endpoints and a result nested in the saved enclosure; contradiction never
replaces it. An insufficient work/domain result stays frozen with diagnostics.
Successful snapshots carry a bounded embedded replay-evidence record and local
`:providerChecked` verification. This is replay of the installed certified
algorithm, not a second mathematical algorithm or a general proof checker.

Host code may explicitly construct a `RealRecipeRegistry` and register trusted
versioned `refine`/`check` functions. Deserialized input cannot access that API.
Opaque functions, external providers, general root/ODE recipe revival and
cryptographic canonicalization remain later scope. The full design is in
[refinable-real JSON](https://github.com/jostylr/rix/blob/main/plugins/numerics/refinable-real-json.md).
