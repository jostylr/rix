# RiXCel workbooks: owned exports and atomic updates

A `.rixbook` file contains several version-3 RiXCel documents plus explicit
`names`, `exports`, and `imports` for each document. Open it in RiXCel and choose
a document from the toolbar. Editing an input document updates every dependent
output together. Each document keeps its own history; undo also recomputes other
documents. Save/reopen and local recovery preserve the complete workbook.

Try [cross-sheet.rixbook](../../examples/rixcel/cross-sheet.rixbook): `sales`
exports a subtotal and `report` applies its own tax rate. The report formula is:

```rix
imports.Get(:subtotal) * (1 + names.Get(:tax))
```

The namespaces are local values, with no leading dot:

- `book.Get(:sales, :subtotal)` reads an explicitly exported value.
- `names.Get(:tax)` reads an owned named definition.
- `imports.Get(:subtotal)` reads the declared import alias.
- `grid[...]`, `near[...]`, `row`, `col`, and `index` retain their ordinary cell meanings.

Document IDs are case-sensitive strings. Names, exports and import aliases are
case-insensitive. There is no access to another document's unexported cells or
the calling evaluator's variables. Names/exports contain exactly one of
`{index:[1,1]}`, `{name:"ownedName"}`, or `{source:"1/10"}`. Source expressions
use the same namespaces; they have no cell-relative origin. An import contains
`{document:"sales",export:"subtotal"}` or `{external:"rates"}`. Constructing a
namespace record does not create ambient globals or install plugin code.

## Host protocol

Public `@ratmath/rix` and `@ratmath/rix/rixcel-workbook` exports include:

- `createRixCelWorkbookDocument(records, externalSnapshots)` and
  `parseRixCelWorkbook(dataOrText)`: inert validation/canonicalization.
- `stringifyRixCelWorkbook(record)`: portable JSON, format `rixcel-workbook`, version 1.
- `createRixCelWorkbook(record, {compileFormula, runFormula, withEpoch, ...})`:
  execution with an explicitly supplied isolated evaluator.

The Cel host adapter `apps/cel/src/workbook-runtime.js` supplies the evaluator,
cooperative instruction/time budgets and a fresh private context per candidate.
It withholds dynamic code/plugin installation, host/IO/async capabilities,
random generators and global configuration changes. Volatile values enter only
as explicit external snapshots. Merely parsing a workbook does not evaluate it;
opening it in the editor explicitly executes its RiX formulas in the worker.

A running workbook exposes:

```js
book.get("report", "total");                // copied exact value
book.edit("sales", {type:"slot:set", index:[1,1], source:"10"});
book.transaction([
  {id:"sales", document:updatedSalesDocument},
  {id:"report", names:{tax:{source:"1/4"}}}
]);
book.sheet("report");                      // live read-only FormulaSheet adapter
book.materialize("report", [[1,1], [2,1]]); // bounded visible cells, one epoch
book.dependencies("report", "total");      // direct dependency paths
book.export();                             // copied portable record, no caches
const unsubscribe = book.subscribe(event => updateView(event));
unsubscribe();
book.dispose();
```

Transactions compile and evaluate a private candidate coordinator graph, then
replace every document at one commit point. Each computed node runs at most once
per epoch; dependencies include cross-document exports/imports and owned names.
Cycle errors retain the full path, such as `sales.exports.subtotal ->
sales.grid[1,1] -> report.exports.total -> ... -> sales.exports.subtotal`.
Compilation, runtime, cycle and budget failures retain the old values, metadata
and epoch. Subscriber exceptions do not undo a committed update. Reentrant
mutation during notification is rejected. Returned values and records are copies.

This bounded implementation rebuilds the materialized graph per transaction;
it does not claim affected-node-only recomputation or huge-workbook throughput.
Implicit cells stay lazy. Batch visible reads with `materialize` to avoid repeated
epochs. Pure runtime callbacks must be synchronous; the Cel adapter enforces the
instruction budget. Arbitrary host callbacks cannot be forcibly preempted in-process.
The browser worker remains the wall-clock termination boundary.

Slot-target names/exports follow C1's stable cell identities through structural
insertion and undo. Removing an exported newly inserted cell by undo requires
changing its definition in the same transaction. A source definition outside the
cell grid that mentions `grid`/`near` must be explicitly updated in that transaction;
its relative intent is never guessed. Arbitrary document replacement through
`replace(record)` uses the explicitly supplied new definitions.

## External values and disposal

External snapshots contain mathematical JSON text plus JSON metadata with
nonempty `source` and `version` strings. Exact numbers retain their values; the
codec's evidence distinctions remain intact. No provider or executable recipe is
stored. A host can supply `providers: {rates: async ({signal, metadata}) =>
({value, metadata:{source:"fixture",version:"v2"}})}`.

`await book.refresh("rates")` performs one explicit fetch and one atomic update.
Failure, invalid metadata, timeout or cancellation retains the previous snapshot.
A response arriving after another epoch is rejected as stale; retry explicitly.
The host may use an abort signal, but ignored signals cannot force a third-party
operation to stop. Late results never publish. Imports never trigger refresh.

Scheduling is off by default. `book.schedule("rates", intervalMs)` requires
`hostPolicy: {allowScheduledRefresh:true}` and an interval of at least 1000ms (or
the host's higher minimum), and at most 2,147,483,647ms. It skips overlapping refreshes and returns a cancel
function. `dispose()` cancels timers, aborts pending refreshes, removes listeners
and invalidates live views. Standalone browser files have no refresh providers;
embedding hosts install them explicitly. The Cel worker protocol also supports
`select-document`, `refresh-external` and `dispose` requests.

Default hard ceilings (hosts may lower them): 32 documents, 32 external sources,
4096 materialized nodes, 50,000 reads, 8192 evaluations, 65,536 characters per
formula, 8 million workbook-text characters, 200,000 evaluator steps and 2000ms
per candidate. Refresh allows four concurrent sources and a 5000ms timeout.
The mathematical JSON codec additionally bounds each snapshot. These are
cooperative work/data bounds, not claims of process memory isolation.

See [the workbook schema](../../schemas/rixcel-workbook-v1.schema.json) and
[the document format](../design/eval/rixcel-format.md).

## Notebook embedding and host reuse

`createRixCelWorkbookHost(record, options)` is the shared isolated evaluator,
exported from `@ratmath/rix` and `@ratmath/rix/rixcel-host`. Cel and Notebook
use the same fresh-context epochs and withheld file/network/plugin capabilities.
Reading a workbook never grants its formulas access to the notebook's bindings.

Notebook exposes `.cel(jsonText, documentId?)` and the explicitly authorized
project reader `.celOpen(relativePath, documentId?)`. A session provides `Sheet`
for editable output, `Get` for a declared export's current exact value, and `View`
for a live output subscribed to that export. `Set(index, source)` commits an
ordinary RiX formula edit atomically. `Record()` returns portable workbook JSON;
edits are session-local until the caller explicitly saves it. `Dispose` and
Notebook rerun/close release the private workbook and observers.

Embedding accepts at most 16 sessions per run. Each Sheet defaults to 20 rows
and 8 columns, capped by its dimensions; explicit windows are limited to 1024
cells across at most 32 hidden-axis planes. Large sheets stay sparse. Source
files are bounded to 8 MB and resolved by existing native project/folder grants
or browser project ZIP storage. Workbook dependency cycles fail atomically;
notebook/script imports are not available to workbook formulas.

Self-contained `.cel` JSON works in published live HTML. External `.celOpen`
requires a host reader; published pages retain the initial static result and
diagnose the missing reader. Use the Notebook `examples/cel-embedding` project
for named exports and the storage-backed path. No Excel-formula translation is
implied by these RiX APIs.
