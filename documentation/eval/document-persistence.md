# Saving portable output

The opt-in `document` plugin saves an evaluated output tree without keeping an
execution scope, reactive handle, callback, or filesystem grant. Loading never
fetches an asset, runs a recipe, imports a plugin, or evaluates RiX source.

```{.rix exec=true}
.Plugin.Load("document");
report := .Fragment([
    .Paragraph([.Strong("Exact results"), 1/3]),
    .Table(["oriented interval"], [[5:4]])
]);
saved := .document.EncodeJSON(report);
imported := .document.DecodeJSON(saved);
.document.EncodeJSON(imported[:value]) == saved ##@ == 1;
imported[:diagnostics].Len() ##@ == 0;
```

`DecodeJSON` returns a map with `value`, `diagnostics`, and `schema`. Display its
warnings alongside the imported value. `EncodeJSON` returns a String and does
not write a file. The host JavaScript functions `encodeOutputJSON`,
`decodeOutputJSON`, and `snapshotOutputDocument` are exported from RiX and its
runtime entry point, with the same behavior in CLI, Web, and Notebook hosts.

## Live widgets become explicit snapshots

Call `.document.Snapshot(value)` before persisting a live tree. It captures
current control values and selected Sheet planes, removes reactive/action
handles, disables controls, and turns draggable points/actions into static
circles/groups. It never invokes an action. The original tree stays live.

```{.rix exec=true}
.Plugin.Load("document");
$$amount := 1/2;
panel := .ControlPanel([.Controls.Slider($$amount, 0:1, 1/10, "Amount")]);
portable := .document.Snapshot(panel);
.document.DecodeJSON(.document.EncodeJSON(portable))[:value];
```

A direct attempt to encode live controls, bindings, functions, promises, host
objects, or accessors fails. Imported Sheet snapshots retain safe `Index`/`At`
lookup over saved cells; an unsaved plane is unavailable, not lazily evaluated.
Frame-aware mathematical tensor graphs require the separate Linalg identity
import adapter; bare Shaped and rank-two Matrix values are supported now.

## Import policy and limits

The `unknownTags` option is one of:

- `"warn-and-skip"` (default): replace an unsupported record with visible text
  and a source-path warning. Required malformed known records still fail.
- `"strict-error"`: reject an unsupported tag.
- `"preserve-opaque"`: show the same fallback while retaining bounded inert
  data for re-export. This never installs behavior for the unknown record.

Exact integers/rationals, formal unreduced Fractions, interval endpoint order,
certified approximation enclosures/source sharing, undecided values, collection
sharing and mathematical graph identities survive. Scoped mathematical imports
create fresh runtime identities while preserving sharing within the document.
Unscoped rational Calculus graphs retain their name-based structure as inert
records, so saved derivative selectors and checked numerical evidence can be
replayed without inventing a new symbol binding. Live extension methods are
omitted from these known graph records.

Defaults are 4,000,000 UTF-8 bytes, 20,000 graph nodes, 100,000 traversal steps,
128 nesting levels and 4,096 integer characters. Options `maxBytes`, `maxNodes`,
`maxEdges`, `maxDepth`, and `maxDigits` can lower them or raise them by at most a
factor of sixteen. The strict mathematical subgraph keeps its own independent
limits. Cycles, dangling/duplicate identities, unsafe keys, nonfinite numbers,
missing required fields and oversized records fail with an error code and path.

## Version-one wire contract

`rix.output.document@1` contains `root`, a document-local `nodes` table, and an
optional strict `rix.math.document@1` graph. References are `{"$ref":"n0"}`;
IDs are traversal-order identifiers, not global identities or signed hashes.

Each node has exactly `id`, `tag`, and `data`. Tags `integer`, `rational`,
`fraction`, `interval`, `certified`, `shaped`, `undecided`, `hole`, `array`, `map`,
`record`, and `math` have explicit scalar/collection forms. `output:KIND` carries
ordered name/value pairs for a validated core output record. Numbers embedded
as native JSON numbers are host presentation data, never exact RiX integers or
rationals. Mathematical expressions share one strict graph across the tree.

Intrinsic methods are rebuilt from installed constructors and never saved.
Metadata, labels, captions, references, asset declarations, styles and evidence
remain ordinary inert data. Unknown-tag import does not change strict Core
mathematical decoding. Existing `rix.control-panel` version-one JSON migrates
on import and emits an informational diagnostic. No general legacy reader or
implicit source execution is provided.

To move images/audio/video together with a saved document, use the
[portable asset bundle APIs](output-assets.md). Plain document JSON retains
asset references and never resolves their bytes.


The `interval-set` scalar tag retains normalized rational interval-set components
with exact nullable endpoints and explicit closure flags. `null` means negative
infinity on the lower side and positive infinity on the upper side; infinite
endpoints must be open. Empty sets and closed singleton components round-trip.
Malformed, reversed, overlapping or unsorted wire components are rejected rather
than silently normalized. The ordinary digit, edge, node and depth budgets apply.


The `fraction-interval` tag stores two exact Fraction references in their stored
low/high order, without reducing endpoint representations. Formal Fraction
values may retain nonzero numerators over zero as signed infinity, using the
existing explicit infinite-Fraction constructor policy. `0/0`, reversed interval
endpoints, non-Fraction endpoints and infinite Rational values are rejected.
