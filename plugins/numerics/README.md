# `numerics`

`numerics` is a pure RiX orchestration plugin for bounded numerical work. It
creates portable refinement requests, dispatches them through methods on the
supplied value, and provides certified algorithm reals for weighted n-th roots,
rational powers, exponential/logarithmic functions, trigonometric functions,
the constant pi, and
Kantorovich/interval-Newton refinement. It depends on the generic Oracle
arithmetic target but does not inspect concrete Float, ball, Cauchy,
continued-fraction, or algebraic-real implementations.

## Load and use

```rix
.Plugin.Load("numerics")
.Plugin.Load("oracle")

real := .oracle.Rational(3 / 7, {= procedure = :bisection })
result := .numerics.Refine(real, {=
  absoluteWidth = 1 / 1000,
  maxWork = 20
})
```

`.numerics.Enclose` and `.numerics.Refine` return
`rix.numerics.enclosure@1` records. A result distinguishes:

- `certified`: whether the interval is proven to contain the represented real;
- `goalMet`: whether the requested width was reached;
- `status`: `:enclosed`, `:approximate`, `:goalNotMet`,
  `:budgetExhausted`, `:resolutionFloor`, `:unsupported`, or `:unknown`;
- `evidenceLevel`: the provider's honest evidence claim;
- `work` and `diagnostics`: bounded resource use and unresolved limitations.
- `approximation`: for certified providers, a scalar `CertifiedApproximation`
  carrying the candidate, exact enclosure, and precision provenance.

When a certified enclosure record is displayed, RiX presents its current exact
interval rather than dumping the orchestration record. The record itself is
unchanged: assign it and use keys such as `result[:status]`,
`result[:evidence]`, or `result[:work]` to inspect the full computation.
Uncertified and unresolved results retain their structured display so their
limitations are not hidden.

Exhaustion is a normal result. Certified providers preserve it as a certified
approximation rather than a guessed answer or an exception; uncertified
providers must not populate that field as though they had an error bound.

## Measurement intervals and certified ranges

A `RationalInterval` passed to the supported elementary functions denotes the
whole closed set of possible inputs. The function returns an immutable interval
image rather than treating the interval as an enclosure of one hidden real.
Use `.numerics.Range` (or the image's `.Range` method) to request certified
rational bounds:

```rix
.Plugin.Load("numerics");

measurement := 99/100:101/100;
image := .numerics.Sin(measurement);
answer := .numerics.Range(image, {=
  endpointTolerance=1/1000000,
  maxWork=200,
  maxSubintervals=8
});

{: answer[:interval], answer[:certified], answer[:domainStatus] };
```

The result schema is `rix.numerics.range-enclosure@1`. Its
`endpointTolerance` controls computation of the outer range boundaries; the
physical width caused by the input measurement is intentionally retained.
`Sin` and `Cos` use rational Taylor bounds and a global Lipschitz proof, with
bounded rational subdivision for tightness. Certified pi landmarks add exact
`-1`/`1` extrema when they occur in the input. Reciprocal trigonometric
functions distinguish a proved `:poleInInput` with
`domainStatus=:partiallyDefined` from an unresolved `:poleNotExcluded` result.
Domain coverage is independent of range status: a provider may certify a
partial defined image, certify that the defined image is empty, or report that
the remaining domain obligation is unresolved.

The same set-valued protocol covers hyperbolic functions, inverse hyperbolic
functions, `Erf`, `Erfc`, normal PDF, and normal CDF. Their range providers use
monotonicity, even symmetry, or exact pole/domain boundaries rather than
sampling.

Immutable Calculus expression graphs have a separate checked entry point:
`.numerics.GraphRange(expression, bindings, options?)`. The initial bridge
evaluates exact constants, variables, arithmetic composition, and Integer
powers; memoizes structural identities; preserves correlated `g-g` and `g/g`;
and can subdivide one exact rational binding. `.numerics.CheckGraphRange`
independently recomputes the portable claim. Semantic `apply` nodes remain
explicitly unresolved until their semantic ID is bound to checked or trusted
domain and range providers.

`.numerics.CheckDerivativeGraph(transformation)` independently recomputes
primitive Calculus differentiation rather than trusting the transformation's
visible evidence labels. `.numerics.DerivativeSign(transformation, bindings,
options?)` then encloses that derivative and proves `nondecreasing`,
`nonincreasing`, or `constant` only after every carried nonzero obligation is
discharged over the complete input. A derivative spanning both signs is an
honest inconclusive result; an input that may hit a quotient or power hole is
unresolved.

Two general smooth-function strategies build on the same checked graph
boundary. `.numerics.LipschitzRange(firstDerivative, bindings, options?)`
encloses each closed piece from its midpoint value and a certified bound on
`|f'|`. `.numerics.TaylorRange(secondDerivative, bindings, options?)` retains
`f'(midpoint)` and uses the signed second-derivative range for a first-order
Taylor remainder. Both accept `maxSubintervals`, expose every piece and bound,
discharge derivative obligations, and include a recomputation checker result.
The Taylor result also reports per-piece convex, concave, affine, or unknown
curvature. See the browser-safe [Explanatory
Explorations](../../explorations/README.md) for interactive investigations.

For an exact interval expression, generic subdivision can reduce dependency
overestimation while retaining the same input occurrence in each piece:

```rix
.numerics.Range((x)->x-x, 1:2, {= maxSubintervals=8 });  ## -1/8:1/8
```

Generic subdivided functions may return an exact scalar, `RationalInterval`, or
one supported Numerics interval image. That callback path does not infer a
graph from arbitrary code; use `GraphRange` when dependency and graph identity
must be explicit.

Range results now also expose `result[:range]` as a `RationalIntervalSet`.
`result[:interval]` remains the compatibility projection when that set is one
closed bounded component. RiX interval operators preserve disconnected sets:
`\/` is genuine union, `/\` is genuine intersection, and `|\/|` is the
explicit hull. `?/\`/`?&` test overlap, `!/\` tests disjointness, and
`.Split()` returns connected components.

See [range-arithmetic-tutorial.md](range-arithmetic-tutorial.md) for exact
arithmetic and scoped domain policy;
[interval-ranges-tutorial.md](interval-ranges-tutorial.md) for a full
transcendental measurement tutorial; and
[derivative-witness-tutorial.md](derivative-witness-tutorial.md) for runnable
general-function evidence and adversarial examples. The underlying designs
are [range-certification.md](range-certification.md) and
[calculus-range-bridge.md](calculus-range-bridge.md). See
[calculus-range-tutorial.md](calculus-range-tutorial.md) for the worked graph
range examples, and
[interval-ranges-checklist.md](interval-ranges-checklist.md) for implemented
unary coverage. The cross-component implementation plan is tracked in
[general-range-development-checklist.md](general-range-development-checklist.md).

## Provider protocol

For general set-valued functions, `.numerics.WithRangeKnowledge(Function,
knowledge)` returns a new callable with an attached
`rix.numerics.range-provider@1` descriptor. The implemented first slice accepts
`directRange(input, request)` and validates its
`rix.numerics.range-provider-result@1` record through
`.numerics.CheckRangeResult`. Function identity, exact covered input, range
type, status/domain consistency, endpoint goal, and bounded work are checked.

Scoped wrappers are always `evidenceLevel=:heuristic` and
`trust=:scopedUntrusted`, regardless of a caller-supplied trust label. Their
ranges may guide a computation but never produce `certified=1`; a callback
that tries to self-certify is rejected.

`.numerics.RegisterRangeProvider(Function, knowledge)` is the separate trusted
surface for a host-approved plugin or explicitly trusted session. Registration
crosses the `.Host` capability boundary, requires `Plugins` permission from an
imported script, and binds an immutable, non-forgeable seal to the exact
callable. Numerics then discovers the registered provider automatically when
that function is passed to `.Range`. `directRange` may be a RiX multifunction,
allowing guarded variants for supported input representations. Duplicate
function identities and callable registrations are rejected.

The seal cannot be serialized or recreated by writing
`trust=:trustedCapability`; that field is audit metadata only. Grant this
registration authority only when the provider's outward-enclosure invariant
has been reviewed. Exact set, partition, and range-arithmetic evidence can now
be independently checked; derivative, composition, and Sturm checker modules
remain later stages in the general-range checklist.

The schemas are documented in
[`range-provider.schema.json`](../../schemas/range-provider.schema.json) and
[`range-provider-result.schema.json`](../../schemas/range-provider-result.schema.json).

The existing singleton-real provider protocol is separate:

A provider value supplies receiver methods:

```rix
value.Enclose(request)
value.Refine(request)
value.Sample(request)
value.NumericsCapabilities()
```

The request schema is `rix.numerics.refinement-request@1`; the result schema is
`rix.numerics.enclosure@1`. That small value protocol is the extension point
used by the implemented `.ball`, `.cauchy`, `.continuedFraction`, and
`.algebraicReal` providers. Providers may use pure RiX or an approved host implementation
without changing Numerics algorithms.

Core owns request normalization, limit intersection, capability negotiation,
and result validation. This lets language Halo comparisons use exactly the
same contract without requiring the Numerics plugin to be loaded. Numerics is
the user-facing orchestration surface: `.Enclose`, `.Refine`, and `.Sample`
force their corresponding operation even when handed an existing request.

## Exact decision evidence

`.numerics.Sign(value, request?)` returns a
`rix.exact.sign-witness@1` record. Exact rationals and polynomial evaluations
are decided directly; other refinable singleton reals are decided only when a
certified enclosure excludes zero or proves the singleton zero. Otherwise the
normal result is `sign=:undecided`, never a guessed sign. Polynomial requests
provide the exact evaluation point as `{= at=q }`.

`.numerics.RootCount(polynomial, interval)` consumes the polynomial
`RootCountProvider` and returns its `rix.exact.root-count@1` record, including
the square-free counting polynomial, Sturm chain, variations, endpoint values,
and `(low, high]` policy.

Phase 1 includes certified Oracle, Ball, Cauchy, continued-fraction, and
algebraic-real adapters plus an approximate Float adapter. For Float, the
returned point interval exactly describes the stored IEEE-754 value, but
`certified` and `goalMet` are null because there is no error bound from that
stored value to the intended real computation.

## Universal algorithms and arithmetic

`.numerics.Sqrt(value)` and `.numerics.NthRoot(value, degree)` apply the
weighted averaging step using exact rational endpoint arithmetic. The current
guess and its partner `q/x^(n-1)` form the enclosing interval. The radicand may
be any certified refinable singleton real. `.Cbrt(value)` is the degree-three
convenience form and retains the real cube root for negative values.

`.numerics.Pow(value, exponent)` accepts an exact Rational exponent. It reduces
`value^(p/q)` to the universal q-th root followed by an integer power, retaining
the real-domain behavior of odd and even roots.

`.numerics.Exp(value)` and `.numerics.Log(value)` are certified natural
exponential and logarithm algorithm reals. Exact rational Taylor/atanh bounds
and rational range reduction produce their enclosures. A second argument
changes the base: `.numerics.Exp(3, 4)` is `4^3`, while
`.numerics.Log(3, 4)` is `log_4(3)`. `.numerics.Ln` aliases natural `Log`;
`.Log2` and `.Log10` select bases two and ten. `.Expm1(x)` and `.Log1p(x)`
provide the conventional near-zero spellings while retaining certified real
arithmetic rather than binary64 subtraction.

`.numerics.Pi()` is a certified algorithm real using Machin's identity with
alternating rational arctangent bounds. Angles are measured in radians.
`.Sin` and `.Cos` use rational Taylor enclosures lifted across a refined input
interval with their global Lipschitz bound. `.Tan`, `.Sec`, `.Csc`, and `.Cot`
are universal arithmetic compositions of those certified reals.

`.Asin`, `.Acos`, and `.Atan` use monotone endpoint enclosures. Arctangent uses
rational range reduction and the same certified pi value; inverse sine and
cosine combine it with the universal square-root algorithm. The synonymous
spellings `.Arcsin`, `.Arccos`, and `.Arctan` are also exported. Inverse sine
and cosine return structured `:unknown` evidence when the input cannot be
certified inside `-1:1`; reciprocal functions retain their ordinary poles.

Hyperbolic `Sinh`, `Cosh`, `Tanh`, `Sech`, `Csch`, and `Coth` compose the
certified exponential and arithmetic protocols. `Asinh`, `Acosh`, and `Atanh`
use the standard logarithm/root identities; `Arsinh`, `Arcosh`, and `Artanh`
are aliases. `Sinc` has its own Taylor refiner, so its removable value at zero
is certified as `1`. `Radians` and `Degrees` convert using certified pi.

The same plugin supplies certified special-function algorithms:

- `EulerGamma()`, `Gamma`, and `LogGamma` use Euler–Maclaurin and
  Stirling–Robbins bounds. Gamma returns exact positive-integer identities,
  uses direct certified half-integer identities on both sides of zero, and
  continues by recurrence on every real interval separated from its poles at
  `0,-1,-2,...`. Its evidence records the resulting sign. `LogGamma` remains
  the real positive-Gamma logarithm and currently requires a positive input.
- `Beta`, `LogBeta`, `Digamma`, and `Trigamma` certify positive-real inputs.
  Beta uses exact positive-integer values and the `Beta(1/2,1/2)=Pi()` identity
  when available; the general path uses Euler's rational product with a
  certified omitted-product tail bound.
- `Erf`/`Erfc` use an alternating entire series.
- `LambertW(x)` selects the principal real branch and `LambertW(x,-1)` the
  lower branch, both by certified monotone bisection.
- `BesselJ(n,x)` and `BesselY(n,x)` implement every exact integer order using
  certified recurrence bounds; the order-zero/order-one convenience names
  remain available. The Y family currently requires positive real arguments.
  Calculator-facing code should load the `bessel` plugin and use `.bessel.J`
  and `.bessel.Y`.
- `BesselI(n,x)` and `BesselK(n,x)` implement the modified families at every
  integer order. `I` accepts real arguments and uses parity; `K` requires a
  positive argument and uses its monotonicity to lift certified input
  intervals. Calculator-facing code should use `.bessel.I` and `.bessel.K`.
- `NormalPDF` and `NormalCDF` use direct request-sized Rational bounds.
  `NormalQuantile` uses a Chebyshev-certified outer bracket followed by
  certified interval Newton, with bisection as a fallback. These universal
  algorithms are used by the calculator-facing `.stats` functions.
- `Zeta` uses Euler–Maclaurin above one, Euler-transformed eta on `(0,1)`,
  exact Bernoulli values at nonpositive integers, and the Riemann functional
  equation below zero. `1` is reported as an explicit pole.

`.numerics.Quadrature(function,a,b,{= secondDerivativeBound=M })` constructs
a reusable certified composite-midpoint integral. The integrand may return any
certified refinable real. The caller must supply a valid nonnegative bound
`|f''| <= M` on the complete interval; the result records that assumption and
adds the rigorous `M*|b-a|^3/(24*n^2)` remainder outward.

`Hypot(x,y)` composes the universal root and arithmetic protocols.
`Atan2(y,x)` certifies the quadrant without converting either input to Float;
its range is `-pi < angle <= pi`, with `pi` on the negative horizontal axis
and a structured `:unknown` result at the undefined origin.

When a restricted domain cannot be certified, refinement returns structured
`:unknown` evidence rather than sampling a Float or claiming a real value.

These functions accept any certified refinable singleton real. They do not
convert Float values into claimed certificates.

`.numerics.Kantorovich(function, derivative, options)` checks a supplied
initial interval, derivative lower bound, second-derivative upper bound, and
the Kantorovich condition before creating a real. Subsequent requests use
interval Newton and retain nested certified enclosures.

The universal algorithms actualize each iteration into exact rational data. With
`trace=1`, every step reports `actualized=1`, so refinement never builds an
unbounded linked arithmetic-expression trail.

Certified real families implement `+`, `-`, `*`, `/`, integer powers, unary
negation, and absolute value. Same-family operations preserve that family;
Rationals become exact leaves of the family. Operations between different
families produce Oracle recipes. Float never participates in this implicit
promotion and must be constructed explicitly on every operand.

Select the functions a script wants to call without a namespace prefix:

```rix
.Plugin.Load("numerics");
.numerics[:Pow, :E=:Exp, :Log, :Log2, :Sin, :Cos, :Atan];

E(3, 4);  ## 64
Log2(8);
```

The selected names are ordinary bindings in the immediate lexical scope. A
selector of the form `:local=:export` aliases an export; an unaliased name is
shorthand for importing it under the same spelling. A
top-level selection lasts for the script or REPL session; a selection inside a
block disappears when that block exits. The `.numerics` mount remains available
in either case. Remounting with `.Plugin.Load("numerics", {= as="n" })` is still
available when a shorter namespace is preferable.

See [tutorial.md](tutorial.md) for worked examples and
[unary-functions.md](unary-functions.md) for the maintained calculator-function
inventory and implementation priorities. See
[accuracy-and-performance.md](accuracy-and-performance.md) for the reference
corpus, benchmark command, and interpretation of certified precision.
