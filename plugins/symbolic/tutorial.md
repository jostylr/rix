---
title: Load the symbolic exploration workspace
description: Activate unreduced fractions and form-preserving functions through one meta-plugin.
theme: Algebra and analysis
status: implemented
plugin: symbolic
---

`.symbolic` loads the formal workspace while preserving the focused plugin
mounts and aliases.

```rix
.Plugin.Load("symbolic");
fraction := .frac(6,8);
form := .ff`(x^2-1)/(x-1)`;
canonical := form.R();
{: fraction, form.Form(), canonical(3), .symbolic.Services() };
```

Use `.fraction` or `.fracfun` directly when only one focused surface is needed.
