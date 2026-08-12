---
title: Exact linear programming
description: Solve a bounded standard-form linear program with exact Rational simplex arithmetic.
theme: Algebra and analysis
plugin: optimize
status: implemented
---

```rix
.Plugin.Load("optimize");
program := .optimize.LinearProgram([3, 2], [1, 1; 1, 0; 0, 1], [4, 2, 3]);
result := .optimize.Solve(program);
{: result.solution, result.objectiveValue, result.status };
```
