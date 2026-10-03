# RiX plugin compilation: initial audit

This audit asks whether the first-party `.plugin.rix` packages can benefit from
direct JavaScript translation. Reproduce the inventory with
`bun benchmarks/plugin-compiler-audit.js` and the small kernel probe with
`bun benchmarks/plugin-kernel-probe.js`. The probe uses Bun 1.4.0 and excludes
plugin loading, parsing, and code generation from its timed calls.

## What the current compiler does

There are 37 RiX plugins and 19 host-JavaScript plugins in `plugins/`. The RiX
plugins contain about 1.91 MB of source, 2,485 top-level named function
definitions, and 201,133 lowered IR nodes. All 37 can be emitted by the
current general `rix-to-js` command, but **none has `fastPathAvailable`**.
Each plugin's initialization includes assignments, registration calls, and
other top-level effects beyond the FizzBuzz-like fast subset.

The current general emitter produces about 173.5 MB of JavaScript for those
1.91 MB of source (roughly 91 times as much text). It serializes the IR and
emits a separate dispatch function plus path-based registration for many
individual nodes. This is unsuitable as the final plugin artifact format.
More importantly, compiled dispatch is attached to a context only during
`runCompiled()`. Plugin functions registered during that call retain their IR
bodies; calls made after plugin loading do not retain the generated dispatch.
Generating `.plugin.rix.js` siblings today would mainly change load-time
parsing, not speed up the plugin's hot functions. The generated `run()` also
does not implement the `.Plugin.Load` contract: it does not itself preserve
the catalog's owner, mount, alias, dependency, and operator-declaration
handling.

The IR inventory shows what a useful plugin compiler must cover beyond the
current subset: `CALL` (9,871 occurrences), `CALL_METHOD` (6,287),
`INDEX_GET` (11,364), maps (`MAP_PAIR` 14,679 and `MAP_OBJ` 4,038),
`BLOCK` (3,622), `OUTER_RETRIEVE` (9,590), `ASSIGN` (8,573), and `LOOP`
(709). These are occurrence counts in source IR, not runtime hotness.

| Candidate | Named functions | IR nodes | Why it is interesting | Main complications |
| --- | ---: | ---: | --- | --- |
| `poly` | 83 | 4,480 | Recursive Horner evaluation, polynomial arithmetic and GCD | Callable values, captures, installed arithmetic variants |
| `fraction` | 55 | 3,977 | GCD, cross-products and reduction use exact arithmetic | Loops, mutable outer cells, Fraction type behavior |
| `linalg` | 270 | 20,199 | Matrix loops and indexing make dispatch costly | Coordinate-aware tensors, exact division, large surface |
| `plot` | 81 | 14,061 | Repeated sampling and polynomial evaluation | Callbacks, Graphics construction, Numerics service |
| `stats` | 97 | 9,874 | Repeated reductions and exact summaries | Maps, method dispatch, several value domains |
| `numerics` | 244 | 24,787 | Large number of repeated arithmetic kernels | Refinement protocols, budgets, callbacks, dynamic backends |

As a concrete opportunity check, `PolyEvaluateAscending` on a degree-19
polynomial took about **0.37 ms/call** interpreted versus **0.00065 ms/call**
for hand-translated recursive JavaScript using RatMath `Integer` methods, a
roughly 570-fold ratio on one local run. The direct version verifies the same
answer but omits RiX call scopes, installed operator dispatch, tracing,
budgets, and diagnostics. It is an upper bound on the opportunity for this
kernel, **not a projected compiler speedup**. Measurements on complete public
plugin operations are still needed.

## Recommended compiler path

1. **Keep plugin activation in the RiX loader.** A trusted, versioned artifact
   should provide compiled bodies keyed to source and operator-declaration
   hashes. `.Plugin.Load` should still resolve dependencies, permissions,
   owner identity, remounting, aliases, type installs, and host registrations.
   Untrusted `.rix` must continue through the interpreter.
2. **Attach compiled bodies to registered RiX callables.** Preserve their
   normal parameter binding, closures, prep, trace, return, and error
   behavior. Compiling only the one-time plugin initialization is unlikely to
   improve the operations users call repeatedly.
3. **Replace per-node wrapper output with compact function-level output.**
   Serialize IR once as a fallback and emit JavaScript only for selected
   function bodies or subtrees. Keep source locations for diagnostics. This
   should address the current 91-fold artifact expansion before distributing
   compiled plugins.
4. **Lower common value and control operations incrementally.** Start with
   local bindings, exact integer/rational arithmetic, calls, comparisons,
   conditionals, arrays/maps, indexing, and loops. Use guarded direct paths
   for known core value types and registry dispatch when a plugin-installed
   variant may apply. A bailout after a mutation cannot safely restart a
   whole function; fallback must happen at a safe expression or call boundary.
5. **Measure representative public operations.** Begin with `poly` evaluation
   and `fraction` GCD/reduction, then `linalg` matrix operations and `plot`
   sampling. Compare identical RiX values and results across interpreted,
   current general AOT, compiled-body AOT, and direct core JavaScript. Include
   load/import time, generated size, budget/diagnostic parity, and behavior
   after registry or plugin changes.

The first implementation slice should compile a pure arithmetic function
body, such as `PolyEvaluateStep`, while leaving plugin initialization and
function registration to the loader. That will test whether direct calls and
exact arithmetic can speed a real plugin without changing its public API.
