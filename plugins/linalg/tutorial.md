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

## Move vectors and covectors through a linear map

```rix
.Plugin.Load("linalg");
V := .linalg.VectorSpace("V",2); W := .linalg.VectorSpace("W",3);
e := .linalg.Frame(V,"e",:defining); g := .linalg.Frame(W,"g",:defining);
A := .linalg.LinearMap(V,W,{:3x2: 1,0;0,1;1,1},{=
  sourceFrame=e,targetFrame=g,name="A"
});
x := .linalg.Vector([1,2],e);
alpha := .linalg.Covector([1,1,1],g);

{=
  pushed=A.Pushforward(x),
  pulled=A.Pullback(alpha),
  dual=A.Dual(),
  verified=A.Verify()
};
```

Pushforward uses `A`; pullback uses its exact transpose. `Compose` checks the
middle abstract space and inserts a Frame change when needed. A square map's
`Inverse` swaps domain and codomain and exactly inverts the matrix.

## Tensor products and contractions

```rix
.Plugin.Load("linalg");
V := .linalg.VectorSpace("V",2);
e := .linalg.Frame(V,"e",:defining);
x := .linalg.Vector([1,2],e);
alpha := .linalg.Covector([3,4],e);
outer := x.TensorProduct(alpha);
{: outer.components,outer.Contract(1,2) };
```

The contraction is `3 + 8 = 11`. It is accepted because one slot is primal,
one is dual, and both belong to `V`. Incompatible variance or spaces are an
error instead of an implicit identification.

## Give a Polynomial a linked Vector view

```rix
.Plugin.Load("linalg");
P3 := .linalg.PolynomialSpace(3,:x);
p := .p`x^2+2*x+3`;
view := P3.Realize(p);
rebuilt := view.Reconstruct();

{:
  p.__type,
  view[:vector].components,
  rebuilt==p,
  .linalg.Serialize(view),
  .linalg.Serialize(view[:vector])
};
```

The coefficients are `[3,2,1,0]` in the monomial Frame, but `p` remains a
callable Polynomial with Polynomial arithmetic. Serialized records contain
stable IDs and data rather than the cyclic in-memory lineage graph.

## Choose a dual Frame explicitly

```{.rix exec=true id=finite-dual-frame}
.Plugin.Load("linalg");
space := .linalg.VectorSpace("dual example",2);
e := .linalg.Frame(space,"e",:defining);
chosen := e.Dual("chosen dual",[1,1;0,1]);
x := .linalg.Vector([2,3],e);
alpha := .linalg.Vector([4,5],chosen);
alpha.Pair(x) ##@ == 33
{: alpha.__type,alpha.Pair(x),alpha==.linalg.Covector([9,5],e),
   e.Dual().Dual()[:frameidentity]==e[:frameidentity] };
```

The pairing is `33`. A dual basis changes coordinates by inverse transpose;
no metric is needed to pair a Covector with a Vector.

## Raise and lower indices with a metric

```{.rix exec=true id=finite-metric}
.Plugin.Load("linalg");
space := .linalg.VectorSpace("metric example",2);
e := .linalg.Frame(space,"e",:defining);
f := .linalg.Frame(space,{= relativeTo=e,basis=[1,1;0,1] });
metric := .linalg.Metric(e,[2,1;1,3]);
x := .linalg.Vector([2,3],e);
alpha := x.Lower(metric);
x.NormSquared(metric) ##@ == 47
alpha.Raise(metric)==x ##@ == 1
{=
  covector=alpha.components,
  recovered=alpha.Raise(metric)==x,
  squaredNorm=x.NormSquared(metric),
  invariant=x.Transform(f).Lower(metric.Transform(f))==alpha.Transform(f)
};
```

The metric is part of the operation, not a consequence of choosing coordinates.
It must be exact, symmetric and nonsingular. `Norm` and `Angle` additionally
require positive definiteness and report unsupported coefficient extensions
when a result is not Rational.

## Project symmetry and distinguish components from tensor views

```{.rix exec=true id=finite-symmetry}
.Plugin.Load("linalg");
space := .linalg.VectorSpace("tensor example",2);
e := .linalg.Frame(space,"e",:defining);
t := .linalg.Tensor([1,2;3,4],[e,e]);
symmetric := t.Symmetrize();
antisymmetric := t.Antisymmetrize();
symmetric+antisymmetric==t ##@ == 1
{: symmetric.components,antisymmetric.components,symmetric+antisymmetric==t,
   t.Permute([2,1]).components,t.View().SameTensor(t),t.ComponentSlice({: 1,1:2}) };
```

The full view preserves identity. The slot permutation is a new derived
tensor. The component slice is Shaped storage, since selecting coordinates
generally fails to commute with a change of Frame.

```{.rix exec=true id=finite-trace-power}
.Plugin.Load("linalg");
space := .linalg.VectorSpace("trace example",2);
e := .linalg.Frame(space,"e",:defining);
x := .linalg.Vector([2,3],e);
alpha := .linalg.Covector([4,5],e);
x.TensorProduct(alpha).Trace() ##@ == 23
{: x.TensorProduct(alpha).Trace(),x.TensorPower(2).components,x.TensorPower(0) };
```

The trace is `23`. Same-variance traces require an explicit metric. Symmetry
and tensor powers enforce finite work budgets before expanding coordinates.


## Save and reconstruct a domain-linked graph

A graph carries the Polynomial source, its explicitly chosen ambient space,
and every Frame needed by its coordinate view. Repeated references remain
shared within an import, and a second import receives independent identities.

```{.rix exec=true id=identity-graph-realizations}
.Plugin.Load("linalg");
small := .linalg.PolynomialSpace(2,:x);
large := .linalg.PolynomialSpace(4,:x);
source := .p`x^2+2*x+3`;
a := small.Realize(source);
b := large.Realize(source);
saved := .MathEncodeJSON(.linalg.ExportGraph([source,a,b]));
loaded := .linalg.ImportGraph(.MathDecodeJSON(saved));
loaded[2].SameSource(loaded[3]) ##@ == 1
loaded[2].Vector().SameTensor(loaded[3].Vector()) ##@ == _
loaded[2].Reconstruct()==loaded[1] ##@ == 1
loaded[1].__type ##@ == "Polynomial"
```

The first and third results are true, the second is `_`, and the final type is
`Polynomial`. Use `SameSource` for domain provenance and `SameTensor` for the
abstract tensor identity. Imported sources are frozen coefficient snapshots;
they retain no provider closure or reactive subscription. Invalid references,
contradictory coordinates and budget overruns are rejected before results are
returned. See the README for graph limits and finite storage protocols.

## Exact spectral information without a field extension

```{.rix exec=true id=rational-spectral-tutorial}
.Plugin.Load("linalg");
matrix := [1/2,1;0,2/3] ~!: :Matrix;
spectral := matrix.RationalEigenspaces();
spectral.CharacteristicPolynomial().Coefficients().All((entry,index)->entry==[1,-7/6,1/3][index]) ##@ == 1
spectral.Roots().All((entry,index)->entry==[1/2,2/3][index]) ##@ == 1
spectral.Verify() ##@ == 1
rotation := .linalg.RationalEigenspaces([0,-1;1,0]);
rotation.Roots().Len() ##@ == 0
rotation[:canonicalforms][:extensionfieldrequired] ##@ == 1
```

The rotation has characteristic polynomial `x^2+1` and no Rational eigenvalue.
RiX records the need for a coefficient extension; it does not manufacture a
Jordan basis over Q. An incomplete bounded root search reports `?` for claims
it has not decided.

## Finite support in a countable polynomial space

```{.rix exec=true id=finite-support-tutorial}
.Plugin.Load("linalg");
polynomials := .linalg.PolynomialSpace(:unbounded);
small := polynomials.Bounded(2);
p := .p`x^5+3*x^2+2`;
r := polynomials.Realize(p);
r.Vector().components.SupportSize() ##@ == 3
r.Reconstruct()==p ##@ == 1
projected := small.Project(r);
projected.Verify() ##@ == 1
projected.Vector().components[1] ##@ == 2
projected.Vector().components[2] ##@ == 0
projected.Vector().components[3] ##@ == 3
polynomials.Include(projected.Realization()).Reconstruct()+projected.Remainder()==p ##@ == 1
saved := .MathEncodeJSON(r.Vector().components.Record());
.linalg.RestoreCoordinates(.MathDecodeJSON(saved)).Verify() ##@ == 1
```

The countable Frame supplies monomials by nonnegative degree; every value has
finite support. The bounded projection keeps degrees zero through two and
reports the exact discarded term `x^5`. Sparse tensor products combine ordered
coordinate slots with explicit support budgets. They do not create multivariate
Polynomials or infinite series.

## Finite sparse matrix application

```rix
.Plugin.Load("linalg");
matrix = .linalg.SparseCoordinates([{= indices=[1,2], value=1/3 }], [1000,1000]);
vector = .linalg.SparseCoordinates([{= indices=[2], value=6 }], [1000]);
image = matrix.Apply(vector);
[image.Get([1]), image.SupportSize(), image.Verify()]; ## [2,1,1], no dense expansion
```
