# Static linting and actionable diagnostics

RiX linting checks scope ownership, control flow, reactive boundaries,
mathematical intent, and plugin contracts without evaluating a program. It is
read-only by default: linting does not rewrite source, load plugins, or change
evaluator behavior. Source edits require the explicit `--fix` flag, and even
then only diagnostics carrying a safe replacement are applied.

## Levels and profiles

Lint one or more files, starting with the highest-confidence findings and
gradually widening the review:

```text
rix lint --level=essential program.rix
rix lint --level=standard program.rix
rix lint --level=thorough program.rix
rix lint --level=pedantic program.rix
```

The default is `standard`. Levels are cumulative: `essential` is level 1,
`standard` adds level 2, `thorough` adds level 3, and `pedantic` adds level 4.
Essential and standard prioritize actionable semantic problems. Thorough adds
heuristics that may need human confirmation. Pedantic adds convention and
style review. Diagnostic severity independently says whether a finding is an
error, warning, or note.

Profiles select relevant domains:

| Profile | Included concerns |
|---|---|
| `default` | Core semantics and syntax gotchas |
| `plugin` | Default checks plus plugin contracts |
| `reactive` | Default checks plus dependency and identity rules |
| `math` | Default checks plus exact arithmetic and refinement rules |
| `teaching` | Syntax, math, and reactive explanations useful in coursework |
| `pedantic` / `all` | Every domain, including style information |

Profiles can be repeated or comma-separated. Plugin files automatically use
the plugin profile unless an explicit profile is supplied.

Valid-but-noteworthy constructs such as dense conditionals, deliberate block
capture boundaries, function values, and capture-density suggestions live in
the `teaching` or `style` concerns. They do not dilute the default or plugin
profiles; request `--profile=teaching`, `--profile=pedantic`, or
`--profile=all` when that review is useful.

Warnings are advisory by default. CI can opt into failure on warnings:

```text
rix lint --strict plugins/my-plugin/my-plugin.plugin.rix
```

Use `--json` for editor/build integration, `--sarif` for SARIF 2.1.0, and
`--list-rules` for the installed rule catalog. Custom operators can be supplied
with `--operator-file=FILE`; a single `-` input reads standard input.
`--closed-plugin-set` treats the listed plugins as a complete dependency
closure and errors when a `requires` contract has no provider in that set.

## Explicit fixes and baselines

Ordinary lint is observational. This command is the opt-in boundary for source
edits:

```text
rix lint --fix program.rix
```

Currently only statically proven `@` capture-marker corrections are marked
safe. A diagnostic may suggest a larger refactor without exposing an automatic
edit. Standard input cannot be fixed.

A baseline supports incremental adoption without changing source:

```text
rix lint --write-baseline=lint-baseline.json existing.rix
rix lint --baseline=lint-baseline.json existing.rix new-code.rix
```

Writing a baseline is also explicit. Baselines key on rule, absolute file, and
message; new diagnostics remain visible.

## Local suppressions

Suppress a named rule and include a reason:

```rix
## rix-lint-disable-next-line RX1601 -- this definition intentionally snapshots the initial seed
$$frozen := seed + 1;
```

`rix-lint-disable-line`, `rix-lint-disable`, and `rix-lint-enable` are also
recognized. Codes can be comma- or whitespace-separated; `ALL` is available
for exceptional generated code. At pedantic level a suppression without `--
reason` produces `RX2002`. The API retains suppressed records separately.

## Coverage-assisted prioritization

`--coverage=FILE` accepts executed-line JSON and annotates/prioritizes findings:

```json
{
  "files": {
    "/absolute/path/program.rix": { "executedLines": [1, 2, 5, 8] }
  }
}
```

Findings are marked `observed`, `unobserved`, or `unknown`. Coverage changes
priority and evidence, never whether a static rule exists.

## Scope explanation

To inspect ownership rather than only warnings, select a source line or the
identifier nearest a column:

```text
rix explain-scope plugin.rix:42
rix explain-scope --json plugin.rix:42:18
```

Each entry reports whether the name is current, captured, missing a capture,
or incorrectly marked outer, plus its owning scope and suggested spelling.

## Rule catalog

| Code | Meaning |
|---|---|
| `RX1001` | A bare name belongs to an enclosing scope and needs `@` or an explicit import. |
| `RX1002` | `@name` points outward even though `name` belongs to the current scope. |
| `RX1003` | `@name` requests an enclosing binding that does not exist. |
| `RX1101` | A number is used directly as a decision; `0` is truthy. |
| `RX1102` | A conditional or loop may receive undecided `?` without handling/refinement. |
| `RX1201` | An identity-preserving update targets a statically known immutable value. |
| `RX1202` | `=` aliases a known mutable cell where copy assignment may be intended. |
| `RX1203` | The result of a known non-mutating collection method is ignored. |
| `RX1302` | A nested binding shadows an enclosing binding. |
| `RX1303` | A binding is initialized along only some conditional paths. |
| `RX1401` | No visible loop operation can change a binding used by its condition. |
| `RX1402` | One loop-control binding advances in both body and update slot. |
| `RX1403` | A closure created in a loop refers to a loop-local binding. |
| `RX1501` | A self-call is not in tail position and may consume unbounded stack. |
| `RX1601` | A reactive definition takes an untracked snapshot where `$name` may be intended. |
| `RX1602` | A `$$name` identity is used in an ordinary value position. |
| `RX1603` | In-place `$name` mutation has no visible `.Touch()` publication. |
| `RX1604` | Static `$name` edges form a reactive dependency cycle. |
| `RX1701` | Lowercase `f(x)` parsed as implicit multiplication, not a direct call. |
| `RX1702` | Literal index zero is used on a one-based collection. |
| `RX1703` | A string/collection is used with JavaScript-like emptiness assumptions. |
| `RX1704` | Ternary nesting is dense enough to obscure branch meaning. |
| `RX1705` | A single-expression block creates a capture boundary where grouping may be intended. |
| `RX1706` | A function binding is referenced as a value rather than directly called. |
| `RX1801` | Exact `/` versus truncating `//` deserves an intent check. |
| `RX1802` | Fraction equality may mean same stored pair or equivalent rational value. |
| `RX1803` | An exact value is explicitly converted to an inexact Float. |
| `RX1804` | A divisor is literal zero or an unguarded function parameter. |
| `RX1805` | Polynomial `/` needs the rational-function capability. |
| `RX1806` | Refinement has no visible precision/work budget. |
| `RX1901`–`RX1910` | Plugin header, exports, mount, dependencies, collisions, portability, schemas, mutation naming, idempotence, and capability groups. |
| `RX2001` | A lazy branch is capture-dense enough to consider extraction (style profile at thorough level). |
| `RX2002` | A lint suppression lacks an explanatory reason. |

Errors always produce a nonzero status. `--strict` additionally fails on
warnings, but not informational suggestions.

## JavaScript API

`lintRix(source, options)` returns ordered diagnostics. `analyzeRix` returns
`diagnostics`, `suppressedDiagnostics`, ownership `scopes`, and the resolved
level/profiles. Options include `level`, `profile`/`profiles`, plugin metadata,
custom operators, and a pre-parsed AST.

```javascript
import {
    applyRixLintFixes,
    formatLintDiagnostic,
    lintDiagnosticsToSarif,
    lintRix,
} from "rix";

const source = "x=1; {; x; };";
const diagnostics = lintRix(source, { file: "example.rix", level: "essential" });
for (const diagnostic of diagnostics) console.log(formatLintDiagnostic(diagnostic));

// This throws unless edit:true is supplied.
const fixed = applyRixLintFixes(source, diagnostics, { edit: true });
const sarif = lintDiagnosticsToSarif(diagnostics);
```

## Runtime assistance and scope model

The evaluator gives capture-direction hints when static linting was not run.
Selected lazy branches name their `?:`, `?_`, or `??` context; loop failures
name the condition/body/update phase and iteration; immutable `~=` failures
explain the identity-preserving contract.

The analyzer follows evaluator ownership rather than JavaScript visibility:

- a function owns its parameters and top-level body bindings;
- a standalone `{; ... }` owns a new isolated scope;
- a loop owns its header locals, and direct blocks in loop slots share it;
- a block used as a lazy branch is nested and needs explicit captures;
- direct function calls retain callable lookup behavior.

Dynamic plugin dispatch, host values, and alias effects can still require
runtime evidence. This is why levels, profiles, coverage annotations, and
reasoned suppressions are separate controls rather than pretending every
heuristic has the same confidence.
