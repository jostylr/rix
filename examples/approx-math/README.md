# Approximate Math Plugin

This optional host plugin installs the JavaScript-backed `Float` semantic type
and its approximate methods below `.float`: `.float.Float(x)`,
`.float.Sin(x)`, `.float.Log(x)`, `.float.Exp(x)`, and related functions. It
is intentionally not part of the default RiX system context.

The root itself is a constructor alias, so `.float(x)` is identical to
`.float.Float(x)`. It also exposes exact conversions from the stored IEEE-754
value:

```rix
x = .float(1/3)
.float.Interval(x)     # exact RationalInterval point enclosure
.float.Round(x, 4)     # exact rational rounded to 4 decimal places
.float.Floor(x, 4)
.float.Ceiling(x, 4)
```

`Round`, `Floor`, and `Ceiling` take an optional non-negative decimal-place
count (default `0`). `Round` resolves an exact midpoint by ties-to-even.

```js
import { createDefaultSystemContext } from "../../src/eval/evaluator.js";
import { createDefaultRegistry } from "../../src/eval/evaluator.js";
import { loadApproxMathPlugin } from "./approx-math-plugin.js";

const systemContext = createDefaultSystemContext();
const registry = createDefaultRegistry();
loadApproxMathPlugin(systemContext, registry);
```

Hosts can replace this plugin with an interval, arbitrary-precision, or other
numeric implementation while keeping the same `.float.PascalCase` interface.
