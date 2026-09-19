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

`rix.linear-realization@1` lets a domain value retain its semantic identity
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

`Serialize` emits `rix.linalg.identity-record@1` data for spaces, Frames,
tensors, maps, and realizations. Tensor records use stable numeric tensor and
representation IDs and refer to prior representations by ID, avoiding live
object cycles while preserving bounded in-memory lineage separately.

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
Metrics and explicit dual Frames have identity-record writers via `Serialize`;
validated graph import is tracked separately from these finite operations.
