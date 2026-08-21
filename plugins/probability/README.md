# `.probability`

`.probability` models probability laws, finite events, and repeatable
experiments. It is separate from `.stats`, which summarizes observed data and
will eventually perform inference, and from `.data`, which manages relations
and external datasets.

```rix
.Plugin.Load("probability");
d := .probability.Binomial(10, 1/2);
[d.PMF(5), d.CDF(5), d.Mean(), d.Variance()];
```

Phase 1 provides:

- `Choose`, `Permutations`, and `MultinomialCoefficient`;
- bounded `CartesianPower` and uniform `Event` enumeration;
- `Finite`, `Binomial`, `Multinomial`, `Dice`, and `CardDraw` distributions;
- a `Normal` distribution backed by certified Numerics PDF, CDF, and quantile
  algorithms;
- `StandardDeck` and `DrawCards`; and
- distribution-level `Sample`/`Simulate` methods plus namespace `Simulate`.

Finite PMFs, CDFs, moments, and samplers use exact Integer/Rational arithmetic.
Sampling a Rational probability uses exact integer rejection through RiX's
scoped RNG; it does not compare a binary float to the probability. Pass a seed
to `Simulate` to get a replayable record:

```rix
dice := .probability.Dice(2, 6);
run := dice.Simulate(100, {= seed=20260821 });
[run[:values], run[:samplingPolicy], run[:exactSampling]];
```

Simulation does not mutate a process-global random generator. A supplied seed
installs a lexically scoped default RNG for that run. The record uses
`rix.probability.simulation@1` and retains the distribution, sample count,
seed, sampling policy, and whether sampling itself was exact.

## Distribution contract

Every constructor returns an immutable map with schema
`rix.probability.distribution@1`. Common methods are `Family`, `Support`,
`Parameters`, `Sample`, `Simulate`, and `Record`. Discrete distributions expose
`PMF` and `CDF`; the normal law exposes `PDF`, `CDF`, and `Quantile`.

`Multinomial.CDF(bounds)` is the componentwise joint CDF
`P(X1 <= b1, ..., Xk <= bk)`, not a one-dimensional cumulative ordering.
`CardDraw(population, marked, draws)` is the hypergeometric law for successes
in sampling without replacement. `Dice(count,sides)` is the exact distribution
of the sum, computed by finite convolution.

The normal PDF/CDF/quantile results are certified refinable reals. Refining
them returns an interval guaranteed to contain the mathematical value:

```rix
normal := .probability.Normal(10, 2);
.numerics.Refine(normal.CDF(12), {=
    absoluteWidth=1/10000,
    maxWork=20000
});
```

Normal simulation selects an exact Rational probability from a finite grid and
applies the certified quantile. It is therefore explicitly marked
`exactSampling=0` with policy `:finiteQuantileGrid`; `grid` controls the
discretization. This avoids presenting an implementation approximation as an
exact draw from a continuous law.

`CartesianPower` defaults to at most 100,000 materialized outcomes. Increase
its `maxOutcomes` argument deliberately when an exhaustive experiment is
larger. For large spaces, prefer a distribution's direct PMF or simulator.
