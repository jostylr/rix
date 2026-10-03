# RiX to JavaScript compiler (initial general path)

`rix-to-js` writes a sibling JavaScript module from a RiX script. For a trusted
script:

```sh
rix-to-js example.rix
bun example.rix.js
```

`rix-to-js --check example.rix` verifies that the generated sibling matches the
current source and compiler output without rewriting it. A generated module
also exports `run(options)` and `runAsync(options)` for a host to call with its
own `context`, `registry`, and `systemContext`. Direct execution uses the sync
path; pass `--async` to the generated file for a script requiring asynchronous
evaluation. The module exports `sourceHash` and `compiledOperationCount` for
inspection. `sourceHash` checks freshness, not authenticity.

This is the foundation of a general compiler, not yet full static translation.
Compilation parses and lowers the source once, serializes the resulting IR, and
emits JavaScript functions for nodes using the standard registry calling
convention. Those functions look up capabilities at runtime so installed type
variants and overrides keep working. RiX functions, multifunctions, scopes,
diagnostics, budgets, plugin calls, and script imports still use the existing
runtime where their behavior is dynamic. Special system operations and spread
calls remain interpreted; `runAsync` currently evaluates the pre-lowered IR
through the async evaluator. This is a correctness-first route for broad script
coverage, and it should not be assumed to have the FizzBuzz prototype's speedup.

The generated file resolves script imports relative to its RiX sibling. It
requires `@ratmath/rix` at runtime, including the `compiler-runtime` package
export. The generated IR fixes the parser configuration used at build time. A
host that needs custom operators or source limits at runtime must interpret the
source instead; build-time source limits are not yet exposed by the CLI. The CLI
currently uses the default parser setup.
Imported scripts with input/export declarations are not standalone compilation
inputs yet.

As a build-time smoke check, the compiler emitted syntactically valid JavaScript
for 79 of the 81 standalone example files examined and all 38 `.rix` files in
`plugins/`. The two exceptions are imported-script fragments with input/export
declarations. Successful emission does not establish runtime parity for every
plugin; the differential tests cover selected functions, control flow,
multifunctions, imports, async evaluation, and registry overrides.

Only execute `.rix.js` that came from a trusted build and distribution path.
JavaScript modules have the host's JavaScript privileges; the generator's hash
and `--check` do not make a module safe to run. No RiX loader selects a sibling
`.rix.js` automatically. Hosts handling untrusted source should continue to run
`.rix` with their normal capability policy.

The next compiler work is direct JavaScript lowering for function calls,
control flow, collections, and exact arithmetic; compiled async dispatch;
build-time plugin linking; and a loader policy that opts into trusted artifacts
explicitly. Each step needs differential tests against the interpreter and
end-to-end measurements, including startup and generated module loading.
