# Cayley plugin

The `cayley` plugin is RiX's scalar-generic Cayley–Dickson kernel. It keeps the
older `exact-algebras` schema unchanged while adding certified-real components,
component boxes, provider capabilities, typed adapters, and dimensions `2^n`.

```rix
.Plugin.Load("cayley");
level := .cayley.Level(2);
i := level.BasisValue(1);
j := level.BasisValue(2);
{: level.Dimension(), (i*j).Components(), (j*i).Components() };
```

`Level(n, provider?)` records the scalar backend and algebra laws. Total
inverse/division is advertised only for levels 1–3 over a central commutative
provider that supports division. Later levels remain constructible, but do not
silently inherit a division-algebra claim.

Main operations are `Value`, `BasisValue`, `Components`, `Conjugate`,
`NormSquared`, `ZeroStatus`, `Enclose`/`Refine`, `Inverse`, `LeftDivide`, and
`RightDivide`. `BasisProduct` is a sparse signed-basis lookup;
`VerifyMultiplication` compares the specialized 2D/4D/8D path with the recursive
law. `Record()` retains component backend identities and multiplication
parentheses.

`FromComplex` accepts both core complex values and `.complex` singletons.
`FromExactAlgebra` adapts rational Quaternion/Octonion values without changing
their source schema.
