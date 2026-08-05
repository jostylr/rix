# RiX Language Evaluator

The RiX evaluator lowers parser AST nodes into IR and evaluates that IR against a
cell-based runtime context.

## Current Status

This is the active RiX runtime, not a stub. It currently supports:

- Exact integer/rational arithmetic through `@ratmath/core`
- Cell-based assignment and aliasing semantics
- Blocks, cases, loops, structured breaks, and ternary expressions
- Functions, lambdas, prep phases, multifunction dispatch, and tail self calls
- Arrays, maps, sets, tuples, intervals, tensors, holes, and destructuring
- Pipe operators, traversal callbacks, partial application, and methods
- Script imports with capability sandboxing
- Diagnostics, testing helpers, tracing, and debug events
- Runtime error messages with line/column source locations when source text is
  available through `parseAndEvaluate()` or script imports
- First-class unit, quantity, and exact-generator values loaded through the
  `.Units` and `.Exact` RiX map collections

The main entry points are:

- `parseAndEvaluate(code, options)` for source-to-result evaluation
- `evaluate(irNode, context, registry, systemContext)` for direct IR evaluation
- `createDefaultRegistry()` for internal language/operator functions
- `createDefaultSystemContext()` for dot-prefixed system capabilities

## Known Gaps

The following evaluator capabilities are intentionally still stubs or partial:

- Exact symbolic derivative/integral support is intentionally bounded; general
  transcendental and multi-equation calculus remains future work.
- Array generators, lazy sequences, interval stepping/division/partitions,
  mediants, random sampling, and infinite arithmetic sequences are implemented.
- `{# ... }` retains symbolic definitions and constraints for plugins without
  solving them. `{$ ... }` is reserved for future async/concurrency syntax.
- General algebraic field composition and user-declared cross-generator
  relations remain future work; built-in exact generators reduce their known
  single-generator relations.

Run the evaluator tests from this directory with:

```bash
bun test
```
