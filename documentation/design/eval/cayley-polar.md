# Exact Cayley Polar Complex Numbers

## Purpose

RiX has two exact representations of a complex number:

- Cartesian form, `x + y~{i}`;
- Cayley polar form, `Cayley(r, t)`.

The Cayley form stores magnitude and direction without storing a transcendental
angle:

\[
r = |z|, \qquad t = \tan(\theta/2).
\]

The direction is the stereographic, tangent-half-angle, or Cayley coordinate
of the unit circle. It is an exact algebraic alternative to conventional polar
form. For exact rational Cartesian coordinates, conversion needs at most the
positive square root of `x^2 + y^2`; it does not introduce π, trigonometric
functions, or a floating approximation.

## Construction and conversion

Convert an exact Cartesian value with one argument:

```rix
z := 1 + 1~{i};
c := .Complex.Cayley(z)       ## Cayley(sqrt2, sqrt2 - 1)
c.Cartesian()                 ## 1 + i
```

Construct directly from magnitude and direction with two arguments:

```rix
c := .Complex.Cayley(5, 1/2);
c.Cartesian()                 ## 3 + 4i
```

`.Complex.Cartesian(c)` is the namespace form of `c.Cartesian()`.

For `z = x + iy != 0`, RiX computes the positive exact root

\[
r=\sqrt{x^2+y^2}
\]

and then

\[
t=\frac{r-x}{y}=\frac{y}{r+x}.
\]

RiX uses the first expression when `y != 0`. This keeps the newly adjoined
root in the numerator and gives an exact element of the same quadratic
extension as `r`. The inverse conversion is

\[
x=r\frac{1-t^2}{1+t^2}, \qquad
y=r\frac{2t}{1+t^2}.
\]

These are identities, not numerical approximations. For example,
`1 + i` produces

\[
r=\sqrt2, \qquad t=\sqrt2-1,
\]

and substituting these exact values into the inverse formulas reduces back to
`x = 1`, `y = 1`.

RiX interns a positive algebraic square-root generator for every nonsquare
rational norm encountered. A perfect rational square is simplified, so
`3 + 4i` has `r = 5` rather than a redundant root generator.

## The one point at infinity

The negative real direction has `theta = pi`, hence finite affine `t` cannot
represent it. Cayley direction therefore lives on the real projective line:

\[
t\in\mathbb R\cup\{\infty\}.
\]

RiX exposes the single projective point as `.Complex[:infinity]` and formats it
as `Infinity`:

```rix
.Complex.Cayley(-2)                 ## Cayley(2, Infinity)
.Complex.Cayley(-2).Cartesian()     ## -2
```

This is not a numeric infinity and arithmetic never performs ordinary numeric
operations on it. There is only one such direction, so `-Infinity` is the
same projective point.

Zero has no mathematical direction. RiX gives it the canonical storage form
`Cayley(0, 0)` so equality, formatting, and arithmetic have one representation.

## Arithmetic

Let direction composition be

\[
t_1\oplus t_2=\frac{t_1+t_2}{1-t_1t_2}.
\]

This is the tangent half-angle addition formula and is the Cayley transform of
unit-complex multiplication. Multiplication is therefore

\[
(r_1,t_1)(r_2,t_2)=(r_1r_2,t_1\oplus t_2).
\]

The projective cases are handled explicitly:

\[
\infty\oplus\infty=0,
\quad 0\oplus\infty=\infty,
\quad t\oplus\infty=-1/t \quad(t\ne0).
\]

Conjugation negates the finite direction and fixes infinity:

\[
\overline{(r,t)}=(r,-t).
\]

Consequently,

\[
(r,t)^{-1}=(1/r,-t)
\]

for nonzero `r`. Division composes the numerator direction with the negated
denominator direction. Integer powers use exponentiation by squaring with the
same Cayley multiplication, including negative powers through reciprocal.

Normal RiX operators use these rules directly:

```rix
a := .Complex.Cayley(3 + 4~{i});
b := .Complex.Cayley(1 + 1~{i});

(a * b).Cartesian()       ## -1 + 7i
(a / b).Cartesian()       ## 7/2 + 1/2i
(b^3).Cartesian()         ## -2 + 2i
a.Conjugate()             ## Cayley(5, -1/2)
```

When `t1` and `t2` belong to independent quadratic extensions, the displayed
Möbius quotient can temporarily require inversion in their compositum. If the
general exact-expression inverter cannot yet perform that inversion, RiX takes
an exact Cartesian multiplication bridge and converts the product back to a
canonical Cayley pair. No approximation is introduced. For example:

```rix
a := (5 + 3~{i}).Cayley();
b := 1/2 - 1/2~{i};
a * b                    ## Cayley(sqrt17, 4 - sqrt17)
```

The exact Cartesian product is `4 - i`. This fallback also canonicalizes the
otherwise separate magnitude factors `sqrt34 * sqrt(1/2)` as `sqrt17`.

Negation keeps the magnitude and adds the negative-real direction. For finite
nonzero `t`, this changes `t` to `-1/t`; zero and infinity exchange places.

Addition is intrinsically less natural in polar coordinates. RiX implements
`+` and `-` by converting both operands exactly to Cartesian form, adding or
subtracting there, and converting the result back to Cayley form. The returned
value is still Cayley:

```rix
sum := .Complex.Cayley(3 + 4~{i}) + .Complex.Cayley(1 + 2~{i});
sum.Cartesian()           ## 4 + 6i
```

Mixed Cayley/Cartesian arithmetic converts the Cartesian operand using the
Cayley value's configured `i` generator. Equality compares exact Cartesian
values, so equivalent values compare equal even when their stored coordinates
differ.

## Methods and namespace operations

| Operation | Receiver form | Namespace form | Result form |
| --- | --- | --- | --- |
| Convert from Cartesian | `z.Cayley()` for exact expressions | `.Complex.Cayley(z)` | Cayley |
| Construct coordinates | — | `.Complex.Cayley(r, t)` | Cayley |
| Convert to Cartesian | `c.Cartesian()` | `.Complex.Cartesian(c)` | Cartesian |
| Conjugate | `c.Conjugate()` | `.Complex.Conjugate(c)` | Cayley |
| Reciprocal | `c.Inverse()` | `.Complex.Inverse(c)` | Cayley |
| Components | `c.Re()`, `c.Im()` | `.Complex.Re(c)`, `.Complex.Im(c)` | exact scalar |
| Magnitude | `c.Magnitude()` | `.Complex.Magnitude(c)` | exact real |
| Direction | `c.Direction()` | `.Complex.Direction(c)` | exact real or `Infinity` |
| Squared norm | `c.NormSquared()` | `.Complex.NormSquared(c)` | exact real |

`Arg` is intentionally not an alias for `Direction`: `Arg` conventionally
means a radian angle, while Cayley direction is `tan(Arg/2)`. A future real and
trigonometric subsystem may provide `Arg` without changing this representation.

## Algebraic background: the Pell-type relation

For rational `x` and `y`, let `r^2=q` and suppose `r` is genuinely quadratic.
Then finite direction can be written

\[
t=ur+v, \qquad u,v\in\mathbb Q,
\]

with

\[
u=1/y, \qquad v=-x/y.
\]

It follows that

\[
q u^2-v^2=1.
\]

Equivalently, `t` has field norm `-1` under the conjugation `r -> -r`.
This is a useful characterization of rational Cartesian points in Cayley
coordinates, but RiX does not impose it on general Cayley values: exact
algebraic Cartesian coordinates are valid too.

## Current exactness boundary

The first implementation computes a new magnitude generator when
`x^2 + y^2` is rational. This covers all Gaussian rational inputs and the
primary exact use case. If the norm squared itself contains algebraic or
transcendental generators, conversion reports that a rational norm squared is
currently required. Supporting general real-algebraic root isolation belongs
to the future algebraic-number layer; silently approximating such a magnitude
would violate the contract of this type.
