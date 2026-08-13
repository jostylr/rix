# Postfix checks and diagnostic taps

## Status

- [x] Define the surface syntax and compatibility boundary.
- [x] Tokenize `##@`, `##:`, and `##!` ahead of ordinary comments.
- [x] Parse postfix predicate, structural, and diagnostic forms.
- [x] Lower checks so the checked value is evaluated exactly once.
- [x] Implement semantic, structural, size, and tensor-shape checks.
- [x] Route `Debug`, `Trace`, `Info`, and `Log` taps through diagnostics.
- [x] Update the Quarto checker to execute native checks rather than duplicate them.
- [x] Add tokenizer, parser, evaluator, diagnostic, and documentation tests.
- [x] Update the syntax and developer documentation.

## Purpose

These operators make lightweight executable checks and observability available
inside ordinary RiX source. They are value-preserving: a successful check or
tap returns its left expression unchanged. They are therefore safe to stack
inside an assignment, pipeline, function body, or larger calculation.

```{.rix exec=false}
x := y + 2 ##: number ##@ < z
```

The right-hand arithmetic value is evaluated once, checked as numeric, checked
against `z`, and then assigned to `x`.

## Lexical compatibility

The no-space forms are language tokens:

- `##@` — predicate check
- `##:` — type/shape check
- `##!` — diagnostic tap

Existing comments remain unchanged:

```{.rix exec=false}
## ordinary line comment
##TAG## tagged block comment ##tag##
```

`##SETUP## ... ##SETUP##` remains Quarto/documentation preprocessing metadata;
it is not a runtime setup construct.

## Predicate checks: `##@`

`value ##@ operator rhs` evaluates the predicate with `value` as the implicit
left operand. A null result throws a check failure; any non-null result passes.

```{.rix exec=false}
x ##@ == 7
x ##@ > 0
xs ##@ |> IsSorted
```

The initial grammar accepts an infix operator after `##@`. This makes the
implied-left rule explicit and keeps normal RiX precedence intact. Multiline
subexpressions use grouping when a nested value needs its own check:

```{.rix exec=false}
x := (
  y ##@ > 7
) * 1/3 ##@ > 2
```

## Structural checks: `##:`

`##:` checks a structural collection kind or semantic membership. Optional
brackets check collection size or tensor shape.

```{.rix exec=false}
[1, 2, 3] ##: array[3]
{| 1, 2 |} ##: set[2]
{= name = "Ada" } ##: map[1]
{: 2, 3 } ##: tuple[2]
{:2x2: 1, 2; 3, 4 } ##: shaped[2x2]
value ##: number
value ##: :rational
```

`array`, `set`, `map`, `tuple`, and `tensor` are structural kinds. Other bare
names and colon names use RiX semantic membership (`? :name`). A failed check
throws and includes the expected specification and formatted actual value.

## Diagnostic taps: `##!`

Diagnostic taps evaluate their left expression once, emit a diagnostic event,
and return that same value.

```{.rix exec=false}
answer ##! Debug("answer")
Compute(x) ##! Trace("Compute", 3, ["x"])
model ##! Info("model", 2)
value ##! Dump("value")
value ##! Log("value")   ### convenient alias for Dump
```

- `Debug(label)` records source, a pretty IR form, and the final value.
- `Trace(label, depth, trackedVars?)` traces evaluation of the wrapped
  expression.
- `Info(label, depth?)` records a depth-oriented inspection event and the
  final value.
- `Dump(label)` records an unrestricted value dump event. `Log(label)` is a
  concise alias for the same diagnostic operation.

`.Error`, `.Stop`, and `.Test*` remain separate control-flow and test APIs.
They are deliberately not accepted as `##!` actions.

The default system intentionally leaves `.Log` unassigned. This keeps the name
available for a future exact Rational logarithm capability, while `.Dump`
remains the explicit diagnostic capability. The concise postfix action
`##! Log("label")` is an alias for `##! Dump("label")` and does not consume the
system name.

## Lowering model

Checks lower to lazy IR nodes. The evaluator evaluates the left node once,
binds the result only for the predicate evaluation, then returns that result.
Structural checks inspect that same concrete value. Diagnostic taps lower to
the existing lazy diagnostic facilities or dedicated value-tap equivalents.

Every check/tap IR node carries the source span of the whole postfix form so a
failure is annotated with ordinary RiX file, line, and column diagnostics.
