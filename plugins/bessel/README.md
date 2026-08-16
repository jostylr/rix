# Bessel plugin

The pure-RiX Bessel plugin gives the letter-and-order functions a clear home:

```rix
.Plugin.Load("bessel");
.bessel.J0(1);
.bessel.J1(1);
.bessel.Y0(1);
.bessel.Y1(1);
```

Loading the plugin automatically loads Numerics and Oracle. The returned values
are certified refinable reals, so use `.numerics.Refine` (or the standard
profile's bare `Refine`) to request an interval:

```rix
.numerics.Refine(.bessel.J0(1), {= absoluteWidth=1/1000 });
```

The implementation remains universal in Numerics under the explicit names
`.numerics.BesselJ0`, `.numerics.BesselJ1`, `.numerics.BesselY0`, and
`.numerics.BesselY1`. The `.bessel` plugin is the preferred calculator-facing
API. `Y0` and `Y1` currently certify only positive real arguments.
