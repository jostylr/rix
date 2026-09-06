# Local substitution and exact evaluation

Expression methods `expr.Eval(bindings)` and `expr.Substitute(bindings)` are
receiver-first forms of `.MathEvaluate(expr,bindings)` and
`.MathSubstitute(expr,bindings)`. Use capitalized method names, as for functions.
They use the same capability checks and evaluator, do not mutate the expression,
and `Eval` returns the same diagnostic report, not an unwrapped candidate.

`MathSubstitute(expressionOrContext, [(symbol,value), ...])` replaces free
scoped identities, never spelling-based names. Bindings are simultaneous: replacing
x with y and y with x swaps them, rather than recursively rewriting inserted values.
Duplicate identities are errors. Immutable definitions in the original expression
are expanded; a direct binding for a defined symbol takes precedence without changing
its definition. Inserted expressions are not recursively substituted or expanded.

```{.rix exec=true}
::dependent = ::x+1;
answer := .MathEvaluate(::dependent^2,[(::x,2)]);
answer[:value] ##@ == 9;
```

Contexts retain their binders, assumptions, domains, traversal information, and import
validation. Substitution does not execute the original body again. Binder identities
remain unchanged. Bound-symbol keys and replacement expressions containing bound
symbols (including through definitions) are rejected: this conservative free-only API
does not yet implement binder instantiation or alpha-renaming. Nested contexts are
traversed with their own identities intact. Context consistency resets to `unresolved`.

`MathEvaluate(expressionOrContext, bindings=[])` returns an immutable
`rix.math.evaluation@1` record:

| Field | Meaning |
| --- | --- |
| `status` | `complete`, `conditional`, `unresolved`, or `invalidAssumptions` |
| `value` | Exact rational result only when complete; otherwise `_` |
| `candidate` | Computed rational, possibly conditional; `_` if unavailable or assumptions fail |
| `localized` | Substituted expression or context, preserving obligations |
| `context` | The localized context, or `_` for bare expressions |
| `reasons` | Unsupported computation diagnostics; not a complete list of context obligations |

Exact finite rational arithmetic, negation, and integer powers from -256 through 256
are supported. Division by zero and zero to nonpositive powers remain unresolved.
Symbolic function applications are inert: semantic IDs never trigger a registry or
plugin lookup. Interval, exact-generator, and real-provider evaluation remain pending;
no refinement is implicit. Open variables remain unresolved, not errors.

Rational comparisons in assumptions are checked after substitution. A false comparison
produces `invalidAssumptions`. Unknown comparisons, any binders or domains, and imported
unverified contexts prevent an unconditional value. Domain discharge is deliberately
not implemented yet, even for an obvious point inside an interval. No assumption is
installed in programming scope or silently used for algebraic rewriting.

```{.rix exec=true}
positive := {& ::x>0 & ::x+1 };
report := .MathEvaluate(positive,[(::x,2)]);
report[:status] ##@ == :conditional;
report[:value] ##@ == _;
report[:candidate] ##@ == 3;
```

Inspection uses ordinary map access, e.g. `report[:context][:assumptions]` and
`report[:context][:domains]`. To intentionally ignore conditions, explicitly pass
the context's raw `[:result]` to evaluation; that is an unconditional arithmetic
calculation, not a proof under the original assumptions.

Traversal is bounded to 10,000 visits and depth 128 per phase; computed integers are
limited to 10,000 decimal characters, with a conservative preflight bound for powers.
Budget exhaustion throws. These synchronous, browser-safe APIs run no external code.
