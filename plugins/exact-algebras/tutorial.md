---
title: Multiply exact quaternions and octonions
description: Explore Cayley–Dickson multiplication, conjugation, norms, and inverses using a pure-RiX plugin.
theme: Algebra and analysis
status: implemented
plugin: exact-algebras
---

The exact-algebras plugin is written in RiX and keeps every component as an
exact Integer or Rational.

```rix
.Plugin.Load("exact-algebras");
i := .exactAlgebras.Quaternion(0, 1, 0, 0);
j := .exactAlgebras.Quaternion(0, 0, 1, 0);
k := i * j;
{: .exactAlgebras.Components(k), .exactAlgebras.NormSquared(k) };
```

## Conjugation and inverse

The same recursive Cayley–Dickson implementation handles octonions. Division
uses right division, so `a / b` means `a * b.Inverse()`.

```rix
.Plugin.Load("exact-algebras");
o := .exactAlgebras.Octonion(1, 2, 3, 4, 5, 6, 7, 8);
inverse := .exactAlgebras.Inverse(o);
{: .exactAlgebras.NormSquared(o),
   .exactAlgebras.Components(o * inverse),
   .exactAlgebras.Components(.exactAlgebras.Conjugate(o)) };
```

Quaternion and octonion dimensions are not mixed implicitly. Exact rational
scalars, however, promote naturally into the real component.

```rix
.Plugin.Load("exact-algebras");
q := .exactAlgebras.Quaternion(1, 2);
.exactAlgebras.Components(q + 1/2);
```
