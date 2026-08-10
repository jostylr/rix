# Static linting and actionable diagnostics

RiX linting checks scope ownership and decision semantics without evaluating a
program. It is additive: linting does not rewrite source, load plugins, or
change evaluator behavior.

## Command line

Lint one or more files:

```text
rix lint program.rix
rix lint plugins/fraction/fraction.plugin.rix
```

Warnings are advisory by default, so the command exits successfully after
printing them. CI and plugin validation can opt into a nonzero exit status:

```text
rix lint --strict plugins/my-plugin/my-plugin.plugin.rix
```

Use `--json` for editor and build-tool integration. Custom operator files can
be supplied with `--operator-file=FILE`. A single `-` input reads standard
input.

To inspect ownership rather than only warnings, select a source line or the
identifier nearest a column:

```text
rix explain-scope plugin.rix:42
rix explain-scope --json plugin.rix:42:18
```

Each entry reports whether the name is current, captured, missing a capture,
or incorrectly marked as outer, together with its owning scope and suggested
spelling.

## JavaScript API

`lintRix(source, options)` returns ordered diagnostic records. Each record has
`code`, `severity`, `message`, `hint`, `file`, `line`, `column`, and `offset`.
`explainRixScopes(source, options)` returns identifier-ownership records for
editor integrations. `analyzeRix` returns both arrays in one parse.

```javascript
import { lintRix, formatLintDiagnostic } from "rix";

const diagnostics = lintRix("x=1; {; x; };", { file: "example.rix" });
for (const diagnostic of diagnostics) {
    console.log(formatLintDiagnostic(diagnostic));
}
```

## Initial rules

| Code | Meaning |
|---|---|
| `RX1001` | A bare name belongs to an enclosing scope and needs `@` or an explicit import. |
| `RX1002` | `@name` points outward even though `name` belongs to the current scope. |
| `RX1101` | A numeric literal or numerically defaulted parameter is used directly as a decision; `0` is truthy. |
| `RX1102` | A conditional or loop can receive undecided `?` without explicitly handling or refining it. |
| `RX1201` | `~=` or another identity-preserving update targets a value known statically to be immutable. |
| `RX1302` | A nested block or loop binding shadows an enclosing binding. |
| `RX2001` | A lazy branch has enough explicit captures that a helper with parameters may be clearer. |

`RX2001` is informational. The other initial rules are warnings. `--strict`
fails on warnings but not on informational style suggestions.

## Runtime assistance

The evaluator gives the same capture-direction hints when static linting was
not run. For example, a selected lazy branch can report:

```text
Undefined variable: numerator
RX1001: 'numerator' exists in an enclosing scope; use '@numerator' to capture it, or import it explicitly.
while evaluating '?_' branch
```

Loop failures identify whether the condition, body, or update failed and name
the iteration. Immutable `~=` failures explain that the operator preserves
cell identity and suggest an explicit rebind/copy or mutable state holder.

## Scope model used by the linter

The analyzer follows evaluator ownership rules rather than ordinary
JavaScript block visibility:

- a function owns its parameters and top-level body bindings;
- a standalone `{; ... }` owns a new isolated scope;
- a loop owns its header locals, and direct code blocks in loop slots share
  that loop scope;
- a block used as a ternary branch is nested and must capture enclosing names;
- direct function calls retain callable lookup behavior and are not mistaken
  for ordinary value captures.

The analyzer intentionally reports only immutable and undecided cases it can
infer with useful confidence. Dynamic plugin dispatch and values supplied by a
host may still require runtime diagnostics.
