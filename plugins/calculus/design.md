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

`.calculus.DifferentiateResult(expression, variable)` returns a
`rix.calculus.transformation@1` record containing the source, transformed
expression, selected variable, obligations, and a rule/evidence trace.
`.calculus.Differentiate` extracts the expression only when the obligation list
is empty; otherwise it refuses to erase the conditions.

The rule set covers constants, variables, negation, linearity, products,
quotients, and Integer powers. Registered unary application rules return the
outer derivative, after which Calculus multiplies by the recursively computed
inner derivative. `Exp`'s outer rule returns the original application,
implementing `D Exp = Exp`.

### Differential-identity reuse

Expression nodes have deterministic structural keys. After differentiating an
Integer-power base, Calculus checks the narrow structural relations `f' = f`
and `f' = c*f` for an exact scalar `c`. It can then retain `n*c*f^n` instead
of constructing `n*f^(n-1)*(c*f)`. The power-rule evidence records the
optimization, relation, and scale.

This is graph optimization justified by derivative knowledge, not a general
algebraic simplifier. In particular, Calculus does not infer
`Exp(a)*Exp(b)=Exp(a+b)` from `D Exp=Exp`; an explicit Symbolic identity and
its assumptions would be required for that transformation.

## `rix.calculus.obligation@1`

An obligation records:

- `kind`: `domain` or `branch`;
- `relation`: the condition to discharge, such as `positive`, `nonzero`,
  `insideOpenUnitInterval`, or `offPrincipalLogBranchCut`;
- `expression`: the portable expression to which the condition applies;
- optional semantic function ID and branch; and
- reason and evidence fields identifying why the transformation requires it.

Division and negative Integer powers create nonzero obligations directly.
Semantic rules may register a separate `derivativeObligations` callable, so
the executable rule, its preconditions, and its evidence remain distinct
registry data. Real-principal `Log`, `Sqrt`, and `Asin`, plus principal
`ComplexLog`, exercise positive-domain, inverse-branch, and complex branch-cut
conditions without treating them as unconditional rewrites.

## `rix.calculus.transformation@1`

The transformation record keeps `operation`, last `variable`, complete
`variables` path, derivative `order`, `source`, `expression`, `obligations`,
and `evidence` together. Passing a transformation back to
`DifferentiateResult` continues from its expression while accumulating its
earlier obligations and evidence. The public spec bridge
accepts an expression, not a whole transformation, so a caller must visibly
select `result[:expression]` and separately decide how to preserve or
discharge `result[:obligations]`.

## `rix.calculus.evaluation@1`

Registry-driven evaluation recursively interprets a public Calculus graph:

- constants return their exact values;
- variables use an explicit binding map;
- arithmetic applies to the resulting concrete values; and
- semantic applications resolve the implementation slot of their stable ID.

Each invoked implementation contributes a link record containing semantic ID,
declared domain/branches, and implementation evidence. Thus a composition and
its exact derivative can reuse linked Numerics providers without serializing
closures or differentiating their algorithms.

Evaluation caches semantic application nodes by structural key. Cache hits are
reported separately from implementation links, so callers can distinguish an
actual provider invocation from a reused result. The cache deliberately does
not assign algebraic equivalence to differently shaped nodes. Sharing is
enabled by default because mathematical implementations are expected to be
referentially transparent, with an explicit option to disable it for tracing
or stateful experimental callables.

When the input is a transformation, evaluation retains its obligations and
evaluates each obligation expression at the same bindings. Those subjects are
reported as `unresolved`: evaluation is not assumption proving. The short
`.Evaluate` form refuses conditional transformations; `.EvaluateResult` is the
explicit boundary for callers that will discharge or propagate conditions.

## `rix.calculus.derivative-collection@1`

Gradients, Jacobians, and Hessians return component transformation records plus
a parallel expression shape, explicit variable ordering, sources, and a
flattened obligation list. Convenience forms return only the expression array
when the flattened list is empty. `DifferentiateNResult` and mixed Hessian
entries reuse transformation continuation, so conditions from every derivative
stage survive.

## `rix.calculus.integral@1`

The initial integration contract represents mathematical intent before any
integration engine is selected:

- `selectedPrimitive` records an integrand, variable, chosen primitive,
  verification status, obligations, and evidence;
- `antiderivativeFamily` records a representative and a separately named
  integration constant; and
- `definiteIntegral` records an integrand, variable, and exact expression
  endpoints.

The constructors do not manufacture verification evidence. A declaration may
remain `unverified`, and no definite record implies a computed value. This
keeps later exact-identity, certified-quadrature, and approximate providers
free to return their own work/evidence while consuming one stable problem
shape. Symbolic imports FractionFunction source-domain restrictions into the
integral obligation list.

General non-Integer powers and broader expression nodes remain blocked until
their real/complex branch policies are designed. `.fracfun` now exports its
display and evaluation specifications plus denominator restrictions as public
Calculus expressions; its closure rewriting and paired-form construction
still justify a host implementation.
