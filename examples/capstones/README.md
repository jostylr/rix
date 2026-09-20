# Runnable capstones

Start with the [six-workflow tutorial](../../documentation/tutorial/capstones.md).
It provides prerequisites, commands, expected results, failure exercises, host
requirements, and exact-versus-approximate boundaries.

Most capstones intentionally reuse maintained sources:

| Workflow | Source |
|---|---|
| Publication and offline companion | [publication project](../publication-workflow/README.md) |
| Checked nonlinear and ODE exploration | [certified-exploration.rix](certified-exploration.rix) |
| Exact-number views and source export | [numeric-presentation.rix](../renderers/numeric-presentation.rix) |
| Tensor coordinate projections | [sheet-views.rix](../rixcel/sheet-views.rix) |
| Host admission, cancellation, cleanup | [async-cancellation.mjs](async-cancellation.mjs) |
| Formula source and CSV/TSV interchange | [persistence.rix](../rixcel/persistence.rix), [delimited.rix](../rixcel/delimited.rix) |

Run `bun test tests/cli/capstones.test.js` from `rix/` for the capstone regression
checks. Publication retains its existing dedicated integration coverage.
