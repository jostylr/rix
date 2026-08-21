# `algebraic-real`

`algebraic-real` is a pure-RiX exact-real plugin. It represents one real root
of a square-free integer polynomial by a rational isolating interval, a
certified one-based root index, and exact Sturm evidence. It mounts callable
`.algebraicReal` and the shorter `.ar` alias. It requires the pure-RiX `.poly`
algorithm service and needs no JavaScript host approval.

```rix
.Plugin.Load("algebraic-real");
root := .ar.Root([-2, 0, 1], 1:2, 2);
root.Sign();                 ## :positive
root.CompareRational(3/2);   ## :less
root.RootIndex();            ## 2
```

Coefficient arrays use ascending power order. Thus `[-2, 0, 1]` means
`x^2 - 2`. The constructor removes integer content and chooses a positive
leading coefficient, so `[-4, 0, 2]` has the same stored polynomial.

## What the constructor certifies

`Root(coefficients, interval, rootIndex)` performs exact checks before it
creates a value:

- every coefficient is an Integer and the polynomial has positive degree;
- the canonical `.poly` primitive polynomial is square-free, using its exact
  polynomial remainder sequence;
- neither rational interval endpoint is a root;
- a Sturm sequence counts exactly one distinct real root in the interval;
- a Cauchy root bound plus another Sturm count verifies the supplied one-based
  index among all real roots.

The retained evidence names the normalization, endpoint signs, root count,
root index, root bound, and Sturm-chain length. Values are immutable.

`Polynomial(coefficients)` returns the same canonical callable Polynomial type
as `.poly`, after primitive-integer normalization and square-free validation.
`Evaluate`, `Derivative`, `SturmSequence`, `RootCount`, `RootCountEvidence`,
and `IsSquareFree`
delegate to that Polynomial service. Algebraic-real owns only root-facing
policy: isolating intervals, root indices, evidence, exact comparisons, and
refinement. There is no second algebraic-real polynomial object.

## Exact sign, comparison, and refinement

```rix
.Plugin.Load("algebraic-real");
.Plugin.Load("numerics");
root := .ar.Sqrt2();

root.Sign();
root.CompareRational(7/5);   ## :greater
.numerics.Refine(root, {= absoluteWidth=1/1000, maxWork=20 });
root < {~ 3/2, 1/1000 };
```

`Sign()` and `CompareRational(q)` are exact. `SignEvidence()` exposes the same
decision as a portable `rix.exact.sign-witness@1` certificate. If zero or `q` lies inside the
stored interval, Sturm counts decide which side contains the isolated root;
overlap is not treated as equality. A rational is equal only when exact
polynomial evaluation proves it is the isolated root.

`Enclose` and `Refine` implement the shared bounded Numerics protocol. Exact
sign bisection halves the rational interval until the requested width is met
or the call/iteration budget is exhausted. The result remains a certified
enclosure in either case, and Halo comparisons consume that protocol directly.

## Portable serialization

`root.Export()` returns a `rix.algebraic-real.export@1` record containing the
canonical coefficients, original isolating interval, root index, name, and
evidence. `.ar.Import(record)` reconstructs the value and reruns every
certificate check; it does not trust serialized proof claims blindly.

## Exact Phase 2 field arithmetic

Algebraic reals support `+`, `-`, `*`, `/`, integer powers, unary `-`, and
absolute value. For two isolated algebraic/Rational operands, Phase 2 now
constructs the exact elimination polynomial, takes its square-free part, and
isolates the result root with operand interval arithmetic and Sturm counts.
The result is another ordinary `rix.algebraic-real@1` value, not an
approximation recipe.

```rix
x := .ar.Sqrt2();
sum := x+x;       ## a root of z(z^2-8), isolated in 2:4
product := x*x;   ## the isolated root 2 of z^2-4
quotient := x/x;  ## the isolated root 1 of z^2-1
{: sum.Coefficients(), product.CompareRational(2), x > 7/5 };
```

For `+` and `-`, RiX eliminates `x` from `f(x)` and `g(z-x)` or
`g(x-z)`. Multiplication uses `x^m g(z/x)`, and division eliminates between
`g(y)` and `f(zy)`. The univariate resultants are evaluated at enough exact
integer values to reconstruct the result polynomial by exact Lagrange
interpolation. No Float sampling is involved. The retained evidence records
the operation, degree bound, elimination method, operands, and number of
isolation refinements.

`Compare(other)` and the ordinary ordering operators subtract algebraic
operands through that exact path and decide the sign by Sturm isolation.
Rational comparisons retain their faster direct polynomial test. Operations
with a different certified-real family still produce an Oracle because exact
resultant construction applies only to algebraic/Rational operands.

## Exact roots and rational-turn trigonometry

`Sqrt(value)` constructs the nonnegative exact algebraic square root of a
nonnegative rational or algebraic real. It forms an integer polynomial for the
new value, takes its square-free part, and isolates the intended root with exact
Sturm evidence.

`CosTurns(p/q)` and `SinTurns(p/q)` return exact algebraic values for rational
turns. Chebyshev/cyclotomic relations provide the integer polynomial; exact
quadrant information selects the intended conjugate. Equivalent angles are
reduced modulo one turn. A denominator budget of 64 bounds polynomial degree
and resultant work; values beyond that budget fail explicitly rather than
silently becoming floating-point approximations.

```rix
.Plugin.Load("algebraic-real");
root := .ar.Sqrt(2+.ar.Sqrt2());
c := .ar.CosTurns(1/8);
s := .ar.SinTurns(1/8);
{: root.Sign(), c.Compare(s), (c*c+s*s).CompareRational(1) };
```

The circular angle and its radian magnitude must not be conflated. Rational
turns have algebraic sine and cosine, but a nonzero rational multiple of `pi`
is itself transcendental. Geometry therefore stores the rational turn as the
exact angle identity and uses these algebraic functions for matrix entries.

See [tutorial.md](tutorial.md).
