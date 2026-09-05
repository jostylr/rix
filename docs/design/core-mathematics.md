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
   Local equality assumptions remain pending with mathematical contexts.
4. Mathematical headers, binders, and domain descriptors: pending.
5. Mathematical constant-provider capabilities: pending.
6. Context inspection, substitution, evaluation, and bounded reasoning: pending.
7. Repository-wide consumer and schema conversion: pending.
8. Identity-preserving mathematical serialization: pending.

Each completed stage requires executable tests and a RiX-Web tutorial. This
ledger distinguishes implemented behavior from the target design.

## Core constructor surface

`ExpressionVariable`, `ExpressionConstant`, `ExpressionOperation`,
`ExpressionApply`, and `IsExpression` are core Symbolic capabilities. They
construct data without loading plugins or selecting numerical algorithms.
At the foundation stage, constants are exact integers/rationals. Binary
arithmetic promotes exact scalars; purely numerical arithmetic is unchanged.
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
