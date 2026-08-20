---
title: Certified quaternion arithmetic and intrinsic functions
description: Proposed order-aware quaternion workflow over exact and refinable real components.
theme: Algebra and analysis
status: proposed
---

This tutorial defines Phase 1/2 acceptance examples. It becomes runnable when
the `.cayley` dependency and Quaternion façade are implemented.

## Preserve multiplication order

```rix
.Plugin.Load("quaternion");
i := .quaternion.I();
j := .quaternion.J();
{: i*j,j*i,(i*j)==-(j*i) };
```

## Mix certified real components

```rix
.Plugin.Load("quaternion");
.Plugin.Load("algebraic-real");
q := .quaternion(1,.ar.Sqrt2(),1/3,0);
enclosure := q.Refine({= absoluteWidth=1/1000,maxWork=400 });
{: q.Components(),q.NormSquared(),q.ZeroStatus(),enclosure[:componentIntervals] };
```

## Inspect function branches

```rix
.Plugin.Load("quaternion");
q := .quaternion(1,2,0,0);
exponential := .quaternion.Exp(q);
logarithm := .quaternion.LogResult(q);
{: exponential,logarithm[:status],logarithm[:sliceDirection],logarithm[:value] };
```

Left and right division are separate named operations so an example never
silently commutes its divisor.

