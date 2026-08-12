---
title: Exact linear algebra and coordinates
description: Solve rational matrix systems and change tensor coordinates without losing tensor identity.
theme: Algebra and analysis
plugin: linalg
status: implemented
---

```rix
.Plugin.Load("linalg");
A := [2, 1; 1, -1];
solution := .linalg.Solve(A, [5, 1]);
solution.solution;
```

```rix
V := .linalg.VectorSpace("plane", 2);
standard := .linalg.Coordinates(V, "standard");
skew := .linalg.Coordinates(V, "skew", [1, 1; 0, 1]);
v := .linalg.Vector([2, 3], standard);
inSkew := .linalg.Transform(v, skew);
{: .linalg.Components(inSkew), .linalg.SameTensor(v, inSkew) };
```
