# `linalg`

Phase 1 provides exact dense linear algebra over RiX Integer and Rational
values. Matrices are rank-2 tensors. `Rref`, `Rank`, `Determinant`, `Inverse`,
and `Solve` preserve exact arithmetic; `Solve` distinguishes unique,
underdetermined, and inconsistent systems.

The coordinate API separates an abstract `VectorSpace` from named coordinate
systems. A coordinate system stores a basis matrix whose columns are its basis
vectors in the space's reference coordinates. `CoordinateTensor` attaches
components and per-axis variance (`:up`/`:contravariant` or
`:down`/`:covariant`). `Transform` returns a new object linked through
`equivalentTo` and sharing the same tensor identity. `Transform!` updates the
object while retaining a snapshot link to its previous representation.

```rix
.Plugin.Load("linalg");
A := [2, 1; 1, -1];
result := .linalg.Solve(A, [5, 1]);
result.solution;
```

Phase 1 is a deterministic host implementation while the coordinate-value and
algorithm protocols settle. It requests no external permissions.

