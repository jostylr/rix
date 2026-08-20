---
title: Build Cayley–Dickson algebras over certified scalars
description: Proposed construction, enclosure, and capability workflow for the generic Cayley layer.
theme: Algebra and analysis
status: proposed
---

This tutorial is an executable acceptance design. Run buttons remain disabled
until `.cayley` Phase 1 implements the documented contracts.

## Construct and inspect a level

```rix
.Plugin.Load("cayley");
complexLevel := .cayley.Level(1);
quaternionLevel := .cayley.Level(2);
{: complexLevel.Basis(), quaternionLevel.Dimension(), quaternionLevel.Capabilities() };
```

## Use certified real components

```rix
.Plugin.Load("cayley");
.Plugin.Load("algebraic-real");
q := .cayley.Value(2,[1,.ar.Sqrt2(),0,1/3]);
box := q.Refine({= absoluteWidth=1/1000,maxWork=400 });
{: q.Conjugate(),q.NormSquared(),box[:componentIntervals],box[:status] };
```

## Keep order and invertibility explicit

```rix
.Plugin.Load("cayley");
i := .cayley.BasisValue(2,1);
j := .cayley.BasisValue(2,2);
{: i*j,j*i,(i*j).Parenthesization(),j.ZeroStatus() };
```

Later-level values with zero divisors must report that general division is not
supported rather than inheriting Quaternion/Octonion behavior by shape.

