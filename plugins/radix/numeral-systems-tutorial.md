---
title: Exact numeral systems and place values
status: implemented
---

# One value, four positional families

`radix.System` constructs an immutable versioned descriptor. Core owns token,
place and carry arithmetic; RiX owns the explicit parser label. Names start with
a lowercase letter, following the existing host namespace. Construction and
Output JSON import do not register a parser. `Define` registers a new name in
the current host and rejects an existing capability with that name.

```{.rix exec=true}
.Plugin.Load("radix");
negative = .radix.System("negTwo",{= kind="negative",radix=-2,tokens=["0","1"] });
.radix.Define(negative);
[`.negTwo:110.1`,.radix.Format(negative,-7/3)[:literal]];
```

The first value is `3/2`. The canonical second spelling is
`` `.negTwo:10.#1` ``: negative bases carry the sign in their places.
`literal` exists only for a complete expansion and parses back to the exact
source. A leading explicit minus negates the complete numeral in every family.

| Family | Signed radix | Token values |
| --- | --- | --- |
| `ordinary` | Positive, 2–256 | `0..radix-1`, one Unicode character each |
| `multiToken` | Positive, 2–256 | `0..radix-1`, one or more characters per token |
| `balanced` | Positive odd, 3–255 | `-(radix-1)/2 .. (radix-1)/2` |
| `negative` | Negative, -256..-2 | `0..abs(radix)-1` |

Balanced and negative families also permit multi-character tokens. All alphabets
are **prefix-free**, case-sensitive sequences of exact Unicode code points.
Duplicate tokens, prefix collisions and numeral punctuation/whitespace are
rejected. There is no implicit longest-match or Unicode-normalization policy.

```{.rix exec=true}
.Plugin.Load("radix");
balanced = .radix.System("balancedTernary",{= kind="balanced",radix=3,tokens=["T","0","1"] });
words = .radix.System("digitWords",{= kind="multiToken",radix=3,tokens=["zero","one","two"] });
[.radix.Parse(balanced,"1T.1T"),.radix.Parse(words,"onezero.two"),.radix.View(balanced,"1T.1T")];
```

The view exposes exact place weights and contributions, integer carry steps,
canonical spelling and the full expansion record. Every carry obeys
`before = digit + radix * after`. Fractional steps obey
`after = radix * before - digit`. Ordinary fractions use a remainder in `[0,1)`;
balanced fractions use `[-1/2,1/2]`; base `-b` uses
`[-b/(b+1),1/(b+1)]`. Repeated exact remainders produce exact repeating blocks.
Boundary choices are deterministic and need not be the shortest spelling.

## Exact grammar and finite work

The existing labeled-backtick grammar accepts signed integers, `_` between
tokens, positional radix points, fractions, mixed fractions, `#` repetition,
finite simple continued fractions (`a.~b~c`) and signed radix shifts (`_^`).
Each numeric component uses the chosen alphabet and signed radix. Mixed fractions
follow the existing signed-whole convention and require nonnegative numerator
and positive denominator. Continued-fraction tails must evaluate to positive
integers. All four families support exact fractional/repeating place arithmetic.

Intervals, uncertainty/approximation markers, arbitrary expressions and parser
modifiers are deliberately rejected by this scalar numeral parser. Combine
separately labeled exact scalars with existing RiX interval/expression syntax.
This adds no interval or uncertainty spelling and changes no global input base.

```{.rix exec=true}
.Plugin.Load("radix");
decimal = .radix.System("decimalPlaces",{= radix=10,tokens="0123456789".Split() });
partial = .radix.Format(decimal,1/97,{= maxDigits=3 });
[partial[:status],partial[:literal],partial[:source],partial[:remaining],.radix.Format(decimal,1/97,{= mode="fraction" })[:literal]];
```

`maxDigits` defaults to 256 and ranges from 0 to 4096. In expansion mode it
bounds retained integer plus fractional digits. Fraction mode bounds each
integer component separately. Exhaustion returns `budgetExhausted`, exact source,
carry/remainder state and an explicitly incomplete `partial`; `spelling` and
`literal` are null. It never returns an approximate prefix as an exact numeral.

Inputs are limited to 65,536 characters, 4,096 digit tokens per component,
256 continued-fraction terms, radix-shift magnitude 4,096 and exact components
of 16,384 bits. An alphabet has at most 256 tokens of at most 32 code points.
Oversized inputs are diagnosed before unbounded parsing or output growth.

## Reversible locale adapters

```{.rix exec=true}
.Plugin.Load("radix");
decimal = .radix.System("decimalPlaces",{= radix=10,tokens="0123456789".Split() });
locale = {= point=",",group=" ",groupSize=3 };
localized = .radix.Locale(decimal,"12345.6#7",locale);
[localized,.radix.Locale(decimal,localized,locale,"parse")];
```

Locale adapters cover positional expansions and integer grouping only. They
validate canonical group placement and reject separator/token/grammar collisions.
They do not alter mathematical values, labels or the ordinary parser grammar.
Fractions/mixed/continued-fraction forms use the canonical scalar parser instead.

The Web **Exact numeral playground**, linked from Showcases, uses these same
public RiX functions. Its four presets, editable alphabets, digit budgets, exact
round-trip check, place/carry tables and static HTML/text/exact-source exports
also work from local bundles. Initial output remains visible without JavaScript.
