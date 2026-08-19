# Rational interval-set interchange versioning

Status: accepted and implemented for the current v1 lifecycle. V1 export,
normalizing import, structured future-version rejection, versioned schemas,
and the no-op migration-plan API have focused tests. A conversion CLI becomes
a release gate when a later stable odd version first creates a real migration.
The current version-1 records remain changeable until RiX 1.0 freezes them.

## Recommended decisions

1. Version 1 should be made deliberately complete, then frozen only when RiX
   1.0 is released. Before RiX 1.0 it is a mutable development contract.
2. Prefer new optional wrappers, new evidence schemas, or new mathematical
   types over a breaking range-set version. A value such as a complex region
   or algebraic-endpoint set is not automatically `RationalIntervalSet@2`.
3. A new runtime reads every released older range-set major version and
   migrates it in memory through bundled, lossless migrations.
4. Import does not force users to rewrite a file. Saving or explicitly
   exporting emits the current version and reports that migration occurred.
5. Forward migration of an exact range set must preserve the represented set
   exactly. It may never round, close an open endpoint, discard a component, or
   replace a union by its hull.
6. Unknown future versions are rejected with a structured version error; they
   are never guessed at.
7. After stable version 1, odd contract versions are stable and even versions
   are temporary experiments developed off main. Experimental version 2 is
   merged only after becoming stable version 3.

## Scope

The policy applies to the semantic `RationalIntervalSet` portable record:

- the RiX registered-type map currently carrying integer `version=1`;
- the Core tagged JSON form;
- the JSON schema used by range-provider and evidence records; and
- embedded copies of the range-set record in documents, caches, and plugin
  interchange.

Provider, result, and checker vocabularies have their own versions. Updating a
range-provider protocol does not by itself change the exact range-set version.

## Stability lifecycle

The `1` appearing in current schemas is not yet a stability promise. Until RiX
1.0:

- version-1 range, provider, result, evidence, and checker contracts may change
  to correct the design;
- repository code, fixtures, and documentation move together;
- migration support between pre-1.0 snapshots is optional; and
- nothing is called stable merely because its development identifier ends in
  `@1` or carries `version=1`.

RiX 1.0 freezes stable version 1. After that point contract development uses
the following lifecycle:

- odd versions (`1`, `3`, `5`, ...) are stable contracts on main;
- even versions (`2`, `4`, `6`, ...) are experimental and temporary;
- even-version work occurs on development branches, not main;
- experimental readers/writers require an explicit opt-in and carry no
  indefinite compatibility promise; and
- once an even draft is accepted, it is assigned the next odd version, gains
  migrations from earlier stable odd versions, and only then merges to main.

Thus a breaking successor to stable v1 incubates as experimental v2 but ships
on main as stable v3. Production migration is `v1 -> v3`, not a requirement to
persist or support the temporary v2 wire form forever.

## Complete version-1 meaning

Version 1 represents a normalized finite union of real components with:

- exact reduced rational finite endpoints;
- structural `-Infinity` only as a low endpoint;
- structural `+Infinity` only as a high endpoint;
- open/closed flags for finite endpoints;
- infinite endpoints always open;
- components sorted and normalized using exact set semantics; and
- an empty component array denoting the empty set.

The portable semantic value contains no work budgets, diagnostics, trust,
provenance, display rounding, or branch information. Those belong in an outer
result/evidence record. Cache fields are non-semantic and may be discarded.

### Selected envelope convention

Use the envelope conventions already established by each layer; do not invent
a third range-set-only schema-string envelope.

The canonical RiX registered-type envelope remains:

```text
{
  type: "RationalIntervalSet",
  version: 1,
  data: { components: [...] },
  cache: null
}
```

This matches other registered RiX values. The Core JSON adapter keeps Core's
existing `$ratmath` convention and adds the same integer version before RiX
1.0:

```text
{
  "$ratmath": "RationalIntervalSet",
  "version": 1,
  "components": [...]
}
```

Both forms use the same component payload and exact semantics, with tested
lossless adapters in both directions. The JSON schema gets a versioned `$id`;
the convenient `range-set.schema.json` name may remain an alias to the current
stable odd schema, but a frozen historical `$id` must never change meaning.

## What counts as breaking

A new major version is required for any change that can alter parsing,
validation, canonical meaning, or round-trip behavior, including:

- changing the meaning of `null`, infinity, or closure flags;
- changing whether components are required to be normalized;
- removing or renaming a required field;
- accepting a former invalid record with a different mathematical meaning;
- changing rational normalization or endpoint equality;
- changing the empty-set representation; or
- adding a required semantic field.

Clarifying documentation, improving diagnostics, optimizing normalization, and
adding invalid examples are not breaking if every valid v1 record retains the
same exact meaning and canonical export.

Because the v1 JSON schema is strict (`additionalProperties=false`), arbitrary
new fields should not be added inside the v1 semantic record. Extensible
metadata belongs in an explicitly designated outer `extensions` or result
record. This makes old validators reliably strict instead of accidentally
forward-compatible in some hosts and rejecting in others.

## Compatibility promise

The desired promise is:

> A newer RiX release accepts every valid range-set record written by an older
> supported release. If the value does not use a newly introduced feature, it
> behaves exactly as before. Migration is automatic in memory and exact.

For this small foundational exact value, every released stable odd major is
supported indefinitely, not only the immediately previous one. Experimental
even versions do not receive this promise. A reader may drop a stable
historical version only for a documented security or implementation reason
and only in a separately announced runtime major release.

A new stable odd major therefore means “the wire contract changed,” not “users
must manually rewrite all stored data.”

## Migration pipeline

Import should be explicit and deterministic:

1. Read the type and source version without interpreting version-dependent
   data.
2. Validate against the frozen source-version schema.
3. Canonicalize according to the source-version rules.
4. Apply pure migrations between stable odd versions (`v1 -> v3 -> v5`). An
   experimental branch may use temporary v2 transforms internally, but they
   are not part of the production migration chain.
5. Validate the target record against the target schema.
6. Construct both semantic values and check exact set equality whenever the
   old runtime representation is available.
7. Return the current in-memory value plus a migration report.

The report should include source and target versions, migration steps,
defaulted fields, warnings, and whether an explicit re-save would change the
stored bytes. For exact range sets, `dropped` and `approximated` must always be
empty; otherwise migration fails.

Opening or importing data should not mutate the source file. An explicit save
or current-version export may rewrite it after the user or host's normal save
policy applies.

Importing an older stable version should emit a structured, suppressible
`migrationAvailable` warning with source version, current version, and the
exact conversion command. Repeated in-memory conversion is safe but may be
unnecessarily expensive or noisy.

A migration command should therefore be supplied, conceptually:

```text
rix migrate path --to-current --check
rix migrate path --to-current --write
```

The first form validates and reports without writing. The second performs an
atomic explicit rewrite, preserves a backup according to CLI policy, and
prints a migration report. Merely opening a file never invokes `--write`.

## Export and downgrade

- Export writes the current version by default.
- An explicit old-version export is allowed only when the current value is
  exactly representable there and a tested reverse adapter exists.
- Failed downgrade returns a structured `notRepresentableInVersion` error.
- Export never silently chooses an older version because a peer appears old.
- Network/plugin negotiation selects a mutually supported version before
  sending; the sender then performs an explicit exact export to that version.

There is no promise that every new feature can be downgraded. The promise is
that unchanged old data can move upward without manual work.

## Unknown, malformed, and opaque records

An unknown future version cannot be used as a number or range. Normal numeric
import returns a structured `unsupportedFutureVersion` error containing the
type, encountered version, and supported versions.

A document editor may separately preserve the raw record as opaque data so it
can round-trip a document it does not understand. Opaque preservation does not
make the value available to arithmetic and must never substitute empty, zero,
all reals, or a hull.

Malformed records are errors in their claimed source version; migration does
not repair them by guessing. A separately named recovery tool may offer
interactive repair, but its output is new data with a repair report.

## Interaction with checker and provider versions

Range-set migration preserves a set, but evidence migration must also preserve
the theorem and trust chain. Therefore:

- a checker continues to interpret `range-checker@1` with the exact v1 rule
  vocabulary after experimental `@2` and stable `@3` exist;
- experimental even checker/provider schemas stay off main and are not treated
  as permanent interchange contracts;
- an evidence migrator may mechanically rename or wrap a rule only when the
  equivalence is itself checked;
- migration may not manufacture a missing premise or turn heuristic evidence
  into checked evidence;
- unresolved trusted-provider references remain unresolved after migration;
  and
- upgrading a nested range-set value does not upgrade its enclosing provider
  or evidence protocol version.

## Release process for a future stable version 3

Development starts as experimental version 2 on a branch. Before merging it
to main as stable version 3:

1. Freeze and retain the v1 schema and normative examples.
2. State why a new type or outer wrapper cannot solve the need more safely.
3. Write and test the experimental v2 schema and semantic differences without
   treating its spelling as permanent.
4. Review the experiment, assign the accepted contract stable version 3, and
   freeze its schema.
5. Implement the pure v1-to-v3 migration and migration report.
6. If practical, offer a best-effort explicit v2-to-v3 conversion for users of
   experimental builds, without granting v2 indefinite support.
7. Add golden v1 fixtures from every released writer.
8. Prove exact semantic equality before and after migration over those fixtures
   and property-generated cases.
9. Keep the v1 reader and tests in the supported runtime.
10. Document downgrade availability and any v3-only values.
11. Announce the change before any default exporter writes v3.

## Required version-1 tests now

- Golden empty, point, bounded, open, disconnected, and unbounded records.
- Canonical export after importing noncanonical but valid source data. V1
  intentionally accepts and normalizes unsorted, overlapping, and otherwise
  noncanonical component arrays that still denote valid components.
- Exact Core JSON to RiX-map round trips and the reverse.
- Rejection of closed infinite endpoints, reversed components, malformed
  rationals, and missing fields according to the final v1 rules.
- Rejection of unknown future versions without partial interpretation.
- Preservation of the source record when a document host uses opaque mode.
- A test that cache or extension metadata cannot alter mathematical equality.

When experimental v2 exists, keep its tests on its development branch. Before
stable v3 merges, add migration idempotence,
`v1 -> v3 -> export -> import`, warning/CLI tests, and exact
equality/property tests.

## Accepted review decisions

- Support every historical stable odd range-set major indefinitely.
- Follow existing envelopes: RiX uses `type/version/data/cache`; Core JSON uses
  `$ratmath` plus the same integer version and an exact adapter.
- Accept valid noncanonical component arrays and normalize them on import.
- Migrate automatically in memory without rewriting a file merely because it
  was opened.
- Warn when conversion is occurring and provide an explicit check/write
  migration command so stored data can be upgraded once.
- Keep every v1 contract mutable until RiX 1.0 freezes it.
- After v1, develop temporary even versions off main and merge only after the
  contract is assigned the next stable odd version.
