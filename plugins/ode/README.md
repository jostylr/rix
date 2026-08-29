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

## Deliberate first-release limits

- forward first-order scalar and vector IVPs;
- fixed rational time steps;
- unconditional differentiable Calculus graphs with exact rational range
  endpoints;
- first-order componentwise Picard boxes, so wrapping can grow quickly;
- adaptive RK4 has estimates but no global certificate;
- event exclusions are certifiable, while event existence/uniqueness is not;
  and
- no Taylor-model flow, stiffness method, backward integration,
  boundary-value solver, or continuation yet.

The record shapes reserve those extensions. The next validated rung is
higher-order Taylor segments with affine/Taylor wrapping control, followed by
interval-Newton event times and adaptive certified subdivision. Boundary-value problems then
become a separate problem kind rather than being disguised as an IVP.

See [tutorial.md](tutorial.md) for runnable approximate, validated, and
bounded-failure examples.
