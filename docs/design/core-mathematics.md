# Core mathematics implementation ledger

The accepted design introduces core symbolic values, normal lexical symbol
scopes (`::x`, `@::x`), immutable definitions, bound symbols (`:::x`), and
mathematical contexts (`{& header & body }`). No legacy compatibility layer is
required. Existing repository consumers will be updated directly.

## Delivery stages

1. Core construction and arithmetic: implemented. Calculus delegates its
   constructors to core; arithmetic no longer requires loading calculus.
2. Lexical symbol identities and capture: implemented for core expressions.
   `::x`, `@::x`, `.SameSymbol`, `.ExpressionKey`, and `.SymbolId()` are available.
   Name-based algorithm consumers reject scoped expressions pending stage 7.
3. Immutable definitions: implemented (`::y = expression`), including cycle
   checks, inspection, expansion, and conservative definition-aware equality.
   Local equality assumptions can now be retained as context data; rewriting
   under them remains stage 6 work.
4. Mathematical headers and fresh binders: foundation implemented. Rational
   interval, direction-tuple, and exact-endpoint object domains normalize and
   intersect; product tuples bind multiple symbols. Symbolic/dependent endpoint
   domains and arbitrary ordered traversal sources remain pending.
5. Mathematical constant providers: finite rational, bounded rational interval,
   and core exact-scalar promotion/inspection implemented. Explicit refinable-real
   adapters now retain provider procedures, protocol-checked enclosures, and
   stable identity. Interval equality is enclosure-aware; exact keys retain
   generator identity. Dimensional-quantity and noncommutative/nonassociative
   adapters remain pending.
6. Context inspection and bounded free substitution/rational evaluation implemented
   (`MathSubstitute`, `MathEvaluate`, expression `Substitute`/`Eval` methods).
   Context-argument evaluation infers direct exact-value equalities and checks
   rational point domains in both overloads; conditions remain attached to reports.
   Explicit partial binder instantiation (`MathInstantiate`, context `Instantiate`)
   preserves nested identities, constraints, and provenance. Provider evaluation now
   supports rational intervals, bounded core exact-scalar ring arithmetic, and stored
   real enclosures with explicit evidence/status. Interval-domain containment checks
   preserve undecided overlap. General domain reasoning and assumption rewriting
   remain pending. See `documentation/eval/mathematical-localization.md`.
7. Repository-wide consumer and schema conversion: pending.
8. Identity-preserving mathematical serialization: implemented for the current
   expression/context/scalar model, including bounded JSONL and frozen real
   snapshots. Portable refinement recipes and explicit recipe restoration
   remain pending; saved code or closures are never executed.

## Remaining work (serialization is not the end of this scope)

- Stage 4: dependent/symbolic domains and arbitrary ordered traversal sources.
- Stage 5: dimensional-quantity and noncommutative/nonassociative adapters.
- Stage 6: bound-to-bound alpha-renaming, general domain reasoning, semantic-function
  linking, additional numeric providers, and bounded assumption rewriting. Free substitution and
  exact rational evaluation are implemented; context inspection uses explicit records.
- Stage 7: coordinated expression schema and repository-wide consumer conversion;
  name-based calculus/CAS/range paths still reject identity/provider-aware inputs.
- Stage 8 follow-on: allowlisted portable real recipes and explicit, bounded
  restoration after inert loading. Snapshots are usable now without this work.

Each completed stage requires executable tests and a RiX-Web tutorial. This
ledger distinguishes implemented behavior from the target design.

## Core constructor surface

`ExpressionVariable`, `ExpressionConstant`, `ExpressionOperation`,
`ExpressionApply`, and `IsExpression` are core Symbolic capabilities. They
construct data without loading plugins or selecting numerical algorithms.
Constants include finite exact integers/rationals, bounded rational intervals,
and core exact scalars. `ExpressionConstantInfo` reports denotation and laws;
binary arithmetic promotes supported scalars, while purely numerical arithmetic
is unchanged. Extended constants require provider-aware algorithm consumers.
The current expression schema remains shared with existing consumers until
the coordinated schema/consumer stage; there is no second representation.

## Required invariants for subsequent stages

- Symbol identity follows programming scopes, not spelling alone. Captures
  use normal outer access semantics. Mathematical contexts share programming
  scope and add a separate mathematical environment.
- Header items are semicolon-separated. Leading bound symbols declare local
  identities; `pattern | source` supplies a domain; predicates are retained
  assumptions, not prematurely evaluated decisions.
- Domains intersect compatible facts, retain open endpoints and orientation,
  and reject proved inconsistency. Unresolved consistency is not a proof.
- Definitions are immutable; assumptions are context-local. Cyclic
  definitions are rejected. Bound substitution avoids capture.
- Equality has decisions 1, _, and ?. Different trees are not necessarily
  mathematically unequal. Binder renaming does not change mathematical meaning.
- Assumption-dependent values cannot lose conditions through assignments or
  escape from a context. Body statements execute once, not once per bound item.
- Existing interval start/end preserve orientation. Normalized domains also
  retain endpoint inclusion, traversal, and consumer-specific interpretation.
- Provider laws govern rewrites: interval enclosures are not exact singleton
  reals; noncommutative/nonassociative constants retain their laws.
- Saved documents preserve shared symbol IDs and binders, not runtime scopes.
