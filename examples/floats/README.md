# RiX Float Example

This folder is an example extension. It lives with the core RiX examples and can later be split into its own package or repository.

- `floats.js.rix` defines the RiX-facing type, trait, conversion hooks, proto, export/import, and operator installs.
- `floats.js` implements the JavaScript-backed arithmetic and JavaScript `Math` calls.
- `floats-loader.js` is host glue for tests and the optional approximate-math plugin. `.load[floats]` resolves and evaluates `floats.js.rix` directly, which installs the type but intentionally does not add host capabilities.

The RiX file calls JavaScript through the generic bridge:

```rix
.JSCall("floats.js", :Sin, x)
```

Float-specific helpers live in the optional approximate-math plugin as host
methods: `.float.Float()`, `.float.Sin()`, and `.float.Log()`. The plugin uses
the same `Float` semantic type defined here, so its results participate in the
installed arithmetic and comparison variants.

## REPL usage

Start the REPL with the Float host plugin:

```sh
bun bin/rix.js --with-floats
```

```rix
a = .float.Float(7)
a
b = "2.5" ~!: :Float
a + b
.float.Sin(b)
7 + .float.Sin(a)
.float.Interval(a)
.float.Round(b, 2)
```

Use soft conversion with `~:` when conversion failure should return `_`, and strict conversion with `~!:` when failure should throw.

The loader convention is intentionally simple. A package can be loaded by file path:

```rix
.load["/path/to/my-package/startup.rix"]
```

or, for local example packages, by name. The REPL looks for `startup.rix`, `<name>.rix`, or `<name>.js.rix` in the package folder, sets that folder as `scriptBaseDir` and `jsImportBaseDir` while evaluating the startup file, and then the package registers its own traits, types, and installs. `.load[floats]` therefore installs the semantic type alone; `--with-floats` additionally loads the `float` host plugin and provides `.float`.

The Float type package itself only installs the semantic type and its variants.
The host plugin owns the user-facing constructor, so when it is loaded:

```rix
.float.Float(x)
```

is equivalent to both `.float(x)` and `x ~!: :Float`. The type also installs mixed numeric-promotion
variants, so arithmetic and comparisons work when one side is already a Float
and the other side is an Integer or Rational.
