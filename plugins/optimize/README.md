# `optimize`

Phase 1 provides exact linear programs in standard inequality form:

```text
maximize or minimize cᵀx
subject to A x <= b and x >= 0
```

`b` must currently be nonnegative so the origin supplies the initial feasible
basis. The pure-RiX deterministic primal-simplex implementation uses exact
Rational arithmetic and reports optimal, unbounded, or iteration-limit status.
It returns shaped solution, slack, and tableau values and provides both
namespace functions and `LinearProgram.Solve()` / `LinearProgram.Evaluate()`
methods. Later phases add general bounds, equality and greater-than constraints,
Phase I feasibility, certificates, and nonlinear providers. The former
JavaScript implementation remains only as `optimize.reference.js` for parity
comparison.
