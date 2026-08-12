# RiX

RiX is the Rational Interval Expression Language: a mathematical language with exact rational and interval arithmetic, a Pratt parser, an AST-to-IR lowering pass, and an evaluator with a configurable capability-based system context.

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

## Local development

RiX uses Bun and declares the released `@ratmath/core` 0.3 line. The current
registry build of Core does not yet export every API used by this RiX revision,
so the RatMath umbrella workspace is the supported development setup until a
compatible Core release is published:

```sh
git clone https://github.com/jostylr/ratmath.git
cd ratmath
bun install
bun --cwd rix test
```

A standalone checkout is laid out for `bun install` followed by `bun test`, but
that path is currently a release-readiness check rather than a working install
path. Publish a compatible Core release and raise RiX's minimum Core version
before advertising standalone registry installation.

Before publishing or cutting a release candidate, run:

```sh
bun run check:release
```

That gate runs the Bun suite with coverage, all native `.test.rix` programs,
shipped-example and plugin-tutorial smoke tests, authored documentation examples,
the generated editor-policy consistency check, package-content assertions, and
an npm package dry run. Its final isolated-consumer smoke intentionally remains
red against the incompatible current Core release. Publication is also blocked
because the public npm name `rix` is owned by an unrelated package.

## API

```js
import { parse, tokenize, lower, evaluate, parseAndEvaluate } from "rix";
```

Use `rix/parser`, `rix/eval`, `rix/runtime`, and `rix/language-service` for
narrower entry points. The command-line tools include `rix`,
`rix-language-server`, `rix-worker`, and `rix-to-ir` after installation.

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
