# RiX

RiX (Rational Interval Expression Language) is a mathematical programming language
for exact fractions, interval arithmetic, symbolic calculations, and reproducible
mathematical documents. Use it as a terminal calculator, run `.rix` programs, or
embed its parser and evaluator in a JavaScript application. Optional bundled
plugins add plotting, geometry, data analysis, approximate numerics, and output
formats including SVG, HTML, LaTeX, and PDF.

**Try it:** [RiX Web](https://rix.ratmath.com/) ·
[Interactive tutorials](https://rix.ratmath.com/tutorial/) ·
[Documentation](https://docs.rix.ratmath.com/) ·
[Getting started](https://docs.rix.ratmath.com/getting-started.html)

The 0.1 line is an alpha and makes no source- or API-compatibility commitment.

## Install

Install [Bun](https://bun.sh/) 1.4 or newer and keep `bun` on your PATH.
The command-line tools run on Bun, including when installed with npm.
The package name is **`@ratmath/rix`**; unscoped `rix` is unrelated.

For a terminal command available globally:

```sh
npm install --global @ratmath/rix
rix
```

Alternatively, use `bun add --global @ratmath/rix`. Make sure your package
manager's global executable directory is on your PATH.

For a project or an embedded application:

```sh
npm install @ratmath/rix
```

Or use `bun add @ratmath/rix`. Core (`@ratmath/core` ^0.6.0) and other required
JavaScript dependencies are installed automatically. Bundled RiX plugins ship
with this package; they do not require separate npm installs.

## Terminal calculator and scripts

Run `rix` to enter the interactive REPL, then enter an expression at each prompt:

```rix
1/3 + 1/6
x := 5/7
x * 7
```

The results are `1/2`, `5/7`, and `5`. Use `.help` for REPL commands and `.exit`
to leave. Assignments persist within the session.

Save a program as `example.rix`:

```rix
x := 1/3;
y := 1/6;
x + y
```

Run it with a global install:

```sh
rix example.rix
rix --help
```

With a project-local install, use `bunx --no-install rix example.rix` or
`./node_modules/.bin/rix example.rix`. The runner prints the program's final
value. To export files declared by `.Out(path, value)`, supply an output directory:

```sh
rix --out=output report.rix
```

## Plugin loading: what is enabled?

**The interactive REPL defaults to `full`. Scripts and JavaScript module calls
start with the core language only.** Saved REPL plugin selections replace the
built-in default. Discovering a plugin does not execute it.

Choose plugins for one invocation. `--plugins` replaces the default or saved
selection; repeatable `--plugin` flags add to the selected set:

| Command | Loads |
| --- | --- |
| `rix --plugins=none` | No implicit or saved plugin preloads. |
| `rix --plugins=none --plugin=float` | Only Float and its dependencies. `--with-floats` is an additive alias for `--plugin=float`. |
| `rix --plugins=plot,svg` | Selected plugins and their required dependencies. |
| `rix --plugins=renderers` | Plugins in the Renderers group. |
| `rix --plugins=full` | The curated standard set: exact algebras, algebra, drawing, plotting, Scene3D, ND, geometry, graphs, combinatorics, data, documents, Float, and renderers. |
| `rix --all-built-plugins` | Every discovered plugin shipped in the package, including its example plugins. This is broader than `full`. |
| `rix --all-plugins` | Every discovered plugin, including project-local plugins; host plugins still need an approved installer. |

Append a filename to run a program with the same selection, for example
`rix --plugins=plot,svg example.rix`. Repeat `--plugin=ID` to select several
plugins. Plugin IDs and group names are accepted by `--plugins`; `full` is a
curated selector, not a promise to load every plugin.

To make a selection your REPL default:

```sh
rix setup --plugins=full
rix
```

Or save a smaller set with `rix setup --plugins=plot,svg`. Save a bare REPL default with `rix setup --plugins=none` (or `--plugins=`). Setup also creates a `cli-preamble.rix`
file you can edit. The default directory is `~/.config/rix` (honoring
`XDG_CONFIG_HOME`); `RIX_CONFIG_DIR` or `--config-dir=DIR` can override it.

Use `rix --no-config` to ignore saved settings and its automatic preamble; the
built-in `full` default then applies. For a clean bare session, use
`rix --no-config --plugins=none`.
Use `--no-preamble` to skip the preamble while retaining configured plugins.
`none` controls preloads, not permissions: an executed preamble, script header,
or `.Plugin.Load(...)` can still request plugins. Explicit plugin flags still
apply. Saved REPL settings do **not** automatically
apply to file execution or JavaScript module calls.

Programs can declare their own dependencies before the code:

```rix
/**
plugins: [plot, svg]
**/

1/3 + 1/6
```

The CLI preloads those plugins before parsing the program. Within a running
session or program, these operations inspect or activate catalog entries:

```rix
.Plugin.List()
.Plugin.Info("float")
.Plugin.Load("float")
```

`.Plugin("float")` is shorthand for `.Plugin.Load("float")`. Loading is
idempotent and required plugin dependencies load automatically. Plugins that
introduce syntax should be preloaded with CLI flags or a source header.

The CLI discovers package plugins plus `plugins/` in the working directory and
beside the input script. A discovered JavaScript plugin needs an approved host
installer; discovery alone does not authorize execution. Embedded and browser
hosts configure their own catalogs. See the
[plugin catalog guide](https://docs.rix.ratmath.com/plugin-catalog.html).

Loading an output plugin does not install external compilers. PDF and some image
formats require host tools such as LaTeX or a rasterizer; see the
[renderer guide](https://docs.rix.ratmath.com/eval/renderer-guide.html) for each
target's requirements.

## Use as a JavaScript module

After installing locally, save this as `example.mjs` and run `bun example.mjs`:

```js
import { parseAndEvaluate, formatValue } from "@ratmath/rix";

const result = parseAndEvaluate("1/3 + 1/6");
console.log(formatValue(result)); // 1/2
```

Evaluation returns RiX values, including exact numeric objects; use `formatValue`
for display instead of assuming results are JavaScript numbers. Without supplied
contexts, each call starts a fresh evaluation session.

To preserve variables and loaded plugins across calls, reuse a context, registry,
and system context:

```js
import {
  Context,
  createDefaultRegistry,
  createDefaultSystemContext,
  parseAndEvaluate,
  formatValue,
} from "@ratmath/rix";

const session = {
  context: new Context(),
  registry: createDefaultRegistry(),
  systemContext: createDefaultSystemContext(),
};

parseAndEvaluate("x := 1/3", session);
console.log(formatValue(parseAndEvaluate("x + 1/6", session))); // 1/2

// Bundled plugins are known to the default catalog but must be activated.
parseAndEvaluate('.Plugin.Load("float")', session);
```

Use `await parseAndEvaluateAsync(source, options)` for programs requiring async
execution; it accepts the same session objects. Module calls do not process CLI
setup or automatically preload a file's plugin header. Load required plugins in
the session before evaluating source that uses their syntax.

The package also exports `parse`, `tokenize`, `lower`, and `evaluate` for tools
that need individual language stages. Narrower entry points include:

- `@ratmath/rix/parser`: tokenizer and parser.
- `@ratmath/rix/eval`: evaluator and evaluation helpers.
- `@ratmath/rix/runtime`: contexts, values, and host interfaces.
- `@ratmath/rix/language-service` and `@ratmath/rix/codemirror`: editor integration.

Browser-aware bundlers select portable entry points. Browser hosts use
`createBrowserHostAdapter` to supply script sources and trusted modules; they
cannot scan a local filesystem. Node/Bun imports select the filesystem adapter,
which is also available as `createNodeHostAdapter` from
`@ratmath/rix/runtime/node`. Bun 1.4+ is the supported runtime for the examples
and CLI here; npm installation does not make the CLI a Node executable.

## Learn more

- [Interactive tutorials](https://rix.ratmath.com/tutorial/): run and edit examples in the browser.
- [Language overview](https://docs.rix.ratmath.com/language-at-a-glance.html) and [syntax guide](https://docs.rix.ratmath.com/eval/syntax-guide.html).
- [Runtime reference](https://docs.rix.ratmath.com/reference/system-reference.html).
- [Capstone tutorials](https://docs.rix.ratmath.com/tutorial/capstones.html): complete workflows combining calculation, output, and host integration.
- [Publication workflows](https://docs.rix.ratmath.com/eval/publication-workflows.html): build documents and multiple output formats with `rix publish build.json`.
- [Editor and agent tooling](https://docs.rix.ratmath.com/editor-and-agent-tooling.html): formatting, verification, language server, and VS Code integration.
- [Source and issues](https://github.com/jostylr/rix).

The package installs `rix`, `rix-to-ir`, `rix-language-server`, and `rix-worker`.
For example, `rix format --check example.rix` checks formatting and
`rix verify --json example.rix` produces structured verification results.

## Contributing and release checks

For coordinated source development, use the umbrella workspace:

```sh
git clone --recurse-submodules https://github.com/jostylr/ratmath.git
cd ratmath
bun install
bun --cwd rix run test:short
```

The repository's `test:ci`, `test:ten`, and `test:suite` commands provide deeper
checks; `test:plugin plot` checks a selected plugin. Run `bun run check:release`
from the RiX repository before publication. It includes coverage, native RiX
tests, documentation, editor policy, package contents, and an isolated install
against registry dependencies. For a local Core/RiX rehearsal, use
`bun scripts/package-consumer-smoke.js --workspace-core`; this does not replace
the registry gate or publish anything.

See the [developer guide](https://docs.rix.ratmath.com/developer-guide.html) and
[source development instructions](https://github.com/jostylr/rix/blob/main/development-instructions.md).
With Quarto installed, `bun run build:docs` builds the documentation and
`bun run preview:docs` previews it. These development commands require the
source repository; the npm package contains the runtime and examples.

MIT licensed.
