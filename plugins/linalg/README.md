# `linalg`

Phase 1 provides exact dense linear algebra over RiX Integer and Rational
values. Matrices use rank-2 `Matrix` semantics. `Rref`, `Rank`, `Determinant`, `Inverse`,
and `Solve` preserve exact arithmetic; `Solve` distinguishes unique,
underdetermined, and inconsistent systems.

The coordinate API separates an abstract `VectorSpace` from each ordered
`Frame`. A frame basis matrix stores its basis vectors as columns expressed in
the `relativeTo` frame. `Vector`, `Covector`, and `Tensor` attach Shaped
components to ordered frame slots; `*` marks a dual slot. `Transform` returns a new object linked through
`equivalentTo` and sharing the same tensor identity. `Transform!` updates the
object while retaining a snapshot link to its previous representation.

```rix
.Plugin.Load("linalg");
A := {:2x2: /Matrix/ 2, 1; 1, -1};
result := .linalg.Solve(A, [5, 1]);
result.solution;
```

Phase 1 is implemented in pure RiX and requests no external permissions. The
host supplies only the public shaped-constructor registration hook used by
typed `/Vector/`, `/Covector/`, and `/Tensor/` headers; all exact algorithms,
coordinate transformations, identities, and bounded lineage are RiX code.

```rix
vspace := .linalg.VectorSpace({= name="V", dimension=2, over=:Rational });
e := .linalg.Frame(vspace, {= name="e", basis=:defining });
f := .linalg.Frame(vspace, {= name="f", relativeTo=e, basis=[1,1;0,1] });
x := {:2: /Vector: E/ 2, 3};
xInF := x.Transform(f);
t := {:2x2: /Tensor: E@E*/ 1,2;3,4};
```

## Phase 2 exact decompositions

`Bareiss(A)` performs fraction-free elimination without normalizing pivot rows.
For Integer matrices, its exact-division recurrence keeps every intermediate
entry integral. Rational matrices use the same recurrence with exact Rational
arithmetic. The result retains the source, echelon matrix, pivots, row swaps,
every before/after stage, and the determinant when `A` is square.

```rix
.Plugin.Load("linalg");
A := [0,2,1; 2,3,4; 4,1,5];
elimination := .linalg.Bareiss(A);
certificate := .linalg.DeterminantCertificate(A);
{:
    elimination[:echelon],
    elimination[:stages],
    elimination.Verify(),
    certificate[:determinant],
    certificate.Verify()
};
```

`LU(A)` returns exact row-pivoted factors satisfying `P A = L U`. `LDU(A)`
splits the diagonal from `U`, producing `P A = L D U` with unit diagonal in the
last factor. Both are reusable immutable records with `Verify()`, `Solve(b)`,
`Inverse()`, and `Determinant()` methods. LU records singular matrices and keeps
their rank; LDU, solving, and inversion require nonsingularity.

```rix
.Plugin.Load("linalg");
factor := .linalg.LU([0,2; 3,4]);
{:
    factor[:permutation],
    factor[:lower],
    factor[:upper],
    factor.Solve([2,7]),
    factor.Inverse(),
    factor.Verify()
};
```

`QR(A)` computes reduced exact QR for a tall or square Rational matrix using
modified Gram-Schmidt. When successful, it returns `A = Q R`, with exact
Rational entries, `Q^T Q = I`, upper-triangular `R`, and a replaying
`Verify()` method. It is also available as `A.QR()` on a typed `Matrix`.

```rix
.Plugin.Load("linalg");
A := {:2x2: /Matrix/ 3,0;4,5};
qr := A.QR();
{: qr.Q(),qr.R(),qr.Verify() };
```

Exact Rational QR is not closed under arbitrary inputs: the first column of
`[1,0;1,1]`, for example, has norm `sqrt(2)`. RiX does not approximate that
factor or silently change coefficient domains. Instead it returns status
`:unsupportedCoefficientExtension` with the column, squared norm, and required
square-root extension. Dependent columns return `:rankDeficient`; matrices with
more columns than rows return `:requiresTallOrSquareMatrix`. These diagnostic
records retain any completed exact orthonormal columns and partial upper
factor when decomposition began; shape diagnostics report the rejected
dimensions before doing work.

## Exact fundamental subspaces

`RowSpace`, `ColumnSpace`, and `NullSpace` return
`rix.linalg.subspace@1` records with exact Shaped basis vectors, ambient and
subspace dimensions, pivot columns, the source matrix, and a `Verify()` method.
Column-space bases are selected from the original matrix rather than its RREF.
Null-space verification checks every basis vector against the original matrix.

```rix
.Plugin.Load("linalg");
A := [1,2,3; 2,4,6];
{:
    .linalg.RowSpace(A),
    .linalg.ColumnSpace(A),
    .linalg.NullSpace(A)
};
```

The current QR surface deliberately stops at the Rational coefficient-domain
boundary. Algebraic-real and generic inner-product-space extensions remain
separate future work.

## Linear maps, duality, and contractions

`LinearMap(domain,codomain,matrix,options?)` separates the abstract source and
target spaces from the Frames used by its exact coordinate matrix. Maps expose
`Pushforward`/`Apply`, `Pullback`, `Compose`, `Inverse`, `Dual`, `Verify`, and
`Serialize`. Composition inserts the exact coordinate-change matrix when the
adjacent maps use different Frames of their shared space.

```rix
.Plugin.Load("linalg");
V := .linalg.VectorSpace("V",2); W := .linalg.VectorSpace("W",3);
e := .linalg.Frame(V,"e",:defining); g := .linalg.Frame(W,"g",:defining);
A := .linalg.LinearMap(V,W,{:3x2: 1,0;0,1;1,1},{=
  sourceFrame=e,targetFrame=g,name="A"
});
x := .linalg.Vector([1,2],e);
alpha := .linalg.Covector([1,1,1],g);
{: A.Pushforward(x),A.Pullback(alpha),A.Dual() };
```

`DualSpace(V)` is an explicit distinct VectorSpace linked back to `V`.
`TensorProduct` accepts either two spaces or two coordinate tensors. Contract
one primal and one dual slot of the same space with `tensor.Contract(i,j)`;
Frame alignment is exact and an all-axis contraction returns a scalar.

## Domain-preserving linear realizations

`rix.linalg.linear-realization@1` lets a domain value retain its semantic identity
while exposing a linked Vector view. `PolynomialSpace(n,variable?)` is the
first adapter: it models polynomials of degree at most `n` in the monomial
Frame. `Realize` pads ascending coefficients with exact zeros, and
`Reconstruct` returns a genuine Polynomial rather than a generic coefficient
array.

```rix
.Plugin.Load("linalg");
P3 := .linalg.PolynomialSpace(3,:x);
p := .p`x^2+2*x+3`;
view := P3.Realize(p);
{: view[:domain].__type,view[:vector].components,view.Reconstruct()==p };
```

`P3.Realize(p, frame?)` explicitly selects its ambient space and optionally a
Frame in that space. A realization has `Domain`, `Vector(frame?)`, `Transform`,
`Reconstruct`, and `SameSource` methods. The Vector also supports `SameSource`.
Two views of the same Polynomial in different ambient spaces share a source,
but have distinct tensor identities. Equal independently constructed
Polynomials have distinct sources. Addition and scaling produce new Vectors;
call the selected adapter's `Reconstruct` to return to the Polynomial domain.
Variable identity, Rational coefficients, and the maximum degree are checked.

### Portable identity graphs

`Serialize` remains a single-record inspection writer. `ExportGraph(value)`
(or an Array of roots) follows the complete supported dependency graph and
returns `rix.linalg.identity-graph@1`. `ImportGraph(graph)` returns an Array of
roots in the original order, including repeated roots. Use mathematical JSON
for transport; it retains exact scalars and shared scoped variable identities:

```{.rix exec=true id=identity-graph-readme}
.Plugin.Load("linalg");
a := .linalg.PolynomialSpace(2,:x);
p := .p`x^2+2*x+3`;
view := a.Realize(p);
saved := .MathEncodeJSON(.linalg.ExportGraph([p,a,view]));
loaded := .linalg.ImportGraph(.MathDecodeJSON(saved));
loaded[3].SameSource(loaded[1]) ##@ == 1
loaded[3].Reconstruct()==loaded[1] ##@ == 1
loaded[1].__type ##@ == "Polynomial"
```

Supported graph records are VectorSpace, Frame (including explicit dual
Frames), Vector/Covector/Tensor representations and identities, LinearMap,
Metric, PolynomialSpace, Polynomial, and linear realizations. Graph IDs are
local references. Sharing inside one import is preserved; every import
allocates fresh runtime tokens, including for equal names, dimensions and
numeric labels. Saved records cannot supply those tokens. Numeric IDs shown
by `Serialize` are diagnostic labels, not portable identity authorities.

The importer checks referenced kinds, scalar fields, dimensions, invertible
Frame bases and their relative change laws, primal/dual relationships, metric
evidence, equivalent tensor coordinates, source reconstruction, and bounded
acyclic lineage. Tagged product, permutation, metric, contraction and symmetry
derivations are replayed and compared exactly; forged derived origins fail.
Untagged `derivedFrom` links record ancestry rather than an asserted operation. Unknown fields and callable metadata are rejected. Nothing
in a graph is executed, fetched, or used to reattach external capabilities.
Polynomial providers are captured as coefficients and imported as frozen
Polynomials with their variable and degree bound. Re-realize a changed source
before exporting an older realization; stale source/coordinate pairs fail.

The options `maxNodes`, `maxComponents`, and `maxDepth` default to 512, 65536,
and 64, with hard maxima of 1024, 262144, and 128. `maxReplayWork` defaults
to 1048576 with a hard maximum of 16777216; it bounds aggregate conservative
component-work estimates before any tagged derivation is replayed. Components are counted across
stored bases, transforms, tensor coordinates and Polynomial coefficients.
Finite spaces have dimensions 1–256; tensor rank is 1–32; Polynomial degree
bounds are at most 255. Mathematical JSON adds its own byte, digit, depth and
node limits. Budget exhaustion is an error rather than a partial import.

### Scalar-field and coordinate-storage protocols

`.linalg.ScalarField()` and `space.ScalarField()` expose
`rix.scalar-field@1` with ID `rix.scalar-field.rational@1`. Its operations are
`Contains`, `Coerce`, `Add`, `Subtract`, `Multiply`, `Divide`, `Negate`, `Equal`,
`Zero` and `One`. Only exact Integer/Rational operands are accepted; intervals
and Float values do not silently change the field.

`.linalg.CoordinateStorage(shapedOrTensor)` and `tensor.CoordinateStorage()`
expose finite `rix.coordinate-storage@1`, kind `denseShaped`. `Shape`, `Size`,
`Get`, `Entries`, `Materialize(maxCells?)`, and `ScalarField` read logical
coordinates, including permuted Shaped views. Materialization checks its
explicit cell budget (default 65536). Graph coordinate payloads contain only
shape and exact logical entries; closures and storage capabilities are never
serialized. Sparse/lazy protocols and custom scalar fields remain later work.

### Shaped input boundary

The matrix services accept rank-2 Shaped or Matrix values and arrays of rows.
Validated Shaped inputs are explicitly converted to Matrix inside the adapter;
this does not change the caller's value or enable mixed Shaped/Matrix arithmetic.
Matrix-valued outputs use `Matrix`; rank-1 coordinate storage uses `Shaped`.
Calling a registered Matrix-only method such as `Determinant` on Shaped storage
suggests `value ~!: :Matrix`. Mathematical Tensor values retain their frame and
slot semantics and are not generic storage containers.

## Finite tensor operations

A Tensor's ordered slots determine its spaces and variance. Constructor
variance defaults to `:up`; `/Covector: E/`, `/Vector: E*/`, or explicit
`:down` selects the algebraic dual. Every finite component is an exact Integer
or Rational; a rank-2 Tensor still returns `Shaped` from `Components()`, not
`Matrix`.

`e.Dual()` returns the cached canonical dual Frame. An independently chosen
basis is explicit: `e.Dual("chosen", [1,1;0,1])`, also spelled
`.linalg.DualFrame(e,"chosen",basis)`. Its basis columns are expressed in
`e`'s canonical dual basis. Using that Frame directly in `/Vector: Chosen/`
constructs a Covector, and `/Tensor: E@Chosen/` uses a covariant second slot.
A second `Dual()` returns the associated primal Frame. These are algebraic
constructions and do not assume a Euclidean metric.

A dual Frame retains the original space identity and an explicit variance
flag. `dualBasis` exposes its basis in the defining dual coordinates;
`primalFrame` exposes its primal companion. The internal `basis` and
`inverseBasis` fields describe that companion, allowing the same slot
transformation algorithm to handle primal and covariant coordinates.
`ChangeMatrix` between two dual Frames applies the inverse-transpose law and
rejects a primal/dual Frame mix. `DualSpace(V)` remains the separate abstract
space used by dual linear maps; those maps retain the duals of their chosen
source and target Frames instead of assuming defining Frames.

| Method | Finite contract |
| --- | --- |
| `a == b`, `a.Equal(b)` | Compare exact components after aligning compatible ordered spaces and variance; independently created tensors may be equal. |
| `a.SameTensor(b)` | Compare abstract identity; coordinate transformations and full views preserve it. |
| `t.Permute([2,1])` | Permute complete slots and their coordinates, creating a derived tensor. The order must contain each axis once. |
| `t.View()` | Full-extent representation with the same identity and component storage. |
| `t.ComponentSlice({: 1,1:2})` | Select component storage or a scalar; never infer tensor semantics for a strict coordinate slice. |
| `t.Contract(i,j)` | Contract opposite-variance slots of the same space, aligning Frames exactly. |
| `t.Symmetrize(axes?)`, `t.Antisymmetrize(axes?)` | Average over selected slots of the same space and variance, accounting for their different Frames. |
| `t.TensorPower(n)` | Exact tensor product, with power zero equal to scalar `1` and power one a full view. |

Symmetry accepts one through six distinct axes, at most 720 permutations and
131,072 component-permutation contributions. Tensor powers accept integer
exponents zero through eight and at most 65,536 output components. These
bounds reject the operation before expansion.

A full view and a whole-slot permutation commute with independent coordinate
changes. Ordinary component slices generally do not, so their result has
storage semantics. Shaped `Flatten` and `Reshape` enumerate logical view
cells, including permuted or offset storage, rather than reading the backing
array in its original order.

`Transform!` is available both on a tensor and through `.linalg`. It keeps the
original representation permanently plus the configured number of recent
representations (default 30; range 1–1024). Retained records are snapshots,
not repeated references to the currently mutating object. Eviction cuts stale
backlinks. Invalid target Frames leave the representation and history intact.

## Explicit Rational metrics

`Metric(frame,matrix)` requires a symmetric, nonsingular exact Rational matrix
of the Frame's dimension. Nondegenerate indefinite forms are accepted for
index changes and bilinear pairings. Positive definiteness is checked exactly
and is required by `Norm` and `Angle`.

```{.rix exec=true id=finite-metric-readme}
.Plugin.Load("linalg");
space := .linalg.VectorSpace("metric example",2);
e := .linalg.Frame(space,"e",:defining);
f := .linalg.Frame(space,{= name="f",relativeTo=e,basis=[1,1;0,1] });
metric := .linalg.Metric(e,[2,1;1,3]);
x := .linalg.Vector([2,3],e);
alpha := x.Lower(metric);
{: alpha.components,alpha.Raise(metric)==x,x.NormSquared(metric),
   x.Transform(f).Lower(metric.Transform(f))==alpha.Transform(f) };
```

The covector has components `[7,11]`, the squared norm is `47`, and both
comparisons are true. `Lower(metric,axis?)` and `Raise(metric,axis?)` default
to axis one; each checks the existing variance and metric's space. The result
has a new derived identity. `metric.Transform(f)` changes its components by
the exact congruence law. `Dot(other,metric)` uses the explicit metric;
`Pair` remains the metric-free vector/covector operation.

`Trace(i?,j?,metric?)` defaults to axes one and two. Opposite variance uses
canonical contraction. Equal variance requires the supplied metric, lowering
or raising the second selected slot first. A missing metric always produces
an explicit diagnostic for index changes, dot products, norms, angles and
same-variance traces.

`Norm(metric)` returns an exact Rational when its square root is Rational.
Otherwise it returns `:unsupportedCoefficientExtension`, the squared norm,
and the required root. `Angle(other,metric)` returns zero for positive
collinear nonzero vectors. Other angles report
`:unsupportedCoefficientExtension`, their exact normalized-pairing data and
an inverse-cosine requirement. Neither operation silently approximates or
changes scalar domains. `NormSquared` is exact for every accepted metric;
for an indefinite form this is the bilinear self-pairing, not a positive norm.
Metrics and explicit dual Frames participate in `ExportGraph`/`ImportGraph`;
`Serialize` remains available for inspecting an individual identity record.

## Rational spectral evidence

`CharacteristicPolynomial(A, variable?, options?)` and `MinimalPolynomial`
return genuine univariate Polynomials over Q and check `p(A)=0` exactly.
The minimal polynomial is the first dependence among `I,A,...,A^n`, with
exact solving at every degree. Both accept matrix rows, rank-2 Shaped, Matrix,
or a finite Rational endomorphism. A LinearMap with different source/target
Frames is expressed in its source Frame before computing either invariant.
Typed Matrix receivers expose the same methods.

`RationalEigenspaces` returns an immutable report with `Roots()`, `Spaces()`,
`CharacteristicPolynomial()`, `MinimalPolynomial()`, `Record()`, and `Verify()`.
Each eigenspace gives the exact Rational root, algebraic/geometric
multiplicities, an independent kernel basis, and rank. The report also gives
the remaining characteristic factor and `diagonalizableOverRational`.

```{.rix exec=true id=rational-spectral-readme}
.Plugin.Load("linalg");
spectral := .linalg.RationalEigenspaces([2,1;0,2]);
{: spectral.CharacteristicPolynomial().Coefficients(),
   spectral.MinimalPolynomial().Coefficients(),spectral.Roots(),
   spectral[:diagonalizableoverrational],spectral.Verify() };
```

The two polynomials are `(x-2)^2`, the only root is `2`, and the one-dimensional
eigenspace proves this matrix is not diagonalizable over Q. The verifier
recomputes the entire report, including annihilation and eigenvector residuals;
`.linalg.VerifySpectral(record)` accepts a data-only `Record()` after
`MathEncodeJSON`/`MathDecodeJSON`. Scoped variables retain document-local sharing.

Spectral budgets are `maxDimension=8`, `maxRootTrials=10000`, and
`maxRootCandidates=4096`, with hard maxima 16, 100000, and 65536. Root enumeration
uses a bounded Rational-root theorem search. A trial/candidate budget exhaustion
returns a partial report: roots already proved remain exact, while root-search
completeness is `_` and unresolved diagonalizability/extension requirements are
`?`. It never treats an incomplete search as proof of no Rational roots.
`VerifySpectral` uses the record's hard-bounded budgets by default; explicitly
supplied verification budgets must reproduce the same report. Rational
canonical forms, Jordan bases, and extension-field eigenspaces are unsupported;
`canonicalForms` records that boundary explicitly.

## Canonical sparse coordinates

`SparseCoordinates(terms, shape, options?)` implements `rix.coordinate-storage@1`
with `kind=:finiteSupport`. Each input term is `{= indices=[...],value=q }`.
Coordinates are exact Integer/Rational values; duplicates are combined, zeros
removed, and keys sorted numerically in lexicographic order. Finite axes use
1-based indices. A `:countable` axis uses nonnegative monomial degree keys.
`finite=1` means the support is finite, even when the ambient dimension is not.

```{.rix exec=true id=sparse-coordinates-readme}
.Plugin.Load("linalg");
coordinates := .linalg.SparseCoordinates([
  {= indices=[2],value=3 },{= indices=[1],value=2 },
  {= indices=[2],value=-1 }
],[3]);
{: coordinates.Entries(),coordinates.Materialize(),coordinates.Verify() };
```

Methods include `Shape`, `Size`, `SupportSize`, `Entries`, `Get`, `ScalarField`,
`Add`, `Scale`, `TensorProduct`, `Permute`, `Equal`, `Materialize`, `Record`, and
`Verify`. `Entries()` contains canonical sparse terms; dense adapters retain
logical row-major scalar entries. `Size()` is the finite ambient cell count or
`_` for countable axes. `Get` selects one exact coordinate; it is not a range
slice. `Materialize(maxCells=65536)` requires all axes finite and respects a
hard ceiling of 262144 cells. Countable coordinates require an explicit bounded
polynomial projection before materialization.

Budgets are `maxSupport=256`, `maxWork=65536`, `maxIndex=4096`, with hard maxima
2048, 1048576, and 65536. Rank is at most 32; each finite axis is at most 65536.
Index, input/work, canonicalization, intermediate support, matrix action and
product growth are checked before or during bounded work. A product of supports
of sizes `a` and `b` must fit `a*b` within its left operand's limits; cancellation
in later operations does not authorize exceeding the intermediate support.

`Vector`, `Covector`, and `Tensor` accept sparse components through the same
ordered Frame slots and exact Rational scalar field. Add/subtract, scale/divide,
equality, Frame transforms, pairing, finite LinearMap application/pullback,
permutation, contraction, metric index changes, symmetry, and tensor powers
retain exact sparse semantics and preserve the existing identity rules. Mixing
dense and sparse components selects sparse output with bounded conversion.
No operation infers a new scalar domain or a multivariate Polynomial from a
tensor product's independent slots.

`RestoreCoordinates(record)` restores only closed canonical sparse data;
`VerifyCoordinates(record)` checks it without trusting a method or callback.
`MathEncodeJSON` is the transport codec. Identity graph v1 remains finite and
dense: it rejects sparse tensors/countable Frames explicitly. Use sparse
records for their coordinates, or explicitly materialize finite components and
construct the finite tensor graph required by an application. Sparse records
alone do not assert or restore mathematical space/tensor identity.

## Finite polynomials in a countable monomial Frame

`PolynomialSpace(:unbounded, variable?, options?)` (or a settings Map with
`maxDegree=:unbounded`) describes finite polynomials of any admissible degree.
It exposes a countable monomial Frame via `Frame()` and `Frame().BasisAt(degree)`.
`Realize(p).Vector().Components()` is sparse, and `Reconstruct` returns a genuine
Polynomial. Addition, cancellation, scaling, pairing with explicit finite-support
Covectors, and tensor products remain algebraic and finite. The full algebraic
dual of a countable space is not finite-support, so `DualSpace` rejects that
request rather than equating the two. General infinite basis changes, series,
convergent expansions and topology remain later work.

```{.rix exec=true id=polynomial-support-readme}
.Plugin.Load("linalg");
polynomials := .linalg.PolynomialSpace(:unbounded);
bounded := polynomials.Bounded(2);
source := polynomials.Realize(.p`x^5+3*x^2+2`);
projected := bounded.Project(source);
{: source.Vector().components.Entries(),projected.Vector().components,
   projected.Remainder().Coefficients(),projected.Verify(),
   polynomials.Include(projected.Realization()).Reconstruct()+projected.Remainder()==source.Domain() };
```

`Bounded(n)` provides the finite dense `P_<=n` subspace for `0<=n<=255`.
`Include` accepts a realization from a subspace created by that same ambient
adapter and preserves its Polynomial source identity. `Project` requires that
ambient realization and returns its bounded realization plus the discarded
Polynomial. It checks `source = kept + discarded`, the degree bound on `kept`,
and the zero low-degree coefficients of `discarded`. Its `Record()` carries
replayable `rix.linalg.polynomial-projection@1` evidence accepted by
`.linalg.VerifyProjection`; it makes no claim to transport ambient identity.
`exactInclusion` is true precisely when nothing was discarded. Projecting to
one bound then including and projecting to another gives the corresponding
finite subspace maps without conflating their tensor identities.

### Finite sparse linear kernels

A `SparseCoordinates` value now supports `matrix.MatMul(otherMatrix)` and
`matrix.Apply(vector)`. Both return canonical exact Rational finite-support
storage, including cancellation of zero terms, without allocating a dense
matrix. Finite dimensions must agree; countable axes require a prior explicit
finite projection. The left operand's existing support/work/index budgets apply
to the output, pair matching, and canonicalization. These bounded reference
kernels scan pairs of stored terms (not the dense domain); they do not add sparse
factorization, approximate solvers, or certified Float evidence. Use Float's
explicit typed adapters when approximate dense arithmetic is intended.
