# `complex`

`complex` is the representation-generic certified complex-number plugin. It
builds one complex singleton from two exact Rationals or two certified,
arbitrarily refinable real singletons. The components may come from different
real packages; their ordinary arithmetic meets at Oracle when necessary.

```rix
.Plugin.Load("complex");
.Plugin.Load("algebraic-real");
.Plugin.Load("continued-fraction");
z := .complex.FromParts(.ar.Sqrt2(), .cf.Sqrt2());
```

The lowercase plugin has a different role from core `.Complex` and
`.ball.Complex`:

- `.Complex` is the compact exact algebraic-expression collection using the
  configured exact generator `i`.
- `.complex` is a Cartesian singleton over arbitrary certified real backends.
- `.ball.Complex` is a finite rectangular set enclosure, not a singleton.

Consequently `.complex.FromParts` rejects finite Balls and Floats. A finite
Ball denotes many possible reals, while a Float is an explicitly approximate
stored scalar; neither may silently acquire singleton certification.

## Arithmetic

`ComplexReal` installs `+`, `-`, `*`, `/`, unary `-`, equality, and Rational
embedding. It also provides `Real`, `Imaginary`, `Conjugate`, and
`NormSquared`:

```rix
z := .complex(1, 2);
w := .complex(3, -1);
{: z + w, z * w, z / w, z.Conjugate(), z.NormSquared() };
```

Division rejects an exact zero immediately. For refinable denominators it
constructs a lazy quotient whose component backend must later certify that
the norm squared excludes zero. `ZeroStatus(options)` makes the current
origin-separation result explicit as `:zero`, `:nonzero`, or `:unknown`.

## Certified rectangular refinement

Complex numbers are not ordered, so the plugin does not pretend that a
complex enclosure is a `RationalInterval`. `Enclose` and `Refine` instead
return `rix.complex.enclosure@1`:

```rix
answer := z.Refine({= absoluteWidth=1/1000, maxWork=200 });
{: answer[:realInterval], answer[:imaginaryInterval], answer[:status] };
```

The two exact rational intervals form an axis-aligned rectangle. Each
component interval is supplied by its real backend and certified to contain
the true component. `achievedWidth` is the larger component width, and the
caller-provided work budget is split between the components. Dependency or
correlation loss may widen the rectangle, but it never permits contraction
past what is proved.

`ComplexCapabilities()` reports the separate
`rix.complex.capabilities@1` protocol. It deliberately does not report
`NumericsCapabilities`, whose result type is an ordered real interval.

## Elementary functions

The first function layer uses certified real algorithms through standard
Cartesian identities:

```text
exp(a+bi) = exp(a) (cos(b) + i sin(b))
sin(a+bi) = sin(a) cosh(b) + i cos(a) sinh(b)
cos(a+bi) = cos(a) cosh(b) - i sin(a) sinh(b)
```

`.complex.Exp`, `.complex.Sin`, and `.complex.Cos` return new refinable
`ComplexReal` values.

## Complex regions and validated set images

`Rectangle`, `Disc`, and `Union` construct first-class `ComplexRegion` sets.
They are deliberately separate from singleton recipes:

```rix
box := .complex.Rectangle((-1):1,(-1):1);
disc := .complex.Disc(.complex(1,1),1/10);
image := disc.Image(:exp,{= absoluteWidth=1/10000,maxWork=1000 });
```

Disc images of `Exp`, `Sin`, and `Cos` use centered validated complex-series
or derivative remainder bounds, retain the shared center as correlation
evidence, and record argument reduction explicitly. Rectangle images use
certified real interval ranges in the Cartesian identities. Both paths return
outward enclosures: a result may be wider than ideal, but never contracts past
what is proved. Finite-union images map every component separately instead of
silently filling gaps.

`FromSingleton` converts a refinable singleton to its current certified
rectangle while retaining its shared-expression provenance. `BoundingRectangle`
returns an outward hull for any region geometry.

## Adaptive branch and zero analysis

`AnalyzeBoundary(feature, options)` recursively subdivides a region near
`:zero`, `:pole`, `:logBranch`, or `:sqrtBranch`. The result separates resolved,
hit, and unresolved cells and obeys both `maxDepth` and `maxCells`. Reaching a
budget preserves a certified unresolved region; it never classifies overlap as
absence.

## Principal branches

`LogResult` and `SqrtResult` classify the input rectangle before selecting the
principal branch. Their status is one of:

- `:resolved` — the enclosure is certified away from the cut;
- `:branchBoundary` — an exact/certified point lies on the nonpositive real
  axis and the conventional principal boundary value is returned;
- `:undefinedAtZero` — logarithm has no value;
- `:branchPoint` — square root has its exact principal value zero but records
  that the input is its branch point;
- `:unknown` — the current rectangle has not separated the input from the cut
  or determined the required imaginary sign.

```rix
cut := .complex.LogResult(.complex(-2, 0));
origin := .complex.LogResult(.complex(0, 0));
{: cut[:status], cut[:value], origin[:status], origin[:diagnostic] };
```

`Log` and `Sqrt` are conveniences returning the `value` when one is
available. They raise a diagnostic for an unresolved result; callers that
need to distinguish boundary, branch, and budget outcomes should use the
`*Result` form. The branch convention is `-pi < argument <= pi`.

See [tutorial.md](tutorial.md) for a runnable walkthrough and
[architecture.md](architecture.md) for the planned Cayley, Quaternion, and
Octonion layers.
