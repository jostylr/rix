# Plugin catalog

RiX hosts can discover optional plugins without evaluating them. A plugin is a
file named `*.plugin.rix` or `*.plugin.rix.js` whose first non-whitespace text
is a `/** ... **/` YAML header. The matching two-star close is accepted by both
RiX and JavaScript: RiX preserves its balanced block-comment rule and
JavaScript treats the final `*/` as the end of the comment.

```rix
/**
id: exact-statistics
description: Exact descriptive statistics for RiX collections.
kind: rix
mount: stats
exports: [Mean, Median]
groups: [Statistics]
permissions: []
defaultEnabled: false
**/

.Host.Register("stats", (values) -> values, "Statistics plugin", ["Statistics"])
```

The catalog scans only configured `plugins/` roots. It reads headers and
declares disabled host mounts so static path checking can recognize a known
surface, but a disabled mount errors when called.

```rix
.Plugin.List()
.Plugin.Info("exact-statistics")
.Plugin.Load("exact-statistics")
.stats.Mean([1, 2, 3])
```

`.Plugin("id")` is shorthand for `.Plugin.Load("id")`. A load can choose a
different camelCase mount with `{= as = "otherStats" }`; the capability is
renamed after activation. A rename is principally intended for a REPL or a
plugin-selection prelude because a complete script is statically checked before
its first expression executes.

RiX-backed plugin entries are evaluated only when loaded. JavaScript-backed
entries are discoverable from the same header but require a host-approved,
already-imported installer. The catalog never dynamically imports arbitrary JS
just because a file was discovered. This makes the boundary explicit: RiX
plugins run at a host-controlled RiX load boundary, while JavaScript plugins
are trusted host extensions.

The metadata `groups` are attached to the mounted capability after activation.
`permissions` is descriptive catalog metadata today; a host decides the actual
permission frame given to a plugin. Plugin metadata never grants core
registration: `.Core.Register` remains trusted-bootstrap only.
