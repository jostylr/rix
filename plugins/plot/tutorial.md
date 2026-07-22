---
title: Plotting a polynomial
description: Build a portable graphics scene with the plot plugin.
---

# Plotting a polynomial

Start by loading the optional plot package:

```rix
.Plugin.Load("plot")
graph := .plot.Polynomial([1, 0, -4, 1], [-3, 3], {= size = [640, 360] })
```

`graph` is still core `.Graphics`, so it can be placed in a document without
locking the document to a browser chart library:

```rix
.Figure(graph, "A cubic polynomial", "fig:cubic")
```

The package chooses sensible sampling and axes for this early convenience API.
For geometry diagrams or exact retained shapes, use `.Graphics` directly or
load `.draw` alongside it.
