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

Renderer/service packages can additionally declare array-valued `requires`,
`optional`, `provides`, `schemas`, and `targets` fields plus Boolean `snapshot`
and `deterministic` claims. Discovery exposes `requires`, `provides`, `targets`,
`snapshot`, and `deterministic` through `.Plugin.Info` without executing the
plugin. Runtime renderer registration still verifies the declared target; full
version-range and dependency resolution is future work.

Set `ignore: true` in an otherwise valid header to keep an unfinished or
alternate source file out of discovery. An ignored entry is absent from
`.Plugin.List()` and does not reserve its ID.

For future candidate packages and the contract used by output-producing
plugins, see [Plugin Roadmap and Rendering Contracts](design/plugins.md). The
current targets, options, results, diagnostics, and host support are specified
by the [Renderer Plugins reference](eval/renderer-guide.md).

## Placement by host

- **RiX CLI:** scans the current working directory's `plugins/`, a script
  sibling's `plugins/`, and the example plugin roots configured by the CLI.
- **RiX web:** first-party packages live in `rix/plugins/<id>/`. The web
  generator has an explicit reviewed-package list and writes its static adapter
  at `rix-web/src/generated/bundled-plugin-catalog.js`. Only selected packages
  become part of the published browser bundle; a browser never scans a
  visitor's filesystem. Add a package to that list only after approving its
  browser-safe JavaScript installer (if it has one).
- **RiX Notebook:** put project-local entries under `<project>/plugins/`, add
  app-wide roots in **Settings**, or configure portable in-project roots with
  `plugin_dirs = ["shared-plugins"]` in `project.toml` or `notebook.toml`.
  Either manifest can enable known entries with `plugins = ["plugin-id"]`.
  The notebook settings can additionally name app-wide automatically loaded
  plugin IDs.
  Bundled JavaScript installers remain trusted by virtue of the signed app;
  a discovered JavaScript plugin needs an explicit notebook-user approval
  unless the user has enabled the global JavaScript-plugin setting.

In the web host, a `.plugin.rix.js` must be imported by the application's
bundle/catalog source to be executable. RiX Notebook may import a discovered
desktop JavaScript plugin only after its approval flow has run. A project
`.plugin.rix` is retained as source and can be loaded through the regular RiX
plugin boundary.

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

The CLI also resolves manifest `groups` as selectors. For example,
`rix --plugins=renderers` loads every discovered member of the `Renderers`
group, while `rix setup --plugins=renderers` makes that selection the default
for future REPL sessions. An exact plugin ID takes precedence over a group with
the same case-insensitive name.

## Bundled exact algebras

The opt-in `exact-algebras` host plugin is the initial exact quaternion and
octonion extension. Its coefficients remain core `Integer` or `Rational`
values, and loading it installs exact variants for ordinary arithmetic and
equality operators.

```rix
.Plugin.Load("exact-algebras");
i := .exactAlgebras.Quaternion(0, 1, 0, 0);
j := .exactAlgebras.Quaternion(0, 0, 1, 0);
k := i * j;

o := .exactAlgebras.Octonion(1, 2, 3, 4, 5, 6, 7, 8);
one := o * .exactAlgebras.Inverse(o);
```

The initial namespace also provides `Components`, `Conjugate`, and
`NormSquared`. Quaternion and octonion dimensions are not mixed implicitly,
and division is exact right division (`a / b` is `a * Inverse(b)`). The plugin
is intentionally a foundation for later semantic types, named basis values,
and matrix or polynomial integrations.

RiX-backed plugin entries are evaluated only when loaded. JavaScript-backed
entries are discoverable from the same header but require a host-approved
installer. Discovery alone never imports arbitrary JavaScript: a web host must
bundle it, while RiX Notebook requires the user's explicit approval or global
preference before importing it. This keeps the boundary explicit: RiX plugins
run at a host-controlled RiX load boundary, while JavaScript plugins are
trusted host extensions.

## Typed operator variants

An approved host plugin can register a semantic type and install variants for
the generic evaluator operators. Arithmetic, comparisons, `Abs`, approximate
functions, and `Min`/`Max` therefore do not need plugin-specific evaluator
branches. A comparison variant may normalize its operands (for example, exact
numbers promoted to a plugin's floating representation); generic `Min` and
`Max` carry those normalized values forward and return the promoted winner.
Variants may declare a numeric `priority`; the highest explicit priority wins,
and equal highest priorities are an activation error rather than an accidental
plugin-load-order decision. Existing variants without a priority retain their
installed order for compatibility.

Plugins should give coexisting implementations distinct semantic type names
such as `FloatIEEE754` and `FloatMPFR`, while exposing a friendly mounted
namespace such as `.float` to ordinary RiX code. `Min`/`Max` reduce through the
generic `COMPARE` operator, so a plugin normally installs ordering once rather
than separate min/max implementations.

The metadata `groups` are attached to the mounted capability after activation.
`permissions` is descriptive catalog metadata today; a host decides the actual
permission frame given to a plugin. Plugin metadata never grants core
registration: `.Core.Register` remains trusted-bootstrap only.
