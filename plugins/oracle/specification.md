# Oracle Plugin Implementation Specification

> **Status:** proposed, no executable plugin manifest yet.  
> **Source of truth reviewed:**
> [`paper/oracles_short.tex`](../../../paper/oracles_short.tex), as present in
> this repository on 2026-07-22. The paper is still evolving; terminology and
> axioms must be rechecked before stabilizing the plugin API.

## 1. Purpose

The lowercase-loadable `.oracle` plugin will be a faithful executable
demonstration of the paper's *real numbers as rational betweenness relations*.
It is not merely another spelling of interval arithmetic and must not reduce an
oracle to a function `precision -> decimal`.

The implementation has four goals:

1. represent the paper's fuzzy interval query and all four answer forms;
2. demonstrate rational, testing, bisection, Newton, and funnel constructions;
3. expose bounded refinement to `.numerics` without coupling Numerics to this
   one real representation; and
4. keep theorem-level claims distinct from facts observed in a finite run.

The plugin is first-party and should initially remain in the RiX repository so
the value schemas, evaluator integration, CLI, and RiX Web presentation evolve
together.

## 2. Paper model and runtime model

The paper deliberately separates an ideal mathematical relation from a
procedure.

### 2.1 Rational betweenness relation

A completed rational betweenness relation (RBR) classifies rational intervals
by whether they contain one real number. Its axioms include existence,
separation, consistency, singularity, and closure. This is the canonical,
extensional mathematical value.

An arbitrary completed relation is generally not enumerable. The runtime must
therefore represent it as one of:

- a decidable relation supplied by a constructor, such as a rational number;
- a symbolic relation plus proof/evidence providers; or
- an opaque theorem-level identity associated with an oracle.

It must never materialize “the set of every Yes interval.”

### 2.2 Oracle procedure

The executable object accepts:

```text
query interval I = a <-> b       rational endpoints
fuzziness delta > 0              positive rational
auxiliary input                  optional algorithm state
```

and produces one of the paper's answer shapes:

```text
( 1, P)   Yes, with prophecy P
( 0, P)   No, with prophecy P
( 0)      No, without a returned prophecy
(-1)      Unknown / unable to answer
```

The public API names these `:yes`, `:no`, and `:unknown`, but it preserves the
difference between No-with-prophecy and No-without-prophecy. A prophecy is an
exact rational interval, never an unlabelled decimal pair.

For an ordered storage view `I = [a,b]`, write its open delta halo as
`H_delta(I) = (a-delta,b+delta)`. The Range conditions are represented exactly:

- `(1,P)` requires `P` to intersect `I` and be a subinterval of `H_delta(I)`;
- `(0,P)` requires `P` to be disjoint from `I` (it is not required to be in the
  query halo);
- `(0)` asserts the existence of some positive `deltaPrime` for which no
  prophecy both intersects `I` and lies in `H_deltaPrime(I)`; and
- `(-1)` makes no Yes/No claim.

The procedure is allowed to be multivalued. Randomized and stateful examples
are also permitted, provided their choice policy, seed, and state transition
are recorded for reproducibility.

### 2.3 Oracle classes

The plugin recognizes the paper's three operational levels:

| Kind | Required intent | Runtime consequence |
| --- | --- | --- |
| `:proto` | Range, existence, separation, and disjointness; it may answer Unknown. | Arbitrarily fine refinement is mathematically available, but a finite call can still exhaust its policy. |
| `:coarse` | The thresholded certainty, existence, separation, disjointness, and consistency properties for a minimum scale `eta`. | Requests below its resolution floor may be Unknown; callers must not promise arbitrary precision. |
| `:complete` | Proto behavior plus the paper's complete-oracle certainty, consistency, and closure requirements. | The declared mathematical object has no Unknown answers, although a host may still stop its own computation for resource reasons. |

The draft discusses reasonableness/availability behavior around fuzziness in
addition to the formal complete-oracle list. Until the paper fixes its final
axiom list, the plugin records `:reasonableness` as a separately declared and
validated property rather than silently including or excluding it.

## 3. Fidelity rules

These rules are non-negotiable:

1. Query endpoints, fuzziness, prophecy endpoints, and interval checks use
   exact RiX rationals.
2. `:no` and `:unknown` are different values.
3. A single Yes observation does not establish the paper's universal “Yes
   interval,” which requires every possible output at every fuzziness to be
   Yes.
4. A finite sample of a multivalued procedure does not establish a universal
   claim over all outputs.
5. The theorem that complete oracles ultimately need not answer `-1` is not a
   license to hide host timeout, cancellation, or resource exhaustion.
6. Exact equality and complete-oracle equivalence are proof-oriented results,
   not tolerance comparisons.
7. All potentially unbounded algorithms accept explicit work limits.
8. Renderers receive a finite interval, trace, table, or graphic. Renderers do
   not invoke an oracle procedure during layout or drawing.

## 4. Value schemas

The exact implementation may use semantic types and multifunctions, but the
serialized fields below define the contract.

### 4.1 `Oracle`

```text
Oracle
  schema              "rix.oracle@1"
  kind                :proto | :coarse | :complete
  procedure           callable service reference
  constructor         stable constructor ID when reconstructable
  parameters          exact serializable constructor parameters
  eta                 positive Rational for :coarse; otherwise absent
  declaredProperties  property claims made by the constructor/provider
  proofProviders      optional executable or symbolic proof services
  choicePolicy        :single | :enumerable | :randomized | :stateful
  provenance          plugin version, source, seed, and user metadata
```

An arbitrary closure in `procedure` is runtime-only. A serializable Oracle must
have a stable constructor ID and serializable parameters from which a host can
reconstruct its procedure after loading the same compatible plugin version.

### 4.2 `OracleQuery`

```text
OracleQuery
  interval       normalized exact RationalInterval
  delta          positive Rational
  auxiliary      optional input state
  requestId      stable trace identifier
```

The paper's interval is symmetric in its endpoints. RiX may store endpoints in
ascending order, but normalization must not change betweenness semantics.

### 4.3 `OracleAnswer`

```text
OracleAnswer
  status         :yes | :no | :unknown
  prophecy       Prophecy or absent
  query          original OracleQuery
  auxiliary      optional output state
  reason         structured status/rejection reason
  evidence       exact checks performed on this output
  work           calls, iterations, and elapsed/cancellation metadata
```

Valid shapes are:

| Status | Prophecy | Paper form |
| --- | --- | --- |
| `:yes` | required | `(1, c <-> d)` |
| `:no` | optional | `(0, c <-> d)` or `(0)` |
| `:unknown` | absent | `(-1)` |

The Range validator checks every returned prophecy against the query and its
delta halo when the selected output form requires it. For Yes it checks both
halo containment and intersection; for No-with-prophecy it checks disjointness
only. A No-without-prophecy may carry an `AbsenceWitness` containing the
positive `deltaPrime` and a trusted/proved justification of its quantified
claim. Invalid procedure output becomes a diagnostic failure, never a normal
No.

### 4.4 `Prophecy`

```text
Prophecy
  interval       exact RationalInterval
  oracleId       originating Oracle identity
  queryId        originating query when applicable
  auxiliary      optional construction state
  provenance     constructor, call, branch, and seed information
```

### 4.5 Refinement and evidence

```text
RefinementResult
  status         :enclosed | :resolutionFloor | :unknown | :budgetExhausted
  interval       prophecy interval when available
  requestedWidth positive Rational
  achievedWidth  exact Rational when available
  trace          BisectionTrace or other construction trace
  assumptions    declared/proved properties used by the algorithm

PropertyEvidence
  property       :range | :existence | :separation | :disjointness | ...
  level          :proof | :constructorGuarantee | :checkedExamples
  subject        Oracle identity
  witness        exact witness or symbolic proof reference
  diagnostics    counterexamples and limitations
```

`checkedExamples` is explicitly not a proof. A built-in rational constructor
may attach a `constructorGuarantee`; a formal proof plugin could later attach
`proof` evidence.

### 4.6 Funnel, fonsi, and completed relation

```text
RefinementFunnel
  refine(epsilon, policy) -> one or more RationalIntervals
  constructor / parameters / provenance
  compatibilityEvidence

ObservedFonsi
  finiteProphecies
  pairwiseIntersectionChecks
  smallestObservedWidth

BetweennessRelation
  contains(interval) -> :yes | :no | :undecided
  proofProviders
  associatedOracleIdentity
```

A refinement funnel must return an interval shorter than positive `epsilon`,
and every possible funnel output must be pairwise compatible. A mathematical
fonsi is a family of pairwise-intersecting, arbitrarily small intervals; the
runtime `ObservedFonsi` is only a finite view of such a family. A maximal fonsi
corresponds to completed Yes intervals in the paper, but is not enumerated.

## 5. Proposed RiX API

All plugin loading uses lowercase `.oracle`. Exported constructors and
operations use capitalized names in accordance with RiX system-name
conventions. Positional convenience forms and explicit map forms are
multifunction variants of the same operation.

### 5.1 Constructors

```rix
.oracle.Proto({= procedure = ask, existence = seedProvider })
.oracle.Coarse({= procedure = ask, eta = 1 / 1000 })
.oracle.Complete({= procedure = ask, claims = [:certainty, :consistency, :closed] })

.oracle.Rational(q)
.oracle.Rational(q, {= procedure = :singular | :reflexive | :halo | :randomHalo | :bisection })
.oracle.FromFunnel(funnel)
.oracle.Cauchy(sequence, modulus)
.oracle.Testing({= function = f, domain = interval, rootEvidence = evidence })
.oracle.NthRoot(value, n, options?)
```

Calling `.oracle.Complete` records a claim; it does not prove arbitrary user
code complete. Built-in constructors attach the guarantees established by
their known construction.

### 5.2 Query operations

```rix
.oracle.Ask(real, interval, delta)
.oracle.Ask(real, {= interval = interval, delta = delta, auxiliary = state })
.oracle.AskAll(real, query, {= maxAlternatives = 20, seed = 17 })
.oracle.CheckRange(answer)
```

`Ask` executes one allowed branch according to the recorded choice policy.
`AskAll` enumerates only procedures that provide a finite enumeration service;
bounded observations from it still do not imply that all mathematical outputs
have been exhausted unless the provider certifies that fact.

### 5.3 Refinement operations

```rix
.oracle.Prophecy(real, policy?)
.oracle.Refine(real, {= width = epsilon, maxCalls = 100, trace = true })
.oracle.Bisect(real, startingProphecy, options?)
.oracle.ToFunnel(real, policy?)
.oracle.FromFunnel(funnel)
```

The default `Refine` implementation uses the paper's bisection construction
when the Oracle exposes the required Range, Existence, and Separation
guarantees. Its trace records every rational split, delta, answer, chosen
prophecy, width, and termination reason. The proof's width contraction bound
is at most `2/3` per successful step; tests should check this invariant on the
built-in examples.

For a coarse oracle, `Refine` returns `:resolutionFloor` when its requested
width falls below what `eta` can justify. It must not loop trying to manufacture
precision absent from the model.

### 5.4 Logical and comparison operations

```rix
.oracle.ProveYes(real, interval, proofPolicy?)
.oracle.ProveNo(real, interval, proofPolicy?)
.oracle.Compatible(leftProphecy, rightProphecy)
.oracle.Equivalent(left, right, proofPolicy?)
.oracle.CompareWithin(left, right, epsilon, workPolicy?)
```

Results are structured:

- `ProveYes` returns `:proved` or `:undecided`; it never treats observed Yes
  answers as universal proof.
- `ProveNo` can return `:proved` with a disjoint prophecy witness.
- `Equivalent` returns `:equal`, `:different`, or `:undecided`, plus evidence.
  The paper characterizes equivalence by every prophecy of one oracle
  intersecting every prophecy of the other; general finite decision is not
  promised.
- `CompareWithin` implements epsilon-trichotomy. It returns `:less` or
  `:greater` with disjoint witness intervals, or `:compatible` with a common
  interval of length at most epsilon. `:compatible` is not exact equality.

### 5.5 Validation

```rix
.oracle.Validate(real, {=
  properties = [:range, :separation, :disjointness],
  queries = testQueries,
  maxCalls = 1000,
  seed = 42
})
```

This is a development/testing service. It returns `PropertyEvidence` at level
`:checkedExamples`, or exact counterexamples. Generic randomized validation is
never presented as a proof of the oracle axioms.

## 6. Required paper demonstrations

The first stable release is not complete until these constructions are
included in tests and in a RiX Web tutorial.

### 6.1 Rational procedures

For an exact rational `q`, implement separately:

- singular oracle;
- reflexive oracle;
- fuzzy reflexive/halo oracle;
- seeded random-halo oracle demonstrating multivalued behavior; and
- bisection oracle.

Although these represent the same rational real when their prophecies are
compatible, they must remain distinguishable procedure objects with different
operational traces.

### 6.2 Testing oracle

Implement the paper's function-zero/nth-root testing construction under
explicit hypotheses: a rational domain, evidence that the target root lies in
the domain, and uniqueness/sign conditions sufficient for the procedure. The
constructor must reject a bare arbitrary function that supplies no usable
root evidence.

### 6.3 Newton funnel

Construct rational interval iterates for positive nth roots, expose them as a
refinement funnel, and then derive the Oracle through `FromFunnel`. The tutorial
should display:

- exact interval iterates;
- requested and achieved width;
- pairwise compatibility checks;
- the derived query answers; and
- a comparison with `.float` that labels Float output approximate rather than
  certified.

### 6.4 Cauchy adapter

Given a rational Cauchy sequence and a certified tail modulus/bound, construct
intervals around sufficiently late terms, turn those intervals into a funnel,
and derive the Oracle. An unadorned sequence with no effective tail information
is insufficient for executable refinement.

### 6.5 Funnel-to-oracle adapter

Follow the scale accounting in the paper: obtain a sufficiently small funnel
interval, answer according to its intersection with the query, and use the
appropriate fuzziness factor (the current draft derives the oracle query at a
`2 * delta` halo). This factor must be named in code and covered by exact
boundary tests rather than hidden as a magic constant.

## 7. Arithmetic

Arithmetic should be implemented through compatible refinement funnels, not
by inspecting opaque procedure internals.

```rix
.oracle.Negate(x)
.oracle.Add(x, y)
.oracle.Multiply(x, y)
.oracle.Reciprocal(x, nonzeroEvidence?)
.oracle.Subtract(x, y)
.oracle.Divide(x, y, nonzeroEvidence?)
```

- Addition combines refined rational intervals and budgets each input width so
  the output width meets the request.
- Multiplication first obtains rational magnitude bounds and uses them in its
  width budget.
- Negation reverses and negates interval endpoints.
- Reciprocal requires a prophecy provably excluding zero. Failure to obtain
  one within the work policy is `:undecided` or `:budgetExhausted`, not division
  by a guessed midpoint.
- Equivalent choices of compatible input funnels must produce equivalent
  result oracles.

Rational `0` and `1` constructors provide the identity objects. Ordinary
interval arithmetic may satisfy distributivity only by containment; field laws
belong at the equivalence/completed-relation level, as in the paper.

Operator overloads such as `x + y` should be added only after the named
operations and evidence semantics are stable.

## 8. Numerics integration

`.oracle` provides the shared `EnclosableReal`/`Refinable` service; `.numerics`
consumes it. Neither plugin imports the other as a concrete implementation.

Conceptually:

```text
Enclose(oracleReal, RefinementRequest)
  -> RefinementResult with exact rational interval and evidence
```

The request includes target width, absolute/relative mode, maximum calls,
maximum depth, deadline/cancellation signal, and trace level. The provider
advertises:

```text
arbitraryRefinement       true for supported proto/complete constructions
minimumResolution         eta for coarse oracles
certificationLevel        proof | constructorGuarantee | assumed | observed
multivalued               true/false
deterministic             true/false under recorded seed/state
```

Geometry and Plot consume the Numerics enclosure service. They may display a
refined prophecy or an unresolved region, but they must not import `.oracle` or
special-case oracle internals.

## 9. Nondeterminism, state, and work policy

Every execution entry point accepts or inherits:

```text
WorkPolicy
  maxCalls
  maxIterations
  maxAlternatives
  maxDepth
  deadline / cancellation
  seed
  trace
```

Unknown reasons are structured, for example:

```text
:procedureUnknown
:belowCoarseResolution
:budgetExhausted
:cancelled
:missingEvidence
:nonEnumerableChoices
```

Only `:procedureUnknown` corresponds directly to the paper's `(-1)` answer.
Host resource outcomes wrap the operation and do not falsify a declared
complete-oracle property.

A randomized constructor requires a supplied seed or generates and records one
in provenance. Replaying a serialized demonstration with the same compatible
plugin version and seed should reproduce the same trace.

## 10. Serialization and display

Portable results include queries, answers, prophecies, refinement traces,
property evidence, and reconstructable built-in Oracle descriptors. Arbitrary
user procedures and closures are runtime-only.

Default display should be structured:

- Oracle: constructor, kind, declared properties, resolution, determinism;
- Answer: status, exact query/delta, prophecy, and reason;
- Refinement: exact enclosure, achieved width, status, and compact trace;
- Validation: checked properties, evidence level, tests, and counterexamples.

RiX Web can add expandable traces and interval diagrams. The CLI uses the same
values as tables/text. Neither host receives privileged mathematical behavior.

## 11. Dependencies and permissions

The initial plugin depends on:

- RiX exact `Rational` and `RationalInterval` values;
- semantic types/multifunction registration;
- the plugin catalog and capability group for numerical computation; and
- core `Table`, `Fragment`, and optional `Graphic` values for demonstrations.

It requests no network, filesystem, DOM, or native-code permission. A browser
and Node installer should share the pure implementation. Optional future
adapters may consume `.algebra` proof services, but the rational/Newton/Cauchy
demonstrations must not require Algebra.

## 12. Error conditions

At minimum, reject or diagnose:

- non-rational endpoints or delta;
- nonpositive delta/epsilon;
- malformed answer shapes;
- prophecy outside the allowed query halo;
- Yes prophecy disjoint from the query;
- No-with-prophecy that intersects the query;
- coarse oracle without positive `eta`;
- refinement invoked without the required property guarantees;
- funnel output whose width is not below epsilon;
- observed incompatible funnel outputs;
- nth-root construction without valid domain/root evidence;
- reciprocal without a nonzero witness; and
- attempts to serialize an anonymous procedure as reconstructable.

## 13. Testing plan

### Unit tests

- exact halo and intersection boundary behavior;
- all valid and invalid answer forms;
- symmetric endpoint normalization;
- rational procedure examples from the paper;
- bisection width contraction and termination;
- coarse `eta` boundary behavior;
- funnel-to-oracle fuzziness factor;
- deterministic replay of randomized examples;
- Newton and Cauchy refinement widths;
- addition, multiplication, negation, and reciprocal interval bounds; and
- serialization round trips for built-in constructors and finite results.

### Property and negative tests

- generated rational queries against known rational oracles;
- pairwise intersection of observed prophecies/funnel outputs;
- counterexample reporting for intentionally invalid procedures;
- no conversion of sampled success into `:proof` evidence;
- exact comparison witnesses and epsilon-trichotomy;
- arithmetic equivalence using different rational/funnel constructions; and
- finite work limits on procedures that always answer Unknown.

### Host integration tests

- identical structured results in CLI and RiX Web;
- tutorial code evaluated cell by cell;
- readable text fallback for every value;
- expandable trace presentation in RiX Web; and
- sandbox denial tests showing that the plugin needs no elevated permissions.

## 14. Implementation phases

1. **Exact schemas and validators:** Query, Answer, Prophecy, WorkPolicy,
   evidence levels, interval/halo utilities, and serialization.
2. **Rational demonstration:** the five rational procedures, Ask/AskAll,
   reproducible traces, and CLI/Web display.
3. **Refinement:** bounded bisection, Funnel, FromFunnel, Newton nth root, and
   the planned tutorial.
4. **Protocol integration:** shared `EnclosableReal` registration and Numerics
   dispatch, without a hard plugin-to-plugin import.
5. **Additional constructions:** testing oracle, Cauchy adapter, coarse oracle,
   validation harness, comparison, and ordering.
6. **Arithmetic and proof hooks:** funnel arithmetic, equivalence evidence,
   RBR adapters, and optional Algebra proof services.

The first useful milestone is phase 3. It demonstrates the paper faithfully
without waiting for full ordered-field machinery.

## 15. Acceptance criteria

The plugin is ready to advertise as implemented when:

1. `.Plugin.Load("oracle")` works in Node and browser hosts;
2. all four paper answer forms are losslessly represented and validated;
3. rational, random-halo, bisection, and Newton-funnel demonstrations run;
4. every refinement path terminates under a finite work policy;
5. coarse resolution and host exhaustion remain distinct from paper Unknown;
6. proof, constructor guarantee, assumption, and sampled evidence are visibly
   different;
7. Numerics can refine an Oracle through the common protocol;
8. the CLI and RiX Web show the same portable result values;
9. the tutorial is executable and covered by tests; and
10. documentation cites the current paper source and records any deliberate
    deviation from it.

## 16. Paper questions to resolve before API stabilization

The working paper leaves a few choices that should remain visible:

1. Is reasonableness a named axiom of every final complete oracle, a derived
   property, or supporting terminology?
2. Which parts of “oracles ultimately do not return `-1`” are intended as
   classical existence results versus executable requirements?
3. Should a No answer without prophecy carry a machine-checkable witness of
   the paper's smaller-fuzziness condition, or may that witness remain implicit
   in a trusted procedure?
4. How should a finite API expose all possible outputs of a genuinely
   multivalued oracle: enumerable branches, a choice relation, or proof hooks?
5. Should “oracle” name only the complete class in the final terminology, with
   proto/coarse values having distinct runtime types?

Until those are settled, schema fields are versioned and the corresponding
claims remain explicit rather than inferred.
