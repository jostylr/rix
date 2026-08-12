# `optimize`

Phase 1 provides exact linear programs in standard inequality form:

```text
maximize or minimize cᵀx
subject to A x <= b and x >= 0
```

`b` must currently be nonnegative so the origin supplies the initial feasible
basis. The deterministic primal-simplex implementation uses exact Rational
arithmetic and reports optimal, unbounded, or iteration-limit status. Later
phases add general bounds, equality and greater-than constraints, Phase I
feasibility, certificates, and nonlinear providers.

