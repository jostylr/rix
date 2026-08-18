# Certified interval ranges checklist

This checklist tracks set-valued evaluation for measurements represented by an
exact `RationalInterval`.  Its contract is

```text
result.interval contains { f(x) | x is in input }
```

The interval input denotes a set, not one unknown singleton real.  Range
boundary tolerance therefore measures numerical uncertainty in the computed
endpoints; it does not try to shrink uncertainty inherent in the measurement.

## Implemented foundation

- [x] Keep singleton-real and set-valued interval semantics distinct.
- [x] Add immutable `rix.numerics.interval-image@1` values with
  `denotation=:set`.
- [x] Add `rix.numerics.range-enclosure@1` results with certification, domain,
  work, evidence, and endpoint-tolerance fields.
- [x] Add `.numerics.Range(image, options)` and `image.Range(options)`.
- [x] Add `.numerics.Range(function, interval, options)` for exact
  scalar/interval expressions.
- [x] Preserve a certified best enclosure when an endpoint work budget is
  exhausted.
- [x] Never promote Float computations into certified range results.

## Function coverage

- [x] Increasing endpoint ranges: `Exp`, `Expm1`, `Log`, `Log1p`, `Sqrt`,
  `Cbrt`, `NthRoot`, `Asin`, and `Atan`.
- [x] Decreasing endpoint range for `Acos`.
- [x] Positive exact bases for `Exp(x, base)`.
- [x] Positive exact bases other than one for `Log(x, base)`, `Log2`, and
  `Log10`.
- [x] `Sin` and `Cos` using exact rational Taylor bounds plus the global
  Lipschitz bound.
- [x] `Tan`, `Sec`, `Csc`, and `Cot` when their denominator range is certified
  away from zero.
- [x] Strict whole-input domain violations for logarithms, even roots, and
  inverse sine/cosine.
- [x] Conservative `:unknown` results when a trigonometric pole cannot be
  excluded.

## Tightness and bounded work

- [x] Exact rational subdivision controlled by `maxSubintervals`.
- [x] Hull certified subranges without sampling or binary64 conversion.
- [x] Bound range work with the existing `maxWork`/`maxIterations` request
  policy.
- [x] Preserve repeated-input correlation better through
  `.numerics.Range((x)->expression, interval, options)` subdivision.
- [ ] Add critical-point detection for tighter `Sin`/`Cos` hulls without
  subdivision.
- [ ] Distinguish a proven pole crossing from the conservative
  `:poleNotExcluded` result.
- [ ] Add interval unions or extended endpoints for genuinely disconnected or
  unbounded ranges.
- [ ] Allow generic subdivided functions to return nested Numerics interval
  images; currently they must return an exact scalar or `RationalInterval`.

## Later function families

- [ ] Add specialized hyperbolic and inverse-hyperbolic range variants.
- [ ] Add certified range variants for special functions only where a
  monotonicity, critical-point, or derivative-bound proof is available.
- [ ] Add multivariate box subdivision for correlated measurements.
- [ ] Investigate affine arithmetic or Taylor models when ordinary interval
  subdivision remains too wide.

## Verification

- [x] Test set-valued capability metadata and result schemas.
- [x] Test exponential, logarithmic, root, circular, and inverse-circular
  containment.
- [x] Test base changes and stable `Expm1`/`Log1p` forms.
- [x] Test domain violations and pole uncertainty.
- [x] Test subdivision tightening and bounded work.
- [x] Keep existing singleton Numerics tests green.
