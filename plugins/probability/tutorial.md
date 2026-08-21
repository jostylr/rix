---
title: Probability laws and replayable experiments
description: Compute exact finite probabilities, use certified continuous laws, and run disclosed simulations.
theme: Probability
status: implemented
plugin: probability
order: 21
---

## Start with a probability law

A distribution is a reusable value rather than a one-off numerical answer.
The binomial PMF, CDF, mean, and variance below are exact rationals.

```rix
.Plugin.Load("probability");
coins := .probability.Binomial(10, 1/2);
[coins.PMF(5), coins.CDF(5), coins.Mean(), coins.Variance()];
```

For more than two outcomes, use a multinomial law. Its CDF is componentwise.

```rix
.Plugin.Load("probability");
colors := .probability.Multinomial(4, [1/2, 1/3, 1/6]);
[colors.PMF([2, 1, 1]), colors.Mean()];
```

## Enumerate a small finite experiment

`CartesianPower` is intentionally bounded. Here it materializes the 36 equally
likely ordered outcomes of two dice, then `Event` counts the favorable ones.

```rix
.Plugin.Load("probability");
rolls := .probability.CartesianPower([1,2,3,4,5,6], 2);
seven := .probability.Event(rolls, (roll) -> roll[1]+roll[2] == 7);
[seven[:favorableCount], seven[:outcomeCount], seven[:probability]];
```

The specialized dice law reaches the same exact answer without materializing
all tuples and also provides direct simulation.

```rix
.Plugin.Load("probability");
dice := .probability.Dice(2, 6);
[dice.PMF(7), dice.CDF(6), dice.Mean(), dice.Variance()];
```

## Draw cards exactly or simulate a deck

`CardDraw(52,4,5)` is the hypergeometric law for the number of aces in a
five-card hand. `DrawCards` returns actual card records.

```rix
.Plugin.Load("probability");
aces := .probability.CardDraw(52, 4, 5);
.RNG(:default, {= seed=314159 });
hand := .probability.DrawCards(.probability.StandardDeck(), 5);
[aces.PMF(0), aces.CDF(1), aces.Mean(), hand];
```

## Replay a simulation

The two runs match because each uses its own lexically scoped RNG initialized
from the same seed. The simulation record documents its policy.

```rix
.Plugin.Load("probability");
dice := .probability.Dice(2, 6);
first := dice.Simulate(12, {= seed=42 });
second := .probability.Simulate(dice, 12, {= seed=42 });
[first[:values] == second[:values], first[:samplingPolicy], first[:exactSampling]];
```

## Refine the normal law

Normal values remain certified objects. Asking for more precision produces an
enclosing rational interval; it never turns a float estimate into a proof.

```rix
.Plugin.Load("probability");
normal := .probability.Normal(0, 1);
[normal.CDF(0), normal.PDF(0)].Map((value) ->
    .numerics.Refine(value, {= absoluteWidth=1/10000, maxWork=20000 })
);
```

Normal simulation uses a finite quantile grid and says so in its returned
record. Increase `grid` for a finer approximation.

```rix
.Plugin.Load("probability");
normal := .probability.Normal();
run := normal.Simulate(4, {= seed=7, grid=1024 });
[run[:values], run[:samplingPolicy], run[:exactSampling]];
```

## Use the broader distribution library

Named discrete laws share `PMF`, `CDF`, `Quantile`, moment, and simulation
methods.

```rix
.Plugin.Load("probability");
geometric := .probability.Geometric(1/3);
poisson := .probability.Poisson(2);
hyper := .probability.Hypergeometric(52, 4, 5);
[
    geometric.PMF(2), geometric.CDF(4), geometric.Mean(),
    hyper.PMF(0),
    .numerics.Refine(poisson.CDF(3), {= absoluteWidth=1/1000, maxWork=20000 })
];
```

Continuous laws expose `PDF`, `CDF`, and `Quantile`. Generic inverse CDFs
return rational brackets that enclose the answer.

```rix
.Plugin.Load("probability");
gamma := .probability.Gamma(2);
beta := .probability.Beta(2, 3);
student := .probability.StudentT(4);
[
    .numerics.Refine(gamma.CDF(1), {= absoluteWidth=1/1000, maxWork=20000 }),
    beta.CDF(1/2),
    beta.Quantile(1/2, {= width=1/1000 }),
    .numerics.Refine(student.CDF(1), {= absoluteWidth=1/1000, maxWork=20000 })
];
```

Certified parameter domains are explicit: gamma CDFs support integer and
half-integer shape, beta CDFs support positive integer parameters, and F CDFs
currently support even degrees of freedom. Other cases report an unsupported
certificate rather than substituting a float.

## See where the classical CLT stops

Uniform and exponential laws have finite variance. The Cauchy law has neither
mean nor variance, and its sample average is again Cauchy.

```rix
.Plugin.Load("probability");
uniformRun := .probability.Uniform(-1,1).Simulate(8, {= seed=12, grid=256 });
exponentialRun := .probability.Exponential().Simulate(8, {= seed=12, grid=256 });
cauchyRun := .probability.Cauchy().Simulate(8, {= seed=12, grid=256 });
[
    uniformRun[:samplingPolicy],
    exponentialRun[:samplingPolicy],
    cauchyRun[:samplingPolicy],
    .probability.Cauchy().Mean(),
    .probability.Cauchy().Variance()
];
```
