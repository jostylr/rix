# Calculus function and expression contract

Phase 1 establishes two portable schemas.

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

Semantic applications remain inert inside a core specification: the bridge
retains identity but does not yet resolve it to an evaluation or rewrite rule.
The next step is a registry keyed by semantic function ID, with exact rules,
implementations, domains, branch obligations, and evidence kept as distinct
entries. Broader nodes and transformation operations are also needed before
representation-heavy plugins such as `.fracfun` can leave their private
symbolic builders.
