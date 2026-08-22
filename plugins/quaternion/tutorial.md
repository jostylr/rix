---
title: Exact arithmetic and intrinsic quaternion functions
description: Explore multiplication order, certified boxes, and branch families.
theme: Algebra and analysis
status: implemented
---

## Exact, ordered arithmetic

```rix
.Plugin.Load("quaternion");
i := .quaternion.Basis(1);
j := .quaternion.Basis(2);
q := .quaternion.Quaternion(1,2,3,4);
{: (i*j).Components(),(j*i).Components(),q.Conjugate().Components(),
   q.NormSquared(),q.Inverse().Components() };
```

## Certified-real components

```rix
.Plugin.Load("quaternion");
.Plugin.Load("algebraic-real");
q := .quaternion.Quaternion(.ar.Sqrt2(),1/3,0,0);
{: q.ZeroStatus(),q.Refine({= absoluteWidth=1/1000,maxWork=300 })[:componentIntervals] };
```

## Slice functions and branches

```rix
.Plugin.Load("quaternion");
q := .quaternion.Quaternion(1,2,0,0);
negative := .quaternion.Quaternion(-1);
family := negative.LogResult();
chosen := negative.Log({= branchDirection=[0,1,0] });
{: q.Exp().Components(),q.Sin().Components(),family[:status],
   family[:branchFamily],chosen.Components() };
```

The Float elementary kernel is intentionally labeled approximate. The branch
record, slice evidence, and chosen direction are retained even when the numeric
components are approximate.
