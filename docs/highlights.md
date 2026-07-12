# RiX Highlights

Short glimpses of language features worth exploring. **TO ADD MORE.**

## Prepared values and ordered recovery

Validate or destructure a computed value without wrapping it in a function.
Soft gates return `_`—or advance inside `{?}`—while strict gates stop and throw:

```rix
answer := {?
  ReadPrimary() ?- value: [value ? :Integer] ?!- value: [value > 0];
  ReadBackup() ?- {: value, status }: [status == :ready];
  0
}
```

The first gate also chooses how errors from the candidate expression itself are
handled. Each candidate runs once, successful arms return that original value,
and all trial bindings stay local.

## Exact Cayley polar complex arithmetic

RiX can store an exact complex number as `Cayley(r, t)`, where `r` is its
nonnegative exact magnitude and `t = tan(theta/2)` is a stereographic direction
coordinate. This avoids transcendental angles while making multiplication,
division, integer powers, reciprocal, and conjugation algebraic:

```rix
z := .Complex.Cayley(1 + 1~{i});
z                              ## Cayley(sqrt2, sqrt2 - 1)
(z^3).Cartesian()              ## -2 + 2i
```

The negative real direction uses one projective `Infinity` point. Addition and
subtraction take an exact Cartesian bridge and return to Cayley form. See
[Exact Cayley Polar Complex Numbers](design/eval/cayley-polar.md).
