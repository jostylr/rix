---
title: Build Cayley–Dickson algebras over certified scalars
description: Construct, enclose, adapt, and verify generic Cayley values.
theme: Algebra and analysis
status: implemented
---

## Levels, bases, and multiplication order

```rix
.Plugin.Load("cayley");
quaternions := .cayley.Level(2);
i := quaternions.BasisValue(1);
j := quaternions.BasisValue(2);
{: quaternions.Basis(), (i*j).Components(), (j*i).Components(),
   (i*j).Parenthesization(), .cayley.VerifyMultiplication(i,j) };
```

## Certified component boxes

```rix
.Plugin.Load("cayley");
.Plugin.Load("algebraic-real");
q := .cayley.Value(2,[1,.ar.Sqrt2(),0,1/3]);
box := q.Refine({= absoluteWidth=1/1000,maxWork=400 });
{: q.Conjugate().Components(),q.NormSquared(),q.ZeroStatus(),
   box[:componentIntervals],box[:certified] };
```

Every exact component is returned as a zero-width interval. Certified singleton
components are refined through Numerics, so the box always contains the known
true value even if bounded work leaves it wider than requested.

## Adapters and gated division

```rix
.Plugin.Load("cayley");
z := .complex.FromParts(2,3);
old := .exactAlgebras.Quaternion(1,2,3,4);
{: .cayley.FromComplex(z).Components(),
   .cayley.FromExactAlgebra(old).Components(),
   .cayley.Level(4).Capabilities()[:division] };
```
