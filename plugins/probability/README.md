# `.probability`

`.probability` models probability laws, finite events, and repeatable
experiments. It is separate from `.stats`, which summarizes observed data and
performs inference, and from `.data`, which manages relations
and external datasets.

```rix
.Plugin.Load("probability");
d := .probability.Binomial(10, 1/2);
[d.PMF(5), d.CDF(5), d.Mean(), d.Variance()];
```

The finite foundation provides:

- `Choose`, `Permutations`, and `MultinomialCoefficient`;
- bounded `CartesianPower` and uniform `Event` enumeration;
- `Finite`, `Binomial`, `Multinomial`, `Dice`, and `CardDraw` distributions;
- a `Normal` distribution backed by certified Numerics PDF, CDF, and quantile
  algorithms;
- `StandardDeck` and `DrawCards`; and
- distribution-level `Sample`/`Simulate` methods plus namespace `Simulate`.

Finite probability calculus includes `Conditional`,
`ConditionalProbability`, `Bayes`, `RandomVariable`, `Joint`, `Marginal`,
`ExpectedValue`, `VarianceOf`, `Covariance`, and `Independent`. These operate
on finite enumerated distributions and keep all weights exact. `Bayes` returns
an inspectable `rix.probability.bayes@1` record rather than only its posterior.

```rix
die := .probability.Finite([1,2,3,4,5,6],[1,1,1,1,1,1]);
even := .probability.Conditional(die,(x)->x%2==0);
[even.PMF(4),.probability.ExpectedValue(die)];
```

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
`PMF` and `CDF`; continuous laws expose `PDF`, `CDF`, and `Quantile`.

Phase 2 adds named Bernoulli, categorical, geometric, negative-binomial,
hypergeometric, Poisson, uniform, exponential, gamma, beta, chi-square,
Student-t, F, lognormal, and Cauchy laws.

`Multinomial.CDF(bounds)` is the componentwise joint CDF
`P(X1 <= b1, ..., Xk <= bk)`, not a one-dimensional cumulative ordering.
`CardDraw(population, marked, draws)` is the hypergeometric law for successes
in sampling without replacement. `Dice(count,sides)` is the exact distribution
of the sum, computed by finite convolution.

## Convolutions and mixtures

A convolution is the law of a sum of independent random variables. For finite
discrete laws its PMF is an exact sum,
`P(X+Y=z)=sum_x P(X=x)P(Y=z-x)`, so no integration is needed; `Dice` already
uses this case. For continuous densities the corresponding formula is
`f_(X+Y)(z)=integral f_X(x)f_Y(z-x) dx`, so a general certified implementation
does require integration (or a closed-form family rule). Simulation only needs
independent samples and addition. Arbitrary user-law convolution remains a
Phase 3 composition API.

A finite mixture chooses one component with exact weights and then samples
from that component. It is not a sum: its CDF, and its PDF or PMF when present,
is the weighted sum of the component methods. Finite mixtures therefore need
no new integration when their components can already answer the requested
method, although quantiles generally require certified inversion. A continuous
mixture over infinitely many parameter values does require integration over
the mixing law. Arbitrary user-law mixtures also remain planned for Phase 3.

Certified PDFs and CDFs return refinable reals. Refining them returns an
interval guaranteed to contain the mathematical value:

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

Uniform CDFs and quantiles are exact. Exponential, normal, lognormal, Cauchy,
and supported gamma-family formulas are certified. Gamma CDFs currently accept
integer or half-integer shape; beta CDFs accept positive integer parameters;
the chi-square constructor inherits the gamma domain; and F CDFs currently
require even degrees of freedom. Unsupported certified cases fail explicitly
instead of returning an unproved numerical estimate. Student-t uses certified
elementary reductions for every positive integer degree of freedom.

Continuous generic inverse CDFs return a rational interval whose width is
controlled by `width`. That interval encloses the quantile. It may stop wider
if the requested CDF precision cannot decide a comparison, preserving the
enclosure rather than guessing a side.

All continuous simulators draw from a finite probability grid and record
`exactSampling=0`. Poisson currently uses a binomial-limit simulator and says
so with `:binomialLimitApproximation`; `approximationTrials` controls it.
Gamma/beta-derived samplers use inverse-grid components. These policies make
approximation visible even when the distribution functions themselves are
certified.

The Cauchy constructor deliberately returns missing mean and variance and
`MomentsExist() == 0`; it is the standard counterexample in the companion
Central Limit Theorem exploration.

`CartesianPower` defaults to at most 100,000 materialized outcomes. Increase
its `maxOutcomes` argument deliberately when an exhaustive experiment is
larger. For large spaces, prefer a distribution's direct PMF or simulator.
