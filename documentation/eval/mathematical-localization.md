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
| `assumptionContext` | Original context supplied as the second argument, or `_` |
| `reasons` | Unsupported computation diagnostics; not a complete list of context obligations |

Exact finite rational arithmetic, negation, and integer powers from -256 through 256
are supported. Division by zero and zero to nonpositive powers remain unresolved.
Symbolic function applications are inert: semantic IDs never trigger a registry or
plugin lookup. Interval, exact-generator, and real-provider evaluation remain pending;
no refinement is implicit. Open variables remain unresolved, not errors.

Rational comparisons in assumptions are checked after substitution. A false comparison
produces `invalidAssumptions`. With explicit replacement pairs, unknown comparisons,
any binders or domains, and imported unverified contexts prevent a complete value.
That substitution-only overload does not discharge domains. No assumption is
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

## Evaluating under an assumption context

`expr.Eval(ctx)` and `.MathEvaluate(expr,ctx)` accept a mathematical context as
the second argument. Unlike replacement pairs, this is evaluation under facts,
not an instruction to override symbolic definitions. The receiver must be an
expression; combining two mathematical contexts is not yet supported.

```{.rix exec=true}
expr := ::x^2+::y;
ctx := {& ::x==3; ::y==7 & };
ans := expr.Eval(ctx);
ans[:status] ##@ == :complete;
ans[:value] ##@ == 16;
.ExpressionDefinition(::x) ##@ == _;
expr.Substitute([(::y,::x)]) == ::x^2+::x ##@ == 1;
```

Headers use semicolons, not commas. An empty body is allowed: this context's
purpose is to supply assumptions. It shares programming scope, so free symbols
refer to the same identities as in `expr`. Context creation runs its body once;
evaluation ignores the stored body result and never reruns the body.

The initial inference rule recognizes direct free-symbol equalities with finite
integer/rational values (including constant-expression wrappers), in either
direction. It does not solve equations, propagate symbol-to-symbol equalities,
or infer interval midpoints. Bound symbols are not instantiated. Immutable
definitions are respected; a conflict is not silently overridden.

Every assumption is then checked after localization. Exact points are checked
against normalized rational domains, including open endpoints and exclusions.
Unknown obligations or remaining binders make a numerical candidate conditional;
false assumptions or violated domains produce `invalidAssumptions`. Obvious
contradictions may already throw when the header is constructed.

```{.rix exec=true}
expr := ::x+1;
expr.Eval({& ::x>0; ::x==3 & })[:value] ##@ == 4;
expr.Eval({& ::x==::y; ::y==7 & })[:status] ##@ == :unresolved;
expr.Eval({& ::x==3; ::y==7; ::x==::y & })[:status] ##@ == :invalidAssumptions;
```

`complete` means the computation completed **under the supplied assumptions**,
not that the assumptions have been proved universally. `assumptionContext`
retains the original conditions; `context` retains their localized form with
the expression as its result. Imported unverified contexts remain conditional
even when all arithmetic checks succeed. No external solver or proof engine runs.

Traversal is bounded to 10,000 visits and depth 128 per phase; computed integers are
limited to 10,000 decimal characters, with a conservative preflight bound for powers.
Budget exhaustion throws. These synchronous, browser-safe APIs run no external code.
