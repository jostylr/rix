# RiX Float Example

This folder is an example extension. It lives with the core RiX examples and can later be split into its own package or repository.

- `floats.js.rix` defines the RiX-facing type, trait, conversion hooks, proto, export/import, and operator installs.
- `floats.js` implements the JavaScript-backed arithmetic and JavaScript `Math` calls.
- `floats-loader.js` is host glue for tests and demos. The REPL does not need it; `.load[floats]` resolves and evaluates `floats.js.rix` directly.

The RiX file calls JavaScript through the generic bridge:

```rix
.JSCall("floats.js", :Sin, x)
```

Float-specific helpers are not system capabilities. Shared math names such as `.SIN` and `.LOG` are system multifunction entry points so other real-number packages can install their own variants.

## REPL usage

Start the normal RiX REPL and load the example:

```sh
bun bin/rix.js
```

```rix
.load[floats]
a = .Float(7)
a
b = "2.5" ~!: :Float
a + b
.SIN(b)
7 + .SIN(a)
```

Or start with the Float example already loaded:

```sh
bun bin/rix.js --with-floats
```

Use soft conversion with `~:` when conversion failure should return `_`, and strict conversion with `~!:` when failure should throw.

The loader convention is intentionally simple. A package can be loaded by file path:

```rix
.load["/path/to/my-package/startup.rix"]
```

or, for local example packages, by name. The REPL looks for `startup.rix`, `<name>.rix`, or `<name>.js.rix` in the package folder, sets that folder as `scriptBaseDir` and `jsImportBaseDir` while evaluating the startup file, and then the package registers its own traits, types, and installs.

During trusted package startup, a package may add user-facing system capabilities with `.CapabilityRegister`. Float uses this to install:

```rix
.Float(x)
```

which is equivalent to:

```rix
x ~!: :Float
```

The Float package also installs mixed numeric promotion variants, so arithmetic and comparisons work when one side is already a Float and the other side is an Integer or Rational.
