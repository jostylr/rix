# Radix plugin

`.radix` provides exact positional representations without treating an
unbounded repeating expansion as a harmless conversion. Load it with:

```rix
.Plugin.Load("radix");
```

Expansion, bounded period detection, digit generation, formatting, and the
Integer/Rational receiver methods are implemented in RiX. The former host
installer is retained only as `radix.reference.js`.

The plugin exposes namespace operations and matching methods on `Integer` and
`Rational` values:

```rix
(1/6).Expansion(10, {= maxDigits=1000 });
(1/7).Digits(10, {= count=20 });
(1/7).PeriodLength(10, {= maxWork=10000 });
(1/7).RadixString(10, {= maxDigits=1000 });
```

`Expansion` returns `rix.radix.expansion@1`. Its separate integer,
non-repeating, and repeating digit sequences are exact when `status` is
`"complete"`. When `maxDigits` is exhausted, it returns the digits computed so
far with `status="budgetExhausted"` and `truncated=1`; it never silently
materializes an arbitrarily large period.

`Digits` is finite by construction. `PeriodInfo` returns a bounded structured
result. `PeriodLength` is the scalar convenience form and throws on exhaustion,
directing callers to `PeriodInfo` when they need normal budget handling.
