# Function and Multifunction Definitions

RiX uses ordinary functions plus ordered multifunction variants. Soft prep (`?-`) performs validation, conversion, setup, and dispatch selection; strict prep (`?!-`) propagates failures. `??-` opts into fallthrough on undecided, while `??!-` requires a decided successful guard and throws otherwise.

```rix
Square = (x) -> x^2
Power = (x, n ?= 2) -> x^n

Abs = [
  (x) ?- [x >= 0] /Positive/ -> x,
  (x) /Negative/ -> -x
]
```

The explicit `{> ... }` literal creates the same callable value and works inline:

```rix
[-2, 0, 3] |>> {>
  (x) ?- [x < 0] -> -x,
  (x) ?- [x > 0] -> x^2,
  (x) -> 0
}
```

Entries may be functions, selected named variants, or whole multifunctions. Nested multifunctions flatten recursively in source order:

```rix
Combined = {> Abs[:Positive], OtherFunction, MoreRules }
```

Variants may also be added incrementally:

```rix
Classify(x) ?- [x < 0] /Negative/ => :negative
Classify(x) /Other/ => :other
```

Dispatch tries variants in order. Prep failure advances to the next variant; after prep succeeds, the body result is final.

Prep entries can return diagnostic results explicitly: `check ?_> result`
returns from the function on `_`, and `check ??> result` returns on undecided
`?`. These are final call results, not variant fallthrough. The same operators
work inside function bodies and nested blocks; using them without an active
function call is an error. See the [reference and runnable tutorial](../eval/function-returns.md).
