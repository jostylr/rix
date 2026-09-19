# Radix plugin

`.radix` provides exact positional representations without treating an
unbounded repeating expansion as a harmless conversion. Load it with:

```rix
.Plugin.Load("radix");
```

Expansion, bounded period detection, cloneable lazy digit streams,
configurable formatting, and the Integer/Rational receiver methods are
implemented in RiX. The former host installer is retained only as
`radix.reference.js`.

The plugin exposes namespace operations and matching methods on `Integer` and
`Rational` values:

```rix
(1/6).Expansion(10, {= maxDigits=1000 });
(1/7).Digits(10, {= count=20 });
(1/7).DigitStream(10, {= start=3, count=20 });
(1/7).PeriodLength(10, {= maxWork=10000 });
(1/7).RadixString(10, {= maxDigits=1000 });
61.RadixString(62, {=
    alphabet="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
});
1234567.RadixString(10, {= groupSize=3, groupSeparator="_" });
```

`Expansion` returns `rix.radix.expansion@1`. Its separate integer,
non-repeating, and repeating digit sequences are exact when `status` is
`"complete"`. When `maxDigits` is exhausted, it returns the digits computed so
far with `status="budgetExhausted"` and `truncated=1`; it never silently
materializes an arbitrarily large period.

`RadixString` uses `0123456789abcdefghijklmnopqrstuvwxyz` by default. Supply an
`alphabet` to format a larger base; each Unicode code point is one digit, the
first `base` glyphs are used, and active glyphs must be unique. The formatter
rejects glyphs that collide with the sign, radix point, repeat parentheses, or
truncation marker. For multi-token, balanced and negative-base systems, use the separate
[versioned numeral-system API](numeral-systems-tutorial.md).

Grouping is disabled by default. `groupSize` groups the integer digits from the
right and both fractional parts from the left. `integerGroupSize` and
`fractionGroupSize` override those sides independently, and `groupSeparator`
defaults to `_`. A used separator must be nonempty and cannot contain an active
digit or positional punctuation. These are formatting policies only: the exact
integer digit arrays in `Expansion` are unchanged.

`Digits` is finite by construction. `PeriodInfo` returns a bounded structured
`rix.radix.period-info@1` result. `PeriodLength` is the scalar convenience form
and throws on exhaustion, directing callers to `PeriodInfo` when they need
normal budget handling.

## Cloneable lazy digit streams

`DigitStream(base, options)` returns the native cached `lazy_sequence`
protocol with `rix.radix.digit-stream@1` metadata. It represents the
fractional digits of the magnitude; `sign`, `sourceNumerator`,
`sourceDenominator`, `base`, and the one-based `start` position remain
inspectable metadata. Integer digits remain available from `Expansion`.

```rix
digits := (1/7).DigitStream(10);
[digits[1], digits[6], digits[7], digits[8]];
```

Without `count`, the stream is unbounded: repeating expansions repeat and
terminating expansions emit exact trailing zeros. Pull it by positive index or
through `.Iterator()`; do not call `.Materialize()` on an unbounded stream.
Set `count` for a finite lazy window:

```rix
window := (1/7).DigitStream(10, {= start=3, count=5 });
window.Materialize();
```

The stream uses exact remainder recurrence after its initial offset, so it
does not form an enormous positional numerator for every successive digit.
The ordinary fresh-copy operator `:=` clones the current cache and recurrence
state; each copy can then advance independently. Deep copy `::=` restarts from
the declared `start`. This matches the core lazy-sequence cloning contract:

```rix
digits[3];
copy := digits;
copy[8];
restart ::= digits;
[digits[7], copy[8], restart[2]];
```

`count` may be zero and both `start` and `count` are bounded at one million,
matching the plugin's explicit work-bound policy. The metadata records
`clonePolicy=:cachedIndependent` and `deepClonePolicy=:restart`.

`Expansion` and `PeriodInfo` use the same generic bounded-work vocabulary as
`.numerics`: a `work` map records `total`, `iterations`, the active maximum, its
limit name, and `exhausted`. An exhausted result has
`status=:budgetExhausted`, leaves `goalMet` unknown, and includes
`:workBudgetReached` in `diagnostics`. The exact partial digits or denominator
state remain available for inspection.

## Versioned numeral systems and playground

[The executable numeral guide](numeral-systems-tutorial.md) covers `System`,
`Define`, `Parse`, `Format`, `Places`, `Locale` and `View`. Four bounded families
share Core arithmetic, explicit named parser registration, exact repeating
expansions and portable snapshots. The Web playground is linked from Showcases.
