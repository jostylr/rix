---
title: Certified and refinable real JSON interchange
description: Versioned inert snapshots and optional safe recipes for reconstructing arbitrarily refinable real values.
theme: Numbers and numerics
status: bounded implementation; broader recipe families proposed
---

# Certified and refinable real JSON interchange

Status: the bounded M7 profile is implemented: standalone frozen snapshots,
embedded evidence, deterministic writing, fresh opaque identities and explicit
version-matched Numerics expression replay. See
[the implemented API and limits](../../documentation/eval/safe-interchange.md).
The sections below also describe future algebraic-root/unique-root, effective
limit, integral and ODE recipe families; those remain inert on import. Historical
JSON examples illustrate the wider design and are not executable tutorial cells.

## 1. Purpose

`rix.refinable-real@1` is the durable interchange envelope for a singleton real
whose current value is enclosed by exact rational endpoints and whose future
refinement may be reconstructed. It separates three questions:

1. **Subject:** which mathematical real does the record denote?
2. **Snapshot:** what exact enclosure and evidence were saved?
3. **Recipe:** which optional, bounded computation may refine it further?

The snapshot is authoritative data. The recipe is inert until an explicit
refinement request is made. Loading a document never evaluates source code,
loads plugins, reads files, performs network requests, or starts background
work.

The format is for singleton reals. A measurement interval or arbitrary real set
uses a range/set schema instead; it must not claim arbitrary refinement toward
one hidden point.

## 2. Design requirements

- Exact Integer, Rational, and interval data never pass through JSON numbers.
- A missing, incompatible, or rejected recipe leaves a useful frozen snapshot.
- Mathematical identity is independent of the algorithm currently selected.
- Built-in and expression recipes are versioned, deterministic, and bounded.
- Anonymous closures and arbitrary RiX/JavaScript source are never portable
  refinement recipes.
- Every narrower certified result is compatible with the saved subject and is
  contained in the applicable earlier certified enclosure.
- Certification, assumption, trust, and verification are separate fields.
- Browser and CLI hosts interpret the same envelope without privileged
  mathematical behavior.

## 3. Media type and encoding

Recommended media type:

```text
application/vnd.rix.refinable-real+json;version=1
```

Recommended filename suffix: `.rixreal.json`.

Documents are UTF-8 JSON. Writers use deterministic object-key ordering for
fixtures and hashes, but readers must not depend on member order. JSON numbers
are forbidden anywhere a mathematical scalar, work count, version, or identity
field might exceed the host's safe-integer range. Such values use decimal
strings or tagged exact values.

## 4. Top-level envelope

The required shape is:

```json
{
  "schema": "rix.refinable-real@1",
  "id": "optional-document-local-id",
  "subject": {},
  "snapshot": {},
  "recipe": null,
  "requirements": [],
  "metadata": {}
}
```

Required members are `schema`, `subject`, `snapshot`, and `recipe`.
`requirements` and `metadata` default to empty values. Unknown members are
retained by migration tools but do not affect mathematical identity unless a
future schema version says otherwise.

## 5. Exact scalar tags

Canonical exact scalars are:

```json
{ "$integer": "-1208925819614629174706176" }
```

```json
{ "$rational": ["-7", "12"] }
```

```json
{
  "$interval": [
    { "$rational": ["665857", "470832"] },
    { "$rational": ["886731088897", "627013566048"] }
  ]
}
```

Integer strings contain `0` or an optional leading `-` followed by digits,
with no `+`, whitespace, exponent, or leading zero. Rational denominators are
strictly positive. Writers reduce rationals and normalize zero to `0/1`.
Interval endpoints are ordered and closed. Infinity is not valid in a
singleton-real snapshot.

## 6. Subject records

The subject gives a representation-independent identity whenever RiX has one.
Version 1 recognizes the following kinds.

### 6.1 Named constant

```json
{
  "kind": "namedConstant",
  "semanticId": "rix.constant.pi@1"
}
```

The semantic ID names the constant, not a particular series for computing it.

### 6.2 Algebraic root

```json
{
  "kind": "algebraicRoot",
  "polynomial": {
    "coefficientDomain": "Q",
    "coefficientsAscending": [
      { "$integer": "-2" },
      { "$integer": "0" },
      { "$integer": "1" }
    ]
  },
  "rootIndex": "2",
  "isolatingInterval": {
    "$interval": [
      { "$integer": "1" },
      { "$integer": "2" }
    ]
  }
}
```

Import reruns the supported square-free/root-count checks. The stored root
index is not trusted by itself.

### 6.3 Unique root of a portable expression

```json
{
  "kind": "uniqueRoot",
  "variable": "x",
  "equation": {
    "schema": "rix.calculus.expression@1",
    "node": {
      "kind": "subtract",
      "left": {
        "kind": "power",
        "base": { "kind": "variable", "name": "x" },
        "exponent": { "$integer": "2" }
      },
      "right": { "kind": "constant", "value": { "$integer": "2" } }
    }
  },
  "domain": {
    "$interval": [
      { "$integer": "1" },
      { "$integer": "2" }
    ]
  },
  "uniquenessEvidenceRef": "evidence:root-1"
}
```

A function graph alone does not identify one real when it has multiple roots.
The domain and checked uniqueness evidence are part of this subject.

### 6.4 Expression over other saved reals

```json
{
  "kind": "expression",
  "graph": {
    "kind": "divide",
    "left": { "kind": "reference", "id": "pi" },
    "right": { "kind": "constant", "value": { "$integer": "2" } }
  }
}
```

References resolve only inside the containing document or an explicit supplied
object table. They never trigger filesystem or network lookup.

### 6.5 Effective limit

An effective limit subject stores a portable sequence descriptor plus a checked
tail modulus. A sequence without effective tail information may have a frozen
snapshot but cannot claim arbitrary refinement.

### 6.6 Definite integral

A definite-integral subject stores a portable integrand expression, exact
endpoints, orientation, domain obligations, and any singularity partition.
Quadrature is a recipe, not the identity of the integral.

### 6.7 ODE solution value

The planned subject is:

```json
{
  "kind": "odeSolutionValue",
  "problem": {
    "schema": "rix.ode.problem@1",
    "independent": "t",
    "stateOrder": ["y"],
    "rhs": [{
      "schema": "rix.calculus.expression@1",
      "node": {
        "kind": "variable",
        "name": "y"
      }
    }],
    "initialTime": { "$integer": "0" },
    "initialState": [{ "$integer": "1" }]
  },
  "time": { "$integer": "1" },
  "component": "y",
  "uniquenessEvidenceRef": "evidence:ode-1"
}
```

An approximate trajectory without a validated existence/uniqueness contract is
saved as an approximation result, not as a certified refinable singleton.

## 7. Snapshot record

The required snapshot shape is:

```json
{
  "interval": {
    "$interval": [
      { "$rational": ["1414213", "1000000"] },
      { "$rational": ["1414214", "1000000"] }
    ]
  },
  "status": "certified",
  "evidenceLevel": "proof",
  "verification": "checked",
  "evidence": [],
  "achievedWidth": { "$rational": ["1", "1000000"] },
  "work": {
    "calls": "18",
    "iterations": "6"
  }
}
```

`status` is one of:

- `certified`: the interval is proved to contain the subject under the listed
  assumptions;
- `assumed`: containment depends on caller assumptions not discharged by a
  portable checker;
- `approximate`: the interval is an error estimate, not a proof enclosure; or
- `unresolved`: the record retains a candidate/region without a containment
  claim.

`verification` is one of:

- `checked`: this importer replayed every required portable check;
- `providerChecked`: a compatible installed provider reran its check;
- `unavailable`: a required checker/provider is absent;
- `failed`: evidence was malformed or contradicted the subject/snapshot.

An imported document must not rewrite `unavailable` to `checked` merely because
the serialized record says `certified`. `failed` imports are data values with
diagnostics unless the caller requests fail-fast loading.

Evidence entries have versioned `schema`, `claim`, `premises`, `conclusion`, and
`checker` fields. Human-readable provenance is never a proof premise.

## 8. Recipe records

`recipe` is either `null` or one of the following closed families.

### 8.1 Built-in recipe

```json
{
  "kind": "builtin",
  "provider": "numerics",
  "algorithm": "machinPi",
  "algorithmVersion": "4",
  "parameters": {},
  "deterministic": true
}
```

Only installed manifest-declared algorithms can revive this record. Provider
and algorithm spelling are data, not dynamic code locations.

### 8.2 Expression recipe

```json
{
  "kind": "expression",
  "graph": {
    "kind": "sqrt",
    "argument": { "kind": "constant", "value": { "$integer": "2" } }
  },
  "allowedSemantics": ["rix.function.sqrt@1"]
}
```

The graph is the safe subset in section 9. Installed semantic implementations
are selected through ordinary capability negotiation.

### 8.3 Root recipe

```json
{
  "kind": "root",
  "algorithm": "intervalNewton",
  "algorithmVersion": "1",
  "expressionRef": "subject.equation",
  "derivativeEvidenceRef": "evidence:derivative-1",
  "initialIntervalRef": "subject.domain"
}
```

The recipe does not make uniqueness true. Revival first verifies the subject's
identity/evidence and then constructs a refiner.

### 8.4 ODE recipe

An ODE recipe names a solver family/version, references an inert
`rix.ode.problem@1`, and records validated-method parameters such as Taylor
order, step bounds, wrapping strategy, and event policy. It cannot embed an
arbitrary callback.

### 8.5 Arithmetic recipe

Arithmetic recipes are DAG nodes over saved real IDs using the supported field
operations and integer powers. Implementations may reconstruct them through
Oracle, Ball, Cauchy, or another compatible singleton-real provider; the
subject does not depend on which provider wins negotiation.

## 9. Safe expression subset

Version 1 permits:

- exact Integer and Rational constants;
- explicitly declared variables;
- references to document-local saved subjects;
- negation, addition, subtraction, multiplication, division;
- integer powers;
- calls by stable semantic ID to an importer-maintained allowlist; and
- immutable piecewise/case nodes with portable exact or certified predicates.

Version 1 forbids:

- assignment, mutation, loops, recursion, or reactive bindings;
- arbitrary RiX or JavaScript source strings;
- anonymous closure serialization;
- dynamic name lookup or method discovery;
- plugin installation/loading during import or refinement;
- filesystem, network, process, DOM, clock, locale, or environment access;
- unseeded randomness; and
- a provider callback claiming its own trust level without a registered
  checker/capability seal.

The allowlist is semantic, not spelling-based. For example, a node refers to a
versioned real exponential semantic ID rather than whatever callable happens to
be named `Exp` in the loading scope.

## 10. Revival state machine

Import proceeds without evaluation:

1. Parse JSON and validate exact scalar canonical forms.
2. Validate the subject and snapshot schemas.
3. Replay every available portable evidence checker.
4. Resolve recipe requirements without installing anything.
5. Produce one state:
   - `live`: checked snapshot and compatible inert recipe;
   - `frozen`: usable snapshot, recipe absent/incompatible/unavailable;
   - `unverified`: snapshot evidence cannot currently be checked; or
   - `invalid`: schema/evidence contradiction.
6. Only an explicit `Refine` request activates a `live` recipe under the
   request's work limits.

Every successful certified refinement must intersect compatibly with the saved
certified snapshot. A disjoint result is a provider/evidence failure, never a
reason to silently replace the old interval.

## 11. Requirements and compatibility

Requirements are descriptive capability constraints:

```json
[
  {
    "capability": "rix.numerics@2",
    "provider": "numerics",
    "minimumPluginVersion": "0.1.0",
    "algorithm": "intervalNewton",
    "algorithmVersion": "1"
  }
]
```

Import never installs missing requirements. Minor implementation revisions may
revive an older algorithm recipe only when the provider declares a compatible
migration. Otherwise the value remains frozen. Migrations preserve the original
record and append a migration event; they do not rewrite historical evidence.

## 12. Complete examples

### 12.1 Built-in pi

```json
{
  "schema": "rix.refinable-real@1",
  "id": "pi",
  "subject": {
    "kind": "namedConstant",
    "semanticId": "rix.constant.pi@1"
  },
  "snapshot": {
    "interval": {
      "$interval": [
        { "$rational": ["3141592", "1000000"] },
        { "$rational": ["3141593", "1000000"] }
      ]
    },
    "status": "certified",
    "evidenceLevel": "constructorGuarantee",
    "verification": "providerChecked",
    "evidence": [],
    "achievedWidth": { "$rational": ["1", "1000000"] },
    "work": { "calls": "14", "iterations": "7" }
  },
  "recipe": {
    "kind": "builtin",
    "provider": "numerics",
    "algorithm": "machinPi",
    "algorithmVersion": "4",
    "parameters": {},
    "deterministic": true
  },
  "requirements": [{
    "capability": "rix.numerics@2",
    "provider": "numerics",
    "algorithm": "machinPi",
    "algorithmVersion": "4"
  }],
  "metadata": { "label": "pi" }
}
```

### 12.2 Frozen but useful snapshot

```json
{
  "schema": "rix.refinable-real@1",
  "subject": {
    "kind": "opaqueSingleton",
    "stableName": "classroom.black-box-limit"
  },
  "snapshot": {
    "interval": {
      "$interval": [
        { "$rational": ["99", "100"] },
        { "$rational": ["101", "100"] }
      ]
    },
    "status": "assumed",
    "evidenceLevel": "declared",
    "verification": "unavailable",
    "evidence": [],
    "achievedWidth": { "$rational": ["1", "50"] },
    "work": { "calls": "0", "iterations": "0" }
  },
  "recipe": null,
  "requirements": [],
  "metadata": {
    "note": "The original anonymous procedure was intentionally not serialized."
  }
}
```

The second record is not arbitrarily refinable, but it still preserves exactly
what was saved and why it is not currently verified.

## 13. JSONL usage

One envelope may be written per line for a collection or refinement history.
JSONL does not change envelope semantics. Lines are independently parseable,
blank-line policy is explicit, and a reader must apply a maximum-record work
limit. Cross-line references are forbidden unless a preceding manifest assigns
stable IDs and bounds the reference table.

## 14. Historical design questions and execution defaults

The questions below are retained as design history. The 2026-09-19 umbrella
`ratmath/WORK_PLAN.md` task M7 settles the bounded implementation defaults:
reuse the existing general mathematical graph container; deterministic writer
ordering without a signing claim; opaque unverified snapshots; exact compatible
provider/checker versions; existing stable arithmetic/root/exp/log/trig IDs with
explicit branches; embedded bounded evidence. These are planned engineering
choices, not claims that recipe restoration is already implemented. Canonical
hashing/signatures and external evidence stores remain later scope. The
original recommendations were:

1. **Filename/media-type names:** accept the recommended `.rixreal.json` and
   media type, or use a general `.rix.json` container that can hold other RiX
   values too. Recommendation: define the general container later and keep this
   focused suffix now.
2. **Canonical byte hashing:** decide whether deterministic key ordering is
   merely a writer rule or a normative canonical-JSON profile used for content
   hashes/signatures. Recommendation: writer rule in Phase 3; normative hashes
   only when deduplicated object stores require them.
3. **Opaque subjects:** decide whether `opaqueSingleton` is allowed to retain an
   assumed snapshot or whether only semantically identified subjects may use
   this envelope. Recommendation: allow it, but never report arbitrary
   refinement or checked identity.
4. **Trusted-provider evidence:** define which provider guarantees survive a
   version change. Recommendation: require an exact compatible algorithm/checker
   version; otherwise preserve the snapshot as `verification=unavailable`.
5. **Expression allowlist:** finalize the initial semantic IDs after the
   Calculus registry IDs stabilize. Recommendation: arithmetic, integer powers,
   roots, exp/log, trigonometric functions, and explicitly selected branches.
6. **Large evidence:** decide when evidence moves to a separately addressed
   object. Recommendation: embed by default; permit document-local content
   references after deterministic hashing exists; never fetch evidence from a
   URL during import.

None of these decisions blocks JSONL relation support or the scalar interval
Newton API. They do block claiming that arbitrary algorithm reals can already
round-trip as live refiners.
