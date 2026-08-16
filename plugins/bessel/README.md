# Bessel plugin

The pure-RiX Bessel plugin gives the letter-and-order functions a clear home:

```rix
.Plugin.Load("bessel");
.bessel.J0(1);
.bessel.J1(1);
.bessel.J(6, 1);
.bessel.Y0(1);
.bessel.Y1(1);
.bessel.Y(6, 1);
```

Loading the plugin automatically loads Numerics and Oracle. The returned values
are certified refinable reals, so use `.numerics.Refine` (or the standard
profile's bare `Refine`) to request an interval:

```rix
.numerics.Refine(.bessel.J0(1), {= absoluteWidth=1/1000 });
```

`J(n,x)` and `Y(n,x)` accept every exact integer order, including negative
orders through the standard parity identities. The implementation remains
universal in Numerics under the explicit `BesselJ` and `BesselY` names, with
the four order-zero/order-one conveniences retained. The `.bessel` plugin is
the preferred calculator-facing API. The Y family currently certifies only
positive real arguments.

The forward recurrence is efficient for modest orders. For order much larger
than the argument magnitude it can be numerically ill-conditioned; the result
remains honest, but may report `:budgetExhausted` with a wide certified
interval. A future Miller/backward recurrence will improve that region.

The Y-family constants use a higher-order alternating Euler–Maclaurin
enclosure for Euler's constant. This keeps exact-Rational work practical at
deep requested widths without changing the outward-certification contract.
