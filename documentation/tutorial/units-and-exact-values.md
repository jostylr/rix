# Tutorial: Quantities and Exact Values

RiX treats units and named exact values as ordinary values. You can use the
short notation for calculations or retrieve the values from their registries.

## First calculations

```rix
distance := 120~[m];
time := 10~[s];
speed := distance / time
## speed is 12~[m/s]
```

The explicit spelling is equivalent:

```rix
m := .Units[:m];
s := .Units[:s];
speed := (120 * m) / (10 * s)
```

Units can therefore be arguments, return values, and collection members:

```rix
chosenUnit := .Units[:ft];
height := chosenUnit(6)
```

## Compatible addition and conversion

```rix
elapsed := 30~[s] + 2~[min];      ## 150~[s]
elapsedMinutes := .ConvertUnit(elapsed, .Units[:min])
## elapsedMinutes is 5/2~[min]
```

The left operand selects the result's display unit:

```rix
2~[min] + 30~[s]                  ## 5/2~[min]
30~[s] + 2~[min]                  ## 150~[s]
```

Incompatible dimensions are errors:

```rix
1~[m] + 1~[s]                     ## error
```

## Compound and inverse units

```rix
acceleration := 10~[m/s^2];
mass := 3~[kg];
force := mass * acceleration

inverseLength := 3 / .Units[:m]
areaUnit := .Units[:m]^2
```

Derived names and expanded expressions remain compatible:

```rix
1~[N] + 1~[kg*m/s^2]              ## 2~[N]
```

## Temperatures

Temperature coordinates have an origin, so call their unit value:

```rix
room := .Units[:degC](20)
freezingF := .ConvertUnit(.Units[:degC](0), .Units[:degF])
```

Temperature differences are linear:

```rix
change := 10 * .Units[:deltaDegC]
```

Compound expressions containing an affine coordinate unit are rejected.

## Exact generators

The `.Exact` map contains algebraic generators and named transcendental
constants:

```rix
i := .Exact[:i];
pi := .Exact[:pi];
sqrt2 := .Exact[:sqrt2];

i^2                         ## -1
sqrt2^2                     ## 2
z := 3 + 4*i
halfTurn := pi~[rad]
```

The sugar form multiplies by an entry from `.Exact`:

```rix
3~{pi}                      ## 3 * .Exact[:pi]
2~{i}                       ## 2 * .Exact[:i]
```

Exact values and physical units compose normally:

```rix
angle := 1/2~{pi}~[rad]
arc := angle * 2~[m]
```

## Exact complex arithmetic

Complex values use the algebraic generator `i`, so division and reduction stay
exact:

```rix
z := 3 + 4~{i};
inverseI := 1 / .Exact[:i];
quotient := (1 + .Exact[:i]) / (1 - .Exact[:i]);
{: z, inverseI, quotient }
```

The `.Complex` map provides component operations without requiring real-number
approximation:

```rix
z := 3 + 4~{i};
{: .Complex.Conjugate(z), .Complex.Re(z), .Complex.Im(z), z.NormSquared() }
```

An exact magnitude is available through Cayley polar form without defining a
transcendental argument:

```rix
c := .Complex.Cayley(1 + 1~{i});
{: c, c.Magnitude(), c.Direction(), c.Cartesian() }
```

The direction is the algebraic half-angle coordinate `tan(Arg/2)`. `Arg`
itself still waits for explicit real-number and trigonometric precision
policies. See [the detailed Cayley writeup](../design/eval/cayley-polar.md).

## Local registry overlays

The default registries are ordinary RiX maps. A program can construct an
extended map without mutating the frozen system context:

```rix
Exact := .Exact.Merge({= tau = 2 * .Exact[:pi] });
oneTurn := 1~{tau}~[rad]
```

The postfix sugar consults a lexical `Exact` or `Units` map before the system
default, so overlays work without changing parser configuration.
