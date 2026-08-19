# Calculus graphs as certified-range subjects

Status: exact-primitive graph evaluation, primitive derivative checking, and
generic derivative-sign reasoning implemented; semantic applications and
semantic derivative rules staged. The Calculus expression and transformation
records provide the identity, immutability, derivative, and obligation
boundary needed by the general range engine.

## Why a graph is necessary

A callable alone does not reveal whether two reads refer to the same input,
whether an apparent cancellation is domain preserving, or which mathematical
identity justifies a derivative. Certified range work therefore names an
immutable mathematical expression graph rather than inspecting an evaluator
closure or trusting source text.

For example, `x-x` has one input node used twice and has exact image `{0}`.
Evaluating two independent copies of the interval gives the safe but wider
Cartesian image `[-width,width]`. The graph is what makes the dependency
visible. Likewise, simplifying `x/x` to `1` is valid only with the carried
obligation `x != 0`; the source-domain hole must not disappear.

## Existing stable boundary

The Calculus plugin already provides the pre-range bridge:

- `rix.calculus.expression@1` records immutable `variable`, `constant`,
  `operator`, and semantic `apply` nodes;
- application nodes use stable `semanticId` values rather than display names
  or closure identity;
- `.calculus.ToSpec` and `.calculus.FromSpec` cross the public `{#}` boundary
  without exposing private evaluator opcodes;
- deterministic structural keys identify equal graph nodes and permit shared
  subexpression reuse;
- `rix.calculus.transformation@1` keeps a derivative graph, its source graph,
  exact rule trace, and every domain or branch obligation together; and
- the same bridge helpers are exported for JavaScript plugin consumers.

These records remain pre-1.0 contracts. Their `@1` spelling is changeable
until RiX 1.0, just like the range evidence vocabulary.

## Identity rules for certification

A range fact should bind all of the following:

1. the canonical structural identity of the source expression graph;
2. the ordered variable identities and their exact input range sets;
3. the semantic IDs and versions of every primitive application;
4. the transformation identity when a derivative graph is used; and
5. the exact domain/branch obligations in force.

Display text, a binding such as `F`, or a provider's claimed name is audit
information only. A checker rejects a derivative range for graph `g2` when
the monotonicity conclusion names `g1`, even if both render the same way.

Structural equality is intentionally narrower than mathematical equality.
Two differently shaped graphs become interchangeable only through a checked
Symbolic transformation that relates their identities and carries any newly
introduced obligations.

## Purity requirement

Range certification quantifies one mathematical function over every input in
a set. The implementation linked to a semantic application must therefore be
referentially transparent for the certified operation: equal exact inputs and
the same explicit request must describe the same mathematical value and
domain. It may use bounded caches internally, but time, random state, I/O, or
call count cannot alter the claimed function.

Calculus currently permits disabling common-subexpression reuse for tracing or
experimental stateful callables. Such a callable may be evaluated, but it is
not an eligible checked graph leaf. A trusted provider may cross an authority
boundary only when its reviewed invariant explicitly supplies the missing
purity and outward-enclosure guarantee.

## Domain obligations are proof obligations

`DifferentiateResult` retains conditions introduced by quotient, negative
power, and semantic derivative rules. The range engine must discharge each
condition on the exact covered input or partition around it:

```text
source graph + input set
  -> derivative transformation + obligations
  -> checked domain partition
  -> derivative range on every defined connected piece
  -> derivative-sign monotonicity
  -> endpoint images
  -> union of piece ranges and exclusions
```

Evaluation is not discharge. Calculus deliberately reports obligations as
unresolved even when it can compute their subject at a sample point. Numerics
must attach a checked `domain-witness` before the derivative can support a
certified monotonicity conclusion.

## Implemented exact-primitive adapter

`.numerics.GraphRange(expression, bindings, options)` now consumes a portable
Calculus expression and exact variable-to-`RationalIntervalSet` bindings. Its
first whitelist is deliberately small:

- exact constants and shared variables;
- negate, add, subtract, multiply, divide, and Integer power
  through the Core checked primitives;
- arithmetic composition through those same nodes.

Every graph node is memoized by structural identity and input binding. The
initial correlation rules prove `g-g={0}` and preserve the zero-domain hole in
`g/g`. Exact rational subdivision rebinds the same variable identity on every
piece. The independent checker recomputes the graph, bindings, active `0^0`
convention, partition, range, and domain coverage before accepting the public
result. Unsupported semantic applications return an explicit unresolved
result; they are never sampled and relabeled as checked.

Semantic applications are the next adapter layer. They will be admitted only
through a matching checked or authority-resolved `RangeProvider`, and
composition must prove that the inner image lies in the outer function's
domain.

`.numerics.RecognizeGraph` is the initial polynomial/rational hook on this
portable graph rather than an alternate parser. It emits exact coefficient
arrays and retains source denominator restrictions without cancellation. The
checker can now recompute a polynomial's canonical Sturm sequence, count its
distinct roots, and validate a complete family of rational isolating
intervals and bind an obligation-free recognized derivative polynomial back
to its checked source graph. A recognized rational function must discharge
every retained denominator restriction.

## What is ready and what is not

Ready now:

- immutable portable graph nodes and stable semantic IDs;
- public RiX and JavaScript bridge APIs;
- exact derivative graphs with obligation-preserving transformations;
- deterministic structural keys and tested common-subexpression reuse;
- exact Core range primitives plus evidence checking for their local steps;
- checked exact-primitive graph evaluation and one-variable subdivision; and
- domain-sensitive correlated `g-g` and `g/g` identities; and
- conservative univariate polynomial/rational recognition with source-domain
  restrictions;
- independent primitive derivative-graph and obligation recomputation; and
- generic derivative-sign certification after total derivative range checking
  and obligation discharge;
- structurally checked monotone composition; and
- checked binding from complete polynomial derivative isolation to the source
  graph when no domain obligations remain.

Still required for general graph certification:

- checked discharge of Calculus obligations over exact sets;
- trusted/checked RangeProvider links for semantic `apply` nodes;
- semantic derivative-identity checking from registered graph rules;
- one-sided derivative-root endpoint counting and monotonicity partition
  formation.

See the [Calculus design](../calculus/design.md), the
[checker vocabulary](checker-vocabulary-v1-proposal.md), and the
[derivative witness tutorial](derivative-witness-tutorial.md) for the records
on each side of this bridge.
