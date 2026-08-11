# `continued-fraction`

`continued-fraction` is a pure-RiX exact-real plugin for finite and lazy simple
continued fractions. It mounts callable `.continuedFraction` and the shorter
alias `.cf`, requires no JavaScript host approval, and implements the shared
bounded enclosure/refinement protocol.

## Finite values and parser interoperability

```rix
.Plugin.Load("continued-fraction");
q := .cf.Finite([3, 7, 16]);
q.Convergents();  ## [3, 22/7, 355/113]
q.Value();        ## 355/113

fromLiteral := .continuedFraction(3.~7~16);
fromLiteral.Coefficients();
```

The constructor accepts an exact Rational—including a value produced by RiX's
continued-fraction literal syntax—and recovers its canonical finite coefficient
sequence with `ToContinuedFraction()`. `Finite(coefficients)` preserves an
explicit finite sequence while `Value()` evaluates it exactly.

Coefficient indices use the conventional zero-based `a_0, a_1, ...` notation.
Convergent counts are positive and follow the existing RiX Rational convention:
`Convergent(1)` uses one coefficient.

## Lazy and periodic values

```rix
.Plugin.Load("continued-fraction");
root := .cf.Sqrt2();
root.Coefficients(6);  ## [1, 2, 2, 2, 2, 2]
root.Convergents(5);   ## [1, 3/2, 7/5, 17/12, 41/29]
root.Enclosure(4);     ## 7/5:17/12
```

`Lazy(rule)` reads coefficient `n` from `rule(n)`. `Periodic(prefix, period)`
builds a repeating rule, and `Sqrt2()` supplies the proven
`[1; overline{2}]` recipe. RiX validates every observed coefficient exactly:
`a_0` may be any Integer and all later coefficients must be positive Integers.

For an arbitrary lazy rule, positivity of all future coefficients is an
explicit constructor guarantee. `Sqrt2()` upgrades the evidence level to a
plugin-provided proof of its quadratic equation.

## Certified cylinders and refinement

For a positive simple continued-fraction tail, consecutive convergents lie on
opposite sides of the represented real. Their ordered RationalInterval is
therefore a certified cylinder. `ErrorInterval(n)` translates that cylinder so
the `n`-term convergent is at zero.

```rix
.Plugin.Load("continued-fraction");
.Plugin.Load("numerics");
root := .cf.Sqrt2();
result := .numerics.Refine(root, {=
  absoluteWidth = 1 / 1000,
  maxWork = 20
});
root < {~ 3 / 2, 1 / 1000 };
```

Finite values return an exact point enclosure immediately. Lazy values consume
at most one new coefficient per refinement call and retain the best certified
cylinder when the budget is exhausted.

Continued-fraction reals support `+`, `-`, `*`, `/`, integer powers, unary `-`,
and absolute value. Same-family and Rational operations retain
`ContinuedFractionReal` through an immutable enclosure recipe; unlike certified
families meet at Oracle. This does not pretend that general arithmetic has
already produced a new canonical coefficient stream.

Periodic quadratic recognition, best-approximation helpers, and native
continued-fraction transducers remain later work.

See [tutorial.md](tutorial.md).
