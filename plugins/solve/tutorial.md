---
title: Solving exact linear systems
description: Turn an inert symbolic system into a named exact affine solution.
theme: Algebra and analysis
plugin: solve
status: implemented
---

```rix
.Plugin.Load("solve");
system := {#a,b:x,y# x + y == a; x - y == b };
answer := .solve.System(system, {= values={= a=3, b=1 } });
answer.solution;
```
