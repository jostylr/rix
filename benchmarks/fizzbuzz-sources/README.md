# Trusted RiX-to-JavaScript experiment

This directory compares four FizzBuzz programs interpreted from `.rix` source
with ahead-of-time generated sibling `.rix.js` modules and one direct JavaScript
implementation. The generated programs still use RatMath `Integer` values and
RiX string and sequence values. JavaScript lexical variables replace the
interpreter's per-call scope stack, while small helpers preserve the supported
RiX decision, modulo, generator, map, and multifunction behavior. The native
JavaScript version uses `Number`, a preallocated array, and a direct loop; it
does not preserve RiX value types or exact integer semantics outside JavaScript's
safe-integer range.

From `rix/`, regenerate one module with:

```sh
bun bin/rix-to-js-experiment.js benchmarks/fizzbuzz-sources/ternary.rix
```

Pass any number of `.rix` paths to regenerate several modules. Add `--check`
to verify that their sibling `.rix.js` files match the current source without
writing them. Run `bun run bench:fizzbuzz:compiled` to compare all three
execution paths. `--quick` uses 100 values and fewer rounds. The table shows
median time per result array. Setup, code generation, and module import are
excluded; every result from the timed batches is checked afterward.

FizzBuzz mostly performs tiny arithmetic and branch operations, so evaluator
dispatch and dynamic call/scope overhead dominate the interpreted path. This
is a useful upper-end example for avoiding that overhead, not a forecast for
all RiX programs. Expensive math, I/O, and plugin calls would leave less time
for compilation to save; dynamic RiX features may also need runtime checks that
this subset does not emit. The native JavaScript baseline shows the remaining
cost of preserving RiX integers, values, and dispatch in the generated version.

The emitter is deliberately narrow. It accepts top-level function definitions,
soft prepared multifunction variants, integer literals, strings, `%`, `==`,
ternaries, cases, eager arithmetic generators, and map pipes, with a
one-parameter `Run(count)` entry point. It rejects unsupported IR rather than
falling back to JavaScript behavior. It does not yet handle dynamic plugins or type installs,
cells, captures, intervals, arbitrary functions, async work, or script
capabilities. The generated callable wrappers are local to this experiment;
only the returned numeric, string, and sequence values are RiX-compatible.

The benchmark's `trustedCompiled` choice imports `.rix.js` only when explicitly
enabled; its untrusted path parses and evaluates `.rix`. No production loader
automatically chooses sibling JavaScript files. The source hash and `--check`
catch stale artifacts, but neither establishes that a JavaScript file is safe.
A future host must trust its build/distribution channel before using generated
code and must preserve RiX capability restrictions at the compiled boundary.
This benchmark's interpreted path does not itself provide a sandbox; an
untrusted-script host must still apply its existing RiX capability policy.
