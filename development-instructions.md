# RiX development instructions

## Runnable documentation examples

RiX documentation examples are checked with the normal evaluator before
Quarto renders the authored documentation. The conventions below are
documentation metadata; they are not RiX language syntax.

Use an executable Quarto fence when an example should run:

```{.rix exec=true id=example-name}
##SETUP##
isThree = x -> x == 3
##SETUP##
3 ##@ |> isThree
##
```

The supported conventions are:

- `##@ expression` evaluates `expression` with the preceding result inserted
  on the left. For example, `1 + 1 ##@ == 2` checks equality. The assertion
  passes when it returns a non-null value, so pipelines can use descriptive
  predicates such as `xs ##@ |> isSorted`.
- `##SETUP## ... ##SETUP##` evaluates hidden setup code and removes it from the
  normal displayed source.
- `##: kind` checks the resulting structural kind; optional brackets check
  size, for example `array[5]`, `set[3]`, `map[2]`, `tuple[2]`, or
  `tensor[2x2]`.
- A standalone `##` displays the most recent result below the code block.
- `### ...` is an ordinary explanatory comment and is not checked.

The HTML Quarto output includes a collapsible “Show setup code” disclosure.
Setup code is suppressed in PDF and other non-HTML output so the exported code
stays focused on the example. The older `/*** ... ***/` setup delimiter is
still accepted by the checker, but new documentation should use `##SETUP##`.

Examples can also use these Quarto attributes:

- `exec=true` evaluates the block.
- `parse=true` checks parsing without evaluating.
- `expect-error="text"` requires an error containing the given text.
- `session=name` shares evaluator state across blocks in one document.
- `output=true` displays the final value even without a standalone `##`.

Run the checker directly from the `rix/` directory:

```sh
bun run docs:examples
bun run test:docs
```

Build or preview the Quarto site with:

```sh
bun run build:docs
bun run preview:docs
```

Edit files under `documentation/`, not the generated `docs/` directory.
