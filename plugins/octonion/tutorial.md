---
title: Preserve octonion structure under exact and intrinsic calculation
description: Run exact identity fixtures, certified refinement, and one-variable functions.
theme: Algebra and analysis
status: implemented
---

## Make nonassociativity visible

```rix
.Plugin.Load("octonion");
e1 := .octonion.Basis(1);
e2 := .octonion.Basis(2);
e4 := .octonion.Basis(4);
{: ((e1*e2)*e4).Components(),e1*(e2*e4),
   .octonion.VerifyIdentity(:alternativityLeft,e1+e2,e4),
   .octonion.VerifyIdentity(:moufang,e1,e2,e4),
   .octonion.VerifyIdentity(:nonassociative,e1,e2,e4) };
```

## Refine certified components

```rix
.Plugin.Load("octonion");
.Plugin.Load("algebraic-real");
o := .octonion.Octonion(1,.ar.Sqrt2(),0,0,1/3,0,0,0);
box := o.Refine({= absoluteWidth=1/1000,maxWork=500 });
{: o.Conjugate().Components(),o.NormSquared(),o.ZeroStatus(),box[:componentIntervals] };
```

## Stay inside a one-generated associative slice

```rix
.Plugin.Load("octonion");
o := .octonion.Octonion(0,1,0,0,0,0,0,0);
polynomial := o.Series([1,2,3]);
family := .octonion.Octonion(-1).LogResult();
{: polynomial.Components(),polynomial.Record()[:evaluationOrder],
   polynomial.Record()[:sliceEvidence],o.Exp().Components(),family[:branchFamily] };
```

The series record fixes right-Horner evaluation and refuses to imply that
independent octonion expressions can be reordered or reassociated.
