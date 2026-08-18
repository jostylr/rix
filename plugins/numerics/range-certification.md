# Certified knowledge for general function ranges

This note describes what RiX can know about a general function in order to
prove a range enclosure over a `RationalInterval`.  It is a design guide, not a
claim that every knowledge form below is already an attachable public API.

The target statement is always

```text
result.interval contains { F(x) | x is in input and F(x) is defined }
```

For a result with `domainStatus=:allDefined`, RiX has additionally proved that
`F` is defined at every point of the input.  Sampling, dense plotting, and
agreement with binary64 values are useful diagnostics, but none proves either
statement.

## Knowledge RiX can use today

### An exact interval extension

The most direct provider is a function that accepts a `RationalInterval` and
returns a `RationalInterval` using only outward-safe exact interval operations:

```rix
.Plugin.Load("numerics");

F := (x) -> x^2 - 3*x + 1;
answer := .numerics.Range(F, 1:2, {= maxSubintervals=16, maxWork=160 });
answer[:interval];
```

Subdivision narrows dependency overestimation, while the hull of all pieces
remains certified.  Repeated occurrences still refer to the same subinterval;
for example, subdividing `x-x` contracts its enclosure toward zero.

A callback may also return one supported Numerics interval image:

```rix
.Plugin.Load("numerics");

answer := .numerics.Range(
  (x) -> .numerics.Sin(x),
  1:2,
  {= endpointTolerance=1/100000, maxSubintervals=8, maxWork=240 }
);
answer[:interval];
```

Arithmetic between several interval images is not yet an expression-graph
range engine.  Write a dedicated range provider or use exact interval
operations around a separately enclosed image until that layer exists.

### Built-in mathematical facts

The current Numerics range implementations use facts embedded in their
certified algorithms:

- monotonicity, so endpoint enclosures determine the whole range;
- even symmetry plus monotonicity in `|x|` for `Cosh`, `Sech`, and normal PDF;
- exact rational Taylor remainders and the global Lipschitz constant `1` for
  `Sin` and `Cos`;
- certified enclosures of pi to prove extrema and trigonometric poles;
- exact domain boundaries for logarithms, roots, inverse functions, and
  hyperbolic poles; and
- global codomain bounds such as `-1:1` for sine and cosine.

These are proof-producing implementations, rather than unchecked labels on a
function.

## The most useful future knowledge forms

The following forms cover most ordinary scientific functions.  A future
attachment API should accept verifiable witnesses or trusted proof-producing
providers, not a bare `monotone=1` assertion.

### 1. Domain and singularity knowledge

Useful fields are a domain prover, isolated excluded points or intervals, and
a partitioner.  This knowledge answers three different questions:

- Is the function defined on the entire input?
- Is an undefined point proved to lie inside it?
- Is the available precision merely insufficient to exclude one?

RiX already distinguishes `:domainViolation`/`:poleInInput` from
`:unknown`/`:poleNotExcluded`.  Interval unions or extended endpoints will be
needed before a range crossing a pole can be represented instead of rejected.

### 2. Monotonicity and critical-point knowledge

An increasing or decreasing function needs only certified endpoint values.
Piecewise monotonicity is nearly as good if a provider can isolate every
critical point in the input.  A useful witness contains:

```text
domain piece, direction, proof method, isolated critical-point enclosures
```

Derivative signs, Sturm witnesses for polynomial derivatives, and known
transcendental landmarks can all justify such a partition.

### 3. A derivative or Lipschitz bound

If `|F'(x)| <= L` on an interval centered at `m`, then

```text
F(input) is contained in F(m) + (-L*r):(L*r)
```

where `r` is the input radius and `F(m)` is itself certified.  This is often
the easiest reusable contract for user functions.  Subdivision improves it
linearly, and a varying interval enclosure for `F'` is usually tighter than
one global `L`.

The derivative bound must cover the whole piece.  Evaluating a derivative at
the midpoint is not a proof of that bound.

### 4. Convexity and higher derivatives

Convexity can rule out interior maxima; concavity can rule out interior
minima.  A certified second-derivative interval supports both facts and also
enables Taylor models:

```text
F(m) + F'(m)(x-m) + remainder,
|remainder| <= M*r^2/2.
```

This retains much more dependency information than ordinary interval
evaluation for smooth narrow measurements.

### 5. Algebraic and symbolic structure

An immutable expression DAG lets the range engine:

- reuse the same input identity instead of treating occurrences as
  independent;
- differentiate supported expressions exactly;
- simplify identities before interval evaluation;
- recognize monotone compositions; and
- select polynomial, rational-function, or root-isolation algorithms.

This is the natural bridge from the Symbolic and Calculus plugins.  Proofs
should be attached to the transformed graph so that a simplification cannot
silently change the function or its domain.

### 6. Periodicity, symmetry, and a global codomain

A certified period reduces very large inputs to bounded pieces.  Odd/even
symmetry reduces duplicated work.  A global range such as `-1:1` supplies a
safe fallback and can prove that further subdivision cannot improve a result
past a known extremum.

### 7. A direct range provider

Special functions often deserve an expert provider:

```text
Range(input, request) -> certified range-enclosure result
```

Such a provider may use monotonicity tables, recurrence relations, integral
bounds, or published inequalities internally.  It should report its domain
proof, work, achieved endpoint tolerance, and the theorem or witness family
used.  This is preferable to forcing every function through generic interval
arithmetic.

## Suggested future attachment shape

A future API could attach a map resembling the following to a callable:

```rix
knowledge := {=
  domain = DomainProvider,
  intervalExtension = IntervalProvider,
  derivativeRange = DerivativeProvider,
  criticalPoints = CriticalPointProvider,
  monotonicity = MonotonicityProvider,
  globalRange = (-1):1,
  period = PeriodProvider,
  evidenceLevel = :proof
};
```

The names are illustrative.  Each provider needs a stable schema and must
return checkable evidence.  RiX should choose the strongest applicable method,
then fall back through derivative bounds, exact interval subdivision, and a
global codomain.  It should never turn an unverified annotation into
`certified=1`.

## Recommended implementation order

1. Standardize a direct user-defined `Range` provider result and validator.
2. Add derivative-range/Lipschitz providers with bounded subdivision.
3. Connect pure symbolic expression DAGs and exact derivatives.
4. Add domain partition and finite critical-point provider schemas.
5. Introduce interval unions and extended endpoints.
6. Add multivariate boxes with Jacobian bounds, then affine arithmetic or
   Taylor models where repeated-variable dependency dominates.

This order provides useful certification early without committing the current
single closed-interval result schema to problems it cannot honestly represent.
