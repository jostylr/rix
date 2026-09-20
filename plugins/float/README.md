# `float`

`float` is an opt-in IEEE-754 approximate-number package. It provides a
semantic Float type, conversions, intervals, rounding, and common approximate
real-valued math without making JavaScript numbers part of RiX core.

## Load and use

```rix
.Plugin.Load("float")

x := .float.Float(1 / 3)
y := (1 / 3).Float()
b32 := .float.Binary32(1 / 3)
.float.Sin(x)
.float.Round(.float.Float(2.675), 2)
```

The plugin registers Float-to-Float overloads for arithmetic, comparison, and
standard math operations. It never silently converts an Integer, Rational, or
certified real. Write both conversions explicitly, for example
`.float(1/2) + .float(1/3)`, or perform exact arithmetic first and convert the
result with `.float(1/2 + 1/3)`.

## Commands

| Command | Purpose |
| --- | --- |
| `.float(value, format?)` / `.float.Float(value, format?)` / `value.Float(format?)` | Convert to Float; the default is `:binary64`. |
| `.float.Binary32(value)`, `.float.Binary64(value)` | Select IEEE-754 binary32 or binary64 explicitly. |
| `value.Format()`, `value.Classify()`, `value.Diagnostics()` | Inspect the configured format and structured exceptional-value metadata. |
| `value.NextUp()`, `value.NextDown()`, `value.NextAfter(target)` | Move by one representable value in the configured format. |
| `.float.Interval(value)` | Construct an exact enclosure of the stored IEEE value. |
| `.float.Round(value, places?)` | Exact decimal representation of IEEE rounding. |
| `.float.Floor(value, places?)`, `.float.Ceiling(value, places?)` | Directed decimal rounding. |
| `.float.Abs`, `.float.Sqrt`, `.float.Sin`, `.float.Cos`, `.float.Tan` | Common Float math. |
| `.float.Log`, `.float.Exp` | Exponential/logarithmic Float math. |
| `.float.Sum(values, options?)` | Reproducible sequential, pairwise, or compensated reduction. |
| `.float.Dot(left, right, options?)` | Reproducible rounded dot product using the same policies. |
| `.float.Complex(re, im, format?)` | Construct a separate approximate `rix.float.complex@1` value. |
| `.float.ComplexAdd`, `ComplexSub`, `ComplexMul`, `ComplexDiv` | Approximate complex arithmetic with per-operation format rounding. |
| `.float.ComplexConjugate`, `ComplexAbs` | Approximate complex conjugate and magnitude. |

Float values implement the neutral `Sample`, `Enclose`, `Refine`, and
`NumericsCapabilities` receiver protocol consumed by `.numerics`. Sampling
and enclosure return `:approximate`: the point interval is exact for the
stored IEEE value, but it is not an error bound for the intended real-valued
calculation. Refinement is explicitly `:unsupported`, because a stored binary32
or binary64 value carries no information from which to refine the intended real. For the
same reason, a Float comparison against a language Halo is diagnostic
undecided rather than a certified Boolean result.

Arithmetic preserves its operands' format and rounds every result back to that
format. Mixed binary32/binary64 arithmetic and ordering require an explicit
conversion. `Classify()` returns the versioned `rix.float.classification@1`
record; diagnostics distinguish overflow, underflow to signed zero, subnormal
values, division by zero, infinities, and NaN. Non-finite values cannot be
turned into rational intervals, and their sampling status is `:unknown` rather
than a fabricated certificate.

## Reproducible algorithms and complex values

`Sum` and `Dot` use a declared `policy` (`:sequential`, `:pairwise`, or
`:compensated`) and round every operation to the selected `format`. Their
`rix.float.algorithm-result@1` record includes the Float result and a
`rix.float.error-estimate@1` first-order estimate. The estimate is explicitly
approximate and has `certified = null`; it is useful diagnostic scale, not a
proof that replaces an interval or Oracle calculation. Input order is part of
the reproducible contract.

Approximate complex values use `rix.float.complex@1` and store two Float
components. They do not register arithmetic for core exact Complex values and
cannot enter exact complex expressions implicitly. Binary32 and binary64
components must match unless the constructor is given an explicit format.

## Dependencies

The Node implementation pairs `node-installer.js` with the RiX type startup
source `floats.js.rix` and its JavaScript bridge `floats.js`. Browser hosts use
`browser-installer.js`, which has no Node filesystem dependency. Neither
implementation requests network or filesystem access at evaluation time.

See [tutorial.md](tutorial.md).

## Bounded typed tensor adapters

`.float.Tensor(values, shape, format ?= :binary64)` explicitly converts a flat
Array or Shaped view into copy-owned Float32/Float64 storage. Shaped input may
omit `shape`; strided views are traversed in logical order. The opaque adapter's `shape`,
`format`, `diagnostics`, `status="approximate"`, and `certified=_` describe the
adapter; `.float.ToShaped(tensor)` creates ordinary Float cells on demand.
`.float.MatMul(matrix, matrixOrVector)` computes finite-dimensional products in
row/column/inner-index order, rounding each product and addition in the chosen
format. Both operands must use the same explicit format. This is approximate
arithmetic, not a Rational result, error enclosure, or spectral certificate.

The limits are 262,144 cells, 16 positive finite axes, and 4,194,304 scalar
multiply/add steps per product. Sparse/countable coordinates use exact linalg
methods instead. Conversion and arithmetic diagnostics are retained per output
cell and in aggregate; `ToShaped` retains that cell's provenance and operation.
Explicit NaN/infinity inputs carry `nonFiniteInput`; signed zero is retained at
import/export, while matrix sums follow the stated IEEE sequential policy.

The JS bridge exports `floatTensorFromTypedArray` and
`floatTensorToTypedArray` from `tensor-adapters.js`. Both copy buffers, preventing
external mutations from changing results. RiX assignment and nested containers
retain the live handle. In-process snapshots can share the read-only numeric handle safely. Serialization
and worker boundaries must transfer ordinary `ToShaped` values and reconstruct
the adapter on the receiving side; a cloned/forged handle fails with an explicit diagnostic.
Adapters are an in-process acceleration boundary, not an interchange format or
hard memory-isolation promise.

`benchmarks/numeric-adapters.js` compares the prior pairwise slicing reduction
with the allocation-free index traversal, retaining its exact operation tree.
It also compares a boxed scalar matrix reference to the typed kernel and checks
every result bit-for-bit. The checked-in baseline records measured timings,
GC-sensitive heap deltas, and deterministic temporary-allocation counts.
