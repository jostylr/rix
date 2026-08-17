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

## Required bridge work

The next exact-calculus phase needs a versioned bridge between these records
and core `{#}` specifications. That bridge must:

1. expose public import and export functions rather than private IR mutation;
2. resolve application semantic IDs through a calculus rule/implementation
   registry;
3. preserve free variables, domains, assumptions, and branch obligations;
4. diagnose unsupported nodes without dropping them;
5. let pure-RiX plugins construct and transform expressions; and
6. give JavaScript plugins the same contract through the public `rix/eval`
   exports.

This bridge is also the missing primitive needed to move representation-heavy
plugins such as `.fracfun` away from private symbolic builders.
