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
    "." parserName ("." modifier)* ":" body
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

The old uppercase-leading `LANG(context):body` AST syntax is still recognized
transitionally by the main parser. New code should use `.Name:body`.

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

Modifiers are parser-owned. `.SArith` currently accepts `Fun`; `.Poly` accepts
`Fun` as a compatible explicit-function marker.

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

`.SArith` recognizes exact numbers, identifiers, `@name` and `@(expression)`
splices, parentheses, implicit multiplication, and:

```text
+  -  *  /  ^  !
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

Tight fraction coefficients bind before implicit multiplication:

```rix
`3/4 x^5`       # Product(Fraction(3,4), Power(x,5))
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

The deliberately phased grammar and algebra work is tracked in the
[structural arithmetic follow-up list](../design/eval/structural-arithmetic-todo.md).
