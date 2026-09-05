# `.ode`

`.ode` defines portable ordinary-differential-equation problem and solution
records. It is a pure RiX, browser-safe plugin over public Calculus graphs and
Numerics range evidence; it has no file, network, native, or external-solver
dependency.

## Initial-value problems

```rix
.Plugin.Load("ode");
t := .calculus.Variable(:t);
y := .calculus.Variable(:y);
problem := .ode.IVP(y+t,0,1,0:1,{=
  independent=:t,
  stateNames=[:y],
  parameters={= },
  units={= t=:seconds,y=:meters },
  events=[],
  assumptions=[:continuouslyDifferentiable]
});
```

`IVP(rhs,initialTime,initialState,interval,options?)` returns
`rix.ode.problem@1`. `rhs`, `initialState`, and `stateNames` are arrays in the
record even for a scalar problem. Euler, RK4, adaptive RK4, and validated
Picard all preserve that coordinate order for vector systems. Parameters,
units, event specifications, and regularity assumptions remain portable data.

The right-hand side must use public Calculus expressions rather than an opaque
callback. This makes derivative identity, domain checking, interchange, and
eventual recipe revival possible without serializing executable code.

## Educational approximate methods

- `Euler(problem,{= steps=n })` uses fixed-step explicit Euler.
- `RK4(problem,{= steps=n })` uses the classical fixed-step four-stage method.
- `AdaptiveRK4(problem,{= tolerance=e })` compares one full RK4 step with two
  half steps, rejects or enlarges rational steps, and records the exact
  step-doubling estimate.

All compute deterministic exact-rational step arithmetic when the expression
does. Their solution status is always `:approximate`, `certified` is unset,
and no global error certificate is claimed. AdaptiveRK4's local estimate is an
observed estimator, not a proof of the trajectory's error.
Formal method order is instructional metadata, not an error certificate.
Approximate methods require a point initial state so interval uncertainty is
never silently replaced by a midpoint.

Approximate segments use `rix.ode.dense-segment@1` with linear interpolation.
`solution.At(t)` evaluates that retained interpolation; it does not upgrade the
answer to a certified trajectory.

## Validated Picard tubes

`ValidatedPicard(problem,options?)` is the first certified solver rung. On each
fixed time segment `T=[t0,t1]`, it searches for a rational interval box `B` such
that

```text
Y0 + [0,h] f(T,B) subset B,  h=t1-t0.
```

The condition is componentwise for systems. RiX derives and checks the full
state Jacobian, certifies its complete interval range on `T x B`, and requires
the infinity-norm contraction bound `h max_i sum_j |J_ij(B)| < 1`. The self-map
and contraction establish existence and uniqueness. The endpoint is enclosed
by `Y0 + h*f(T,B)`. All graph ranges use
exact outward interval arithmetic and retain their independently checkable
evidence.

Options are:

- `steps` (default 4): fixed segment count;
- `maxTubeIterations` (default 8): maximum radius doublings per segment;
- `maxSubintervals` (default 4): bounded graph-range subdivision; and
- `tubeRadius`: optional positive initial search radius.

A completed result has `status=:validated`, `classification=:certifiedTube`,
and `certified=1`. If a self-map cannot be established, the result has
`status=:partial`; all earlier certified segments and the unresolved attempted
segment remain available. `solution.At(t)` returns the certified tube covering
`t`, not a midpoint estimate. Scalar queries retain the convenient scalar
return; vector queries return the ordered interval box.

## Event candidates and exclusions

`Event(expression,{= name=:zero,direction=:any })` creates a portable event
record. `solution.IsolateEvents()` then reports one result per event.

- On approximate linear dense output, sign changes are bisected and labeled
  `:observedCandidate`; they are not certified trajectory events.
- On validated tubes, a graph range excluding zero certifies that the whole
  segment has no event. A range containing zero is only an
  `:unresolvedCandidate`: containment alone proves neither existence nor
  uniqueness.

This distinction leaves room for the later certified event method, which must
combine a dense validated flow with an interval-Newton derivative test.

## Second-order validated Taylor flow

`ValidatedTaylor2(problem,options?)` starts with the same checked Picard
self-map used by `ValidatedPicard`, then derives the total derivative

```text
d f_i/dt = partial_t f_i + sum_j partial_(y_j) f_i * f_j.
```

Complete graph-range checks bound this derivative over the Picard tube. On
each segment RiX encloses

```text
y(t0+s) = y(t0) + s f(t0,y(t0)) + s^2/2 * y''(xi)
```

and intersects that result with the independently certified Picard tube. This
is a second-order interval Taylor remainder with segmentwise recentering. It
reduces dependency growth, but it is not yet a general polynomial Taylor model
or affine-arithmetic flow. The record says so explicitly through
`wrappingControl.kind=:secondOrderTaylorRecentering` and
`affineArithmetic=null`.

Fixed `ValidatedTaylor2` stops at the first failed tube and retains that
uncertified segment in `segments`, with
`work.stopReason=:tubeSelfMapNotEstablished`. It does not retry the same step
or silently omit its evidence. This differs from the adaptive solver's
accepted-only segment list and separate candidate history.

For these Taylor segments, event isolation can now certify one event. RiX
requires certified opposite endpoint signs, checks the total event derivative
`g_t + grad(g) dot f` away from zero, and contracts the time interval with
interval Newton. The resulting `:certifiedUniqueEvent` combines the
intermediate-value existence argument with monotonic uniqueness. If the
endpoint bracket or derivative test is unavailable, the candidate remains
unresolved.

## Adaptive certified subdivision

`AdaptiveValidatedTaylor2(problem, options?)`, also a problem method, uses the
same Picard and Taylor certificates with rational step subdivision. `steps`
(default 4) sets the initial and maximum step size. A rejected self-map or
contraction halves the step; an accepted segment advances the interval state
and may double the next step up to that maximum.

`maxAttempts` (default 256) bounds all accepted and rejected attempts.
`minimumStep` (default `1/1048576`) stops further halving below that size.
Optional `remainderTolerance` bounds the largest component of
`h^2 sup |y''| / 2` on each accepted segment. This is a certified local
remainder bound, not a global error tolerance or a promise about final enclosure
width. Initial-state uncertainty and interval wrapping remain in the result.

`work.attempts` retains each candidate segment, its acceptance/rejection reason,
and its remainder bound. Adaptive `segments` contains only the accepted prefix.
If work is exhausted, `coveredInterval` identifies that prefix and
`work.stopReason` distinguishes `:attemptBudgetExhausted` from
`:minimumStepReached`. The existing dense queries and event checks apply to
every accepted Taylor segment. Unsupported derivative/domain graphs still
produce explicit diagnostics; adaptation currently handles tube validation and
local remainder rejections.

## Deliberate first-release limits

- forward first-order scalar and vector IVPs;
- fixed or adaptively subdivided rational time steps;
- unconditional differentiable Calculus graphs with exact rational range
  endpoints;
- second-order interval Taylor recentering, but no general affine or
  polynomial Taylor-model algebra yet;
- adaptive RK4 has estimates but no global certificate;
- event existence/uniqueness is certified only on Taylor segments with a
  checked endpoint bracket and nonzero total event derivative;
  and
- no Taylor-model flow, stiffness method, backward integration,
  boundary-value solver, or continuation yet.

The record shapes reserve those extensions. The next validated rung is a
general higher-order Taylor-model or affine flow using the adaptive controller.
Boundary-value problems then become a separate problem kind
rather than being disguised as an IVP.

See [tutorial.md](tutorial.md) for runnable approximate, validated, and
bounded-failure examples.
