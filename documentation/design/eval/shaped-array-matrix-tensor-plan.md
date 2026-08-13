---
title: "Shaped values, matrices, vectors, and mathematical tensors"
description: "Deferred design and migration checklist for separating shaped storage, matrix algebra, and coordinate-aware vectors and tensors."
toc-depth: 4
---

# Status

**Deferred design; do not begin the runtime migration while the current parser,
evaluator, and plugin work is in flight.** This document records the intended
contract and the gates for starting it. Nothing in this plan changes current
RiX behavior merely by being documented.

Start implementation only when all of the following are true:

- [ ] The current overlapping parser/evaluator/plugin work has landed or been
  deliberately set aside.
- [ ] The `rix/` worktree has a known baseline and the complete test suite is
  green.
- [ ] A dedicated migration branch is created.
- [ ] The syntax and compatibility decisions marked **decision gate** below
  have been approved.
- [ ] Export/import versioning and deprecation policy have named owners.

# Decision summary

RiX should distinguish mathematical interpretations from their component
storage. Finite values can use one dense, strided shaped-storage implementation,
but vector and tensor semantics must not require that representation:

| Semantic type | Meaning | Intrinsic operations |
|---|---|---|
| `:Shaped` | Rectangular shaped storage without implied mathematical semantics | Indexing, views, reshape, axis permutation, map, reductions, and elementwise arithmetic |
| `:Matrix` | A rank-2 matrix over a declared or inferred scalar domain, without named vector spaces | Matrix addition, scalar arithmetic, matrix product, transpose, powers, rank, determinant, decompositions, inverse, and solve where defined |
| `:Vector` | A rank-1 mathematical vector in a named vector space and selected coordinates | Compatible vector addition, scalar arithmetic, coordinate transformation, tensor product, and pairing with a covector |
| `:Tensor` | A mathematical tensor whose ordered slots name vector spaces, coordinate systems, and variance | Tensor product, contraction, slot permutation, symmetry operations, coordinate transformation, pullback, and pushforward |

These are **not** a nominal inheritance chain. In particular, a mathematical
tensor must not inherit coordinate-dependent shaped-array operations merely
because its components use shaped storage. Each type exposes its components
through an explicit operation when storage-level work is wanted.

`Shaped` is the default semantic type for uninterpreted finite shaped storage.
It is component storage, not the base type of every mathematical object.
`Matrix` requires finite rank-2 shaped components. A finite `Vector` or `Tensor`
may contain `Shaped` components, while an infinite-dimensional representation
may instead contain finite-support sparse coordinates or a later lazy/oracular
coordinate provider. The mathematical wrapper exposes its storage explicitly;
it does not inherit the storage object's entire operator surface.

A bare shaped literal makes the weakest claim and therefore defaults to
`:Shaped`:

```rix
a := [1, 2; 3, 4];
b := {:2x2: 1, 2; 3, 4};
```

Both values have the same semantic interpretation even though one shape is
inferred and the other is explicit.

# Terminology

Do not rename the shaped-storage layer to **block**. RiX already uses block for
executable `{; ... }` values, deferred blocks, document blocks, and structured
break targets. In mathematics, “block” also usually means a submatrix or block
decomposition rather than an arbitrary rank-N container.

Use these terms consistently:

- **shaped storage**: the internal dense/strided representation;
- **shaped value**: the public semantics of untyped shaped storage;
- **shaped array**: the concrete dense/strided storage used by a shaped value;
- **matrix**: rank-2 matrix algebra without space/coordinate attachment;
- **abstract tensor**: the coordinate-independent mathematical value;
- **tensor representation**: components plus one coordinate choice for every
  tensor slot;
- **slot**: one ordered vector-space or dual-space factor;
- **coordinatized space**: an abstract vector space together with a selected
  basis/coordinate system.

The source braces may be described as a **shaped literal** or **shape block** in
parser prose, but `Block` must not become its runtime or semantic type name.

Use `:Shaped` as the container's canonical semantic type. It says that the
value has fixed rectangular shape while leaving room for a later `Matrix`,
`Vector`, or `Tensor` interpretation. Do not use `:Shape`: a shaped value *has*
a shape but is not itself a shape. RiX already uses `Shape()` for the dimension
descriptor, and `:Shape` should remain available if dimension tuples later
become validated first-class shape values. Thus `a ? :Shaped` describes the
storage value while `a.Shape()` returns its dimensions.

# Type-name case folding

Semantic type lookup is not fully case-insensitive today. Built-ins such as
`:Tensor` accept selected lowercase spellings because those spellings were
registered as aliases, while arbitrary registered types retain case-sensitive
registry keys. Method-extension lookup already folds type names to lowercase.

The target rule is:

> Semantic type and trait names are compared case-insensitively, while each
> registration retains one canonical display spelling.

This applies to type/trait registration, aliases, `::Type` headers, `~:` and
`~!:` conversion, `? :trait`, `##::Type` checks, `.TypeKnown`, type-installed
operator dispatch, method extensions, and type import/export lookup. It does
not case-fold ordinary RiX identifiers, runtime representation tags, schema
IDs, plugin IDs, or arbitrary map keys.

Canonical registered spelling must be stored in `.__type`, emitted by export,
and used in diagnostics. Thus `::matrix`, `::MATRIX`, and `::Matrix` all select
the canonical registered `Matrix` type.

## Case-folding checklist

- [ ] Add one semantic-name folding helper and use it in both immutable
  semantic registries.
- [ ] Store entries and aliases by folded key while retaining `entry.name` as
  canonical display spelling.
- [ ] Reject type/type, alias/alias, and type/alias collisions under folding.
- [ ] Apply the same collision and resolution rules to traits.
- [ ] Fold built-in replacement protection and context-local registration
  ownership checks.
- [ ] Canonicalize sticky `.__type` and materialized `.__traits` values after
  lookup rather than retaining caller spelling.
- [ ] Audit `convertFrom`, installed operator variants, method-extension lookup,
  export tags, and import tags for mixed semantic/runtime-name assumptions.
- [ ] Accept historical export tags in any case but emit only canonical tags.
- [ ] Add tests for mixed-case registration, lookup, conversion, membership,
  method dispatch, duplicate rejection, export/import, and diagnostics.
- [ ] Update the types-and-traits guide to state the global rule; remove prose
  suggesting lowercase support is only a compatibility alias.

# Proposed shaped-literal header syntax

## Specifying vector spaces and frames

Keep the abstract vector space separate from any component coordinate system.
The preferred explicit construction is:

```rix
vspace := .linalg.VectorSpace({=
  name = "V",
  dimension = 3,
  over = :Rational
});

e := .linalg.Frame(vspace, {=
  name = "e",
  basis = :defining
});
```

`VectorSpace` creates a basis-free mathematical space. Its essential immutable
properties are:

- a stable abstract space identity;
- a human-readable name, which is descriptive rather than identity-defining;
- a positive finite dimension in the first implementation; and
- a scalar field/domain implementing the required exact field protocol.

Two calls with the same name, dimension, and scalar field create two distinct
spaces. Structural coincidence must not make their vectors addable. Space
equivalence or an isomorphism is always explicit.

`Frame` creates an ordered basis on a space. It is the coordinatized-space value
referenced by component-bearing `Vector` and `Tensor` literals. The first frame
may use `basis=:defining`: this nominates the basis that initially identifies
the otherwise abstract finite-dimensional space with coordinate tuples. It is
a chosen defining frame, not an intrinsic canonical basis of every abstract
vector space.

Another frame must state how its basis is expressed relative to an existing
frame:

```rix
f := .linalg.Frame(vspace, {=
  name = "f",
  relativeTo = e,
  basis = [1, 1, 0; 0, 1, 0; 0, 0, 1]
});
```

The basis matrix columns are the new basis vectors expressed in `e`. The
constructor validates that the reference frame belongs to the same abstract
space, that the matrix has the correct dimensions and scalar domain, and that
it is invertible.

The existing Phase 1 `.linalg.Coordinates(space, name, basis?)` object already
contains a space and an ordered basis matrix. Prefer `Frame` as the eventual
canonical name because coordinates are the dual coordinate functions induced
by a basis. Retain `Coordinates` as a compatibility constructor/alias during
migration.

A convenience constructor can cover the common coordinate-space case without
collapsing the underlying model:

```rix
v := .linalg.FramedSpace({=
  name = "V",
  dimension = 3,
  over = :Rational
});
```

`FramedSpace` returns a defining `Frame`; `v.space` exposes the newly created
abstract space. It is sugar for `VectorSpace` followed by `Frame`, not a fourth
mathematical concept. Whether this convenience earns a public API should be
decided from usage examples rather than required for the core model.

The `over` value may initially be a registered semantic scalar type such as
`:Rational`. The lasting contract should accept a field/domain value satisfying
a versioned scalar-field protocol, allowing constructed finite fields or
extension fields later. A mere display string is insufficient. Modules over a
ring are a separate future type and must not weaken `VectorSpace` field
requirements silently.

In compact shaped headers, the annotation factor names a `Frame`, not a bare
`VectorSpace`:

```rix
x := {:3: /Vector: E/ 1, 2, 3};
```

Here display-style `E` resolves the user binding `e`. If it resolves to an
abstract vector space instead, evaluation diagnoses that coordinates must be
chosen. This makes the components unambiguous: a vector belongs to
`e.space`, while the numbers shown are its representation in frame `e`.

The dual frame is derived canonically from the selected frame:

```rix
p := {:3: /Covector: E/ 4, 5, 6};
t := {:3x3: /Tensor: E@E*/ components};
```

`E*` means the frame canonically dual to `e`, not an inner-product
identification of the space with its dual. An independently chosen or
noncanonical dual frame is constructed explicitly and referenced by its own
binding.

### Vector-space API decision checklist

- [ ] Confirm `VectorSpace` as the basis-free value and `Frame` as the value
  referenced by component annotations.
- [ ] Confirm `Coordinates` as a temporary compatibility alias for `Frame`.
- [ ] Confirm the options-map fields `name`, `dimension`, and `over`.
- [ ] Define the versioned scalar-field protocol and verify that `:Rational`
  supplies it.
- [ ] Confirm that separately constructed structurally identical spaces remain
  distinct.
- [ ] Confirm `basis=:defining` for nominating the first frame without calling
  it mathematically canonical.
- [ ] Specify basis-matrix orientation as new-frame basis vectors in columns of
  `relativeTo` coordinates.
- [ ] Decide whether `FramedSpace` convenience sugar is worth exposing.
- [ ] Define stable export identities for spaces and frames and reject dangling
  frame references during import.
- [ ] Reserve separate future constructors for modules, affine spaces,
  subspaces, quotient spaces, direct sums, and infinite-dimensional spaces.

## Domain objects with linear realizations

Objects such as polynomials should keep their own semantic type, identity, and
domain operations while admitting a linked vector-space view. Do not convert a
`Polynomial` permanently into `Vector` merely because polynomial addition and
scalar multiplication form a vector space.

The reusable abstraction is a **linear realization** (or linear model):

- a family/domain predicate identifying admissible source objects;
- an abstract vector space;
- one or more frames;
- an encoding from a source object to coordinates;
- a decoding from valid coordinates to a domain object;
- evidence or tests that encoding respects addition and scalar multiplication;
- provenance connecting a vector representation to its source object.

For polynomials, “degree exactly `n`” is not a vector space: it excludes zero
and cancellation can lower the degree. The finite vector space is polynomials
of degree **at most** `n`, conventionally `P_<=n`, with dimension `n + 1`.

```rix
p4 := .poly.PolynomialSpace({=
  variable = :x,
  maxDegree = 4,
  over = :Rational
});

monomial := p4.Frame(:monomial);
p := .poly([1, 2, 0, 3]);
pv := p4.AsVector(p, monomial);
```

`p` remains a `Polynomial`; `pv` is a vector representation linked by
`viewOf=p` and by the `p4` realization. Polynomial multiplication, degree,
evaluation, factorization, and variable metadata remain polynomial behavior.
Coordinate changes on `pv` do not mutate or retype `p`.

One polynomial can belong to several ambient spaces, for example both
`P_<=3` and `P_<=7`. Those vector views have distinct ambient vector-space
identities even though they refer to the same polynomial source. Consequently:

- source identity and vector-space element identity are recorded separately;
- `SameSource` may hold when `SameVector` does not;
- decoding a computed vector returns a new polynomial value unless an explicit
  identity-preserving view operation applies;
- vector arithmetic returns a vector by default, while the realization can
  provide an explicit `AsPolynomial`/`Decode` operation;
- domain plugins may offer convenience operations that calculate linearly and
  return their domain type, but generic vector dispatch does not assume this.

Other natural realizations include fixed-size homogeneous polynomials,
truncated power series, functions on a finite set, finite-dimensional function
subspaces, matrices viewed as vectors under a selected entry frame, and finite
algebra extensions. Each domain owns its adapters; `.linalg` owns only the
generic realization protocol.

### Linear-realization checklist

- [ ] Define a versioned `rix.linear-realization@1` protocol with membership,
  space, frame, encode, decode, scalar-domain, and provenance operations.
- [ ] Distinguish `viewOf`/`SameSource` from abstract vector identity and
  coordinate-representation identity.
- [ ] Decide whether `AsVector` is a generic method, realization method, or
  both with one canonical dispatch path.
- [ ] Require an explicit ambient realization when a source belongs to several
  vector spaces.
- [ ] Ensure coordinate transformation of a view preserves its source link
  without mutating the source.
- [ ] Make vector arithmetic return `Vector` unless an explicit domain adapter
  requests decoded results.
- [ ] Add `.poly.PolynomialSpace(maxDegree=n)` for `P_<=n` with monomial and
  selected alternative frames.
- [ ] Test cancellation, zero, degree bounds, variable mismatch, scalar-field
  mismatch, encode/decode round trips, and the same polynomial viewed in two
  ambient spaces.

## Infinite-dimensional spaces

Support infinite-dimensional spaces in tiers; “infinite coordinates” describes
several different mathematical and computational contracts.

### Tier 1: infinite basis, finite-support elements

This is the tractable exact starting point. A countably infinite frame supplies
`BasisAt(index)` and basis-key validation, while every individual vector stores
only finitely many nonzero coordinates in a sparse map.

All ordinary finite polynomials over a field form such a vector space. Their
monomial frame is indexed by nonnegative integers, and each polynomial has
finite support even though no global degree bound exists:

```rix
px := .poly.PolynomialSpace({=
  variable = :x,
  maxDegree = :unbounded,
  over = :Rational
});

monomial := px.Frame(:monomial);
pv := px.AsVector(.poly([1, 0, 0, 5]), monomial);
```

Here `:unbounded` means every element still has finite degree; it does not mean
a formal power series. Vector addition and scalar multiplication remain finite
and exact. The dimension descriptor is countably infinite, and `Components()`
returns `SparseCoordinates`, not `Shaped`.

The same model handles free vector spaces on other countable or symbolically
keyed bases. Tensor products remain feasible when every operand has finite
support, although support growth must obey explicit work budgets.

### Tier 2: genuinely infinite coordinate expansions

Formal power series, infinite sequences, and basis expansions of functions can
have infinitely many nonzero coordinates. These are not obtained by simply
allowing a sparse vector to run forever. They need a coordinate provider such
as a lazy sequence or oracle, bounded observation APIs, and honest equality
that may be undecidable.

Moreover, an infinite sum is not part of a bare algebraic vector-space
contract. Formal power series use a completion/product construction; Banach,
Hilbert, and general function spaces require topology, norms, convergence, or
other analytic structure. A countable Schauder/orthonormal basis is not the
same thing as a Hamel basis.

Therefore Tier 2 must introduce explicit space kinds and evidence-bearing
operations rather than treating every lazy sequence as a vector. Summation,
inner products, transforms, equality, and coordinate changes require work or
precision budgets and can return unresolved/certified-approximation results.

### Tier 3: symbolic and non-countably-presented spaces

Some function spaces have no useful enumerable coordinate basis. They may
still support symbolic vectors, linear maps, subspaces, evaluation functionals,
and finite projections. Model these through operations and finite observations,
not a fictitious dense coordinate array. General cardinal arithmetic and
arbitrary Hamel bases are research-level capabilities rather than prerequisites
for useful infinite-dimensional work.

### Infinite-dimensional checklist

- [ ] Add dimension descriptors distinguishing finite `n`, countably infinite,
  and symbolic/unknown dimension.
- [ ] Define `SparseCoordinates` with canonical zero removal, basis keys,
  scalar-domain validation, deterministic traversal, and work-bounded tensor
  products.
- [ ] Permit `Vector` and `Tensor` component storage through a coordinate-
  storage protocol rather than requiring `Shaped`.
- [ ] Implement countable frames with `BasisAt`, optional key enumeration, and
  finite-support encode/decode.
- [ ] Use all finite polynomials as the first countably infinite-dimensional
  exact realization.
- [ ] Keep bounded `P_<=n` as a finite subspace with dense `Shaped` components.
- [ ] Define inclusion maps and projections between `P_<=n`, `P_<=m`, and the
  unbounded finite-polynomial space.
- [ ] Specify support-growth budgets and diagnostics for tensor products and
  linear maps.
- [ ] Design a separate lazy/oracular coordinate protocol before formal power
  series or infinite-support sequences are called vectors.
- [ ] Require topology/completion metadata for convergent infinite sums and
  distinguish Hamel, Schauder, and orthonormal basis claims.
- [ ] Integrate undecided equality and certified approximation rather than
  forcing termination.
- [ ] Defer arbitrary uncountable bases and general cardinal arithmetic until
  concrete use cases justify them.

The compact goal is:

```rix
a := {:2x2: 1, 2; 3, 4};                       # Shaped by omission
m := {:2x2: /Matrix/ 1, 2; 3, 4};              # Matrix
v := {:2: /Vector: V/ 2, 3};                   # Vector in coordinates V
t := {:2x2x3: /Tensor: V@V*@Wa/ components};   # Tensor representation
```

Inside the tensor slot clause, `@` separates tensor-product factors and postfix
`*` selects the dual of a coordinatized space. Header coordinate names are a
small annotation grammar, not ordinary RiX multiplication or system
identifiers.

The preferred desugaring is:

- omission -> semantic `Shaped`;
- `/Shaped/` -> explicit semantic `Shaped`;
- `/Matrix/` -> semantic `Matrix` plus rank-2 validation;
- `/Vector: V/` -> semantic `Vector` plus one evaluated coordinatized-space
  descriptor;
- `/Tensor: V@V*@Wa/` -> semantic `Tensor` plus three evaluated slot
  descriptors.

Existing `/::Matrix/` headers remain accepted. The compact `/Matrix/` spelling
is shaped-literal sugar rather than a second global semantic-type syntax.
Likewise, `/Vector: .../` and `/Tensor: .../` are only valid where the
constructed value has a known shape. An ordinary outfit continues to use
`{^ /::Type/ value }`.

Common header directives can precede the shaped interpretation, which must be
last:

```rix
t := {:2x2: /#stress :symmetric Tensor: V@V*/ 1, 0; 0, 1};
```

This ordering keeps `:trait` distinguishable from the colon introducing a
tensor slot product.

## Header-name resolution

Ordinary RiX variables still follow the lowercase-user/uppercase-system rule.
Within a tensor slot clause only, a display-style `V` is resolved as the user
binding `v`, and `Wa` as `wa`. This exception is deliberately local to the
annotation grammar. Diagnostics should show both the written label and the
binding that was attempted.

Every resolved factor must be a `Frame`. In the current `.linalg` vocabulary,
that is the existing `Coordinates` value, which already contains an abstract
`VectorSpace` and a basis. Migrate it to the canonical `Frame` vocabulary
rather than introduce another overlapping runtime object.

For `V*`, RiX constructs the dual slot and the basis canonically dual to `V`'s
selected basis. A noncanonical pairing or independently selected dual basis is
never inferred from `*`; it must be constructed explicitly and referenced by
its own name:

```rix
vd := .linalg.DualCoordinates(v, "chosen dual", basisData);
t := {:2x2: /Tensor: V@vd/ components};
```

## Syntax decision gate

- [ ] Confirm `/Matrix/`, `/Vector: .../`, and `/Tensor: .../` as
  shaped-literal-only sugar.
- [ ] Confirm that existing `/::Matrix/` remains supported and canonical in
  general semantic headers.
- [ ] Confirm whether documentation prints compact shaped headers or the
  general `::Type` form when both are valid.
- [ ] Confirm `@` and postfix `*` as annotation tokens with no ordinary
  operator evaluation inside the clause.
- [ ] Confirm display-case resolution (`V` -> user binding `v`) is limited to
  tensor slot clauses.
- [ ] Confirm that the interpretation clause must be the last header item.
- [ ] Reserve a future syntax for tensor powers without overloading repeated
  source text prematurely.
- [ ] Specify source spans and recovery diagnostics for missing factors,
  repeated `@`, repeated `*`, unknown coordinates, rank mismatch, and dimension
  mismatch.

# Value model

## Shaped

`Shaped` owns the dense/strided storage protocol. A value records shape,
strides, offset, backing storage, mutability, scalar-domain information when
known, and view provenance. It carries no vector-space meaning.

- Elementwise `+`, `-`, `*`, and `/` require compatible shapes or an explicit
  documented scalar/broadcasting rule.
- `Sum`, `Mean`, `Map`, `Reduce`, reshape, and axis permutation are valid.
- `Dot`, `MatMul`, determinant, inverse, and contraction are absent.
- A view remains `Shaped` unless a higher semantic layer explicitly
  proves that its invariants survive the view.

## Matrix

`Matrix` wraps or semantically outfits rank-2 shaped storage. It has no named
domain/codomain spaces and therefore does not claim to be a coordinate
representation of a particular linear map.

- `+` and `-` are same-shape matrix operations.
- scalar multiplication/division preserve `Matrix`.
- `Matrix * Matrix` is matrix multiplication; dimensions must compose.
- Elementwise multiplication is explicit (`Hadamard`), not `*`.
- Integer powers are defined for square matrices.
- Division by a matrix is not introduced; use `Solve` or `Inverse` explicitly.
- A transpose remains `Matrix`; a slice remains `Matrix` only when the result
  is rank 2 and the slicing contract explicitly preserves matrix semantics.

## Vector and covector

`Vector` is a rank-1 mathematical tensor with one contravariant slot. It must
name an abstract vector space and the coordinates/frame used by its component
representation. A rank-1 `Shaped` value does not silently become a `Vector`.

```rix
x := {:3: /Vector: V/ 1, 2, 3};
```

The design should also expose covectors clearly. Two compatible surface
choices remain at the decision gate:

```rix
p := {:3: /Covector: V/ 4, 5, 6};
q := {:3: /Vector: V*/ 4, 5, 6};
```

The first is clearer to readers; the second makes the rank-1 tensor model more
uniform. Both may desugar to a one-slot Tensor whose slot is the dual of `V`,
but there should be one canonical printed spelling.

- Vector addition/subtraction requires the same abstract vector space.
- Coordinate representations must either agree or undergo an explicit,
  provenance-recorded coordinate transformation; silent basis changes require
  a separate decision.
- Scalar arithmetic preserves vector identity rules and coordinate metadata.
- A covector may pair canonically with a vector from its primal space.
- A dot product, length, angle, normalization, or identification of `V` with
  `V*` requires a metric or another explicit isomorphism. Coordinates alone do
  not provide an inner product.
- `Vector.Components()` returns its coordinate-storage value: `Shaped` for a
  finite dense representation and `SparseCoordinates` or a later provider for
  other representations.

The runtime already registers a placeholder semantic `Vector` type, but it
currently neither validates a one-slot coordinate representation nor requires
space/frame metadata. That placeholder must be migrated rather than treated as
the final contract.

## Tensor

A mathematical tensor representation records:

- an abstract tensor identity;
- a distinct representation identity;
- ordered slot descriptors;
- shaped component storage;
- one abstract vector space per slot;
- one coordinate system/frame per slot;
- variance or dual-space status per slot;
- scalar domain;
- bounded provenance and coordinate-transformation lineage.

Different slots may use different spaces and dimensions. The component shape
must equal the ordered slot dimensions. The Phase 1 `.linalg` restriction that
every axis has one shared dimension and coordinate system is temporary.

Intrinsic tensor operations include tensor product, compatible addition,
scalar arithmetic, contraction of valid dual pairs, slot permutation,
symmetrization/antisymmetrization, coordinate changes, and appropriate
pushforward/pullback operations. Coordinate-dependent component operations are
available only through `Components()`:

```rix
componentSum := t.Components().Sum();
```

For finite dense components, `Components()` returns `Shaped`, not a `Matrix`,
even for two slots. Infinite-dimensional representations return their declared
coordinate-storage value instead. An explicit conversion may request a matrix
view when that interpretation is intended.

# Identity and provenance

Coordinate transformation changes a representation, not the abstract tensor:

- non-bang `Transform` creates a new representation object with the same
  abstract tensor identity, a new representation identity, and an
  `equivalentTo` link;
- `Transform!` changes the active representation while retaining a bounded
  snapshot/history record;
- `SameTensor` compares abstract identities;
- arithmetic such as addition, contraction, or tensor product creates a new
  abstract identity and records `derivedFrom` provenance instead of
  `equivalentTo` equivalence.

Serialization must use stable IDs and bounded records rather than recursively
embedding an unbounded in-memory object chain.

# Runtime and system-method naming

The current implementation uses “tensor” for all rank-N shaped storage:
`type: "tensor"`, `tensor.js`, `tensorMethods`, `TENSOR_LITERAL`,
`TENSOR_TRANSPOSE`, `.TGEN`, and the public Tensor method group. Once `Tensor`
means only a mathematical tensor, those public names are misleading.

Preferred target names:

| Current name | Target name | Compatibility policy |
|---|---|---|
| Tensor runtime method group | Shaped method group | Move generic methods; document semantic dispatch |
| generic `tensor` semantic trait | storage-specific traits | Reserve `tensor` for mathematics; use `shaped`, `sparseCoordinates`, or later coordinate-provider traits on component storage |
| `tensor.js` helpers | `shaped-array.js` helpers | Add new exports first; keep deprecated forwarding exports temporarily |
| `isTensor` / `createTensor` | `isShapedArray` / `createShapedArray` | Mechanical migration after behavior is covered |
| `TENSOR_LITERAL` | `SHAPED_ARRAY_LITERAL` | IR-version migration with reader compatibility |
| `TENSOR_TRANSPOSE` | semantic transpose/axis permutation dispatch | `Matrix` and `Tensor` preserve their own invariants |
| `.TGEN` | `.Shaped.Generate` or a settled short alias | Keep `.TGEN` deprecated for one compatibility window |
| runtime `._type = tensor` | `._type = shapedArray` | Change only with import/export and host compatibility support |
| semantic `:Tensor` on generic storage | `:Shaped` | Reserve `:Tensor` for complete slot metadata |

Do not perform all renames in one commit. Introduce target names and adapters,
migrate internal consumers, then deprecate old public names. The runtime tag may
remain `tensor` as a private compatibility detail longer than the public method
group; semantic correctness does not require an immediate storage-tag rename.

# Staged implementation checklist

## Stage 0 — Freeze, inventory, and fixtures

- [ ] Satisfy the start gates at the top of this document.
- [ ] Inventory every runtime tag, helper, IR function, formatter, parser AST
  node, method table, plugin API, renderer, sheet adapter, worker boundary,
  export schema, and documentation reference containing matrix/tensor naming.
- [ ] Add characterization tests for current literals, views, mutation,
  destructuring, pipes, async collections, formatting, sheets, workers, and
  plugin inputs before renaming anything.
- [ ] Record which current APIs are public compatibility promises versus
  internal implementation details.
- [ ] Choose the IR and interchange version transition policy.
- [ ] Publish the approved syntax examples and operator table as the migration
  contract.

## Stage 1 — Case-insensitive semantic names

- [ ] Complete the case-folding checklist above as an isolated change.
- [ ] Keep runtime tags and ordinary identifiers unchanged.
- [ ] Run type-system, operator-dispatch, plugin, import/export, parser, and
  complete regression suites.
- [ ] Land this stage independently before `Shaped` semantics so failures
  have one clear cause.

## Stage 2 — Introduce shaped-storage vocabulary without behavior changes

- [ ] Add `shaped-array.js` names as forwarding or canonical helpers while
  retaining compatibility exports from `tensor.js`.
- [ ] Add `isShapedArray`, `createShapedArray`, view, indexing, traversal, and
  shape helpers.
- [ ] Rename internal local variables and documentation categories where the
  value is only shaped storage.
- [ ] Add a `Shaped` semantic registration with validation,
  normalization, export/import, traits, and generic methods.
- [ ] Add the shared `shaped` trait and migrate the current generic `tensor`
  trait without implying that every Vector or Tensor representation is dense
  and finite.
- [ ] Keep existing literals behavior-compatible behind an explicit feature
  flag or migration branch until Stage 3.
- [ ] Prove Node, worker, browser, sheet, output, and plugin consumers accept
  the compatibility layer.

## Stage 3 — Make literals default to Shaped and isolate Matrix

- [ ] Parse and lower shaped-literal interpretation headers.
- [ ] Make inferred-semicolon and explicit-shape literals default to
  `Shaped`.
- [ ] Implement `/Shaped/`, `/Matrix/`, and legacy `/::Matrix/` handling.
- [ ] Require `Matrix` rank 2 and a supported scalar domain.
- [ ] Remove the current placeholder `Matrix` parent relationship to semantic
  `Tensor`; use the shared `shaped` protocol instead.
- [ ] Move `Dot`, `MatMul`, determinant, inverse, rank, RREF, solve, and matrix
  powers out of the generic shaped-array method surface.
- [ ] Install type-specific arithmetic variants: elementwise shaped-array
  arithmetic versus conventional matrix arithmetic.
- [ ] Add explicit `Hadamard` for matrices.
- [ ] Define result-type rules for reshape, transpose, indexing, slicing,
  concatenation, mapping, and reductions.
- [ ] Update `.linalg`, `.optimize`, `.solve`, `.Sheet`, formatters, and examples
  to request `Matrix` where matrix semantics are required.
- [ ] Add clear diagnostics suggesting `~!: :Matrix` when a shaped array is
  passed to a matrix-only operation.
- [ ] Keep a compatibility mode for old untyped rank-2 plugin inputs, with one
  documented removal window rather than silent permanent coercion.

## Stage 4 — Implement coordinate-aware Vector and complete Tensor slots

- [ ] Replace the placeholder `Vector` semantic type with one-slot coordinate-
  storage validation and one required frame; finite shaped literals require a
  rank-1 `Shaped` component value.
- [ ] Decide and implement canonical covector source syntax.
- [ ] Share identity, representation, coordinate transformation, and
  serialization machinery between Vector, Covector, and Tensor.
- [ ] Accept component storage through a versioned coordinate-storage protocol;
  use `Shaped` for finite dense coordinates and `SparseCoordinates` for
  finite-support infinite-dimensional coordinates.
- [ ] Implement vector/covector pairing without inventing a metric.
- [ ] Require an explicit metric for dot products, norms, angles, and
  raising/lowering between a space and its dual.
- [ ] Replace the one-space `CoordinateTensor` assumption with ordered slot
  descriptors supporting distinct vector spaces and dimensions.
- [ ] Decide whether the public coordinatized-space value is named
  `Coordinates`, `Frame`, or another single canonical term.
- [ ] Implement canonical dual spaces and dual coordinate bases.
- [ ] Implement explicit noncanonical dual-coordinate construction.
- [ ] Parse, lower, resolve, and validate `/Tensor: V@V*@Wa/`.
- [ ] Validate literal rank and each axis dimension against the resolved slot.
- [ ] Make `:Tensor` construction fail unless complete slot and coordinate
  metadata is present.
- [ ] Preserve abstract identity and create representation identity during
  every coordinate change.
- [ ] Generalize basis changes so each slot can select an independent target
  frame.
- [ ] Implement tensor product, valid contraction, compatible addition, scalar
  arithmetic, and slot permutation.
- [ ] Return shaped arrays from `Components()` and representation-bound partial
  component slices.
- [ ] Define tensor equality, `SameTensor`, structural equality of independent
  tensors, and equality across coordinate representations.
- [ ] Add stable serialization for spaces, frames, slots, abstract IDs,
  representation IDs, and bounded provenance.

## Stage 5 — Migrate names, hosts, and documentation

- [ ] Introduce the target IR names and support reading the previous IR version.
- [ ] Migrate parser AST names only if doing so materially improves public AST
  clarity; otherwise document legacy node names as syntax-level artifacts.
- [ ] Migrate runtime methods, standard functions, destructuring diagnostics,
  formatter labels, reference generation, editor tooling, and completions.
- [ ] Migrate all bundled plugins and examples from generic tensor assumptions.
- [ ] Update RiX Web and RiX Notebook consumers in coordinated changes.
- [ ] Add deprecation diagnostics for `.TGEN` and any other superseded public
  capability only after replacements work in every host.
- [ ] Regenerate the system reference and search the repository for stale uses
  of “tensor” that actually mean shaped storage.
- [ ] Retain “tensor” where it refers to mathematical tensors, tensor products,
  tensor slots, or deliberate compatibility names.

## Stage 6 — Removal and advanced tensor algebra

- [ ] Remove compatibility aliases only in a declared breaking release.
- [ ] Add metrics and validated raising/lowering of indices; never identify a
  space with its dual without a metric or explicit isomorphism.
- [ ] Add symmetrization, antisymmetrization, traces, tensor powers, and named
  contraction notation.
- [ ] Add linear maps between distinct spaces, composition, pullbacks, and
  pushforwards using the same slot model.
- [ ] Add sparse or accelerated component storage without changing semantic
  tensor identity.
- [ ] Add proof/certificate hooks for coordinate transformations and exact
  linear-algebra operations.

# Acceptance matrix

Implementation is not complete until tests cover at least these cases:

- [ ] `[1,2;3,4]` and `{:2x2: ...}` produce `Shaped` by default.
- [ ] `/Matrix/` accepts rank 2 and rejects every other rank.
- [ ] Shaped-array `*` is elementwise while matrix `*` is matrix product.
- [ ] Matrix `Hadamard` remains available explicitly.
- [ ] Generic shaped arrays have no `MatMul`, determinant, inverse, or tensor
  contraction methods.
- [ ] `/Vector: V/` accepts rank 1, validates its dimension, and retains its
  abstract vector-space and coordinate identities.
- [ ] A rank-1 bare literal remains `Shaped` rather than silently becoming a
  Vector.
- [ ] Matrix components are shaped; Vector and Tensor values report their
  component-storage capability without falsely satisfying `? :shaped` when
  their coordinates are sparse or lazy.
- [ ] Vector coordinate changes preserve abstract identity and create new
  representation identity.
- [ ] Vector/covector pairing works without a metric, while dot product, norm,
  and angle diagnose a missing metric.
- [ ] `:Tensor` without slot metadata is rejected.
- [ ] `/Tensor: V@V*@Wa/` resolves `V`/`Wa` to the intended local coordinate
  values and validates every dimension.
- [ ] `V*` uses the canonically dual basis, while an explicit dual coordinate
  value can represent a noncanonical choice.
- [ ] A tensor with slots from differently sized spaces transforms correctly.
- [ ] Non-bang coordinate transformation returns a new representation of the
  same abstract tensor.
- [ ] Bang transformation retains bounded history without changing abstract
  identity.
- [ ] Tensor arithmetic creates a new abstract identity with derivation
  provenance rather than an equivalence link.
- [ ] Invalid contractions report the incompatible slots and spaces.
- [ ] Mixed-case type and trait spellings resolve identically and export with
  canonical spelling.
- [ ] Old serialized shaped values and supported IR versions still import.
- [ ] CLI, workers, RiX Web, RiX Notebook, sheets, renderers, and bundled
  plugins pass their targeted suites.
- [ ] The complete RiX suite passes with no compatibility mode enabled before
  old names are removed.

# Open decisions

- [ ] Confirm `Frame` as the canonical public name for an ordered basis and
  keep `Coordinates` only for the declared compatibility window.
- [ ] Select the long-form replacement and optional short alias for `.TGEN`.
- [ ] Decide whether runtime `type: "tensor"` ever needs a breaking rename or
  may remain a private storage tag indefinitely.
- [ ] Define broadcasting, if any, before making shaped-array arithmetic
  public; do not inherit a NumPy policy accidentally.
- [ ] Define scalar-domain promotion for Shaped and Matrix results.
- [ ] Decide which matrix slices preserve `Matrix` and which deliberately
  degrade to `Shaped`.
- [ ] Choose `/Covector: V/` versus `/Vector: V*/` as the canonical covector
  spelling and decide whether the other is accepted as sugar.
- [ ] Decide whether compatible vector arithmetic automatically transforms one
  representation or requires an explicit coordinate change.
- [ ] Decide whether a tensor's full-slot-preserving component view can remain
  a Tensor representation or whether all direct slicing returns shaped data.
- [ ] Specify memory bounds and retention policy for representation lineage.
- [ ] Decide whether the compact shaped header is exported verbatim or
  normalized to a canonical long form by formatters.
