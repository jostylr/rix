# Function and Multifunction Definitions

RiX uses ordinary functions plus ordered multifunction variants. Soft prep (`?-`) performs validation, conversion, setup, and dispatch selection; strict prep (`?!-`) propagates failures.

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
