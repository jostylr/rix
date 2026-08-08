# Rational-function plugin

`.ratfun` provides semantic, callable univariate rational functions over
exact rational coefficients. It is also available as `.rationalFunction` and
`.rf`; all three names refer to the same loaded plugin value. Loading it
automatically loads `.poly`. Loading `.algebra` automatically loads both.

```rix
.Plugin.Load("ratfun");
R := .rf`(x^2 - 1)/(x - 1)`;
S := (`1/(x + 1)`).R();
T := {#x# (x + 2)/(x - 2)}.R();
{: R(3), S(3), T(3) };
```

The constructor accepts two Polynomials, a record, a Polynomial or exact
scalar to lift, a structural form, or a single-input symbolic specification.
Use `.ratfun.Var(x):...` inside a backtick label or `.R(:x)` when a structural
form has more than one free symbol.

## Canonical value and domain policy

A `RationalFunction` is a fraction-field value, not a record of the source
expression. Construction and every operation:

1. expands numerator and denominator into exact coefficient Polynomials;
2. divides out their monic polynomial gcd; and
3. scales the denominator to be monic.

Thus `(x^2-1)/(x-1)` is the same value as `x+1`, and it evaluates to `2` at
`x=1`. `Domain()` reports the zeros of the *reduced* denominator as excluded.
Restrictions contributed only by cancelled source factors are deliberately not
preserved. The `.fracfun` plugin is the domain-aware, form-preserving workspace
for removable holes; keeping that concern separate prevents RationalFunction
equality from depending on source history.

## Operators and methods

`+`, `-`, `*`, `/`, unary `-`, exact integral `^`, `==`, and `!=` accept
RationalFunctions, Polynomials, and exact scalars where mathematically valid.
Polynomial division promotes to RationalFunction after this plugin is loaded;
negative Polynomial powers do likewise. Calls compose naturally with scalar,
Polynomial, or RationalFunction arguments. Composition may return the narrower
Polynomial type when canonical cancellation leaves denominator `1`.

Receiver methods include `R`, `RationalFunction`, `Numerator`, `Denominator`,
`Variable`, `Spec`, `Record`, `Evaluate`, `Compose`, `Canonical`, `Cancel`,
`Domain`, `IsPolynomial`, and `ToPolynomial`. `Cancel` and `Canonical` are
idempotent because values are normalized eagerly. `Record()` is a portable
round trip using schema `rix.rational-function@1`.

See [tutorial.md](tutorial.md) for a runnable lesson and
[design.md](design.md) for representation, presentation, and domain decisions.
