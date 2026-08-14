---
title: Number input and display
---

RiX keeps numeric values separate from their notation. A Rational remains the
same exact value whether the session displays it as a decimal, binary
expansion, fraction, or several views at once. Ordinary unmarked literals are
always decimal RiX source; only literals beginning with `#` use the session's
active input base.

## Session shorthand

`*>` installs a comma-separated output profile. `<*` selects the base used by
subsequent `#` literals and, until an explicit display profile is set, also
selects that base for output.

```rix
*> ".[12],b,..";
7/4
```

The result is displayed as `1.75 · 1.11 · 1..3/4`: decimal with at most twelve
places, binary, and a decimal mixed fraction.

```rix
<* "b";
binary := #101;
ordinary := 101;
{: binary, ordinary }
```

This produces `{: 5, 101 }`. Changing the active base never changes the meaning
of ordinary decimal source.

The long forms are useful in generated programs:

```rix
.Config.NumInput("x");
.Config.NumDisplay(".[8],x,/");
.Config.Number({= input="b", display="b,.." });
.Config.Current()
```

## Display profile grammar

A profile is a comma-separated list. Whitespace around entries is ignored.

| Entry | Meaning |
|---|---|
| `.[n]` | decimal with at most `n` fractional places; `…` marks truncation |
| `..` or `mixed` | decimal mixed fraction |
| `/` or `fraction` | decimal improper fraction |
| `cf` or `.~` | continued fraction |
| `sci[n]` | scientific notation with `n` significant digits |
| `sci-period[n]` | scientific notation with repeating-period information |
| `b`, `o`, `x`, `u` | registered base prefix, without the leading `0` |
| `z[n]` | built-in positional base `n` |
| `b..`, `x..` | mixed fraction in that base |
| `b/`, `x/` | improper fraction in that base |

Display profiles are presentation only. A displayed `0.142…` is not a RiX
number literal and must not be used to reconstruct the value. RiX Web's result
insertion control uses the exact source value (`1/7`) instead of the displayed
text.

## Strict active-base literals

A single leading `#` begins one strict active-base token. Space, an operator, a
separator, or the end of input terminates it. The tokenizer keeps radix points,
repeat markers, mixed numbers, and continued fractions together:

```rix
<* "b";
{: #101, #101.1#10, #101..11/1100, #101.~11~10 }
```

The first `#` opens the numeral. In `#101.1#10`, the second `#` starts the
repeating period; it does not select a base. Dedicated `..` and `.~` syntax
propagates the active base through every following component. Thus the binary
continued fraction `#101.~11~10` has coefficients 5, 3, and 2. An ordinary
fraction is division rather than one dedicated literal, so both operands must
select the active base: `#101/#10`.

As with ordinary continued fractions, a leading `~` makes a signed first
coefficient explicit. It follows the base selector: in a binary session,
`#~-1.~10` represents the coefficients −1 and 2, and therefore the value
`-1/2`. Unary negation of the entire continued fraction remains
`-(#1.~10)`.

The linter reports a likely accidental mixture such as `#101/11`. It also
reports redundant or inconsistent inner markers such as `#101..#11/#1100`;
the canonical unquoted spelling has just one leading marker.

The whole payload is validated against the active base. Consequently,
`#face.ToString()` is not property access—it is an invalid hexadecimal numeral.
Parenthesize the literal: `(#face).ToString()`.

For a digit alphabet containing punctuation, `#\`...\`` captures the payload
verbatim. Prefer punctuation-free alphabets when possible because they are
easier to read and embed.

```rix
0P = {: 2, "0+", 0 };
<* "P";
#`++`
```

Here `+` is a digit rather than an addition operator, so the final expression
is three. Quoting is required for such a custom alphabet. Lossless `_>!`
output quotes every explicitly prefixed component automatically; for example,
`(3/2) _>! 0P` returns `"0P\"++\"/0P\"+0\""`.

Backticks delimit only one integer component. Consequently every component of
a composite punctuation-alphabet literal is separately quoted and marked:

```rix
mixed := #`++`..#`+`/#`+0`;
continued := #`++`.~#`+0`;
{: mixed, continued }
```

Both expressions are `7/2`. The deliberately repetitive spelling makes the
boundaries unambiguous even when `.`, `/`, `~`, or an operator is itself a
digit.

`##` remains comment/check syntax, `{#...}` remains a symbolic system spec, and
`#name` inside a `/.../` semantic header remains a sticky semantic name. Those
contexts are already delimited and therefore do not conflict with a leading
active-base numeral.

## Lossless output with `_>!`

`_>` returns presentation text. `_>!` instead requires a string that RiX can
parse to recreate the exact value. It adds an explicit registered prefix to
every necessary component:

```rix
source := (7/4) _>! 0b;
value := @@source;
{: source, value }
```

Here `source` is `"0b111/0b100"`. `_>!` fails if the requested base has no
registered prefix or the requested style has a digit limit. This makes failure
preferable to silently turning a display approximation into data.

## Balanced, negative-radix, and bijective systems

An uppercase custom prefix may be defined from `{: radix, digits, offset }`.
`offset` is the numeric value of the first digit.

```rix
0T = {: 3, "T01", -1 };  ## T=-1, 0=0, 1=1
0N = {: -2, "01", 0 };  ## negabinary
0K = {: 26, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", 1 }; ## bijective base 26
```

The codec uses the signed radix and digit values for both parsing and integer
formatting:

```rix
<* "T";
balanced := #1T;
<* "N";
negative := #1111;
<* "K";
bijective := #AA;
{: balanced, negative, bijective }
```

This yields `{: 2, -5, 27 }`. Fraction and mixed-fraction modes encode their
integer components in any generalized system—for example
`(5/2) _> (0T, "/")`. Radix-point and repeating-fraction notation is currently
restricted to conventional positive positional systems (`radix = digit count`
and `offset = 0`); generalized systems report a clear error instead of applying
an incorrect conventional-place algorithm. A bijective system has no spelling
for zero and likewise reports that fact.

## Host and JSON configuration

Hosts can pass the same settings without evaluating a directive:

```js
parseAndEvaluate(source, {
  context,
  numberConfig: { input: "b", display: ".[12],b,.." },
});
```

RiX workspace configuration accepts a `numbers` section:

```json
{
  "version": 1,
  "numbers": {
    "input": "b",
    "display": ".[12],b,.."
  }
}
```

The CLI's persistent `config.json` accepts the same section. RiX Web exposes it
through the **Numbers** panel; settings are session-scoped unless **Remember in
this browser** is selected.
