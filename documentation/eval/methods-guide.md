# RiX methods overview

This is the complete overview of RiX's built-in receiver method surface. Each object type links to a dedicated reference page with full signatures, behavior notes, and executable `##@` / `##:` comment checks.

The generated [runtime catalog](../reference/system-reference.md#built-in-receiver-methods) is derived from the same runtime prototypes and is useful for detecting implementation drift. This page uses the readable source spellings.

## How method calls work

RiX method syntax is receiver-first callable sugar:

```rix
object.Method(argument1, argument2)
object.Method!(argument1, argument2)
```

- A method without `!` does not mutate its receiver.
- A paired `!` method mutates a mutable receiver and usually returns that receiver.
- `Pop!` and `Shift!` are mutation-only extractors: they return the removed value.
- Iterator cursor methods are stateful without `!`; an Iterator is already a traversal handle.
- Lookup is case-flexible at the language boundary. The reference uses readable names such as `Numerator`, even though generated registry keys are uppercase.
- Every built-in receiver supports `CheckTraits()` (also addressable as `CHECKTRAITS`) for explicit semantic-trait validation.

Built-in prototypes are frozen and do not chain. Lookup checks direct value metadata, semantic trait and type methods, active plugin extensions, and finally the built-in prototype. See the [types and traits guide](./types-and-traits-guide.md) for the semantic layers.

## Object type index

| Object type | Dedicated reference | Role |
|---|---|---|
| Integer | [Integer methods](./objects/integer.md) | Exact whole numbers |
| Rational | [Rational methods](./objects/rational.md) | Reduced exact fractions |
| RationalInterval | [RationalInterval methods](./objects/rational-interval.md) | Exact bounded rational intervals |
| Array | [Array methods](./objects/array.md) | Mutable eager sequences |
| LazySequence | [LazySequence methods](./objects/lazy-sequence.md) | Cached on-demand sequences |
| AsyncStream | [AsyncStream methods](./objects/async-stream.md) | Linear asynchronous pull streams |
| Iterator | [Iterator methods](./objects/iterator.md) | Stateful collection cursors |
| Map | [Map methods](./objects/map.md) | Insertion-ordered keyed collections |
| Set | [Set methods](./objects/set.md) | Insertion-ordered distinct collections |
| String | [String methods](./objects/string.md) | Immutable Unicode text |
| Tuple | [Tuple methods](./objects/tuple.md) | Fixed-arity ordered values |
| Tensor | [Tensor methods](./objects/tensor.md) | Rectangular rank-N collections |
| Deferred | [Deferred methods](./objects/deferred.md) | Stored lowered RiX code |
| Structural values | [Structural value methods](./objects/structural-values.md) | Structural symbols, literals, forms, and algebras |
| Exact generator / expression | [Exact Cartesian methods](./objects/exact-cartesian.md) | Exact Cartesian complex expressions |
| Cayley | [Cayley methods](./objects/cayley.md) | Exact magnitude/direction complex values |

## Complete method lists

The lists below include inherited `Iterator` and `CheckTraits` methods where they are available. A slash joins non-mutating and mutating spellings; both full names are shown.

### Integer

`Negate`, `Abs`, `E`, `BitLength`, `ToString`, `CheckTraits`

### Rational

`Numerator`, `Denominator`, `Negate`, `Reciprocal`, `Abs`, `Floor`, `Ceil`, `Trunc`, `Round`, `RoundTo`, `E`, `ToMixedString`, `ToDecimal`, `ToContinuedFraction`, `ToContinuedFractionString`, `Convergents`, `Convergent`, `ApproximationError`, `BestApproximation`, `BestConvergent`, `BitLength`, `ToString`, `CheckTraits`

### RationalInterval

`Start`, `End`, `Low`, `High`, `Width`, `IsAscending`, `Midpoint`, `Mediant`, `Negate`, `Reciprocal`, `Overlaps`, `Contains`, `ContainsValue`, `ContainsZero`, `Intersection`, `Union`, `ShortestDecimal`, `DenominatorInterval`, `Random`, `RandomPartition`, `E`, `BitLength`, `ToMixedString`, `ToString`, `CheckTraits`

`Random(parameters)` and `RandomPartition(parameters)` consume the RNG selected by `.RNG`. Their parameter tuple matches the interval `:%` and `:/%` operators: count, optional fixed denominator, and optional tolerance.

### Array

Read-only and copying:
`Len`, `IsEmpty`, `Get`, `First`, `Last`, `Includes`, `IndexOf`, `LastIndexOf`, `HasAt`, `Slice`, `Join`, `Push`, `Unshift`, `Set`, `Insert`, `RemoveAt`, `Concat`, `Reverse`, `Sort`, `Distinct`, `Flatten`, `DropFirst`, `DropLast`, `Map`, `Filter`, `Any`, `All`, `Count`, `Find`, `FindIndex`, `Reduce`, `Swap`, `Move`, `Iterator`, `CheckTraits`

Mutating:
`Push!`, `Unshift!`, `Set!`, `Insert!`, `RemoveAt!`, `Concat!`, `Reverse!`, `Sort!`, `Distinct!`, `Flatten!`, `Pop!`, `Shift!`, `Swap!`, `Move!`

Array callbacks receive `(value, index, array)`. `RemoveAt` shortens its returned copy; `RemoveAt!` leaves a hole in place.

### LazySequence

`Len`, `IsEmpty`, `Get`, `First`, `Last`, `Materialize`, `Iterator`, `CheckTraits`

Positive `Get` generates only through the requested one-based index. `Last`, negative indexing, and `Materialize` require a known finite source.

### AsyncStream

Lazy derivation:
`Map`, `Filter`, `Take`, `Drop`, `Chunk`, `Window`

Promise-aware terminals:
`ForEach`, `Reduce`, `Collect`, `First`, `Find`, `Count`

Lifecycle:
`Close`, `Done`, `Status`, `CheckTraits`

An AsyncStream is a linear handle, not a cached LazySequence. A terminal claims the stream. `Status()` returns a map containing lifecycle details; it does not pull.

### Iterator

`Next`, `Peek`, `Done`, `Index`, `Reset`, `CheckTraits`

Arrays, LazySequences, Tuples, Strings, Tensors, Maps, and Sets provide `Iterator()`. A new cursor starts at index `0`, before the first one-based item.

### Map

Read-only and copying:
`Len`, `IsEmpty`, `Has`, `Get`, `Keys`, `Values`, `Entries`, `Set`, `Remove`, `Merge`, `Update`, `Default`, `Keep`, `Omit`, `MapValues`, `ReduceKeys`, `Filter`, `Any`, `All`, `Count`, `Reduce`, `Iterator`, `CheckTraits`

Mutating:
`Set!`, `Remove!`, `Merge!`, `Update!`, `Default!`, `Keep!`, `Omit!`

Most callbacks receive `(value, key, map)`. `ReduceKeys` deliberately uses `(acc, key, value, map)`.

### Set

Read-only and copying:
`Len`, `IsEmpty`, `Has`, `Values`, `Add`, `Remove`, `Union`, `Intersect`, `Diff`, `SymDiff`, `SubsetOf`, `SupersetOf`, `Disjoint`, `Filter`, `Any`, `All`, `Count`, `Reduce`, `Iterator`, `CheckTraits`

Mutating:
`Add!`, `Remove!`, `Union!`, `Intersect!`, `Diff!`, `SymDiff!`

Set callbacks receive `(value, value, set)`. The repeated second argument occupies the generic key/index slot.

### String

`Len`, `IsEmpty`, `Get`, `First`, `Last`, `Includes`, `StartsWith`, `EndsWith`, `IndexOf`, `LastIndexOf`, `Slice`, `Concat`, `Split`, `Trim`, `TrimStart`, `TrimEnd`, `Upper`, `Lower`, `Replace`, `ReplaceAll`, `PadLeft`, `PadRight`, `Repeat`, `Reduce`, `Iterator`, `CheckTraits`

Strings are immutable. String Reduce callbacks receive `(acc, char, index, string)`.

### Tuple

`Len`, `Get`, `First`, `Last`, `Slice`, `Set`, `ToArray`, `Reduce`, `Iterator`, `CheckTraits`

Tuple methods do not mutate the receiver. `Set` returns a new tuple.

### Tensor

Read-only and copying:
`Shape`, `Rank`, `Size`, `Get`, `Set`, `Reshape`, `Flatten`, `Transpose`, `Permute`, `Map`, `Sum`, `Mean`, `Dot`, `MatMul`, `Reduce`, `Iterator`, `CheckTraits`

Mutating:
`Set!`, `Fill!`

Tensor callbacks receive `(value, indexTuple, tensor)`. `Transpose` is rank-2 only; `Permute` accepts a tuple containing every one-based axis exactly once.

### Deferred

`Eval`, `Desugar`, `Inspect`, `CheckTraits`

`Eval` runs stored code. `Desugar` displays lowered IR. `Inspect` runs in a fresh scope and reports inputs, trace, and output.

### Structural values

`Inspect`, `Render`, `Collapse`, `ToExact`, `Simplify`, `Head`, `Arguments`, `SourceSpan`, `MapArguments`, `CheckTraits`

This common surface applies to structural symbols, structural literals, structural forms, structural algebra values, and legacy structural Fraction values.

### Exact generators and exact expressions

`Conjugate`, `Re`, `Im`, `NormSquared`, `Cayley`, `CheckTraits`

### Cayley

`Cartesian`, `Cayley`, `Conjugate`, `Re`, `Im`, `NormSquared`, `Magnitude`, `Direction`, `Inverse`, `CheckTraits`

## Generic Reduce callback

Collection `Reduce` methods use:

```rix
object.Reduce((acc, value, keyOrIndex, object) -> nextAcc, initial?)
```

If `initial` is omitted, RiX creates a mutable accumulator suited to the receiver:

| Receiver | Default accumulator |
|---|---|
| Array | `[]` |
| Map | `{= }` |
| Set | `{| |}` |
| String | Empty string |
| Tuple | Same-arity mutable tuple filled with holes |
| Tensor | Same-shape mutable tensor filled with holes |

Extra callback arguments may be ignored normally or capped explicitly, for example with `@+[2]`.

## Specialized method-bearing values

Several domain objects own methods outside the frozen built-in prototype catalog:

- ReactiveGraph and reactive-node methods are covered by the [sheet guide](./sheet-guide.md) and [reactive identities](#reactive-identities) below.
- Binding (`Get`, `Set`, `At`, `Slice`), FormulaSheet, and portable Sheet methods are documented in the [sheet guide](./sheet-guide.md).
- Renderer and structured-output objects are documented in the [output guide](./output-guide.md) and [renderer guide](./renderer-guide.md).
- Plugin namespace objects document their methods in each plugin's tutorial and in the [plugin catalog](../plugin-catalog.md).

These surfaces are intentionally outside the built-in object-type list because they are constructed by subsystems or plugins rather than attached by the universal runtime prototype registry.

### Reactive identities

`$$name` exposes a ReactiveNode with `Get()`, `Peek()`, `Set(value)`, `ReplaceValue(value)`, `GetFormula()`, `SetFormula(formula)`, `Live()`, and `Touch()`.

`Touch()` explicitly publishes an intentional in-place mutation:

```{.rix exec=true id=reactive-touch-method}
$$items := [1];
$$count := $items.Len();
$items.Push!(2);
$$items.Touch();
$count ##@ == 2;
```

For an explicit `.ReactiveGraph`, use `graph.Touch("name")`. Prefer ordinary value replacement when possible; `Touch` does not inspect or validate deep mutations.

## Plugin extension methods

Plugins can add a receiver-first method to an existing semantic/runtime type without patching individual values or RatMath JavaScript classes:

```{.rix exec=true id=register-method-example}
.RegisterMethod(:Rational, :Twice, (self) -> self * 2);
(3/7).Twice() ##@ == 6/7;
```

A plugin registration cannot replace a built-in method, and a second extension with the same type/name pair is an error. Plugin-owned extensions remain usable only while their owning mount is visible in the active system context.

The bundled `.radix` plugin adds `Expansion`, `Digits`, `PeriodLength`, `PeriodInfo`, and `RadixString` to exact numeric values. The `.float` plugin adds the explicit `Float()` conversion to Integers and Rationals. Plugin methods are listed on their plugin pages rather than in the built-in lists above.
