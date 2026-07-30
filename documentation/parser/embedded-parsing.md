# Backtick parsers and structural arithmetic

## Overview

Backticks fence source text for a secondary parser. The body is preserved
verbatim, including internal whitespace. An unnamed body uses the built-in
`.SArith` structural-arithmetic parser:

```rix
`6/4+2/4`       # Sum(6/4, 2/4)
`6/4 + 2/4`     # 8/4
```

A leading-dot header selects another parser object from the visible `.` system
context:

```rix
`.SArith:x^2 + 1`
`.SArith.Fun:x^2 + 1`
`.Poly:x^2 + 3/4 x^5 - 7`
`.myParser.Option:source text`
```

PascalCase roots such as `.Poly` are core RiX capabilities. CamelCase roots
such as `.myParser` are host/plugin capabilities. This is the same ownership
rule used by all other entries in the `.` registry.

## Header grammar

```text
backtickBody :=
    "." parserName ("." modifier ("(" names ")")?)* ":" body
  | ":" rawStringBody
  | defaultSArithBody
```

Examples:

```rix
`x + 1`                    # .SArith.Parse("x + 1")
`.Poly.Fun:x^2 + 1`        # .Poly.Parse(body, modifiers=[:Fun])
`:ordinary raw text`       # RiX string value
```

The leading dot is required for new named-parser syntax. Consequently, colons
in an unnamed secondary language are not automatically parser headers.

The removed uppercase-leading `LANG(context):body` syntax has no special
meaning. It is ordinary default `.SArith` text. Named parsers always use the
leading dot.

## Parser object protocol

The selected registry entry must be an object exposing a callable `Parse`
method. Conceptually, RiX invokes:

```text
parser.Parse(bodyString, modifierSequence, parseInfo)
```

`parseInfo` is a map containing:

- `function`: truthy when an uppercase assignment requests a function;
- `name`: the inferred uppercase function name, when present;
- `explicit`: truthy when the source used a leading-dot parser header.

Modifiers are parser-owned. `.SArith` accepts `Fun`, `Fun(name,...)`,
`Difference`, `Complex`, `Quaternion`, `Octonion`, and `Algebra(name,...)`;
`.Poly` accepts `Fun` as a compatible explicit-function marker.

The lookup uses the current visible system context. Script capability
restrictions therefore apply to backtick parsers just as they do to ordinary
dot capabilities.

## Multiple backtick delimiters

Any positive number of backticks may delimit a body. The closing delimiter
must contain the same number:

```rix
``.myParser:a `nested` body``
```Code: `one` and ``two`` ```
```

This avoids escape syntax when a secondary language itself uses backticks.

## `.SArith`

`.SArith` recognizes exact numbers, comments, identifiers, `@name` and
`@(expression)` splices, parentheses, implicit multiplication, and:

```text
+  -  *  /  ^  !  :
```

Touching operators construct raw forms. Operators separated from both operands
apply structural algebra:

```rix
`a+b`           # Sum(a, b), construction mode
`a + b`         # structurally add a and b

`6/4+2/4`       # Sum(Fraction(6,4), Fraction(2,4))
`6/4 + 2/4`     # Fraction(8,4)

`x+0`           # Sum(x, 0)
`x + 0`         # x
```

One-sided binary spacing is an error:

```rix
`a+ b`          # error
`a +b`          # error
```

Tight prefix/postfix notation colliding with a higher-precedence tight form is
also rejected instead of guessing:

```rix
`-x^2`          # error
`1/2!`          # error
`1/2^3`         # error

`- x^2`         # Negative(Power(x,2))
`-x ^ 2`        # Power(Negative(x),2), applied power
`(-x)^2`        # Power(Negative(x),2), constructed power
`(1/2)!`        # Factorial(Fraction(1,2))
`1/(2!)`        # Fraction(1, Factorial(2))
```

Structural operations remain in the structural domain. If a specialized
combination is unavailable, the result is an applied form rather than an
ordinary RiX evaluation:

```rix
`3/4 + x`       # Sum(Fraction(3,4), x)
```

Equal-denominator `Fraction` addition and subtraction preserve the denominator
instead of reducing:

```rix
`6/4 + 2/4`     # 8/4, not 2
```

Unequal denominators use their least common denominator while still returning
an unreduced `Fraction` presentation:

```rix
`1/2 + 1/3`     # 5/6 as Fraction, not Rational
```

### Exact literals and intervals

The number scanner is shared with ordinary RiX. Spellings that carry visible
presentation are retained as structural literals:

```rix
`1..3/4`        # MixedNumber presentation
`1.~2~3`        # continued fraction
`~1.~2~3`       # explicit-start continued fraction
`0xFF`          # built-in base prefix
`0z[7]123`      # explicit radix
`1.25[1]`       # uncertainty interval literal
```

Colon follows the same attachment rule as other binary operators:

```rix
`1:3`           # Interval(1, 3), preserved form
`1 : 3`         # applied RationalInterval 1:3
```

Line comments begin with `##`; block comments use `/* ... */`. A comment
separates tokens, so it participates in the same attachment checks as spaces.

Tight fraction coefficients bind before implicit multiplication:

```rix
`3/4 x^5`       # Product(Fraction(3,4), Power(x,5))
```

### Difference and algebra scopes

`Difference` is the default interpretation of tight subtraction, so these
forms are equivalent:

```rix
`1-x`                       # Difference(1, x)
`.SArith.Difference:1-x`    # Difference(1, x)
```

Algebra modifiers turn selected identifiers into basis units and collect the
result into Cartesian components:

```rix
`.SArith.Complex:3+4i`                  # Complex(3, 4)
`.SArith.Quaternion:1+2i+3j+4k`         # Quaternion(1, 2, 3, 4)
`.SArith.Octonion:1+2e1+3e7`            # Octonion(1, 2, 0, 0, 0, 0, 0, 3)
`.SArith.Algebra(u,v):3+4u+x v`         # Algebra[u,v](3, 4, x)
```

The profiles are opt-in. In ordinary `.SArith`, `i`, `j`, `k`, and `e1` are
normal free symbols. In an algebra profile its declared basis names are units;
all other identifiers remain symbolic coefficients. Consequently:

```rix
F := `.SArith.Complex.Fun:x+2i`
F(5)                                    # Complex(5, 2)
```

`F` has only the parameter `x`; `i` belongs to the Complex basis.

As elsewhere in structural arithmetic, tight multiplication preserves a
product while spaced multiplication applies the active algebra law:

```rix
`.SArith.Complex:i*i`                   # Product(i, i)
`.SArith.Complex:i * i`                 # -1
`.SArith.Quaternion:i * j`              # Quaternion(0, 0, 0, 1)
`.SArith.Quaternion:j * i`              # Quaternion(0, 0, 0, -1)
```

The quaternion and octonion tables use the Cayley-Dickson convention. Explicit
parentheses are retained during component interpretation, which matters
because octonion multiplication is not associative:

```rix
`.SArith.Octonion:(e1 * e2) * e4`       # e7 component is 1
`.SArith.Octonion:e1 * (e2 * e4)`       # e7 component is -1
```

`Algebra(name,...)` is the general linear-basis profile. It collects scalar
coefficients but deliberately supplies no multiplication table; products of
multiple basis terms therefore remain structural rather than inventing an
algebra law.

For repeated use, `Scope` returns another parser object with the profile
attached:

```rix
quaternions := .SArith.Scope(:Quaternion)
quaternions.Parse("i * j", [], {= })     # Quaternion(0, 0, 0, 1)

units := .SArith.Scope(:Algebra, :u, :v)
units.Parse("3+4u+x v", [], {= })        # Algebra[u,v](3, 4, x)
```

This is a parser-local scope: it does not change the meaning of identifiers
elsewhere in the surrounding RiX block.

`ToExact()` crosses from the presentation object into an ordinary RiX
algebraic value. Complex conversion uses the core `.Complex` capability.
Quaternion and octonion conversion requires the opt-in `exact-algebras`
plugin:

```rix
(`.SArith.Complex:3-4i`).ToExact()

.Plugin.Load("exact-algebras")
(`.SArith.Quaternion:1+2i+3j+4k`).ToExact()
```

For a general `Algebra` profile, each basis name is resolved in the surrounding
scope when `ToExact()` is called:

```rix
u := .Exact[:i]
(`.SArith.Algebra(u):3+4u`).ToExact()    # 3 + 4~{i}
```

## Symbols and outer splicing

An ordinary identifier becomes a free structural symbol:

```rix
`x + 1`
```

`@name` reads the current surrounding RiX value and lifts a snapshot into the
structural domain:

```rix
x := 6 / 4
`x + 1`         # Sum(Symbol("x"), 1)
`@x + 1`        # 5/2
```

Captured names do not become function parameters.

`@(expression)` parses and evaluates ordinary RiX source in the surrounding
scope, then lifts its result. Its balancing scan uses the RiX tokenizer, so
nested parentheses, strings, backticks, regular expressions, and system calls
inside the splice do not prematurely close it:

```rix
offset := 3
`@(offset^2 + 1)/4`          # Fraction(10,4)
`@(.Add((offset + 1), 2))+x` # Sum(6,x)
```

The expression is evaluated when the structural form is created. Reads,
assignments, calls, diagnostics, and other effects therefore retain their
ordinary RiX behavior. Names mentioned only inside the splice are captured
values rather than free structural symbols.

## Structural functions

`Fun` converts the parsed result to a RiX lambda:

```rix
F := `.SArith.Fun:y - x`
F(2, 5)         # 3
```

Free-symbol parameters are ordered alphabetically, independent of their first
appearance. Repeated symbols produce one parameter.

An argument list on `Fun` overrides inference, preserves the stated order, and
may include unused parameters:

```rix
F := `.SArith.Fun(y,x,unused):y - x`
F(5, 2, 99)     # 3
```

Every free symbol must still appear in the explicit list.

A structural backtick directly assigned to an uppercase identifier receives
the same function conversion automatically:

```rix
F := `y - x`    # parameters: (x, y)
```

Lowercase assignment retains the form:

```rix
f := `y - x`    # structural Difference/Sum value
```

If no free symbols exist, explicit or inferred function conversion creates a
zero-argument constant function:

```rix
Constant := `6/4 + 2/4`
Constant()      # 8/4
```

## Structural value methods

Forms, symbols, structural literals, and `Fraction` values expose:

```rix
(`x+1`).Head()             # Sum
(`x+1`).Arguments()        # [x, 1]
(`x+1`).Inspect()          # kind/head/mode/arguments/span map
(`x+1`).Render()           # "Sum(x, 1)"
(`6/4`).Collapse()         # reduced Rational 3/2
(`x*2/x`).Simplify(:x)     # 2, assuming x is nonzero
(`x+1`).SourceSpan()       # one-based [start, end]
```

`MapArguments(callable)` supplies a small, explicit transformation primitive.
Cancellation is conservative: symbolic factors cancel only when named as
nonzero assumptions; concrete nonzero factors need no assumption. Nested sums
and products with the same construction mode are flattened canonically.

## Configurable notation and RiX parser helpers

`.SArith.Configure` builds another parser from operator declaration maps:

```rix
tensorNotation := .SArith.Configure(
  {= symbol="⊗", head=:Tensor, fixity=:infix,
     precedence=90, associativity=:left }
)

tensorNotation.Parse("a⊗b", [], {= })  # Tensor(a, b)
```

Declarations support `infix`, `prefix`, and `postfix`; a callable `apply`
entry can define spaced operational behavior. Tight use always constructs the
declared head.

`.NotationParser(callable)` wraps a RiX function in the registered-parser
protocol. The callable receives `(body, modifiers, parseInfo)`. A trusted
package can register the returned object through the ordinary capability
registration API, so a parser plugin need not contain host JavaScript.

The CodeMirror support reads the leading-dot header and mounts the configured
secondary parser over the body. `.SArith` and `.Poly` are included by default;
editors can supply parsers for plugin names. Every constructed secondary node
retains a zero-based source span relative to the backtick body; `SourceSpan()`
exposes it to RiX as a one-based pair.

## `.RG.Parse`

`.RG` is the registered declaration language for ReactiveGraph plans:

```rix
graph := `.RG.Init.Set:
    $source1 := 2
    source source2 := 3
    target1 := source1 + source2
    target2 := target1 * 4
`
```

`$name` is local to the RG grammar and declares a source node; `source name` is
its word-form alias. An ordinary assignment declares a computed node whose
deferred RiX expression is evaluated by the graph. Top-level newlines and
semicolons both separate declarations.

`Init` creates a graph. `Set` makes it the current evaluation context's default
for later `.RG:` blocks. `.RG.Use(graph): ...` selects a graph for one block,
while `.RG.Set(graph): ...` also changes the default. Modifier arguments name
ordinary RiX graph bindings.

The programmatic protocol uses `.RG.Analyze`, `.RG.Init`, `.RG.Apply`,
`.RG.Set`, and `.RG.Use`. A deferred program marks sources explicitly:

```rix
plan := .RG.Analyze(@{
    source1 := .RG.Source(2);
    target1 := source1 + 1
});
graph := .RG.Init(plan)
```

The outer RiX parser still assigns `$` its existing callable-self meaning.
Only the RG parser interprets `$name` as a source declaration.

## `.Poly.Parse`

`.Poly` is both the existing polynomial compiler capability and a registered
backtick parser object. Its parser uses `.SArith` notation, converts the result
to the exact symbolic IR subset, alphabetizes its free inputs, and returns an
executable polynomial:

```rix
P := `.Poly:x^2 + 3/4 x^5 - 7`
P(2)            # 21
```

Unsupported symbolic forms fail rather than silently switching to approximate
arithmetic.

The completed implementation checklist is retained in the
[structural arithmetic implementation record](../design/eval/structural-arithmetic-todo.md).
