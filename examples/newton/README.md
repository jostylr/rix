# Newton nth-root example

`nth-root.rix` exports `NthRoot`, a Newton-iteration nth-root calculator.

RiX treats uppercase identifiers as callables, so the exported name is uppercase:

```rix
<"rix/examples/newton/nth-root" ; NthRoot=NthRoot>;
NthRoot(2, 2)
```

From the repository root, run the demo:

```sh
bun bin/rix.js rix/examples/newton/demo.rix
```

Run the RiX test program:

```sh
bun bin/rix.js test rix/examples/newton
```

Load it in the command-line RiX REPL:

```sh
bun bin/rix.js
```

Then in the REPL:

```rix
.load[newton]
NthRoot(2, 2)
NthRoot(3, 4567890, 8, 10^-10)
```

The result is a tuple. The first entry is the final rational interval `x:y`.
The second entry is the array of Newton step tuples `{: z, x, y }`.

## Pretty output

`pretty.rix` exports `NthRootPretty`, which turns the raw result into a map with
short decimal strings, a representative center point, interval width, and
`widthPower10`.

```rix
<"rix/examples/newton/nth-root" ; NthRoot=NthRoot>;
<"rix/examples/newton/pretty" ; NthRootPretty=NthRootPretty>;

.PRINT(NthRootPretty("sqrt 2", 2, 2, NthRoot(2, 2, 5)))
```

`.PRINT` uses a replaceable host IO hook. A JS host can set:

```js
context.setEnv("__io__", {
  format(value, helpers) {
    return helpers.prettyFormat(value);
  },
  print(text) {
    myOutputSink.write(text + "\n");
  },
});
```

RiX print calls stay as `.PRINT(...)`; the environment can replace formatting or
the destination.

## JavaScript versions

Readable implementation:

```sh
bun rix/examples/newton/nth-root.js
bun test rix/examples/newton/nth-root.test.js
```

Compact implementation:

```sh
bun rix/examples/newton/nth-root-compact.js
bun test rix/examples/newton/nth-root-compact.test.js
```

Use them in a Bun REPL from the repository root:

```sh
bun repl
```

```js
import { nthRoot, prettyNthRoot } from "./rix/examples/newton/nth-root.js";
prettyNthRoot("sqrt 2", 2, "2", nthRoot(2, "2", 3));
```

Compact REPL variant:

```js
import { nthRootCompact, prettyCompact } from "./rix/examples/newton/nth-root-compact.js";
prettyCompact(nthRootCompact(2, "2", 5));
```
