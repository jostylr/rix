# Units and Exact Generators

## Status and goal

This document is the target design for physical quantities and exact symbolic
numbers in RiX. It replaces the older idea that scientific, algebraic, and
transcendental "units" should all be fields on one wrapper object.

RiX uses ordinary values and ordinary arithmetic as the primary interface:

```rix
m := .Units[:m];
s := .Units[:s];
pi := .Exact[:pi];

distance := 3 * m;
speed := distance / (2 * s);
circumference := 2 * pi * distance
```

The postfix forms are concise sugar over the same values:

```rix
3~[m]             ## 3 * .Units[:m]
9.8~[m/s^2]       ## 9.8 * (.Units[:m] / .Units[:s]^2)
3~{pi}            ## 3 * .Exact[:pi]
```

There is only one runtime model. The sugar does not create string annotations.

## RiX collection registries

`.Units` and `.Exact` are system values whose storage is the ordinary RiX map
collection type. Keys are canonical strings, normally accessed with colon
strings:

```rix
.Units[:m]
.Units[:minute]
.Exact[:pi]
.Exact[:sqrt2]
```

The default system context loads canonical maps. A host or trusted startup
package may augment or replace either map before freezing the system context.
A script may also create a lexical overlay:

```rix
Units := .Units.Merge({= fortnight = customFortnight })
Exact := .Exact.Merge({= tau = 2 * .Exact[:pi] })
```

Unit and exact sugar first consults a lexical `Units` or `Exact` map, when
present, and otherwise consults the system map. Explicit lookup always uses the
map named by the program.

Registry entries are values, not special parser symbols. They may be assigned,
passed to functions, stored in other collections, and used as map keys through
their stable `.key` identity.

## Runtime value families

The physical side has three related values:

- `Unit`: a named linear or affine unit definition.
- `UnitExpr`: a product, quotient, or power of linear units.
- `Quantity`: a scalar magnitude with physical dimensions and a display unit.

The exact side has two:

- `ExactGenerator`: an interned algebraic or transcendental generator.
- `ExactExpression`: a sparse sum of coefficients times canonical monomials.

A `Quantity` magnitude may itself be an `ExactExpression`. Thus π radians is a
composition of the two systems rather than a special transcendental unit.

## Physical representation

Every unit resolves to a coherent base representation:

```text
unit = dimensions + scale + offset + display name
base magnitude = displayed magnitude * scale + offset
```

Dimensions use stable semantic names such as `Length`, `Time`, `Mass`, and
`Angle`; they do not use display unit names. Conversion factors are exact RiX
numeric values, normally `Integer` or `Rational`, never JavaScript floats.

Quantities retain a display unit but store a coherent base magnitude. This
makes compatibility and arithmetic independent of presentation.

### Arithmetic

```rix
60~[s] + 2~[min]      ## 180~[s]
2~[min] + 60~[s]      ## 3~[min]
2~[m] + 3~[s]         ## error: incompatible dimensions
3~[m] * 2~[s]         ## 6~[m*s]
5~[m] / 2~[m]         ## 5/2 (dimensionless)
3 / .Units[:m]        ## 3~[m^-1]
```

Addition, subtraction, comparison, and explicit conversion require equal
dimension vectors. Compatible addition converts the right operand to the
left operand's display unit and preserves that display. The coherent internal
unit remains unchanged. This is silent by default; setting
`warnings.implicitUnitConversion` enables a diagnostic whenever the displayed
units differ.

Multiplication, division, and integer powers combine dimension vectors.
Unknown unit names are errors at construction time.

### Conversion

The source unit is already part of a quantity and must not be repeated:

```rix
.ConvertUnit(90~[s], .Units[:min])    ## 3/2~[min]
.ConvertUnit(1~[mi], "km")           ## target strings are also accepted
```

### Callable units and affine coordinates

Every unit value constructs a quantity from one scalar argument:

```rix
.Units[:m](3)
.Units[:degC](20)
```

For a lowercase local binding, RiX's existing adjacency rule makes `m(3)` the
same construction as `m * 3`.

Affine coordinates such as Celsius and Fahrenheit are callable, but cannot be
multiplied into compound unit expressions. Temperature differences use linear
units such as `deltaDegC`.

## Exact generators and relations

"Exact generator" is the umbrella term. Algebraic generators and named
transcendental constants have different reduction behavior:

```rix
i := .Exact[:i];            ## algebraic: i^2 + 1 = 0
sqrt2 := .Exact[:sqrt2];    ## algebraic: sqrt2^2 - 2 = 0
pi := .Exact[:pi]           ## named transcendental constant
```

Exact expressions are sparse tables keyed internally by canonical monomials.
Generator objects have stable identities and can also be RiX map keys.

Algebraic generators record a monic minimal polynomial and powers are reduced
by it. Aliases share identity. Distinct transcendental generators are assumed
algebraically independent unless the registry explicitly supplies a relation;
RiX cannot infer independence that is unknown mathematically.

Examples:

```rix
i^2                    ## -1
.Exact[:sqrt2]^2       ## 2
1 + 3~{sqrt2}          ## exact expression
3/2~{pi}               ## exact rational multiple of pi
1~{pi}~[rad]           ## exact quantity: pi radians
```

## Dispatch and sandboxing

`Unit`, `UnitExpr`, `Quantity`, `ExactGenerator`, and `ExactExpression` install
variants into RiX's existing arithmetic multifunctions. Generic arithmetic
does not contain ad-hoc unit branches.

Reading `.Units` and `.Exact` is part of the `Units` and `Exact` capability
groups. Mutation of the system collections is restricted to host construction
or trusted startup. Ordinary scripts can freely build local map overlays.
