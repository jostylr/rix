---
title: Prepare a PNG snapshot
description: Build the portable Graphics value used by the host PNG rasterizer.
theme: Renderers and exporters
status: implemented
---

The CLI export form is `.Out("diagram.png", scene)`. This tutorial remains
portable by constructing and returning the exact scene; browser hosts do not
claim a rasterizer unless one is installed.

```rix
.Plugin.Load("png");
scene := .Graphics.Graphic([180, 100], [
    .Graphics.Circle([90, 50], 32, {= fill="#0c7b7f" })
]);
scene;
```
