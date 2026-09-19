# Shaped Literal Implementation

RiX uses one rectangular storage representation for inferred semicolon literals
and explicit shape constructors. Both default to `Shaped`. Matrix algebra is an
explicit interpretation; mathematical Vector, Covector and Tensor values need
Frames from the linalg plugin.

## Source and AST contract

Commas separate columns, `;` separates rows, and `;;`, `;;;`, and higher
semicolon runs separate higher-axis display slices. The tokenizer emits a
`Symbol` for `;` and `SemicolonSequence` for longer runs. Arrays without
semicolons remain arrays.

```rix
[1, 2; 3, 4]                         ## Shaped, shape 2x2
[1, 2; 3, 4 ;; 5, 6; 7, 8]         ## Shaped, shape 2x2x2
{:2x2: 1, 2; 3, 4}                  ## explicit Shaped
{:2x2: /Matrix/ 1, 2; 3, 4}          ## explicit Matrix
{:2x2: /::Matrix/ 1, 2; 3, 4}        ## general semantic-header spelling
```

`src/parser/parser.js` emits `Shaped` for inferred semicolon notation. Rank-2
nodes have `rows`; higher-rank nodes have `structure` (rows with following
`separatorLevel`) and `maxDimension`. Explicit dimensions produce
`ShapedLiteral` with `shape`, `elements`, and an optional `SemanticHeader`.
There are no legacy `Matrix`, `Tensor`, or `TensorLiteral` AST adapters.

A compact header retains `typeName`, optional ordered `slots`, and normal
capture/name/trait directives. Each slot has `displayName`, normalized
`bindingName`, and `dual`. `/Tensor: E@F*/` selects frames `e` and the canonical
dual of `f`; it does not imply that the spaces have the same dimension.
The complete explicit literal and header have source spans. The language
formatter preserves each semantic header as a unit, including dual marks.

## Lowering and runtime semantics

`src/eval/lower.js` infers rectangular shape, rejects ragged rows or slices,
and reorders display slices into row-major axis storage. Inferred and explicit
constructors lower to `SHAPED_LITERAL`; its arguments are shape plus cells, or
constructor metadata followed by shape plus cells. Runtime storage uses
`type: "shaped"` and `src/runtime/shaped.js`.

Bare Shaped arithmetic is elementwise and requires identical shapes. Scalars
apply entrywise within the declared scalar domain. Matrix multiplication
contracts rows and columns; `Hadamard` requests its entrywise counterpart.
Mixed Shaped/Matrix operations diagnose the required explicit conversion:
`value ~!: :Matrix`. A rank-2 Shaped value does not acquire Matrix methods merely
because its dimensions happen to fit.

`.Shaped.Generate(shape, callback)`, `Map`, `Reshape`, and `Permute` provide
explicit shape construction. They do not broadcast. New repetition/padding
syntax remains deferred in the umbrella plan's D2 register.

`.linalg` and `.optimize` accept rectangular Shaped inputs as data and convert
them explicitly to Matrix inside their validated adapters. Matrix-valued
outputs in linalg, optimize and solve are explicitly typed. Rank-1 coordinate
storage remains Shaped, while mathematical tensors retain their distinct
Frames, slots and identity records.

## Verification and examples

- `tests/parser/parser.test.js`: inferred/explicit constructors, malformed
  shapes, compact headers, slots and source spans.
- `tests/eval/shaped.test.js`: indexing/views, scalar domains, explicit shape
  operations, Matrix products and conversion diagnostics.
- `tests/eval/linalg-optimize-solve-plugin.test.js`: matrix adapters and
  mathematical coordinate semantics.
- `tests/tools/codemirror.test.js`, `language-service.test.js`, and
  `execution-worker.test.js`: highlighting, formatting and worker execution.
- Web REPL and Notebook engine tests exercise the same migrated constructors.
- `examples/parser/simple-matrices.js`, `matrix-tensor-demo.js`, and
  `matrix-error-cases.js` demonstrate parser structures. Their historical
  filenames are retained so existing links continue to work.

See [Shaped methods](../eval/objects/shaped.md) for runnable method examples and
[the migration record](../design/eval/shaped-array-matrix-tensor-plan.md) for the
separate finite tensor work tracked by T1–T3 in the umbrella execution plan.
