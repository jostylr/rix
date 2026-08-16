# RiX examples

The supported RiX programs are grouped by purpose:

- `eval/` — self-contained language examples; every file is smoke-tested.
- `newton/` and `quadratic/` — import/export and native `.test.rix` examples.
- `algebra/`, `geometry/` (including interactive Scene3D/nD labs), `complex/`, `documents/`, `renderers/`,
  `rixcel/`, and `stern-brocot/` — plugin, output, and renderer examples.
- `plugins/` — small third-party-plugin teaching fixtures.

Run a self-contained program from this directory's repository root:

```sh
bun bin/rix.js examples/eval/fibonacci.rix
```

Run all native RiX test programs:

```sh
bun bin/rix.js test
```

Programs that call `.Out(...)` require an output directory:

```sh
bun bin/rix.js --out=tmp/example-output examples/renderers/all-formats.rix
```

The JavaScript files under `parser/` are archived pre-1.0 parser design
sketches. They use obsolete syntax and AST contracts and are not supported
runnable examples. Current parser usage is covered by `documentation/parser/`
and `tests/parser/`.
