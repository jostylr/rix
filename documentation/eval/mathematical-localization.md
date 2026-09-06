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
does not instantiate binders; use `Instantiate` below. Nested contexts are
traversed with their own identities intact. Context consistency resets to `unresolved`.

`MathEvaluate(expressionOrContext, bindings=[])` returns an immutable
`rix.math.evaluation@1` record:

| Field | Meaning |
| --- | --- |
| `status` | `complete`, `enclosed`, `conditional`, `unresolved`, or `invalidAssumptions` |
| `value` | Completed rational/exact scalar or set-enclosure result; otherwise `_` |
| `candidate` | Computed scalar or interval, possibly conditional; `_` if unavailable or assumptions fail |
| `resultKind` | `rational`, `exactScalar`, `setEnclosure`, `singletonEnclosure`, or `unresolved` |
| `enclosure` | Interval candidate, including real approximations; otherwise `_` |
| `providers` | Provider metadata for inputs inspected during calculation and condition checks |
| `semantics` | Trusted semantic IDs attempted during evaluation |
| `localized` | Substituted expression or context, preserving obligations |
| `context` | The localized context, or `_` for bare expressions |
| `assumptionContext` | Original context supplied as the second argument, or `_` |
| `reasons` | Unsupported computation diagnostics; not a complete list of context obligations |

Exact finite rational arithmetic, negation, and integer powers from -256 through 256
are supported. Division by zero and zero to nonpositive powers remain unresolved.
Symbolic applications use only the explicit semantic kernels described below;
unknown IDs remain inert and no ID triggers a registry or plugin lookup.
Known core constant providers are supported as described below;
no refinement is implicit. Open variables remain unresolved, not errors.

Rational comparisons in assumptions are checked after substitution. A false comparison
produces `invalidAssumptions`. With explicit replacement pairs, unknown comparisons,
remaining binders, unresolved domains, and imported unverified contexts prevent a
complete value. Exact points now discharge rational domains in both overloads. No assumption is
installed in programming scope or silently used for algebraic rewriting.

```{.rix exec=true}
positive := {& ::x>0 & ::x+1 };
report := .MathEvaluate(positive,[(::x,2)]);
report[:status] ##@ == :complete;
report[:value] ##@ == 3;
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

## Explicit binder instantiation

`ctx.Instantiate([(binder,value), ...])` is the receiver form of
`.MathInstantiate(ctx,bindings)`. Contexts also support `Eval` and `Substitute`.
Select binders from `ctx[:binders]`, not by spelling. Only binders declared by
that context may be selected. The new context removes selected identities from
its active binder list, substitutes all their occurrences (including outer captures
inside nested contexts), and retains every assumption and domain for evaluation.
Same-named inner binders keep their distinct identities. The original context is unchanged.

```{.rix exec=true}
ctx := {& :::t | 1:0; :::t>0 & :::t^2 };
point := ctx.Instantiate([(ctx[:binders][1],1/2)]);
point.Eval()[:value] ##@ == 1/4;
point[:domains][1][:domain][:orientation] ##@ == :desc;
ctx.Instantiate([(ctx[:binders][1],0)]).Eval()[:status] ##@ == :invalidAssumptions;
```

Instantiation is simultaneous and may be partial. A replacement can contain free
symbols; later `Eval` bindings can localize them. Replacement expressions containing
bound symbols are rejected, including through definitions, so capture cannot occur.
Foreign, duplicate, free-symbol, and already-instantiated binder keys are errors.
`instantiations` records original selected symbols and replacements as provenance.
This operation selects parameter values; it does not compute an integral or sum,
change traversal direction, or rerun a context body. Imported contexts regain these
trusted built-in methods but retain their unverified evidence status.

## Provider-aware evaluation

The supported provider set is closed and browser-safe; arbitrary maps cannot install
an evaluator. Rational intervals use exact endpoint arithmetic. Their `setEnclosure`
result is a conservative enclosure, not necessarily the exact image of the expression:
`x-x` with x in 1:2 still gives -1:1. No dependency cancellation or floating-point
conversion is used. An interval divisor containing zero remains unresolved.

```{.rix exec=true}
ans := (::x^2+1).Eval([(::x,-1:2)]);
ans[:status] ##@ == :complete;
ans[:resultKind] ##@ == :setEnclosure;
ans[:enclosure].Start() ##@ == 1;
ans[:enclosure].End() ##@ == 5;
```

Core exact scalars support bounded addition, subtraction, multiplication, negation,
positive integer powers, and division by nonzero rationals. Generator identities and
their declared polynomial relations are preserved. This does not assume the generator
algebra is a field: division by an exact generator/expression, and zero/negative powers
without established nonzero evidence, remain unresolved. Exact-scalar/interval mixing
also remains unresolved; no approximate embedding is guessed.

```{.rix exec=true}
p := 1~{pi};
ans := ((::x+1)^2/2).Eval([(::x,p)]);
ans[:resultKind] ##@ == :exactScalar;
.ExpressionConstant(ans[:value]) == .ExpressionConstant((p+1)^2/2) ##@ == 1;
```

Real adapters are singletons, not interval-valued quantities. Evaluation snapshots
their stored enclosures once per identity, performs interval arithmetic, and reports
`enclosed` with `value=_`, `resultKind=:singletonEnclosure`, and an `enclosure`.
Use `.ExpressionRefine` explicitly before another evaluation if tighter bounds are
needed. Evaluation never invokes the retained procedure or restores a recipe.

```{.rix exec=true}
.Plugin.Load("numerics");
r := .ExpressionReal(.numerics.Sqrt(2));
ans := (r^2).Eval();
ans[:status] ##@ == :enclosed;
ans[:value] ##@ == _;
ans[:resultKind] ##@ == :singletonEnclosure;
saved := .MathDecodeJSON(.MathEncodeJSON(r));
(saved+1).Eval()[:status] ##@ == :conditional;
```

Live-adapter evidence is protocol-checked, not an independent verification of a user
provider's proof. Metadata is retained in `providers`. Imported real evidence remains
unverified: any use keeps the report conditional, even if arithmetic yields a point.
Combining an actual interval set with a real reports `setEnclosure`; the real's
approximation/evidence restrictions still apply. Other unresolved assumptions take
precedence over the successful `enclosed` status.

Domain and comparison checks use conservative enclosure relations: an interval wholly
inside a domain can discharge it; one wholly outside contradicts it; partial overlap
remains conditional. An excluded point inside a nonpoint enclosure likewise leaves
an obligation. Exact-scalar ordering is unresolved unless it reduces to rationals;
supported equality does not prove arbitrary inequality.

Additional budgets cap exact-scalar products at 1,024 input-term pairs, sums at 1,024
input terms, 64 generators per term, generator polynomials at 64 coefficients, and
absolute term powers at 10,000. The earlier rational, exponent, and traversal budgets
still apply. Further semantic kernels, quantities, noncommutative providers, and
automatic precision scheduling remain future work.

## Per-call work budgets

These mathematical work limits are now defaults, not fixed algorithm limits. Pass
an options map as the last argument to `Eval`, `Substitute`, or `Instantiate` (or
their system forms). Use `[]` for evaluation without replacements. Options also
work when the second argument is an assumption context. No global state changes.

```{.rix exec=true}
expr := (::x+1)^64;
ans := expr.Eval([(::x,1~{pi})],{= maxProductPairs=2048 });
ans[:status] ##@ == :complete;
ans[:budgets][:maxProductPairs] ##@ == 2048;
.MathBudgets()[:maxProductPairs] ##@ == 1024;
```

| Option | Default | Scope |
| --- | ---: | --- |
| `maxVisits` | 10000 | Traversal visits per phase |
| `maxDepth` | 128 | Traversal nesting; host stack-safety ceiling 512 |
| `maxDigits` | 10000 | Integer components, including conservative power preflight |
| `maxTerms` | 1024 | Stored exact-expression terms |
| `maxProductPairs` | 1024 | Input term pairs per exact multiplication |
| `maxSumTerms` | 1024 | Input terms per exact addition/subtraction |
| `maxGenerators` | 64 | Generators per exact term |
| `maxPolynomialCoefficients` | 64 | Coefficients per generator polynomial |
| `maxDegree` | 10000 | Absolute power per generator in a term |
| `maxExponent` | 256 | Absolute integer exponent evaluated |
| `rootBits` | 64 | Dyadic fractional bits for interval square-root endpoints |

`.MathBudgets(options)` returns the merged settings; reports expose `budgets`.
Unknown keys, non-Integer values, nonpositive values, and integers above the JS
safe-integer range are rejected. Raising work limits may substantially increase
memory/time; these are operation-size limits, not a wall-clock deadline or unlimited
mode. Substitution/instantiation use the traversal settings; arithmetic settings
apply during evaluation. Domain safety and unsupported-provider checks cannot be disabled.
Exponents above `maxExponent` remain unresolved; other exhausted budgets throw.

These options do not change the separate defensive JSON/JSONL import limits or
the settings of calculus/CAS algorithms. Real refinement still uses its explicit
request options such as `maxWork`; evaluation never refines automatically.

## Trusted semantic applications

The first supported meanings are `rix.function.abs.real@1` and
`rix.function.sqrt.real-principal@1`, each taking exactly one argument. They match
the calculus plugin's semantic IDs, but evaluation does not load that plugin or call
its implementation. Display names are labels only. `semantics` records attempted
known IDs; it is not a proof certificate. Unknown IDs remain unresolved even if
their name happens to be `Sqrt`.

```{.rix exec=true}
Root(x) -> .ExpressionApply("rix.function.sqrt.real-principal@1",:Sqrt,[x]);
ans := Root(::x).Eval([(::x,2)]);
ans[:status] ##@ == :complete;
ans[:resultKind] ##@ == :exactScalar;
.ExpressionConstant(ans[:value]^2) == .ExpressionConstant(2) ##@ == 1;
Root(9/4).Eval()[:value] ##@ == 3/2;
```

For nonnegative rational inputs, square root returns an exact rational or the core
canonical positive algebraic root. It does not approximate an irrational singleton.
For rational intervals and real-adapter enclosures, it returns certified dyadic
endpoint bounds, with error at each endpoint at most `2^(-rootBits)`. Input interval
width remains: increasing `rootBits` does not refine a real adapter. Integer square
root and rational comparisons establish the bounds without floating-point numerical
evaluation. The scaled integer allocation is checked against `maxDigits` first.

```{.rix exec=true}
Root(x) -> .ExpressionApply("rix.function.sqrt.real-principal@1",:Sqrt,[x]);
ans := Root(::x).Eval([(::x,2:3)],{= rootBits=32 });
ans[:enclosure].Start()^2 <= 2 ##@ == 1;
ans[:enclosure].End()^2 >= 3 ##@ == 1;
Root(-1:2).Eval()[:status] ##@ == :unresolved;
```

An entirely negative input reports `outsideRealSquareRootDomain`; an interval
crossing into negatives reports `squareRootDomainUnresolved`. The kernel does not
discard invalid points or switch to a complex branch. Real `Abs` supports rational
and interval arguments, including intervals straddling zero. Both kernels accept
stored real enclosures and preserve their approximation/import evidence restrictions.
General exact-scalar arguments, unsupported arity, and further semantic meanings
remain diagnostic rather than invoking arbitrary code. Inert JSON loading is unchanged;
an explicit subsequent `Eval` may use these known mathematical meanings.
