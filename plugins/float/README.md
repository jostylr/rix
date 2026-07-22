# `float`

`float` is an opt-in IEEE-754 approximate-number package. It provides a
semantic Float type, conversions, intervals, rounding, and common approximate
real-valued math without making JavaScript numbers part of RiX core.

## Load and use

```rix
.Plugin.Load("float")

x := .float.Float(1 / 3)
.float.Sin(x)
.float.Round(.float.Float(2.675), 2)
```

The plugin registers overloads for arithmetic, comparison, and standard math
operations, allowing Float values to participate in ordinary expressions once
loaded.

## Commands

| Command | Purpose |
| --- | --- |
| `.float(value)` / `.float.Float(value)` | Convert a finite value to Float. |
| `.float.Interval(value)` | Construct an exact enclosure of the stored IEEE value. |
| `.float.Round(value, places?)` | Exact decimal representation of IEEE rounding. |
| `.float.Floor(value, places?)`, `.float.Ceiling(value, places?)` | Directed decimal rounding. |
| `.float.Abs`, `.float.Sqrt`, `.float.Sin`, `.float.Cos`, `.float.Tan` | Common Float math. |
| `.float.Log`, `.float.Exp` | Exponential/logarithmic Float math. |

## Dependencies

The Node implementation pairs `node-installer.js` with the RiX type startup
source `floats.js.rix` and its JavaScript bridge `floats.js`. Browser hosts use
`browser-installer.js`, which has no Node filesystem dependency. Neither
implementation requests network or filesystem access at evaluation time.

See [tutorial.md](tutorial.md).
