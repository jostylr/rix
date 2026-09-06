# Mathematical graph JSON, version 1

Status: implemented for current core expression values. This is not a runtime
scope dump or a serialization of arbitrary RiX objects.

## API and encoding

`MathEncodeJSON(value)` returns a JSON string; `MathDecodeJSON(text)` returns
the decoded value with fresh document-local identities. `MathEncodeJSONL`
accepts a finite sequence/tuple and writes one independent document per line.
`MathDecodeJSONL` returns a sequence; a failure reports its physical line.
These bounded convenience APIs materialize their text/results, not a streaming
transport. Hosts can process individual documents incrementally. Existing
`.data` JSONL row-source APIs remain available for tabular streaming.

Suggested suffix: `.rixmath.json`, or `.rixmath.jsonl`. UTF-8 is the file
encoding; the API accepts/returns RiX strings. Writers emit compact JSON with
stable traversal/property order for an unchanged input value. This is not a
canonical algebraic normal form or a cross-process hash.

```json
{
  "schema": "rix.math.document@1",
  "root": {"$ref":"n0"},
  "nodes": [
    {"id":"n0","kind":"tuple","values":[{"$ref":"n1"},{"$ref":"n2"},{"$ref":"n1"}]},
    {"id":"n1","kind":"symbol","name":"x","bound":false,"definition":null},
    {"id":"n2","kind":"symbol","name":"y","bound":false,"definition":{"$ref":"n3"}},
    {"id":"n3","kind":"operator","operation":"subtract","operands":[{"$ref":"n1"},{"$integer":"0"}]}
  ]
}
```

This records `(x,y,x)` with `y=x-0`. The two references to x share identity;
the y definition refers to that same x. Loading twice creates two independent
identity sets. Loading never introduces `::x` into a programming scope. Names
are display labels, not identity keys. Constructor-based name-only symbols are
interned by name while saving and become fresh identity-bearing symbols when
loaded; old name-based algorithm consumers must not be assumed compatible.

## Tagged values

`root` and all value-bearing node fields use these exact forms:

| Form | Meaning |
| --- | --- |
| `null` | RiX `_` |
| `{"$undecided":true}` | RiX `?` |
| `{"$string":"text"}` | RiX string |
| `{"$integer":"-123"}` | Exact Integer |
| `{"$rational":["-7","12"]}` | Reduced Rational with positive denominator |
| `{"$ref":"n3"}` | Document-local node reference |

Integers use canonical decimal spelling: no plus sign, leading zeros, or
negative zero. Rational components obey the same spelling and must already
be reduced. Mathematical scalars never pass through JSON floating-point
numbers. Exponents in exact-generator monomials are bounded JSON integers.

## Node records

Every node has exactly `id`, `kind`, and the fields listed below. IDs match
`n` followed by decimal digits and must be unique. Forward references are
allowed. Every referenced node must exist; cycles—including definition
cycles—are rejected. Unreachable records are also validated.

| Kind | Additional required fields |
| --- | --- |
| `symbol` | `name` nonempty string, `bound` boolean, `definition` tagged value or null |
| `constant` | `value` tagged supported scalar |
| `operator` | `operation` string, `operands` array of tagged expressions/scalars |
| `apply` | `semanticId` string, `name` string, `arguments` array of tagged expressions/scalars |
| `interval` | `start`, `end`: tagged finite exact scalars, preserving original order |
| `generator` | `name`, `category` strings; `real`, `positiveRoot` booleans; `polynomial`: null or ascending tagged rational coefficients |
| `exact` | `terms`: array of `{coefficient,powers}`, where `powers` is an array of `[generator-reference,exponent]` pairs |
| `tuple`, `sequence` | `values`: array of tagged values |
| `map` | `entries`: array of `[string-key,tagged-value]` pairs; no duplicate keys |
| `real` | `envelope`: frozen singleton-real envelope below |

Operators are `add`, `subtract`, `multiply`, `divide`, `power` (arity 2), and
`negate` (arity 1). Function applications are inert expression data: decoding
does not resolve a semantic ID or call it. Exact generators acquire fresh
identities; their defining polynomials are normalized by the existing exact
scalar constructor, not evaluated as source code. Exact terms cannot repeat
the same generator within a monomial or duplicate a monomial. Bound symbols
cannot have definitions. Definitions must themselves be supported expression
values. Unsupported node kinds, extra fields, and callables are errors.
Generator `real`/`positiveRoot` flags remain algebra declarations; importing
them is not independent root-isolation or positivity verification.

Sequence order, tuple shape, exact scalar components, definitions, and shared
symbol/generator/real identities survive. Objects' `_ext` metadata, method
tables, execution scopes, callbacks, cells, and aliasing of programming cells
do not. Maps are restored as immutable data records; no imported field becomes
a JavaScript prototype property.

## Mathematical contexts

Current context values are encoded as ordinary map nodes, retaining result,
binders, assumptions, and normalized domain records. Import changes
`consistency` to `:unresolved` and adds `validation=:unverifiedImport`.
This preserves the mathematical statements without trusting serialized
consistency claims. Import is not a theorem checker, binder-normalization
pass, or automatic assumption application. Consumers must validate context
semantics before using them for proofs or numerical guarantees.

## Frozen real envelope

The `real` node uses the frozen opaque-subject subset of the existing
`rix.refinable-real@1` design:

```json
{
  "schema":"rix.refinable-real@1",
  "subject":{"kind":"opaqueSingleton","stableName":"n4"},
  "snapshot":{
    "interval":{"$interval":[{"$rational":["7","5"]},{"$rational":["3","2"]}]},
    "status":"certified",
    "evidenceLevel":"proof",
    "verification":"unavailable",
    "evidence":[],
    "achievedWidth":{"$rational":["1","10"]},
    "work":{"calls":"0","iterations":"0"}
  },
  "recipe":null
}
```

`stableName` is document-local, not a global name or network locator. The
saved evidence level and certification status are provenance claims, not
imported authority. Current readers accept status `certified`, `assumed`,
`approximate`, or `unresolved`, but always expose the loaded real as a frozen
snapshot with evidence `:declared`, `validation=:unverifiedImport`, and
`refinable=_`. `savedEvidenceLevel` retains the claim. The enclosure width is
checked exactly. Work counts here describe import/refinement work, not the
original provider's historical work; both are zero. Evidence arrays must be
empty, verification unavailable, and recipe null in this implemented profile.

The loaded snapshot remains a singleton subject with an enclosure, not an
interval-valued set. Repeated references share its fresh opaque identity.
`ExpressionRefine` reports that no recipe is installed. Export never saves
anonymous RiX/JavaScript closures, captured environments, plugin code, or
host resources. Non-null recipes are rejected until an explicit allowlisted
restoration API is implemented. Loading does not load plugins, run algorithms,
read files, access a network, or register symbolic definitions in user scopes.

## Resource limits and JSONL

Each document is limited to 2,000,000 UTF-16 code units of API text, 10,000
nodes/items per array, depth 128, and 1,024 characters per decimal integer.
Exact-generator polynomials have at most 64 coefficients; monomial exponents
are positive safe integers at most 10,000. A 100,000-element expanded-graph
budget rejects compact DAGs that would explode in downstream tree traversal.
Readers use the platform JSON parser, followed by strict tag/record checking.

JSONL is limited to 1,000 records and the same total text limit. LF and CRLF
are accepted; one final newline is optional. Blank interior records are
errors. Each line gets its own identity table: two saved `::x` values on two
lines are different loaded symbols. To preserve shared identity across values,
save them in one tuple/map document. A decode failure returns no partial
result and leaves the programming scope unchanged.
