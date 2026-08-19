# Range evidence checker vocabulary v1 — proposal

Status: accepted pre-1.0 design draft. This document reserves the target
vocabulary for `rix.numerics.range-evidence@1`; it is not yet an implemented
checker contract and remains changeable until RiX 1.0.

## Recommended decisions

1. A certificate proves the image of the inputs on which the named real
   function is mathematically defined. It separately proves whether all, some,
   or none of the requested inputs are in the domain.
2. The checker accepts only the rule identifiers listed here. Unknown rules,
   missing premises, unresolved identities, and heuristic premises fail
   closed.
3. Trusted-provider leaves are allowed, but are resolved through host authority
   rather than a portable trust label. The checker reports which trusted leaves
   the conclusion depends on.
4. The strategy engine may use sampling and other heuristics, but heuristic
   nodes may not occur in the premise closure of a certified root.
5. The polynomial/Sturm completeness rules are part of the v1 target rather
   than postponed to a later checker.
6. The default range-arithmetic convention treats `0^0` as undefined. A
   scoped convention may define it as 1, but that convention becomes part of
   the checked operation parameters and evidence identity.
7. At RiX 1.0 this vocabulary becomes stable. Before that release, the `@1`
   draft may change with the implementation and fixtures.

## Statement being checked

For a unary function `F` and input set `A`, the main conclusion is

```text
range contains { F(x) | x in A and x in Domain(F) }.
```

For a binary operation `G` and input sets `A` and `B`, it is

```text
range contains { G(x,y) |
                 x in A, y in B, and (x,y) in Domain(G) }.
```

Undefined inputs do not add a value to the image. They do add a domain fact.
A certificate may therefore have an empty certified range. Failing to compute
a value at an input where the function is defined is not a domain exclusion;
it is an unresolved or failed proof.

The proposed domain coverage vocabulary is:

| Value | Meaning |
| --- | --- |
| `allDefined` | Every requested input tuple is in the real domain. |
| `partiallyDefined` | At least one requested tuple is defined and at least one is not. |
| `noDefinedInputs` | No requested input tuple is in the real domain; the defined image is empty. |
| `unresolved` | The evidence does not establish which of the preceding cases holds. |

For an empty requested input (or empty Cartesian product of operands),
`allDefined` holds vacuously and the image is empty. `noDefinedInputs` is
reserved for a nonempty request whose intersection with the domain is empty.
This keeps the four cases mutually exclusive.

This replaces the current overloading of `domainViolation` and
`notCertified`. Domain coverage and proof confidence are independent facts. A
`partiallyDefined` or `noDefinedInputs` result may be certified when both the
defined image and exclusion are proved.

## Evidence document

The portable document should have this conceptual shape:

```text
{
  schema: "rix.numerics.range-evidence@1",
  vocabulary: "rix.numerics.range-checker@1",
  codomain: "real",
  root: "n17",
  nodes: [...],
  resources: {
    graphs: [...],
    rangeSets: [...],
    polynomials: [...]
  }
}
```

The schema may encode records as RiX maps or tagged JSON, but both encodings
must have the same meaning. The root must conclude both a `rangeEnclosure` and
a `domainCoverage` fact, either directly or through a paired conclusion.

Every node contains:

```text
{
  id: stable document-local identifier,
  rule: one rule identifier from this document,
  premises: ordered node identifiers,
  conclusion: typed fact,
  parameters: exact rule-specific data,
  provenance: optional non-authoritative audit data
}
```

The checker rejects duplicate IDs, dangling premises, cycles, conclusions of
the wrong fact type, and unused root substitutions. Human-readable provenance
does not grant trust.

### Identity binding

Every mathematical fact names its subject:

- a stable immutable expression-graph identity;
- a registered primitive identifier plus version; or
- an exact callable identity resolved by a trusted host capability.

Range, derivative, monotonicity, and domain premises must name the same subject
and input bindings unless a rule explicitly relates two identities. Matching
display names is never sufficient.

### Fact types

The v1 checker understands these conclusion shapes:

| Fact | Required content |
| --- | --- |
| `exactSet` | A normalized `RationalIntervalSet`. |
| `setInclusion` | Exact sets `subset` and `superset`. |
| `rangeEnclosure` | Subject identity, input binding, real output set, and defined-image semantics. |
| `domainCoverage` | Subject identity, input binding, coverage value, and exclusion witness when not `allDefined`. |
| `partition` | Parent set and ordered, pairwise-disjoint pieces whose union is the parent. |
| `derivativeIdentity` | Function graph, derivative graph, variable, and carried domain obligations. |
| `derivativeRange` | Derivative graph, input piece, and enclosing set. |
| `monotonicity` | Function graph, input piece, and `nondecreasing`, `nonincreasing`, or `constant`. |
| `rootCount` | Exact polynomial, interval, endpoint policy, and nonnegative count. |
| `isolatedRoots` | Exact polynomial, search set, isolating components, and completeness statement. |

Facts use exact rational data. Approximate binary64 values may appear only in
non-certifying provenance.

## Accepted v1 rules

### Given and trust-bound leaves

| Rule | Checker action |
| --- | --- |
| `given.input` | Admits the exact normalized input bindings from the request. |
| `given.constant` | Admits an exact rational constant or exact range-set literal. |
| `trusted.range` | Resolves a provider reference and exact callable binding through the host, then admits the provider's range invariant as a trusted premise. |
| `trusted.domain` | Resolves a host-authorized provider and admits its documented domain fact. |
| `trusted.derivativeRange` | Resolves a host-authorized derivative-range provider and admits its enclosure. |

Portable fields such as `trust="trusted"` never satisfy these rules. If the
host cannot resolve the referenced authority, checking fails. A checker may
also be run in `pureCheckedOnly` mode, which rejects all trusted leaves.

### Exact set and enclosure rules

| Rule | Checker action |
| --- | --- |
| `set.normalize` | Recomputes canonical component order, merging, topology, and empty-component removal. |
| `set.union` | Recomputes the exact normalized union of premise sets. |
| `set.intersection` | Recomputes exact intersection. When used to tighten enclosures, all premises must enclose the same subject and input. |
| `set.hull` | Recomputes the least single-component hull; use is visible in the evidence. |
| `set.include` | Checks exact set containment. This supports deliberate weakening to a simpler outer enclosure. |
| `partition.cover` | Checks that pieces are contained in the parent, pairwise disjoint as sets, and have exact union equal to the parent. Empty pieces are rejected. |
| `range.assembleUnion` | Checks that each piece encloses the same subject on one member of a covering partition, then unions the piece ranges. |
| `range.assembleHull` | Performs the same check but returns the explicit hull and records the loss of disconnected topology. |

`set.intersection` does not justify intersecting unrelated images. Its
range-tightening form requires identical subject and input identity on every
premise.

### Exact real arithmetic image rules

These rules recompute the Cartesian image of all defined input tuples. Their
precise domains and topology are specified in
[range-arithmetic-policy-proposal.md](range-arithmetic-policy-proposal.md).

| Rule | Real domain |
| --- | --- |
| `arith.negate` | All real inputs. |
| `arith.absoluteValue` | All real inputs. |
| `arith.add` | All real pairs. |
| `arith.subtract` | All real pairs. |
| `arith.multiply` | All real pairs. |
| `arith.reciprocal` | `x != 0`. |
| `arith.divide` | `y != 0`. |
| `arith.integerPower` | All inputs for positive exponent; `x != 0` for negative exponent; for exponent zero, `x != 0` under the default convention and all reals under scoped `zeroPowerZero=one`. |

Each arithmetic node concludes an exact output set and exact domain coverage.
The checker independently recomputes both. A rule may not silently discard an
in-domain input because an implementation could not evaluate it.

`arith.integerPower` records the active `zeroPowerZero` convention explicitly.
The checker never infers it from ambient state while checking a portable
certificate. A missing convention means the default `undefined` convention.

Rational non-integer powers are deliberately absent from the Core arithmetic
rules: their boundaries are often irrational and their real domain depends on
the reduced denominator. They enter through checked graph strategies or a
trusted provider.

### Domain and composition rules

| Rule | Checker action |
| --- | --- |
| `domain.primitive` | Recomputes the real-domain restriction for a versioned primitive, such as positive inputs for real `log`. |
| `domain.partition` | Combines checked defined and excluded pieces and establishes one domain-coverage value. |
| `domain.compose` | Checks that an outer function's domain witness covers the inner defined image and propagates exclusions through the composition. |
| `range.compose` | Checks compatible identities and bindings, then applies a checked outer range fact to a checked inner image. |
| `range.global` | Applies a checked or trusted global codomain enclosure to the same function identity. |

For `domain.compose`, an unresolved outer-domain obligation makes the composed
domain unresolved. It cannot be converted into an exclusion.

### Derivative and monotonicity rules

| Rule | Checker action |
| --- | --- |
| `derivative.graph` | Checks an exact derivative graph from the whitelist of v1 graph primitives, including product, quotient, and chain rules and their domain obligations. |
| `monotone.derivativeSign` | Requires a checked derivative identity and derivative range on the whole connected input piece. A range contained in `[0,+Infinity)` proves nondecreasing; one contained in `(-Infinity,0]` proves nonincreasing. |
| `monotone.compose` | Combines checked monotonicity facts with the usual direction table and checks that the inner image lies in the outer fact's covered domain. |
| `range.monotoneEndpoints` | On one closed bounded connected input piece, checks endpoint enclosures and forms the output enclosure using the monotonicity direction. |

The initial v1 rule is deliberately restricted to closed bounded pieces. An
open or unbounded piece must use primitive arithmetic, a global enclosure, or
a trusted provider until a versioned one-sided-limit vocabulary is specified.
The checker must never treat an excluded endpoint as an attained function
value.

### Polynomial completeness rules

| Rule | Checker action |
| --- | --- |
| `polynomial.sturmSequence` | Recomputes or verifies the exact signed remainder sequence for a rational polynomial. |
| `polynomial.rootCount` | Uses exact sign variation, with an explicit endpoint convention, to check the number of distinct real roots in a component. |
| `polynomial.isolateRoots` | Checks pairwise-disjoint isolating intervals, one root in each, zero roots in the uncovered remainder, and exact coverage of the search set. |
| `polynomial.completeCriticalPoints` | Relates the polynomial derivative to the source graph and turns complete derivative-root isolation into a complete critical-point partition. |

Repeated roots and roots at rational partition endpoints must use an explicit
half-open counting convention so that no root is missed or counted twice.

## Certification result

The checker returns more than a boolean:

```text
{
  accepted: boolean,
  vocabulary: "rix.numerics.range-checker@1",
  conclusion: root fact or null,
  evidenceLevel: checkedEvidence | trustedCapability | heuristic,
  trustedDependencies: [...],
  diagnostics: [...],
  work: { nodes, exactOperations, rationalDigits }
}
```

- `checkedEvidence` means every leaf is a given exact input or was discharged
  by checker rules.
- `trustedCapability` means the checked chain depends on at least one
  successfully resolved trusted leaf.
- `heuristic` is never an accepted certification result; it is reported when a
  caller asks the checker to diagnose a candidate graph containing heuristic
  premises.

The final `certified` flag is true only when `accepted` is true and every trust
dependency was resolved. Certification does not require `allDefined`.

## Limits and deterministic behavior

The checker must have explicit limits for node count, component count,
polynomial degree, rational numerator/denominator digits, and exact-operation
work. Reaching a limit returns `resourceLimit`, never a partially accepted
certificate. Node ordering, map ordering, provenance text, and strategy traces
must not affect the mathematical decision.

## Version rule

Before RiX 1.0, `rix.numerics.range-checker@1` is a development identifier.
Its schema, whitelist, and semantics may change as the checker is implemented.
Repository callers, fixtures, and schemas should be updated together; no
pre-1.0 compatibility promise overrides correctness.

RiX 1.0 freezes `@1` with these rules:

- Clarifying prose and additional invalid examples do not change the version.
- A new rule, changed premise requirement, changed domain convention, or
  changed meaning of a conclusion requires development on experimental `@2`
  off main.
- Once that work is accepted as the next stable contract, it is published and
  merged as odd version `@3`; `@2` remains an explicitly temporary
  experimental vocabulary.
- A version-3 checker continues to implement stable `@1` directly. It must not
  reinterpret an `@1` certificate using version-3 rules.
- Migrating evidence may perform only a checkable mechanical translation. It
  may not invent a missing proof or silently replace a checked step with trust.

The same odd-stable/even-experimental lifecycle applies to later checker
versions. Experimental even-version work stays on development branches and is
merged to main only after it is assigned the next stable odd version.

## Accepted review decisions

- Use `allDefined`, `partiallyDefined`, `noDefinedInputs`, and `unresolved`
  before the provider result contract is frozen.
- Keep trusted leaves in the common evidence DAG. `pureCheckedOnly` rejects
  them when a caller wants a trust-free proof; no outer wrapper is required.
- Include polynomial/Sturm rules in the v1 target.
- Treat `0^0` as undefined by default, with an explicit inheritable scoped
  override to the convention `0^0=1`.
- Treat every v1 checker contract as mutable until the RiX 1.0 release freezes
  it.
