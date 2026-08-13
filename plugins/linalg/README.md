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

Phase 1 is a deterministic host implementation while the coordinate-value and
algorithm protocols settle. It requests no external permissions.

```rix
vspace := .linalg.VectorSpace({= name="V", dimension=2, over=:Rational });
e := .linalg.Frame(vspace, {= name="e", basis=:defining });
f := .linalg.Frame(vspace, {= name="f", relativeTo=e, basis=[1,1;0,1] });
x := {:2: /Vector: E/ 2, 3};
xInF := x.Transform(f);
t := {:2x2: /Tensor: E@E*/ 1,2;3,4};
```
