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

Exact QR remains the next decomposition milestone because it requires an
explicit coefficient-extension policy whenever a column norm is not Rational.
