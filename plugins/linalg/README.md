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
