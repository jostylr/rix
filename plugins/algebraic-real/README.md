# `algebraic-real`

`algebraic-real` is a pure-RiX exact-real plugin. It represents one real root
of a square-free integer polynomial by a rational isolating interval, a
certified one-based root index, and exact Sturm evidence. It mounts callable
`.algebraicReal` and the shorter `.ar` alias. It requires the pure-RiX `.poly`
algorithm service and needs no JavaScript host approval.

```rix
.Plugin.Load("algebraic-real");
root := .ar.Root([-2, 0, 1], 1:2, 2);
root.Sign();                 ## :positive
root.CompareRational(3/2);   ## :less
root.RootIndex();            ## 2
```

Coefficient arrays use ascending power order. Thus `[-2, 0, 1]` means
`x^2 - 2`. The constructor removes integer content and chooses a positive
leading coefficient, so `[-4, 0, 2]` has the same stored polynomial.

## What the constructor certifies

`Root(coefficients, interval, rootIndex)` performs exact checks before it
creates a value:

- every coefficient is an Integer and the polynomial has positive degree;
- the canonical `.poly` primitive polynomial is square-free, using its exact
  polynomial remainder sequence;
- neither rational interval endpoint is a root;
- a Sturm sequence counts exactly one distinct real root in the interval;
- a Cauchy root bound plus another Sturm count verifies the supplied one-based
  index among all real roots.

The retained evidence names the normalization, endpoint signs, root count,
root index, root bound, and Sturm-chain length. Values are immutable.

`Polynomial(coefficients)` returns the same canonical callable Polynomial type
as `.poly`, after primitive-integer normalization and square-free validation.
`Evaluate`, `Derivative`, `SturmSequence`, `RootCount`, and `IsSquareFree`
delegate to that Polynomial service. Algebraic-real owns only root-facing
policy: isolating intervals, root indices, evidence, exact comparisons, and
refinement. There is no second algebraic-real polynomial object.

## Exact sign, comparison, and refinement

```rix
.Plugin.Load("algebraic-real");
.Plugin.Load("numerics");
root := .ar.Sqrt2();

root.Sign();
root.CompareRational(7/5);   ## :greater
.numerics.Refine(root, {= absoluteWidth=1/1000, maxWork=20 });
root < {~ 3/2, 1/1000 };
```

`Sign()` and `CompareRational(q)` are exact. If zero or `q` lies inside the
stored interval, Sturm counts decide which side contains the isolated root;
overlap is not treated as equality. A rational is equal only when exact
polynomial evaluation proves it is the isolated root.

`Enclose` and `Refine` implement the shared bounded Numerics protocol. Exact
sign bisection halves the rational interval until the requested width is met
or the call/iteration budget is exhausted. The result remains a certified
enclosure in either case, and Halo comparisons consume that protocol directly.

## Portable serialization

`root.Export()` returns a `rix.algebraic-real.export@1` record containing the
canonical coefficients, original isolating interval, root index, name, and
evidence. `.ar.Import(record)` reconstructs the value and reruns every
certificate check; it does not trust serialized proof claims blindly.

## Phase boundary

Phase 1 does not install arithmetic operators between algebraic reals.
Addition, multiplication, division, powers, and algebraic-to-algebraic
comparison require resultant/minimal-polynomial construction, factor
selection, and fresh root isolation. Those field operations belong to Phase 2;
the Phase 1 value already exchanges its defining Polynomial with `.poly` and
`.algebra`.

See [tutorial.md](tutorial.md).
