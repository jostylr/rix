# `exact-algebras`

`exact-algebras` is an opt-in foundation for finite-dimensional exact normed
division algebras over the rationals. The initial surface provides quaternion
and octonion values with exact `Integer`/`Rational` coefficients. Its
Cayley–Dickson construction and operator variants are implemented entirely in
RiX; `exact-algebras.reference.js` retains the former JavaScript version only
as a comparison source.

```rix
.Plugin.Load("exact-algebras");

i := .exactAlgebras.Quaternion(0, 1, 0, 0);
j := .exactAlgebras.Quaternion(0, 0, 1, 0);
k := i * j;

o := .exactAlgebras.Octonion(1, 2, 3, 4, 5, 6, 7, 8);
n := .exactAlgebras.NormSquared(o);
unit := o * .exactAlgebras.Inverse(o);
```

## Initial API

| Command | Purpose |
| --- | --- |
| `.exactAlgebras.Quaternion(a, b, c, d)` | Construct `a + bi + cj + dk`; omitted trailing components are zero. |
| `.exactAlgebras.Octonion(a0, ..., a7)` | Construct an octonion; omitted trailing components are zero. |
| `.exactAlgebras.Components(value)` | Return the exact coefficients in basis order. |
| `.exactAlgebras.Conjugate(value)` | Negate all imaginary components. |
| `.exactAlgebras.NormSquared(value)` | Return the sum of the eight or four component squares. |
| `.exactAlgebras.Inverse(value)` | Return `conjugate(value) / normSquared(value)`. |

Once loaded, `+`, `-`, unary `-`, `*`, `/`, `==`, and `!=` accept these values
and rational scalars. Quaternion and octonion dimensions are intentionally not
mixed implicitly.

This is a foundation rather than a finished hypercomplex package. Natural
follow-on work includes named basis units, semantic type declarations,
Cayley–Dickson construction at the RiX level, matrices and polynomials over
these values, and explicit left/right quotient APIs for nonassociative work.
