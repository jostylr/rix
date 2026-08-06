# Custom operators

RiX supports statically declared, delimited infix operators. The delimiter is
`:<...>:` and declarations live in a tagged comment before executable code:

```rix
##OPS##
:<o+>: Mediant :infix :additive :none
##OPS##

Mediant(a, b) -> a + b
value := 2 :<o+>: 3
```

Declaration fields are separated by whitespace and their order is irrelevant.
Exactly one field must supply each meaning: operator spelling, callable target,
fixity, precedence, and associativity. RiX supports `:infix` with `:left`,
`:right`, or `:none`.

Named precedence bands include `:assignment`, `:pipe`, `:arrow`,
`:logical_or`, `:logical_and`, `:condition`, `:equality`, `:comparison`,
`:interval`, `:conversion`, `:additive`, `:multiplicative`, `:power`,
`:calculus`, `:postfix`, and `:property`. `:above` or `:below` places an
operator in the adjacent gap:

```rix
##OPS##
:<dot+>: DotAdd :infix :above :additive :left
##OPS##
```

A standalone declaration may target a system/plugin method explicitly:

```rix
##OPS##
:<o+>: .fractions.Mediant :infix :additive :none
##OPS##
```

Inside a plugin-owned operator file, the plugin is already known, so the short
target `Mediant` means the method on that plugin object rather than a global
function.

## Preloading

The CLI reads an optional leading YAML doc-comment before parsing a script:

```rix
/**
plugins: [fraction-ops]
operator-files:
  - ./project.operators.rix
**/
```

Paths are resolved relative to the script. A plugin can contribute operator
files from its own manifest:

```yaml
operator-files: [fraction.operators.rix]
```

Loading with `.Plugin.Load(...)` inside a complete source file is too late to
affect that file's parse. Use the source header, a CLI preload option, or a
plugin already loaded by the host. Runtime loading can make syntax available
to later REPL submissions.

For an interactive session, operator files can be supplied directly:

```sh
rix --operator-file=project.operators.rix
rix --preamble=project-preamble.rix
```

The default REPL preamble is `cli-preamble.rix` in the RiX configuration
directory. Its YAML header can preload plugins and operator files, and its body
can define functions and values used by the session. See [Getting started](../getting-started.qmd#persistent-repl-setup).

## Scope

There are no current plans for user-defined prefix, postfix, or n-ary custom
operators. Prefix notation such as negation or square root is generally as
clear as an ordinary function. Postfix notation has familiar special cases
such as factorial, percent, transpose, and derivatives, but the visible
`:<...>:` delimiter removes much of its ergonomic advantage. N-ary notation is
usually mixfix syntax—conditionals, slicing, bounded sums, or “between … and
…”—and requires a grammar template with several operand holes rather than an
operator token. Functions, methods, containers, and existing RiX syntax cover
those cases more clearly. Binary infix notation remains the intended custom
operator extension point.

Custom operator declarations are static for a parse. Undeclared operators,
conflicting declarations, duplicate fields, late `##OPS##` blocks, and chains
of `:none` operators without parentheses are errors.
