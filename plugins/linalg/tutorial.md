---
title: Exact linear algebra and Frames
description: Solve rational matrix systems and change tensor coordinates without losing tensor identity.
theme: Algebra and analysis
plugin: linalg
status: implemented
---

```rix
.Plugin.Load("linalg");
A := {:2x2: /Matrix/ 2, 1; 1, -1};
solution := .linalg.Solve(A, [5, 1]);
solution.solution;
```

```rix
vspace := .linalg.VectorSpace({= name="V", dimension=2, over=:Rational });
standard := .linalg.Frame(vspace, {= name="standard", basis=:defining });
skew := .linalg.Frame(vspace, {= name="skew", relativeTo=standard, basis=[1, 1; 0, 1] });
v := {:2: /Vector: Standard/ 2, 3};
inSkew := .linalg.Transform(v, skew);
{: .linalg.Components(inSkew), .linalg.SameTensor(v, inSkew) };
```

## Inspect fraction-free elimination

Bareiss elimination keeps exact pivot and row-swap evidence. The stored stages
make the recurrence visible without replacing the source matrix.

```rix
.Plugin.Load("linalg");
A := [0,2,1; 2,3,4; 4,1,5];
work := .linalg.Bareiss(A);
{=
    echelon=work[:echelon],
    pivots=work[:pivots],
    swaps=work[:rowswaps],
    stages=work[:stages],
    determinant=work[:determinant],
    verified=work.Verify()
};
```

## Reuse one exact factorization

The permutation is part of the mathematical record: `P A = L U`. Solving two
right-hand sides does not repeat elimination.

```rix
.Plugin.Load("linalg");
A := [0,2; 3,4];
factor := .linalg.LU(A);
{=
    first=factor.Solve([2,7]),
    second=factor.Solve([4,11]),
    inverse=factor.Inverse(),
    determinant=factor.Determinant(),
    verified=factor.Verify()
};
```

Use `.linalg.LDU(A)` when the separated diagonal is useful. It satisfies
`P A = L D U`, and its final `U` has unit diagonal.

## Compute QR without leaving the Rational domain

This matrix has orthogonalization norms `5` and `3`, so both reduced factors
remain exact:

```rix
.Plugin.Load("linalg");
A := {:2x2: /Matrix/ 3,0;4,5};
qr := A.QR();
{=
    status=qr[:status],
    q=qr.Q(),
    r=qr.R(),
    verified=qr.Verify()
};
```

An input that needs `sqrt(2)` returns a diagnostic rather than approximate
entries or a hidden coefficient-domain change:

```rix
needsRoot := .linalg.QR([1,0;1,1]);
{=
    status=needsRoot[:status],
    column=needsRoot[:column],
    squaredNorm=needsRoot[:squarednorm],
    requiredExtension=needsRoot[:requiredextension]
};
```

Check `:status` before using `Q()` or `R()`. Successful results use
`:decomposed`; other current statuses are `:unsupportedCoefficientExtension`,
`:rankDeficient`, and `:requiresTallOrSquareMatrix`.

## Compute the fundamental subspaces

```rix
.Plugin.Load("linalg");
A := [1,2,3; 2,4,6];
rows := .linalg.RowSpace(A);
columns := .linalg.ColumnSpace(A);
nulls := .linalg.NullSpace(A);
{=
    rowBasis=rows.Basis(),
    columnBasis=columns.Basis(),
    nullBasis=nulls.Basis(),
    dimensions=[rows[:dimension],columns[:dimension],nulls[:dimension]],
    verified=[rows.Verify(),columns.Verify(),nulls.Verify()]
};
```

For this matrix the dimensions are `1`, `1`, and `2`. Each result keeps its
original source matrix and exact pivot evidence.
