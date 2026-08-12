# `solve`

Phase 1 consumes the existing inert `{# ... }` system carrier. It resolves
declared output roles, accepts exact input values, recognizes affine equality
expressions, and delegates the resulting matrix system to `.linalg`.

Supported expression operations are exact literals, identifiers, unary minus,
addition, subtraction, multiplication or division by exact scalars, and powers
zero or one. Inequalities and nonlinear expressions are rejected explicitly;
later phases dispatch them to Optimization, Algebra, and Numerics providers.

```rix
.Plugin.Load("solve");
S := {#a,b:x,y# x + y == a; x - y == b };
answer := .solve.System(S, {= values={= a=3, b=1 } });
answer.solution;
```

