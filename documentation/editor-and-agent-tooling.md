# Editor and coding-agent tooling

RiX includes a portable static language service, a stdio language server, a
desktop VS Code extension, a separate execution worker, and machine-readable
CLI commands. The implementation lives with RiX under `src/tools`, while the
extension package lives in `editors/vscode`.

## VS Code development build

Build the version-matched Node bundles before launching or packaging the
extension:

```bash
cd editors/vscode
bun run build
```

The resulting extension does not require Bun at runtime. VS Code launches the
bundled language server and evaluator worker using its Node-compatible desktop
runtime. Static parsing, highlighting, linting, navigation, and formatting
remain available in an untrusted workspace; execution does not.

The initial execution profile uses an explicit checked-in capability allowlist
and no plugins. Network, general files, background capabilities, dynamic
JavaScript imports, plugin loading, host/core registration roots, artifact
output, and renderers are absent. Check policy drift with:

```bash
bun run check:editor-policy
```

## Deterministic coding-agent loop

Use formatting as a non-mutating check first, then verify the exact file:

```bash
bun bin/rix.js format --check --json example.rix
bun bin/rix.js format example.rix
bun bin/rix.js verify --json example.rix
```

When verification fails, inspect static structure without evaluating source:

```bash
bun bin/rix.js parse --json example.rix
bun bin/rix.js symbols --json example.rix
bun bin/rix.js lint --json example.rix
bun bin/rix.js explain-scope --json example.rix:12:8
```

These commands emit versioned records. `verify` combines normalized static
diagnostics, structured `rix.execution/1` events, inline-check outcomes, and a
stable final summary. JSON Schemas are shipped in `schemas/`.

## Formatter profiles

The default `readable` profile is Candidate B: four-space indentation,
balanced multiline containers, and pipes at the beginning of an indented
continuation line. The explicit `compact` profile is Candidate A. Comments and
postfix `##@`, `##:`, and `##!` constructs remain on their logical source line.
Formatting refuses a source that does not parse and is idempotent for accepted
input.

## Current limitations

- Static symbols and references are document-local; imported definitions and
  plugin catalogs are not indexed yet.
- Signature help, selection ranges, range formatting, and LSP cancellation are
  not implemented yet.
- Inline checks appear in Test Explorer, but `.Test` group discovery is still
  pending.
- The first worker emits scalar/text results and check/log diagnostics. Rich
  preview, artifacts, external renderers, full HTML, and plugin CSS are not
  enabled.
- Forced timeout restarts the worker; cooperative evaluator cancellation and
  resource budgets beyond time/capability containment remain future work.

