# Certified approximation methods

`CertifiedApproximation` is one uncertain scalar with an exact rational
enclosure. It is not a `RationalInterval` collection. A literal such as
`23.456?789` certifies the prefix `23.456`, retains `789` as provisional
display information, and guarantees that the represented value lies in
`23.456:23.457`.

## Construction

```rix
x := 23.456?789
y := 3.~7~15?
z := 0xA.B?C
providerValue := .CertifiedApproximation(3/2, 1:2, {=
  reason = :budgetExhausted,
  requested = 1/100,
  achieved = 1
})
```

The system constructor is intended for certified providers. Its candidate
must be an exact Integer or Rational inside the supplied RationalInterval.
The enclosure, not the candidate or provisional digits, is authoritative.

## Method reference

| Full syntax | Result | Meaning |
|---|---|---|
| `x.Candidate()` | exact scalar | Return the non-authoritative representative. |
| `x.Enclosure()` | `RationalInterval` | Return the authoritative enclosure. |
| `x.Low()` / `x.High()` | `Rational` | Return an enclosure endpoint. |
| `x.Negate()` | certified or exact scalar | Negate candidate and enclosure. |
| `x.Reciprocal()` | certified or exact scalar | Reciprocate when the enclosure excludes zero. |
| `x.PossibleRelations(y)` | `Array` | Return the possible `<`, `=`, and `>` relations. |
| `x.CertainlyLessThan(y)` | `1 \| null` | Ask whether every represented value is less than `y`. |
| `x.PossiblyLessThan(y)` | `1 \| null` | Ask whether some represented value may be less than `y`. |
| `x.ToString()` | `String` | Return a parseable certified spelling when available. |

Ordinary arithmetic propagates enclosures. Mixing an exact scalar with a
certified scalar returns a certified scalar unless the enclosure collapses to
a point. Mixing an explicit RationalInterval with either returns a
RationalInterval.

Comparisons return `1`, `_`, or `?`. Use the decision conditional when all
three outcomes matter:

```rix
x := 23.456?
x < 23.4565
  ?: "certainly less"
  ?_ "certainly not less"
  ?? "not decided by this enclosure"
```

[Back to the methods overview](../methods-guide.md)
