---
title: Your first RiX plugin
description: A tiny RiX plugin that sums, describes, and reverses arrays.
---

# Your first RiX plugin

This teaching source lives under `rix/examples/plugins/`, not the first-party
production plugin directory.

Load the plugin when you need its commands:

```rix
.Plugin.Load("example-array-rix")
values := [2, 3, 5]
.arrayRixSum(values)
```

The plugin source is just three `.Host.Register` calls. Each is ordinary RiX:
`Reduce` computes the sum, `Reverse` creates a new sequence, and `@"..."`
builds its summary text.

```rix
.arrayRixDescribe(values)  ## "count 3; sum 10"
.arrayRixReverse(values)   ## [5, 3, 2]
```

Because it is a RiX plugin, discovery never evaluates it. The catalog supplies
the source to the evaluator only after `.Plugin.Load("example-array-rix")`.
Compare this with `example-array-js`: that package needs a host to explicitly
approve its JavaScript installer before it can load.
