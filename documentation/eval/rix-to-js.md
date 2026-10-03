# RiX to JavaScript compiler

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
inspection. `fastPathAvailable` reports whether the compiler emitted a direct
JavaScript entry point. `sourceHash` checks freshness, not authenticity.

The compiler has two execution paths. For a narrow static subset, `run()` with
no host options calls directly translated JavaScript functions. This path
supports top-level one-parameter functions and append-only multifunctions,
integer and string literals, integer `%` and `==`, ternaries and cases, eager
arithmetic generators, map pipes, and calls to known functions. Returned
integers, strings, and sequences retain their RiX value shapes. If a fast-path
precondition fails or its result cannot be represented in this subset, `run()`
retries through the regular RiX runtime. Supplying any `run()` options, such as
a `context`, `registry`, `systemContext`, or execution budget, also uses that
runtime. `runAsync()` always uses the runtime. Custom parser configuration
disables direct translation.

For everything outside that static subset, compilation parses and lowers the
source once, serializes the resulting IR, and emits JavaScript functions for
nodes using the standard registry calling convention. Those functions look up
capabilities at runtime so installed type variants and overrides keep working.
RiX scopes, diagnostics, budgets, plugin calls, script imports, special system
operations, and spread calls still use the existing runtime where needed.
This is still not full static translation.

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

`bun run bench:fizzbuzz:compiled` measures four FizzBuzz forms over 1,000
values. On a local Bun run, direct compilation through this general command
took roughly 0.055–0.072 ms per result array versus 3.5–4.4 ms interpreted,
about 60× faster. Compilation, import, and setup are excluded. FizzBuzz is
especially sensitive to call and dispatch overhead; this ratio is not a
prediction for scripts dominated by expensive math, I/O, or plugins.

Only execute `.rix.js` that came from a trusted build and distribution path.
JavaScript modules have the host's JavaScript privileges; the generator's hash
and `--check` do not make a module safe to run. No RiX loader selects a sibling
`.rix.js` automatically. Hosts handling untrusted source should continue to run
`.rix` with their normal capability policy.

The next compiler work is expanding direct lowering safely beyond this subset,
compiled async dispatch, build-time plugin linking, and a loader policy that
opts into trusted artifacts explicitly. Each step needs differential tests
against the interpreter and end-to-end measurements, including startup and
generated module loading.
