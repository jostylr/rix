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
record even for a scalar problem, preserving the coordinate order needed by
later vector and higher-order reductions. Parameters, units, event
specifications, and regularity assumptions remain inert data. The current
execution methods support forward scalar problems; vector records are already
accepted but fail explicitly when passed to a scalar solver.

The right-hand side must use public Calculus expressions rather than an opaque
callback. This makes derivative identity, domain checking, interchange, and
eventual recipe revival possible without serializing executable code.

## Educational approximate methods

- `Euler(problem,{= steps=n })` uses fixed-step explicit Euler.
- `RK4(problem,{= steps=n })` uses the classical fixed-step four-stage method.

Both compute deterministic exact-rational step arithmetic when the expression
does. Their solution status is always `:approximate`, `certified` is unset,
and the record states that no local or global error estimate was computed.
Formal method order is instructional metadata, not an error certificate.
Approximate methods require a point initial state so interval uncertainty is
never silently replaced by a midpoint.

Approximate segments use `rix.ode.dense-segment@1` with linear interpolation.
`solution.At(t)` evaluates that retained interpolation; it does not upgrade the
answer to a certified trajectory.

## Validated Picard tubes

`ValidatedPicard(problem,options?)` is the first certified solver rung. On each
fixed time segment `T=[t0,t1]`, it searches for a rational interval `B` such
that

```text
Y0 + [0,h] f(T,B) subset B,  h=t1-t0.
```

The self-map condition supplies a Picard existence enclosure. RiX derives
`df/dy` from the public expression, checks the derivative transformation, and
certifies its complete range on `T x B`; the resulting Lipschitz bound supplies
uniqueness. The endpoint is enclosed by `Y0 + h*f(T,B)`. All graph ranges use
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
`t`, not a midpoint estimate.

## Deliberate first-release limits

- forward scalar IVPs only for execution;
- fixed rational time steps;
- unconditional differentiable Calculus graphs with exact rational range
  endpoints;
- first-order Picard endpoint enclosures, so wrapping can grow quickly;
- no event isolation yet; and
- no adaptive RK pair, Taylor-model flow, vector system, stiffness method,
  boundary-value solver, or continuation yet.

The record shapes reserve those extensions. The next validated rung is vector
Picard/Taylor segments using checked Jacobians and Taylor models, followed by
event-time intervals and adaptive subdivision. Boundary-value problems then
become a separate problem kind rather than being disguised as an IVP.

See [tutorial.md](tutorial.md) for runnable approximate, validated, and
bounded-failure examples.
