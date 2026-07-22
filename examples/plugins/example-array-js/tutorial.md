---
title: Your first JavaScript RiX plugin
description: A tiny host-approved plugin that sums, describes, and reverses arrays.
---

# Your first JavaScript RiX plugin

This teaching source lives under `rix/examples/plugins/`, not the first-party
production plugin directory.

The plugin entry starts with a small YAML header. RiX reads that header without
running the file, so `.Plugin.List()` can safely describe what is available.

```rix
.Plugin.Load("example-array-js")
values := [2, 3, 5]
.arrayJs.Sum(values)
```

The result is `10`. The same namespace also exposes two deliberately mundane
operations:

```rix
.arrayJs.Describe(values)  ## "count 3; sum 10"
.arrayJs.Reverse(values)   ## [5, 3, 2]
```

The JavaScript file exports `install({ systemContext })`. A host imports and
approves that function, and the function registers `arrayJs` with
`registerHostCallableValue`. That explicit approval boundary is important: a
file being discoverable is never permission to execute arbitrary JavaScript.

For an implementation that makes the same three operations entirely in RiX,
continue with the `example-array-rix` tutorial.
