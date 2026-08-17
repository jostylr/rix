# `.poly`

Provides semantic, callable univariate polynomials. The plugin is mounted as
`.poly` with `.polynomial` and `.p` aliases. All three names refer to the same
callable plugin object; portable source uses `.poly` as the canonical spelling.
The active implementation is [`poly.plugin.rix`](poly.plugin.rix): coefficient
normalization, arithmetic, division, derivatives, gcd/lcm, square-free and
rational-factor evidence, exact resultants, Sturm sequences, root counts, root
bounds, and primitive-integer normalization are all written in RiX.
[`poly.reference.js`](poly.reference.js) retains the former JavaScript plugin as
a comparison, while [`polynomial.js`](polynomial.js) is only an interoperability
adapter for host plugins that have not yet been ported.

```rix
.Plugin.Load("poly");

P := `x^3 - 6x^2 + 11x - 6`.P();
P(2);

Q := {#x# x^2 + 1}.P();
R := P(Q) + 3;
```

`P()` on a structural form infers its sole symbol. Use `P(:x)` when the form
contains more than one symbol. A symbolic specification supplies the declared
polynomial input and retains ordinary closure cells as live coefficients.

The callable namespace accepts the same sources:

```rix
A := .poly([1, 0, -1]);
B := .polynomial({#x# x^2 - 1});
C := .p`x^2 - 1`;
```

The last line is the outside-label form: the default structural backtick value
is passed to callable `.p`. A named parser header is available when the
indeterminate must be separated from contextual coefficients:

```rix
y := 4;
P := `.poly.Var(x):x^2 + y*x`;
P(2);                                  ## 12
```

Leading-dot casing identifies ownership, not value shape: `.poly` is a
host/plugin capability and is both callable and method-bearing. The older core
`.Poly` capability remains the general exact symbolic-spec compiler; it does
not attach the semantic `rix.polynomial@1` identity supplied here. The RiX
plugin uses that compiler as a syntax/IR bridge and owns the actual Polynomial
value and algorithms.

The plugin also demonstrates pure-RiX receiver extension. It registers `P()`
and `Polynomial()` on structural and symbolic values with
`.Host.RegisterMethod(type, name, callable, pluginId, mount)`. The extension is
visible only while the owning `.poly` mount is visible and cannot replace a
built-in method.

`.ratfun` declares `requires: [rix.polynomial@1]`; `.algebra` requires both the
polynomial algorithms and rational-function service; and `.algebraicReal`
requires `rix.polynomial.algorithms@1`. Loading any of those higher-level
plugins therefore loads this one first. Repeated `.Plugin.Load("poly")` calls
are harmless.

## Exact Phase 2 algorithms

`P.Gcd(Q)` and `P.Lcm(Q)` compute the monic result over exact rational
coefficients. The gcd of two zero polynomials is zero; an lcm involving zero is
zero. `.ratfun` uses this same public gcd when it canonically cancels a
RationalFunction.

`P.SquareFreeDecomposition()` returns a
`rix.polynomial.square-free@1` record containing the leading unit and monic
factors paired with their positive multiplicities. Its `verified` field is set
only after exact reconstruction equals the input polynomial.

`P.RationalRoots()` applies the rational-root theorem after clearing rational
denominators and making the resulting integer coefficients primitive.
`P.FactorEvidence()` returns a `rix.polynomial.factor-evidence@1` record with
distinct rational roots, exact linear factors and multiplicities, the residual
polynomial, and exact reconstruction verification. `complete` means that the
residual is constant; it does not claim that a nonconstant residual is
irreducible over the rationals.

`P.Resultant(Q)` constructs the Sylvester matrix and evaluates its exact
fraction-free Bareiss determinant. A zero result therefore certifies a shared
factor over the coefficient field without floating-point approximation. The
zero polynomial is rejected for rational-root, factor-evidence, square-free,
and resultant requests because those outputs would not have a finite canonical
interpretation.

`P.SignEvidence(q)` returns a `rix.exact.sign-witness@1` record from exact
evaluation at rational `q`; `P.SignAt(q)` returns its sign label directly.
`P.RootCountEvidence(interval)` returns a `rix.exact.root-count@1` Sturm
certificate for the distinct real roots. It first computes the exact
square-free part, so multiplicities cannot make the chain cycle or alter the
count. The interval convention is explicitly `(low, high]`, with endpoint
values and both sign-variation totals retained. `P.RootCount(interval)` is the
count-only convenience.
