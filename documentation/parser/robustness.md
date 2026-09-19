# Source bounds and editor recovery

RiX checks source size before tokenization, token and literal size during
scanning, parser recursion while parsing, and AST depth before lowering or lint
visitors run. These defaults are ceilings. A host may lower them through
`tokenize(source, { limits })`, `parse(source, lookup, { limits })`, or
`analyzeRixDocument(source, { limits })`. The public evaluation helpers accept
`sourceLimits` for the immediate source being evaluated. Imported/plugin source
uses the ordinary default ceilings unless its own host invocation lowers them.

| Limit | Default ceiling | Unit |
|---|---:|---|
| `sourceLength` | 8,388,608 | UTF-16 code units |
| `tokens` | 262,144 | non-End tokens, including comments |
| `tokenLength` | 1,048,576 | token code units, excluding leading whitespace |
| `numeralLength` | 65,536 | numeric token code units |
| `nodes` | 262,144 | AST nodes |
| `parseDepth` | 128 | nested expression parser calls |
| `astDepth` | 256 | nested AST nodes |
| `recoveryErrors` | 32 | lexical diagnostics per editor scan |

`RIX_SOURCE_LIMITS` exposes the defaults; `RixSourceLimitError` has code
`RXP1001`, `limit`, `maximum`, `offset` and `endOffset`. Unknown limits, nonpositive
values and attempts to raise a ceiling reject the host configuration. A long
left-associative expression is subject to the AST depth bound even though the
Pratt parser can build it iteratively. Token-array callers receive the same
count/length/depth checks.

Identifiers scan Unicode code points. Their positions, editor ranges and LSP
positions remain UTF-16 offsets, including letters outside the basic multilingual
plane. Case normalization follows the first letter, as before. Unsupported
numeric characters cannot silently disappear. Literal and identifier leaves
retain their own token spans rather than the following token's span. The
three token positions are leading-whitespace start, value start and token end;
quoted strings keep their existing content-start convention.

`tokenizeForEditor` returns `{ tokens, diagnostics, truncated }`. A lexical error
gets code `RXP1002` and a source range. Recovery marks the damaged remainder of
that line as `Invalid` and resumes at the next line. It is conservative: a damaged
multiline delimiter may produce several subsequent diagnostics. A limit failure
or the recovery diagnostic cap stops the scan. `analyzeRixDocument` retains later
symbol/completion information, reports `recovered`/`truncated`, and returns
`ast: null` after lexical failure. It reuses the single token scan for parsing and
folds. Delimiter and plugin-selector indexes are built in one pass; malformed
documents do not repeatedly rescan suffixes or infer function parameters. Strict parsing still rejects the original source and the recovered tokens;
recovery never supplies executable IR.

The seeded grammar/property suite verifies complete token-source reconstruction,
UTF-16 spans, deterministic AST lowering, malformed number/delimiter diagnostics,
large/deep inputs and recovery. Bare base descriptors such as `0x` remain valid;
digit/base validity is checked by number evaluation, including rejection of
`0z[2]102`.

These are portable counts and source-size guards, not a hard process memory or
wall-clock sandbox. A token matcher can scan up to the bounded source size;
large exact arithmetic and uncooperative host callbacks require evaluation
budgets and, when appropriate, an isolated worker/process boundary.
