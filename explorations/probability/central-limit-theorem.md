---
title: The Central Limit Theorem and its boundary
kind: explanatory-exploration
companion: central-limit-theorem.rix
---

# The Central Limit Theorem and its boundary

The familiar independent, identically distributed Central Limit Theorem says
that if the source variable has finite mean `mu` and positive finite variance
`sigma^2`, then

```text
(X1 + ... + Xn - n*mu) / (sigma*sqrt(n))
```

converges in distribution to the standard normal law. The conclusion is about
the distribution after centering and scaling. It does not say that raw sums
stay in a fixed location or width, and it does not say every source law has a
finite mean and variance.

## Exact finite examples

Open [central-limit-theorem.rix](central-limit-theorem.rix) in `rix-web`. The
slider selects a number of fair dice. `.probability.Dice(n,6)` obtains the sum
law by exact finite convolution, so every plotted bar is an exact Rational
PMF—not a histogram of simulated floats.

The companion also compares one, two, four, and eight dice. Their exact means
and variances obey

```text
E[sum] = n*7/2
Var(sum) = n*35/12.
```

The unstandardized support widens as `n` grows and the largest individual point
mass falls. If the horizontal coordinate is instead centered by `n*7/2` and
scaled by `sqrt(n*35/12)`, the shape approaches the normal density. Bernoulli
sums give the binomial version of the same story.

## Normal inputs are a fixed point

Independent normal variables add to another normal variable. Consequently, a
standardized average of normal inputs is exactly normal for every positive
sample size; it does not need to wait for a limiting approximation. The
companion asks the certified normal CDF for its value at zero and refines it to
the enclosing singleton interval `1/2:1/2`.

This distinction matters in RiX. A certified normal PDF or CDF is a refinable
real whose requested interval is guaranteed to enclose the mathematical value.
A finite simulation can be useful evidence about behavior, but it is not a
certificate of a limit theorem.

## Why Cauchy defeats this CLT

The standard Cauchy density is

```text
1 / (pi*(1+x^2)).
```

Its mean and variance do not exist. More strongly, if `X1,...,Xn` are
independent standard Cauchy variables, `(X1+...+Xn)/n` is itself standard
Cauchy. The quartiles remain `-1`, `0`, and `1` no matter how large `n` grows.
The average does not concentrate around zero, so this is not merely a case of
slow convergence.

Phase 2 of `.probability` plans a first-class Cauchy distribution with PDF,
CDF, quantile, and seeded simulation. The Phase 1 companion records the exact
stability fact and keeps its simulation explicitly pending rather than using a
truncated Cauchy sample that would secretly have finite variance.

## Computing versus simulating

Exact PMFs answer questions about a finite law without Monte Carlo error.
Simulation is useful when the event space is large, for developing intuition,
and for checking implementations. `.probability` keeps both paths available:

```rix
dice := .probability.Dice(8,6);
exact := dice.PMF(28);
run := dice.Simulate(1000,{= seed=42});
```

The first value is exact. The second is a replayable experiment record whose
empirical frequency will generally differ from the PMF.

## Further explorations

1. Move the slider from one to twelve dice. Track the largest exact point mass
   and explain why it shrinks even though total probability remains one.
2. Replace fair six-sided dice with a binomial law. Compare `Binomial(n,1/2)`
   to a sum of `n` Bernoulli trials and identify the matching mean and variance.
3. Simulate the eight-dice law with several seeds. Compare the empirical count
   at the mean with the exact PMF, without expecting equality.
4. Change the die to a finite weighted distribution using `.probability.Finite`.
   Predict whether the classical iid CLT applies before simulating.
5. When Phase 2 lands, generate Cauchy sample averages for several `n`. Plot
   their quartiles and contrast them with uniform and exponential averages.
6. Construct a truncated Cauchy law and explain why it eventually satisfies
   the finite-variance CLT even though moderate samples may still look wild.
