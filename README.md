# RiX

RiX is the Rational Interval Expression Language: a mathematical language with exact rational and interval arithmetic, a Pratt parser, an AST-to-IR lowering pass, and an evaluator with a configurable capability-based system context.

The 0.1 line is an alpha and makes no source- or API-compatibility commitment.
RiX core is the portable language and runtime contract. The bundled plugins are
useful first-party extensions, but they are optional: an implementation can
support RiX without porting or enabling them.

## Repository layout

- `src/parser/`: tokenization, parsing, and system identifier configuration.
- `src/eval/`: IR, lowering, evaluator dispatch, formatting, and built-in functions.
- `src/runtime/`: contexts, values, types, tensors, diagnostics, and runtime configuration.
- `src/tools/`: CodeMirror/Lezer support, the portable language service, LSP,
  and editor execution protocol.
- `editors/vscode/`: desktop VS Code extension package and Node bundle build.
- `bin/`: the `rix` REPL/runner, machine-facing editor commands, language
  server, worker, and `rix-to-ir` utility.
- `tests/`: parser, evaluator, and command-line tests.
- `documentation/`: authored Quarto documentation, language guides, references, and design records.
- `development-instructions.md`: developer workflow and runnable documentation conventions.
- `docs/`: generated GitHub Pages site; do not edit it by hand.
- `examples/`: runnable RiX and JavaScript examples.
- `explorations/`: explanatory mathematical investigations with browser-safe
  interactive RiX companions.

## Local development

RiX uses Bun and requires the released `@ratmath/core` 0.5 line. The RatMath
umbrella workspace links the local Core checkout for coordinated development:

```sh
git clone https://github.com/jostylr/ratmath.git
cd ratmath
bun install
bun --cwd rix test
```

A standalone RiX checkout can install the compatible Core release with
`bun install` and run `bun test`. RiX is published as `@ratmath/rix`; the
unscoped `rix` npm name belongs to an unrelated package.

Before publishing or cutting a release candidate, run:

```sh
bun run check:release
```

That opt-in gate runs the complete Bun suite with coverage, all native
`.test.rix` programs, authored documentation tests and examples, the generated
editor-policy consistency check, package-content assertions, an npm package dry
run, and an isolated-consumer smoke against the published Core dependency. It is
also available as the manually dispatched **Release verification** GitHub
Actions workflow; ordinary push and pull-request CI remains the faster gate.

## API

```js
import { parse, tokenize, lower, evaluate, parseAndEvaluate } from "@ratmath/rix";
```

Use `@ratmath/rix/parser`, `@ratmath/rix/eval`, `@ratmath/rix/runtime`, and
`@ratmath/rix/language-service` for
narrower entry points. The command-line tools include `rix`,
`rix-language-server`, `rix-worker`, and `rix-to-ir` after installation.

The evaluator entry is browser-safe. Browser hosts preload script sources or
trusted JavaScript modules through `createBrowserHostAdapter`; Node/Bun hosts
get the filesystem adapter from the package's default export condition, or can
import `createNodeHostAdapter` from `@ratmath/rix/runtime/node` explicitly.

For deterministic editor/agent feedback:

```sh
bun bin/rix.js format --check --json example.rix
bun bin/rix.js verify --json example.rix
```

See [`documentation/editor-and-agent-tooling.md`](documentation/editor-and-agent-tooling.md)
for the VS Code development build and current security boundary.

## Documentation

See [`development-instructions.md`](development-instructions.md) for the
runnable-example syntax used by documentation tests and Quarto rendering.

With Quarto installed, build the documentation site into `docs/`:

```sh
bun run build:docs
```

Use `bun run preview:docs` for a local authoring server. The source-derived runtime catalog is regenerated as part of both commands.
