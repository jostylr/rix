# RiX

RiX is the Rational Interval Expression Language: a mathematical language with exact rational and interval arithmetic, a Pratt parser, an AST-to-IR lowering pass, and an evaluator with a configurable capability-based system context.

## Repository layout

- `src/parser/`: tokenization, parsing, and system identifier configuration.
- `src/eval/`: IR, lowering, evaluator dispatch, formatting, and built-in functions.
- `src/runtime/`: contexts, values, types, tensors, diagnostics, and runtime configuration.
- `bin/`: the `rix` REPL/runner and `rix-to-ir` utility.
- `tests/`: parser, evaluator, and command-line tests.
- `docs/` and `examples/`: language documentation, design records, and runnable examples.

## Local development

RiX uses Bun and depends on `@ratmath/core`. In the RatMath umbrella checkout, Bun resolves that dependency through the parent workspace:

```sh
bun install
bun --cwd rix test
```

For a standalone clone, provide `@ratmath/core` through a Bun workspace until it is published. Once `@ratmath/core` is published, the `workspace:*` dependency can be replaced with a released version without changing RiX source code.

## API

```js
import { parse, tokenize, lower, evaluate, parseAndEvaluate } from "rix";
```

Use `rix/parser`, `rix/eval`, and `rix/runtime` for narrower entry points. The command-line tools are available as `rix` and `rix-to-ir` after installation.
