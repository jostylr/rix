---
status: implemented
---

# Portable fraction derivations

The Fraction plugin computes a bounded derivation and checks it by replaying the
public exact algorithm. The same immutable record feeds Web's exact-number
inspector and `DerivationView`, an ordinary document fragment with the source
record in its metadata. Output JSON retains the original written pairs and
interval orientation; decoding never loads a plugin or calls a provider.

```{.rix exec=true}
.Plugin.Load("fraction");
written = .frac(710,226);
evidence = .fraction.Derivation(:convergents,written,{= maxTerms=2 });
[.fraction.CheckDerivation(evidence)[:accepted],evidence[:status],evidence[:value],evidence[:error]];
```

This returns a checked partial derivation: `22/7` with signed exact error
`-1/791` against `710/226`. It does not claim the retained result equals the
input. Each row records the coefficient, previous numerator/denominator pairs,
continuant determinant, exact value, signed error, absolute error and point
interval. A reduced convergent does not erase the original written fraction.

`Derivation(kind,input,options?)` supports:

| Kind | Input | Retained evidence |
| --- | --- | --- |
| `:mediant` | Two Fractions/exact rationals | Addition of the represented components |
| `:parentage` | One finite Fraction | Exact Farey parents and their component sum |
| `:fareyPath` | One finite Fraction | Signed Stern–Brocot/Farey walk, every attempted candidate, bounds, target and partial result |
| `:convergents` | One finite Fraction | Bounded simple continued-fraction prefix and exact errors |
| `:coefficients` | 1–256 Integers | Continuant recurrence without an asserted source identity |

The signed tree starts at `0/1` between `-1/0` and `1/0`. Its zero root uses
an explicit `signedRootConvention`; it never pretends adding those boundary
components yields a legal `0/0` fraction. Unreduced parentage uses represented
components. A path seeks the reduced value and retains the written input.

Defaults are 128 path steps, 32 terms and denominator limit 1,000,000. Explicit
limits are `maxSteps=0..4096`, `maxTerms=1..256`, and positive
`maxDenominator`. Every exact component is limited to 16,384 bits. An input
outside these bounds is rejected. Convergent growth stops before admitting an
oversized component and preserves the remaining coefficient input. Statuses
include `exact`, `found`, `budgetExhausted`, `denominatorLimit`,
`termBudgetExhausted` and `componentBudgetExhausted`.

## Continued-fraction sources

```{.rix exec=true}
.Plugin.Load("continued-fraction");
finite = .cf.Finite([3,7,16]).Derivation(2);
observed = .cf.Sqrt2().Derivation(4);
[finite[:status],finite[:errors],observed[:status],observed[:premise],.cf.CheckDerivation(observed)[:accepted]];
```

A finite source includes its complete coefficient list (at most 256 terms), so
its exact value independently determines the errors of any retained prefix.
For a lazy/periodic source, an explicit count is required. The snapshot checks
only observed coefficients. Consecutive convergents give **conditional** bounds
under the recorded premise that every future simple coefficient is a positive
integer. `evidenceLevel=:assumedPositiveTail` and `certified=_` remain explicit,
even if the original provider has stronger evidence. This adapter does not
prove the provider's mathematical identity or a correlation theorem. One
observed coefficient gives an unresolved enclosure. Generalized continued
fractions must first provide a supported simple coefficient representation.

`CheckDerivation(record)` returns `accepted=1` only when all fields agree with
bounded replay; otherwise it returns a mismatch diagnostic. Malformed or
out-of-budget inputs may raise the same explicit validation error as the
constructor. Checking a detached record never invokes its original provider.
Unknown schemas are rejected. `accepted` attests to the recorded algorithm and
premises; it does not upgrade a partial result or an assumption to certainty.

## Documents and symbolic values

```{.rix exec=true}
.Plugin.Load("symbolic");
evidence = .fraction.Derivation(:mediant,[.frac(6,8),.frac(1,2)]);
symbolic = .symbolic.FractionDerivation(evidence);
[.fraction.DerivationView(evidence),symbolic[:representation],symbolic[:relation]];
```

The symbolic adapter returns a public Calculus constant plus the represented
Fraction and complete checked evidence. Its relation is `exactRetainedResult`;
`sourceEqualityClaim=_` avoids inventing an equality to an unresolved target.
It requires a finite retained result. Renderers reject unchecked evidence.

Run `examples/fraction/derivation.rix` with `rix --out=YOUR_OUTPUT` for HTML,
Markdown, LaTeX/PDF and an inert exact sidecar. PDF generation uses the installed
local TeX toolchain. All other formats preserve useful static output without it.
