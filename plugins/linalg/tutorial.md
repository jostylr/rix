---
title: Exact linear algebra and Frames
description: Solve rational matrix systems and change tensor coordinates without losing tensor identity.
theme: Algebra and analysis
plugin: linalg
status: implemented
---

```rix
.Plugin.Load("linalg");
A := {:2x2: /Matrix/ 2, 1; 1, -1};
solution := .linalg.Solve(A, [5, 1]);
solution.solution;
```

```rix
vspace := .linalg.VectorSpace({= name="V", dimension=2, over=:Rational });
standard := .linalg.Frame(vspace, {= name="standard", basis=:defining });
skew := .linalg.Frame(vspace, {= name="skew", relativeTo=standard, basis=[1, 1; 0, 1] });
v := {:2: /Vector: Standard/ 2, 3};
inSkew := .linalg.Transform(v, skew);
{: .linalg.Components(inSkew), .linalg.SameTensor(v, inSkew) };
```
