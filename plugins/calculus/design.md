# Calculus function and expression contract

The base layer establishes two portable schemas.

## `rix.calculus.function@1`

A mathematical-function record contains:

- `semanticId`: stable identity independent of a RiX binding name;
- `name` and `arity`;
- `domain` and `codomain` declarations;
- `facts`: mathematical characterizations and assumptions;
- `hasImplementation` and `implementationEvidence`.

The live function value may additionally retain an implementation callable.
That callable is intentionally absent from the portable record. A host or
plugin must reconnect implementations by semantic ID rather than attempting to
serialize closures.

## `rix.calculus.expression@1`

Phase 1 defines four node kinds:

- `variable`: a named free variable;
- `constant`: an exact Integer or Rational;
- `apply`: a semantic function ID, display name, and argument expressions;
- `operator`: an operation name and operand expressions.

All child values are expressions; exact scalar operands are promoted to
constant nodes. Application nodes retain semantic IDs rather than depending on
the spelling or object identity of the function that produced them.

## Public specification bridge

The initial versioned bridge between these records and core `{#}`
specifications is implemented. It:

1. exposes `.calculus.ToSpec` and `.calculus.FromSpec` without permitting raw
   IR mutation;
2. preserves free-variable order when supplied and otherwise infers a stable
   order;
3. preserves exact constants, arithmetic nodes, and application semantic IDs;
4. diagnoses unsupported nodes and incomplete explicit input lists;
5. lets pure-RiX plugins consume the portable expression records; and
6. exports the same conversion helpers through the public `rix/eval` module
   for JavaScript plugins.

Semantic applications remain inert when a core specification is evaluated on
its own. The bridge retains their identity, allowing Calculus to resolve them
through its semantic registry.

## `rix.calculus.registry-entry@1`

The live registry is keyed only by stable semantic function ID. A resolved
entry exposes separate slots for:

- canonical function metadata;
- exact symbolic rules;
- an optional concrete implementation;
- domain and codomain declarations;
- branch declarations; and
- evidence indexed by the slot or rule it justifies.

Rules and implementations are intentionally live callables and are not part of
the portable function record. A second mathematical-function object with the
same semantic ID resolves the same registry entry. This makes spelling and
object identity irrelevant while keeping exact knowledge distinct from an
evaluation algorithm.

## Exact derivative contract

`.calculus.Differentiate(expression, variable)` returns another
`rix.calculus.expression@1` graph. The initial rule set covers constants,
variables, negation, linearity, products, quotients, and Integer powers.
Registered unary application rules return the outer derivative, after which
Calculus multiplies by the recursively computed inner derivative. `Exp`'s
outer rule returns the original application, implementing `D Exp = Exp`.

General powers, logarithms, roots, inverse functions, and complex
continuations require explicit domain or branch obligations and therefore do
not receive unconditional rules. Broader nodes and transformation operations
are also needed before representation-heavy plugins such as `.fracfun` can
leave their private symbolic builders.
