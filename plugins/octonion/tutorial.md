---
title: Preserve octonion structure under certified calculation
description: Proposed nonassociative arithmetic, enclosure, and intrinsic-function workflow.
theme: Algebra and analysis
status: proposed
---

This proposed tutorial doubles as the Octonion acceptance fixture until the
plugin is loadable.

## Make nonassociativity visible

```rix
.Plugin.Load("octonion");
e1 := .octonion.Basis(1);
e2 := .octonion.Basis(2);
e4 := .octonion.Basis(4);
{: (e1*e2)*e4,e1*(e2*e4),((e1*e2)*e4)==e1*(e2*e4) };
```

## Refine certified components

```rix
.Plugin.Load("octonion");
.Plugin.Load("continued-fraction");
o := .octonion(1,.cf.Sqrt2(),0,0,1/3,0,0,0);
box := o.Refine({= absoluteWidth=1/1000,maxWork=500 });
{: o.Conjugate(),o.NormSquared(),o.ZeroStatus(),box[:componentIntervals] };
```

## Evaluate an intrinsic one-variable function

```rix
.Plugin.Load("octonion");
o := .octonion(1,1,0,0,0,0,0,0);
result := .octonion.Exp(o);
{: result,result.Record()[:evaluationOrder],result.Record()[:sliceEvidence] };
```

Function implementations must retain the one-generated associative-slice
evidence and reject transformations that reassociate independent factors.

