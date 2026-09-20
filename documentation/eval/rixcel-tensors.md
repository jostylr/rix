# Explicit tensor planes in RiXCel

RiXCel materializes a tensor only when explicitly requested. A finite `Shaped`,
Matrix, Vector, Covector or Tensor supplies its components. Select one complete
plane with two distinct, 1-based `viewAxes` and a rank-matching `slice`: visible
axes are `null`, hidden axes are fixed positive indices. Defaults select axes
1 and 2 with hidden indices 1. A rank-one value becomes a single column.

The shared JavaScript helpers live in `src/runtime/rixcel-tensor.js`:

```js
const options = { viewAxes: [3, 1], slice: [null, 2, null] };
const plane = rixCelTensorPlane(tensor, options);
// plane: { shape: [rows, columns], values, indices, viewAxes, slice }
const readonlySheet = createRixCelTensorSheet(tensor, options);
const candidate = materializeRixCelTensorPlane(document, tensor, {
  ...options,
  targetAxes: [1, 2],
  targetStart: [1, 1],
});
// candidate: { document, event, shape }; event is one slot:batch.
```

`targetStart` contains one canonical numeric index for every destination axis.
`targetAxes` selects its row and column axes; other destination coordinates stay
fixed. The complete plane must fit. A rank-one destination accepts only a single
column. The operation does not grow the document or introduce spill behavior.

Each selected value becomes a literal formula source: exact integers, rationals,
intervals, strings, null and undecided values are supported. Fractions and large
integers retain their exact values, and strings remain inert. Unsupported scalar
kinds fail explicitly; there is no fallback through rounded display text. Finite sparse Rational coordinates are read directly without allocating the full
ambient tensor. Countable coordinates require an explicit bounded projection
before this operation. Unsupported coordinate storage is rejected.

Only a slot whose source is `_` and whose `view.blank` is true is vacant.
A nonblank formula that evaluates to null still collides. Drafts also collide.
Collision, invalid axis/slice, unsupported scalar, bounds and shape failures
leave the input document unchanged. The helper constructs a complete candidate
with one batch event; hosts validate and publish that candidate atomically through
the workbook transaction API. Subsequent source changes never alter the snapshot.

A linked view uses `createRixCelTensorSheet` after each observed source update.
The returned Sheet is read-only and holds no editable binding. Hosts retain the
expression or named export, subscribe to its workbook, rebuild the complete
selected plane after a committed update, and dispose the subscription with the
session. Plane changes likewise rebuild a complete candidate before replacing
the visible output. A failed refresh must preserve the last valid output and
report its diagnostic. Linked views are session-local; explicit materialization
is the route to persistent formula slots.

All helpers cap a selected plane at 4,096 cells before reading its values;
sparse support is additionally bounded at 2,048 canonical terms.
`maxCells` can lower this ceiling. They do not enumerate the other planes of a
rank-N tensor. Empty, infinite, malformed or oversized planes fail before output
allocation. Formatting and named regions do not change these canonical addresses
or exact values.
