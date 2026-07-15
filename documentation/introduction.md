# Introduction to RiX

Welcome to RiX! RiX is the expressive scripting language designed for the RatMath arithmetic environment. Its syntax is built to be concise, functional, and deeply oriented around mathematical investigation.

This guide introduces the core features and idiosyncrasies of RiX to get you comfortable with the language quickly.

---

## Basics & Syntax

### Identifiers: Capital vs Lowercase
In RiX, the casing of the very first letter of an identifier carries semantic weight:

- **Variables** should start with a lowercase letter (e.g., `x`, `myVar`, `my_var`). **camelCase** or **snake_case** are recommended.
- **User-defined functions** start with an uppercase letter (e.g., `Square`, `MyFn`).
- **System capabilities** (built-in functions like `ADD`, `RAND_NAME`, `SIN`) are **not** accessible as bare identifiers. They must be called via the **system object** using the dot prefix: `.ADD(3, 4)`, `.SIN(x)`, `.RAND_NAME()`.

> [!NOTE]
> Standalone `_` is the **null operator** (same as `NULL()`). However, `_` is allowed within identifiers as long as it's not the only character.

> [!NOTE]
> Case normalization: only the first letter's case is significant. Beyond the first letter, identifiers are case-insensitive — so `myVar`, `myvar`, and `myVAR` all refer to the same variable. Similarly, `Square` and `SQUARE` are the same user function.


### Setting Up Variables and Scopes
#### Assignment and the Cell Model

A variable in RiX names a **cell** — a mutable container holding a value and meta properties. Different assignment operators control whether you share, copy, or update a cell.

**`=` — Alias / Rebind.** Makes the left-hand side point to the same cell as the right-hand side. If the right side is a variable, both names share the same cell; if it is an expression, a fresh cell is created for the result.

```rix
x := 5
y = x        ## y and x share the same cell
x += 1       ## both x and y see 6
```

**`:=` — Fresh Copy.** Creates a new, independent cell with a shallow copy of the value and all meta properties.

```rix
x := 5
y := x       ## y gets its own copy
x += 1       ## x is 6, y is still 5
```

**`~=` — In-Place Value Replacement.** Replaces the value inside the existing cell. This preserves cell identity, so aliases still track the change. Ordinary meta (`.key`, `.lock`) is preserved; ephemeral meta (`._mutable`, `._spec`) is replaced wholesale from the right-hand side; sticky meta (`.__units`) is preserved unless the right-hand side supplies the same key.

```rix
t := [0]
t.key = "temperature"
t.__units = "C"
t._spec = "sensor formula"
t ~= 21
## t.key stays "temperature"
## t.__units stays "C"
## t._spec is cleared (rhs had none)
```

Sticky semantic metadata also powers RiX's type and trait system. A semantic header such as `{^ /::Rational :ordered/ 7}` applies a registered type and traits to the value. Runtime facts live in `._type` and `._proto`; semantic interpretation lives in `.__type`, `.__traits`, and `.__proto`.

```rix
r = 7 ~: :Rational
r ? :number       ## true because :Rational implies numeric traits
r.Num()           ## type-proto method
```

Use `x ~: :Type` for soft conversion, `x ~!: :Type` for strict conversion, and `.TypeExport(x)` / `.TypeImport(m)` for registered type export/import.

**`::=` and `~~=`** are deep-copy variants of `:=` and `~=`, respectively. They recursively copy nested collections instead of sharing inner references.

**Combo operators** (`+=`, `-=`, `*=`, `/=`, `//=`, `%=`, `^=`, `++=`, `\/=`, `/\=`, `\=`, `**=`, `/^=`, `/~=`) use `~=` semantics — they update the value in place, so aliases see the change and meta is preserved:

```rix
x := 5
y = x
x += 1       ## desugars to x ~= x + 1
## both x and y are 6
```

The same pattern applies to collection-style operators:

```rix
xs := [1, 2]
ys = xs
xs ++= [3]
## ys now sees [1, 2, 3]

s := {| 1, 2 |}
s \/= {| 2, 3 |}
## s is now {| 1, 2, 3 |}

t := {| 1, 2, 3 |}
t /\= {| 2, 3, 4 |}
## t is now {| 2, 3 |}

u := {| 1, 2, 3 |}
u \= {| 2 |}
## u is now {| 1, 3 |}
```

Formally, combo updates follow the same cell-preserving model for both local and outer writes:

```rix
x op= y   =>   x ~= x op y
@x op= y  =>   @x ~= @x op y
```

#### Left-Hand Destructuring

RiX destructuring is not a separate assignment system. It:

1. evaluates the right-hand side once
2. reads the actual stored entries from the source structure
3. binds each extracted piece outward using the ordinary assignment mode from the outer operator, unless that entry overrides it

That means the outer assignment operator supplies the default binding mode for the whole pattern:

```rix
[a, b] = arr
[a, b] := arr
[a, b] ~= arr
{= a, b[:x] } ::= m
```

Supported left-hand patterns are arrays, tuples, maps, and tensors:

```rix
[a, b, ...rest] = [1, 2, 3, 4]
{: a, b, ...rest } = {: 1, 2, 3, 4 }
{= a, b[:x], pair[:pt] = [u, v], [:meta] = {: p, q}, ...rest } = m
{:2x2: [a, b], [c, d]} = {:2x2: 1, 2; 3, 4}
```

Map entries use explicit source-key syntax so the target role is unambiguous:

- `a` means source key `a`, target variable `a`
- `b[:a]` means source key `a`, target variable `b`
- `a = pattern` means bind the whole selected value to `a` and also destructure it
- `[:a] = pattern` means destructure key `a` without also binding the whole value
- `b[:a] = pattern` means bind the whole selected value to `b` and also destructure it

Simple missing positions or keys bind a hole:

```rix
[a, b] = [1]              ## b gets hole
{= a, b } = {= a = 5 }    ## b gets hole
```

Missing nested required structure is an error:

```rix
[a, [b, c]] = [1]         ## error
{= a = [x, y] } = {= }    ## error
```

Extra source contents are ignored unless captured by a final `...rest`.

Per-entry binding overrides reuse the ordinary assignment model:

```rix
[==a, :=b, ~=c]
{: a, :=b }
{= ==a, ~=b[:x] }
```

Target-side semantic wrapping also works inside destructuring:

```rix
[{^ /::rational/ x}] = [2]
{= p[:pt] = {^ /:= #point ::Point :cartesian/ q} } = m
```

Inside a destructuring target header:

- `#name` sets a sticky target name
- `::Type` requires conversion/canonicalization to that type or errors
- `:trait` is required on the extracted source value; it is not "blindly added"
- a capture mode inside the header acts as that entry's binding-mode override

#### Indexed Destructuring

Destructuring entries may also select from the current source object with ordinary indexing or slicing before binding:

```rix
{.. a[1:3], b[2:4], c[3] } = [10, 20, 30, 40, 50]
{.. d[-1:1] = [e, f, ...g] } = [1, 2, 3, 4]
{: a[1:2], b[3] } = {: 5, 6, 7, 8 }
{.. row2[2, 1:3], block[1:2, 1:2] } = tensor
```

Interpretation rule: the indexing applies to the source object being destructured, not to the target.

So `a[1:3]` inside a destructuring pattern means:

1. compute `source[1:3]`
2. bind that extracted result to `a`

Each indexed entry extracts independently from the same source object. Overlapping and repeated extractions are allowed:

```rix
{.. a[1:3], b[2:4], c[3], d[3] } = arr
```

Indexed nested destructuring is also allowed:

```rix
{.. picked[2:4] = [x, y, ...z] } = arr
{.. [2:4] = [x, y, ...z] } = arr
```

This uses the same indexing rules RiX already uses for arrays, tuples, maps, and tensors. Tensor indexed destructuring uses the ordinary tensor selector rules directly; it does not introduce a separate tensor-only destructuring model.

For sequence-like values, bracket slices are interval-based, inclusive, and direction-aware:

```rix
a := [10, 20, 30, 40, 50]
a[2:4]      ## [20, 30, 40]
a[4:2]      ## [40, 30, 20]
a[-2:-1]    ## [40, 50]
```

### Semantic Inquiry and Explicit Conversion

RiX distinguishes between runtime facts and sticky semantic decoration, so it also provides direct expression operators for asking about and requesting semantic types:

```rix
x ? :rational
x ~: :rational
x ~!: :rational
```

The core registry includes exact built-in numeric types such as `:Integer`, `:Rational`, and `:RationalInterval`. Real-number implementations, including oracle-style reals and JavaScript-backed floats, are intended to be RiX startup extensions rather than core JavaScript types, so several implementations can coexist in user land.

`x ? :name` checks semantic membership using these sources:

- the registered runtime type of a plain value
- `x.__type`
- `x._type`
- membership of `:name` inside `x.__traits`

There is no hidden inheritance or group expansion in this operator. If you want something to count as `:rational`, that should already be recorded in one of those places by construction or conversion.

### Function Prep Phase

Functions can include a preparation phase between parameter binding and body execution:

```rix
SumPos = (x, y) ?- [
  xr = x ~: :rational,
  yr = y ~: :rational,
  total = xr + yr,
  total > 0
] -> total
```

Prep entries run left-to-right in the function's local scope. They may perform checks, conversions, destructuring, and local setup, and any bindings they create are visible to later prep entries and to the body.

`?-` is the soft form: if any prep entry returns `_` or throws, the call returns `_`.

`?!-` is the strict form: the same failures throw instead of collapsing to `_`.

`~:` and `~!:` are explicit type conversions, not trait conversions. They reuse the same copy/meta/type-canonicalization path as `{^ /::type/ expr }`, so they return a converted value with the same outfitting behavior rather than mutating the original variable in place.

- `x ~: :type` returns the converted value or `_`
- `x ~!: :type` returns the converted value or throws

Soft-conversion warnings can be enabled with:

```js
warnings: {
  conversion: true
}
```

### Prepared Trial Expressions

The function prep model is also available directly on expressions:

```rix
F(3) ?- x: [x ? :Integer, x > 0]
F(3) ?!- x: [x ? :Integer]
```

The candidate expression is evaluated once, then bound or destructured in a
temporary scope. Prep entries run left-to-right. On success, the expression
returns the original candidate value; the binding and any prep locals do not
escape. Discarding that scope does not roll back mutations or IO performed by
prep code.

- `?-` returns `_` when candidate evaluation, destructuring, or prep fails.
- `?!-` throws on the same failures.
- The first gate controls errors raised while evaluating the candidate.
- Chained gates run in source order and each gate supplies its own failure
  policy.

```rix
F(3)
  ?-  value: [value ? :Integer]
  ?!- value: [value > 0]
```

Here an evaluation error or non-integer result is a soft failure, while an
integer that is not positive is a strict failure. Successful prep bindings are
visible to later gates, and the candidate is never evaluated again.

Prepared trials compose with ordinary assignment:

```rix
a := F(3) ?- x: [x > 0]             ## assigns the value or _
b := F(3) ?!- x: [x ? :Integer]     ## assigns or throws before := commits
```

Inside a case block, a soft prepared-trial failure advances to the next arm:

```rix
result := {?
  F(-3) ?- x: [x > 0];
  F(4) ?- x: [x > 0];
  5
}
```

The first successful arm returns its original candidate. A strict failure
throws, an ordinary expression remains the unconditional fallback, and no
successful arm with no fallback returns `_`. A successfully accepted `_` is
still a result and does not fall through.

Prepared-trial patterns reuse ordinary destructuring, including structural
failure:

```rix
value ?- [head, ...tail]: [head > 0]
value ?- {: x, y }: [x + y == 1]
```

### Multifunctions

RiX supports ordered multi-variant dispatch. Prep success selects the first matching variant; there is no separate hidden pattern-matching engine.

```rix
F = [
  (x) ?- [x > 0] /Positive/ -> x,
  (x) /Fallback/ -> -x
]

F(5)          ## 5
F(-5)         ## 5
F[:Positive](5)
```

Use the explicit `{> ... }` literal when the multifunction is anonymous, inline, or assembled from existing callables:

```rix
[-2, 0, 3] |>> {>
  (x) ?- [x < 0] /Negative/ -> -x,
  (x) ?- [x > 0] /Positive/ -> x^2,
  (x) /Zero/ -> 0
}
## [2, 0, 9]

A = {> (x) /Small/ -> x + 1 }
B = {> (x) /Large/ -> x * 10 }
Combined = {> A, B }              ## flattened in source order
OnlySmall = {> A[:Small] }        ## selected variants are ordinary functions
```

Key rules:

- If an uppercase name is assigned an array, RiX marks that array as a multifunction automatically.
- `{> ... }` always creates a multifunction value, without requiring assignment.
- Entries may be functions or multifunctions. Nested multifunctions are flattened recursively in source order.
- `F[:Name]` returns that named variant as an ordinary function, so it can be called, piped, or inserted into another `{> ... }` literal.
- Variants are tried in array order.
- Prep success selects the variant permanently for that call.
- Prep failure means "try the next variant".
- Once a variant is selected, its body result is final, even when it returns `_`.
- If no variant matches, the whole call returns `_`.

Variant-building syntax:

```rix
F(x) => x + 1        ## append
F(x) ^=> x * 10      ## prepend
F(x) /Exact/ => x
F(x) ?- [x > 0] /Pos/ => x
```

Named variants store their name in `variant.__name`, and direct dispatch is available through ordinary key-style indexing:

```rix
F[:Exact](7)
```

Inside a variant:

- `$` is the current variant
- `$$` is the parent multifunction

A no-prep variant that appears before later variants always matches if reached, so RiX can emit a configurable warning for that situation.

#### Cell Protections and Value Mutability

RiX distinguishes two separate concepts:

1. **Cell-level protection** (ordinary meta — survives `~=`, governs whole-value *replacement*):
   - `.lock` — blocks `~=`, `~~=`, and combo operators; allows `=` rebind, `:=` copy, and in-place index mutation.
   - `.frozen` — blocks `~=`/`~~=` *and* ordinary meta edits; allows `=` rebind and in-place index mutation.
   - `.immutable` — like `.frozen` but permanent; cannot be unset.

2. **Value-level mutability** (ephemeral meta — replaced wholesale under `~=`, governs in-place *structural mutation*):
   - `._mutable` — when truthy, composite values (arrays, maps, tensors) allow index assignment (`arr[i] = v`). Arrays, maps, and tensors default to `._mutable = 1`.

These are intentionally independent: a locked cell may still hold a mutable array whose elements can be changed; and a `~=` to a non-mutable rhs drops the `._mutable` flag from the lhs.

```rix
x := [1, 2, 3]
x.lock = 1       ## lock the cell

x ~= [4, 5, 6]  ## ERROR: cell is locked
x[1] = 9        ## OK: ._mutable governs index mutation, not .lock
```

```rix
a := [1, 2]
a._mutable = _   ## remove value mutability

b := [3, 4]      ## b is mutable (._mutable = 1 by default)
a ~= b           ## a now has b's value AND b's ._mutable
a[1] = 9         ## now OK — ._mutable was adopted from b
```

Use `.DeepMutable(value, flag)` to recursively set or clear `._mutable` throughout a nested structure. Pass `_` (null) to remove mutability, or any non-null value (e.g. `1`) to restore it:

```rix
nested := [[1, 2], [3, 4]]
.DeepMutable(nested, _)   ## all inner arrays lose ._mutable
.DeepMutable(nested, 1)   ## all inner arrays regain ._mutable
```

#### Equality vs Identity

RiX distinguishes **value equality** from **cell identity**:

- `==` compares values: do these cells hold equal values?
- `===` tests identity: do these names refer to the **same cell**?

```rix
x := 5
y = x       ## y aliases x — same cell
z := x      ## z is an independent copy

x == y      ## 1 (same value)
x === y     ## 1 (same cell)
x == z      ## 1 (same value)
x === z     ## null (different cells, even though equal values)
```

This distinction matters for tracking mutations: two names sharing a cell will always agree, but two independent copies will not.

#### Headered Outfitting, Sticky Semantics, And Constructor Capture

RiX uses a shared `/ ... /` header syntax for value outfitting and for constructor defaults:

```rix
{^ 7}
{^ /#len ::Length :meters/ 7}
{= /:= #pt ::Point :cartesian/ x = 3, y = 4}
{.. /::=/ a, ==b, ~=c}
{: /#pair/ a, b}
{:2x2: /#M ::Matrix :square/ 1, 2; 3, 4}
```

Headers can declare:

- a default capture mode
- a sticky semantic name via `#name`
- a sticky semantic type via `::TypeName`
- sticky traits via `:trait`

RiX constructors use assignment-style capture rules instead of a separate "containers just keep values somehow" model. Every inserted entry uses one capture mode:

- `==` — alias capture
- `:=` — fresh shallow copy
- `~=` — fresh refreshing shallow copy
- `::=` — fresh deep copy
- `~~=` — fresh refreshing deep copy

The effective mode comes from an entry override when the constructor kind supports one, otherwise from the constructor header, otherwise from the runtime default constructor capture mode. The current default is deep copy.

```rix
m = {= /::=/ a = x, b == y, c ~= z}
a = {.. 1, 2, 3}
b = {.. /:=/ x, y}
t = {: /::=/ a, b, c}
u = {| /==/ item1, item2 |}
grid = {:2x2: /::=/ a, b; c, d}
```

This is deliberate: RiX is a cell-based language, so container construction follows the same alias/copy/update reasoning as the rest of the language rather than introducing ad hoc JS-style value/reference rules.

Semantic metadata is split deliberately:

- ephemeral runtime facts: `._type`, `._proto`
- sticky semantic interpretation: `.__name`, `.__type`, `.__traits`, `.__proto`

On `~=` / `~~=` updates, sticky semantic metadata survives unless explicitly replaced. If a value has a sticky semantic type, the new raw rhs is processed through that type again so the cell remains in the same semantic regime. Traits are sticky augmentations in this version; they do not transform values. Automatic trait checking is optional, with `:verify` enabling per-value validation on updates.

Semantic `.__proto` is layered so trait methods override type methods, and semantic methods override builtin/runtime `_proto` methods. If a semantic type changes while traits are preserved, RiX allows it but emits a warning.

To define a function, you use the `->` operator. You can either use a named function definition or assign an anonymous lambda to a variable:
```rix
Square(n) -> n ^ 2
Cube := (n) -> n ^ 3
```

#### Receiver-First Methods

RiX also supports receiver-first method syntax as sugar over ordinary callable values:

```rix
arr.Push(5)
arr.Push!(5)
```

- `obj.Method(args)` calls a non-mutating method and should return a new value.
- `obj.Method!(args)` calls the mutating variant and should modify `obj` in place.
- The receiver is always the first argument to the resolved callable.
- Only the call form performs method lookup. `x = arr.Push` is still just direct meta-property access.

For example:

```rix
a := [1, 2]
b := a.Push(5)
## a is still [1, 2]
## b is [1, 2, 5]

a.Push!(5)
## a is now [1, 2, 5]
```

Array methods follow the same mutating/non-mutating pairing. A few common ones:

```rix
[1, 2, 3, 4].Slice(2, 4)      ## [2, 3]     (method Slice is end-exclusive)
[10, 20, 30].SWAP(1, 3)       ## [30, 20, 10]
[1, 2, 3, 4, 5, 6, 7].MOVE(4:6, 2)   ## [1, 4, 5, 6, 2, 3, 7]
```

`MOVE(indexOrInterval, targetIndex)` removes the selected item(s) first, then inserts them into the shortened array. Positive target indices insert before that position; negative target indices insert after the addressed slot counting from the end.

Mutating `!` methods require a mutable receiver. RiX uses the existing meta model for that check, so a value without `._mutable` or one marked `.frozen` / `.immutable` will reject the mutation attempt.

The full built-in method surface is listed in the [methods guide](./eval/methods-guide.md).

#### Rest Parameters and Spread Syntax
RiX supports the spread operator (`...`) to gather leftover parameters into an array (rest parameters) or expand collections into arguments (spread arguments).

```rix
## Rest Parameters
SumAll := (...args) -> (args |>: @+[2] )
SumAll(1, 2, 3)     ## -> 6

## Spread Arguments
arr = [1, 2, 3]
SumAll(...arr, 4)   ## -> 10

## Array Spread
extended = [0, ...arr, 4]  ## -> [0, 1, 2, 3, 4]
```

#### Implicit Multiplication and Function Application

RiX lets you write mathematical expressions the way you would on paper. When two expressions appear next to each other with no operator between them, RiX interprets the adjacency based on what's on the left.

**Implicit multiplication** — lowercase variables and numbers multiply when adjacent:

```rix
a := 7
b := 9
3a             ## -> 21        (same as 3 * a)
a b            ## -> 63        (same as a * b)
5 10           ## -> 50        (same as 5 * 10)
3(7 + 1)       ## -> 24        (same as 3 * (7 + 1))
(a + 1)(b - 1) ## -> 64        (same as (a + 1) * (b - 1))
3x^2           ## -> 3 * (x^2) — exponentiation binds tighter
```

Note that `ab` is a single identifier, not `a * b`. Only separate tokens produce multiplication.

**Implicit callable application** — an uppercase function name followed by an adjacent expression calls that function, consuming the **maximal multiplicative chunk** to its right as the argument:

```rix
F(n) -> n + 10
G(n) -> 2 * n
H(n) -> n - 1

F 3            ## -> 13        F(3)
F 3x           ## -> F(3*x)    with x=4: F(12) = 22
F 3x^2         ## -> F(3*x^2)  with x=4: F(48) = 58
F 3x + 7       ## -> F(3*x) + 7   chunk stops at +
F (3x + 7)     ## -> F(3*x + 7)   parens extend past the chunk
```

Application binds tighter than implicit multiplication, so a number before a callable multiplies the call result:

```rix
3 F 7          ## -> 51        3 * F(7) = 3 * 17
2 G 3 + 1      ## -> 13        2 * G(3) + 1 = 2*6 + 1
```

Callables chain right-to-left through adjacent callables:

```rix
F G 7          ## -> 24        F(G(7)) = F(14)
3 F G 7        ## -> 72        3 * F(G(7)) = 3 * 24
F G x          ## -> F(G(x))   with x=4: F(8) = 18
3 F G 7 H 9    ## -> 366       3 * F(G(7 * H(9)))
               ##              H(9)=8, 7*8=56, G(56)=112, F(112)=122, 3*122=366
```

A few things that do **not** happen:
- `3 F` with no argument does not auto-call `F` — it means `3 * F`, which is an error if `F` is a bare function.
- `F` alone retrieves the function value; it does not call it.
- `F + 1` does not call `F` — only adjacency triggers application, not operators.
- Explicit call syntax `F(args)` always works and is unchanged.

#### Lexical Scoping and the `@` Prefix
RiX uses lexical scoping. Function bodies, explicit blocks, loops, and system blocks create a new local scope. Inside one of those scopes, plain names resolve only within the current local scope unless you explicitly use `@` to reach outward.

Direct function calls are the one exception: `F(...)` searches outward for a callable binding, so an outer function can be called from inside a scoped block without importing it first. For imported scripts, that search stops at the script module boundary: exported functions can call private module helpers without `@`, but a missing helper will not fall through to the importing caller's scope. Bare retrieval is still lexical, so `G = F` inside a block is local-only and requires `G = @F` if `F` lives outside the block.

Break blocks (`{! ... }`) and case blocks (`{? ... }`) are a special case. Inside a break block, plain reads can see the **immediate surrounding scope** without `@`, but writes still stay local unless you explicitly use `@name = ...` or `@name += ...` / `@name ++= ...` / `@name \/= ...` to mutate that surrounding scope.

When the *entire* body of a function or lambda is itself a block, loop, or system container, that outermost container shares the function's scope instead of creating an extra nested one. This lets parameter bindings work naturally:

```rix
Double := (x) -> {; 2 * x }
```

Nested blocks inside that body are still isolated:

```rix
Adjust := (x) -> {;
    x += 1
    {; 2 * @x }   ## nested block must use @x
}
```

More generally, when a code block appears as a sub-part of any scope-creating construct, it shares that construct's scope. This is especially useful in loops where one part needs multiple statements:

```rix
## The init block shares the loop's scope — x is visible everywhere:
{@ {; x = 0; y = 10 }; x < 3; x + y; x += 1 }   ## => 12

## Equivalent to writing it without a block:
{@ x = 0; x < 3; x; x += 1 }                      ## => 2
```

Inside temporal brace containers such as loops and explicit blocks, a comma can sequence multiple expressions inside one semicolon-delimited slot. It evaluates left-to-right in the current scope and returns the final expression, without creating a new block scope:

```rix
{@ i = 1, j = 3; i < j; i + j; i += 1 }            ## => 5
{; x = 1, x += 2, x + 4 }                          ## => 7
```

To create an isolated block inside a construct position, use nested braces — the outer block shares scope, the inner one isolates:

```rix
{@ { { x = 1 } }; x < 4; x; x += 1 }   ## Error: x is not in loop scope
```

If you want to explicitly modify or read a variable from an **outer scope**, you must prefix it with `@`. This prevents accidental shadowing of variables when inside a lambda, block, or loop.

```rix
counter := 0

Increment() -> {;
    @counter += 1   ## Modifies 'counter' from the outer scope
}
```
*Note: Combo assignment operators (`+=`, `*=`, `/=`, etc.) work natively and automatically desugar to the appropriate underlying operation.*

```rix
x := 5
{;
    x         ## Error: x is outside the block scope
    @x + 1    ## OK
}
```

#### Deferred Execution and `@@`
Sometimes you want to create a block of code but execute it later rather than immediately. You can prefix any block or syntax container with `@` to create a **deferred AST node**. 

```rix
f := @{; 1 + 2 }   ## f now holds an AST node, not the number 3
```

To evaluate a deferred node at runtime, use the `@@` prefix operator (which is syntax sugar for the `.Eval(ast)` capability). You can also use `@@` directly on a string to dynamically parse and evaluate it:

```rix
@@f                ## Evaluates the deferred block, yielding 3
@@"1 + 2"          ## Evaluates the string of code, yielding 3
```

By default, deferred ASTs and strings evaluated with `@@` execute in the **current lexical scope** just as if they had been written inline. This means any assignments happen directly in your current scope instead of disappearing into a transient subscope:

```rix
x := 10
f := @{; x = 99 }
@@f                ## Evaluates x = 99
x                  ## 99 (the caller scope was directly mutated)

@@"y := x + 1"     ## Dynamically evaluates a string
y                  ## 100
```

If you need to evaluate a block with specific local bindings, or in a completely isolated scope, you can explicitly use the `.` system capability `.Eval(ast_or_string, bindings, mode)`:

```rix
f := @{; x + y }
.Eval(f, {= y=5 })           ## 104 (inherits x=99, injects y=5)
.Eval(f, _, :fresh)          ## Evaluates in an entirely fresh scope (x is undefined)
```

#### Block Import Headers
Scoped execution blocks can optionally start with an import header. This is only valid at the top of an explicit scoped block: plain `{ ... }`, `{; ... }`, `{@ ... }`, and `{$ ... }`.

```rix
{;
    < a~x, b=y, z=, r >
    ...block body...
}
```

The left side introduces a new local name for the block. The right side names the source in the enclosing scope chain.

- `name` and `name~` mean copy `name` from the outer scope into a new local `name`
- `local~outer` copies the current outer value of `outer` into a new local `local`
- `name=` aliases local `name` to the outer binding `name`
- `local=outer` aliases local `local` to the outer binding `outer`

Copy imports stay local:

```rix
x = 10
{;
    < x >
    x = x + 1
}
## outer x is still 10
```

Alias imports write through when you use `~=` or combo operators (which preserve cell identity):

```rix
y := 20
{;
    < y=>
    y += 1       ## combo ops use ~= semantics — writes through the alias
}
## outer y is now 21
```

Note: using plain `=` inside an aliased import rebinds the local name and breaks the alias.  Use `~=` or combo operators like `+=` to write through.

`@name` still bypasses the local import and reaches outward directly:

```rix
x = 5
{;
    < x >
    x = x + 1
    @x = @x + 100
}
## local x is 6, outer x is 105
```

Import headers are declarative, not sequential. In `< a~x, b~a >`, the source for `b~a` is the enclosing `a`, not the newly introduced local `a`. Reusing the same local target twice in one header is an error.

#### Script Imports
RiX can run another `.rix` file with an angle-call expression:

```rix
<"math/square">
<"math/square" x>
<"worker" state=data>
<"poly" x ; p=result, d=deriv>
<"net/fetch" /-All,+Core,+Net/ >
```

The path is resolved relative to the current script (or the current execution base directory at the top level), and `.rix` is added automatically.

- `<"path">` runs the target script.
- Inputs after the path bind caller cells or copied values into a fresh script scope.
- `; outputs` copies or aliases named exports back into the caller scope.
- Every run is fresh. Re-running the same script creates a new execution state each time.
- Imported scripts run with a restricted system capability set. Nested imports are allowed by default unless the `Imports` capability is removed.

If the imported script ends with an explicit export declaration, the script call returns an export bundle instead of the last expression value.

Script:

```rix
< x >
r := x * x
< result=r >
```

Caller:

```rix
y = <"square" x ; z=result>
```


## Null, Holes, Truthiness
RiX simplifies boolean logic with a very consistent rule:
**`null` is the only falsy value.** 
** holes are the undefined and not consider true or false**

Everything else—including `0`, `""` (empty string), and empty collections `[]`—is considered **truthy**. When a short-circuiting operator like `&&` (logical AND) fails to match, it simply returns `null`. This logic makes it very easy to chain conditional checks without needing strict boolean casting.


### Holes and Undefined

RiX has an explicit **hole** value distinct from `null`. Holes arise from two sources:
1. **Omitted syntax** — explicit gaps in array or function-call argument lists.
2. **Unbound identifiers at the REPL** — typing a bare name that has not been assigned displays `undefined` instead of an error.

### null vs hole

| | `null` (`_`) | hole |
|---|---|---|
| Literal syntax | `_` | `[1,,3][2]`, `F(,7)` |
| Assignable? | yes | no |
| Falsy? | yes | — |
| Standard ops | accepted | **error** |
| `?|` coalescing | left side kept | right side used |

### Array hole syntax

Consecutive or trailing commas produce holes:

```rix
[1,,3]      ## sequence with hole at position 2
[,1]        ## hole then 1
[1,]        ## 1 then hole
[,]         ## two holes
[,,]        ## three holes
[1,,3][2]   ## → hole
```

### Hole-coalescing operator `?|`

`left ?| right` — returns `left` if it is not a hole, otherwise evaluates and returns `right`.

```rix
a := [1,,3]
a[2] ?| 9      ## → 9  (position 2 is a hole)
a[1] ?| 9      ## → 1  (position 1 is not a hole)
a[2] ?| a[3]   ## → 3  (chains naturally: left-associative)
```

`?|` is lazy — the right side is not evaluated when the left side is not a hole.

### Omitted call arguments

Pass a hole explicitly by omitting a positional argument:

```rix
F(,7)      ## first arg is a hole
F(1,,3)    ## second arg is a hole
F(,)       ## both args are holes
```

### Parameter defaults with `?=`

Parameters declare a **hole default** using `?=`. The default is used when the caller explicitly passes a hole or when the argument is omitted entirely. It does **not** trigger on `null`, `0`, empty string, or any other non-hole value.

```rix
F := (x ?= 2, a) -> a ^ x
F(, 7)     ## → 49   (hole for x → x defaults to 2, 7^2)
F(3, 7)    ## → 343  (explicit 3, 7^3)
F(0, 7)    ## → 1    (explicit 0, 7^0; holeDefault not triggered)
```

`F(_, 7)` would fail because `_` (null) is not a hole — null is a regular value.

`?=` is **only** valid in parameter/binding position. It is not a comparison operator. Use `==` for equality comparison.

### Holes in pipes

Holes in sequences are passed through to callbacks. Use `?|` inside the callback to handle them:

```rix
[1,,3] |>> (x -> (x ?| 0) + 1)   ## → [2, 1, 4]
```

Standard reduction/arithmetic pipes will **throw** if they encounter a hole:

```rix
[1,,3] |>: @+[2]   ## error: Cannot use undefined/hole value in computation
```

### REPL unbound identifiers

In the interactive REPL, entering a bare unbound identifier displays `undefined` (rather than raising an error). Expressions that *use* an unbound identifier still throw:

```
rix> x
undefined
rix> x + 1
Error: Undefined variable: x
```


---

## Collections & Data Types

RiX has four primary collection kinds:

| Kind | Literal syntax | Description |
|------|----------------|-------------|
| Sequence (array) | `[1, 2, 3]` | Ordered, 1-based indexed |
| Sequence (advanced brace form) | `{.. 1, 2, 3}` | Ordered, 1-based indexed with explicit constructor capture header |
| String | `"hello"` or `:hello` | Unicode code-point sequence |
| Tuple | `{: a, b, c }` | Fixed-arity positional group |
| Map | `{= a=1, b=2 }` | Key-value, canonicalized string keys |

### Colon-Strings

A colon followed by an identifier or number in a position where a value is expected (not after another value) produces a string literal:

```rix
:hello          ## same as "hello"
:World          ## same as "World" (case preserved)
:some_key       ## same as "some_key"
:123            ## same as "123"
```

This is convenient for map key access and anywhere a short string is needed:

```rix
m := {= name = 5 }
m[:name]        ## 5 — same as m["name"]
x := :hello     ## x is "hello"
[:a, :b, :c]    ## same as ["a", "b", "c"]
```

Note: `:` after a value is still the interval operator. `a:b` and `a :b` both produce intervals, not strings.

Arrays, maps, and tensors are **structurally mutable by default** (`._mutable=1`). Other collections are not. This allows in-place index assignment (`arr[1] = 9`). See the cell protection section below for details.

Map keys are canonicalized via `KEYOF`: integers become their decimal string, strings stay as-is, and arbitrary values may supply a `.key` meta property.
###  Map Key Notes
Map keys are always stored as **strings**.

Key resolution (`.KEYOF`) rules:
- String value -> same string key
- Integer value -> canonical integer string (so `1` and `"1"` are the same key)
- Any other value -> must have meta property `.key` (string or integer)

Map literals support two key forms:
- Identifier sugar: `{= a=5 }` (same as key `"a"`)
- Parenthesized key expression: `{= (expr)=value }`

Expression keys must be parenthesized:

```rix
a = {= a=5, (1)=2, ("3")=4, (1+1)=9 }
```

These are equivalent for lookup/set:

```rix
a[1]
a[:1]
a["1"]
```

So after `a = {= (1)=2 }`, all of `a[1]`, `a[:1]`, and `a["1"]` return `2`.

Map literals reject duplicate keys after key canonicalization:

```rix
{= a=1, ("a")=2 }      ## error: duplicate key "a"
{= (1)=1, ("1")=2 }    ## error: duplicate key "1"
```

### `.key` Identity
Values can define `.key` to control how they behave as map keys:

```rix
v.key = "user:42"
```

Rules:
- `.key` must be string or integer
- First assignment sets identity
- Reassigning the same canonical key is allowed (idempotent)
- Reassigning a different key is an error


### Map Keys

Map keys are canonicalized strings:
- Plain identifiers in literals (`a=1`) use the identifier name as key
- Parenthesized expressions (`(1)=2`) use `KEYOF` to canonicalize: integers become `"1"`, `"2"`, etc.
- Strings use their value

```rix
m = {= a=5, (1)=10, ("x")=20 }
m["a"]   ## 5
m[1]     ## 10   (integer 1 → key "1")
m["x"]   ## 20
```

When a map callback receives a key locator `k`, it is a RiX string value consistent with `KEYOF` and `INDEX_GET`.

### Sort

Sort makes sense for arrays but not maps or sets. There is no canonical ordered version for them. 

### Examples — tensors

Tensor literals use an explicit shape header and row-major order:

```rix
m := {:2x3: 1, 2, 3; 4, 5, 6 }
m[2, 3]            ## 6
m[1, ::]           ## tensor view of the first row
m^^                ## transpose view, shape {: 3, 2 }
```

Tensor traversal pipes use the index tuple as the locator:

```rix
{:2x3:} |>> (v, idx) -> idx[1] * 10 + idx[2]
## {:2x3: 11, 12, 13; 21, 22, 23 }
```

This is the preferred fill idiom. Assignment loops are usually unnecessary because tuple pipes already unpack index tuples:

```rix
{:2x3x7:} |>> (v, idx) -> (idx |> SomeFormula)
```


### Tensor Notes

- Tensor indices are 1-based; negative indices count from the end; index `0` is invalid.
- Bracket slices are strict, closed, and directed. `::` is sugar for the full forward slice.
- Tensor `|>>` returns a new dense tensor with the same shape.
- Tensor `|>?` returns a sequence of `{: value, indexTuple }` pairs.

---

## Execution Blocks & Sigils
RiX heavily leverages braces `{...}` for creating various containers, collections, and execution blocks. 

### Plain Braces: Execution Blocks
Plain braces `{ ... }` are **always** interpreted as execution blocks. They execute statements sequentially and return the value of the final statement.

```rix
## Simple block
{ 
  x := 5; 
  y := 10; 
  x + y 
} ## Returns 15
```

### Sigilled Braces
For other types of containers or specialized execution, a "sigil" is used immediately after the opening brace:

| Syntax | Type | Example / Description |
|--------|------|-------------|
| `{; ... }` | **Explicit Block** | Alternative syntax for blocks. Supports an optional top-of-block import header `< ... >`. |
| `{? ... }` | **Case / Branch** | Conditional branching. Example: `{? x > 0 ? "pos"; x < 0 ? "neg"; "zero" }` |
| `{@ ... }` | **Loop** | C-style loop: `{@ init; condition; body; update }`, the three-part form `{@ init; condition; body }` when the body performs its own update, or the five-part form `{@ init; condition; body; update; after }` where `after` runs on normal completion and supplies the loop result. Loop headers may also carry an optional name and/or max-iteration cap such as `{@name@ ... }`, `{@:100@ ... }`, `{@name:100@ ... }`, `{@::@ ... }`, or `{@name::@ ... }`. Supports an optional top-of-block import header `< ... >`. |
| `{! ... }` | **Break Block** | Terminates the nearest matching block/case/loop and returns a value. Examples: `{! 5 }`, `{!; 5 }`, `{!@ "done" }`, `{!?name! "big" }`. |
| `{$ ... }` | **System** | Mathematical system of equations/assertions. Example: `{$ x :=: 3; y :>: 10 }`. Supports an optional top-of-block import header `< ... >`. |
| `{= ... }` | **Map** | Dictionary / key-value mappings. Example: `{= name="RiX", version=1 }` |
| `{\| ... }` | **Set** | A collection of unique elements. Example: `{\| 1, 2, 3 }` |
| `{: ... }` | **Tuple** | Fixed-length collection. Example: `{: x, y, z }` |
| `{> ... }` | **Multifunction** | Ordered callable variants; nested multifunctions flatten in source order. |

There are also N-ary operation braces for applying operations across arbitrary elements:
- `{+ 1, 2, 3}` -> N-ary Addition (or string concatenation).
- `{* 2, 3, 4}` -> N-ary Multiplication.
- `{&& a, b, c}` -> N-ary Logical AND (short-circuits to `null` on falsy).
- `{|| a, b, c}` -> N-ary Logical OR (short-circuits to the first truthy value or null).
- `{\/ A, B, C}` -> N-ary set union / interval hull.
- `{/\ A, B, C}` -> N-ary set intersection / interval overlap.
- `{++ A, B, C}` -> N-ary concatenation.
- `{<< a, b, c}` -> N-ary minimum (ignores `null` arguments).
- `{>> a, b, c}` -> N-ary maximum (ignores `null` arguments).
- `<>` remains binary-only; no n-ary brace form.
- In brace form, `<<`/`>>` mean min/max (not shift operators).

###  Loop Headers

Loops use a default max of `10000` iterations unless the host runtime changes `defaultLoopMax`.

- `{@ ... }` and `{@name@ ... }` use the default max.
- `{@:100@ ... }` and `{@name:100@ ... }` set an explicit finite cap.
- `{@::@ ... }` and `{@name::@ ... }` disable max checking.

The max check happens **after the loop condition passes and before the next body execution**. A loop with max `100` can therefore complete 100 iterations; it throws only when iteration 101 would start.

The three-part form omits the separate update slot. Use it when the body is the full iteration step, such as `{@ i = 0; i < 4; {; @total += i; i += 1 } }`, or for update-only loops such as `{@ i = 0; i < 4; i += 1 }`. The underlying lazy system capability accepts the same shape: `@_LOOP(init, condition, body)`.

The five-part form adds an `after` slot: `{@ init; condition; body; update; after }`. The `after` slot runs once after the condition becomes false, shares the loop scope, and its value becomes the loop result. This is useful for returning accumulated loop-local state:

```rix
{@ i = 0, total = 0; i < 4; total += i; i += 1; total }  ## => 6
```

`BREAK` exits the loop immediately and skips the `after` slot, so the break value remains the loop result.

Blank loop slots are preserved as no-op holes. For example, `{@ i = 0; i < 5; ; i += 1; i^2 }` has a blank body slot, still has five loop slots, and returns `25`.

Within each loop slot, comma expressions are evaluated left-to-right and stay in that slot. For example, `{@ i = 1, j = 3; i < j; i + j; i += 1; i }` has five loop slots: init `i = 1, j = 3`, condition `i < j`, body `i + j`, update `i += 1`, and after `i`. Commas in arrays, tuples, maps, and function calls remain element or argument separators.

### Break Blocks

Break blocks terminate the nearest matching **plain block**, **explicit block**, **case block**, or **loop**, and the break value becomes that construct's final result.

```rix
{;
    x := 1
    {! 5}
    99
}
## returns 5
```

Targeting forms:

- `{! expr }` — nearest breakable construct of any supported kind
- `{!; expr }` — nearest block (`{ ... }` or `{; ... }`)
- `{!@ expr }` — nearest loop
- `{!? expr }` — nearest case block
- `{!name! expr }`, `{!;name! expr }`, `{!@name! expr }`, `{!?name! expr }` — named targeting

Named explicit blocks use the existing sigil-name syntax, for example `{;outer; ... }`.


---

## System Functions & Calls
Essentially everything in RiX is "syntax sugar" that is immediately translated into fundamental **System Functions** after parsing.
- Writing `3 + 4` evaluates the internal `ADD` function.
- Writing `x := 5` evaluates the internal `ASSIGN` function.

These internal dispatch functions are not exposed as bare identifiers. Instead, all system capabilities are accessed through the **system object**.

### The System Object (`.`)

The bare `.` refers to the **system capability object** — a frozen, sandboxable collection of all built-in functions. You can call any system function by prefixing it with a dot:

```rix
.ADD(3, 4)       ## 7
.SIN(.PI())      ## ~0
.RAND_NAME(8)    ## e.g. "xKqTmPaR"
.AND(1, _)       ## null (false)
```

The system object can be inspected, copied, and restricted:

```rix
sys := .            ## copy of the system object
sys2 := . \ {|"PRINT"|}   ## withhold a capability (not yet in syntax; use .Withhold())
```

> [!NOTE]
> The system object is **frozen by default** — you cannot add or change capabilities on it directly. Use `.Withhold("NAME")` or `.With("NAME", fn)` to create a restricted or extended copy for passing to loaded scripts.

### Calling System Functions via `@_` Syntax

You can also invoke a system capability using the `@_Name()` form, which is an exact equivalent to `.Name()`:

```rix
@_ADD(3, 4)    ## same as .ADD(3, 4) → 7
@_ASSIGN(x, 5) ## same as .ASSIGN(x, 5) → sets x
```

### Aliasing Operator Functions

If you want to retrieve an operator's underlying function (e.g., to pass to a pipe or partial application), prefix its symbol with `@`. This returns a reference to the system capability for that operator:

```rix
adder := @+       ## reference to .ADD
adder(10, 20)     ## 30

## Equivalent forms:
ref := .ADD       ## also a reference to .ADD
ref(10, 20)       ## 30
```

The mapping from operator symbol to system name:

| Operator | System Capability |
|----------|------------------|
| `@+`     | `.ADD`           |
| `@-`     | `.SUB`           |
| `@*`     | `.MUL`           |
| `@/`     | `.DIV`           |
| `@//`    | `.INTDIV`        |
| `@%`     | `.MOD`           |
| `@^`     | `.POW`           |
| `@==`    | `.EQ`            |
| `@===`   | `.SAME_CELL`     |
| `@<`     | `.LT`            |
| `@>`     | `.GT`            |
| `@&&`    | `.AND`           |
| `@\|\|`  | `.OR`            |
| `@!`     | `.NOT`           |

### Partial Application and Placeholders
RiX supports powerful partial application using placeholders `_1`, `_2`, etc. When you call a function and use one or more of these placeholders instead of a value, it returns a **Partial Function**.

```rix
Double := @*(_1, 2)
Double(5) ## Returns 10

## Reordering arguments
SwapSubtract := @-(_2, _1)
SwapSubtract(10, 30) ## Returns 20 (30 - 10)

## Duplicating arguments
Square := @*(_1, _1)
Square(4) ## Returns 16
```

Partial functions are especially useful in pipelines:
```rix
[1, 2, 3] |>> @+(_1, 10) ## [11, 12, 13]
```


### Arity-Capped Callable Views

The syntax `fn[n]` produces a **callable wrapper** that forwards only the first `n` arguments to `fn` and silently discards any extras.

```rix
fn[n]
```

This is useful when a pipe callback supplies extra context arguments (locator, source) that a bare system function would misinterpret.

**This is not partial application.** It does not bind arguments, reorder them, or select arbitrary positions — it simply truncates the incoming argument list to the first `n`.

### Examples

```rix
## Reduce with bare @+ — without arity cap, @+ would receive (acc, val, locator, src)
## and MUL would try to use the sequence object in arithmetic.
[1, 2, 3] |>: @+[2]        ## 6   (only acc and val forwarded to @+)
[1, 2, 3] |:> 0 >: @+[2]   ## 6

## Map and filter with a user function
double := (x) -> x * 2
[1, 2, 3] |>> double[1]     ## [2, 4, 6]   (locator dropped)

isEven := (x) -> x % 2 == 0
[1, 2, 3, 4] |>? isEven[1]  ## [2, 4]

## Works on maps too
{= a=2, b=3 } |>> double[1]   ## {= a=4, b=6 }

## General call context (not pipe-specific)
G := @+[2]
G(10, 20, 99, 99)   ## 30  (only 10 and 20 forwarded)

## Zero-arity cap
C := () -> 42
C[0](1, 2, 3)       ## 42  (no args forwarded)

## Nested caps — outer cap wins
@+[3][2](1, 2, 3, 4)   ## 3  (at most 2 args reach @+)
```

### Relationship to placeholders

| Approach | Syntax | Purpose |
|---|---|---|
| Arity cap | `fn[n]` | Forward only first `n` args |
| Placeholder | `@+(_1, _2)` | Explicit selection / reordering |

Use `fn[n]` when you want "first N args only"; use placeholders when you need anything more specific.

### Rules

- `n` must be a non-negative integer literal. Negative or non-integer values error.
- If fewer than `n` arguments are supplied at call time, all are forwarded (no padding).
- Works on any callable value: lambdas, named functions (uppercase), system references, partials, or already-capped callables.
- Does not affect ordinary collection indexing — `collection[i]` continues to index as before.


---

##  Pipe Operators `|>`

RiX is highly optimized for functional programming and data transformation. The pipe operators allow you to cleanly string operations together. It's crucial to note that **pipe operators always return new collections**; they never mutate the original in-place. 

**Mutability Note:** While pipe operators create new copies, arrays and maps are created as **structurally mutable** by default (`._mutable=1`). This allows you to perform in-place modification using indices (e.g., `arr[1] = val`). You can disable structural mutation by removing the value mutability flag (`arr._mutable = _`). Cell-level protections (`.lock`, `.frozen`, `.immutable`) govern whole-value replacement, not index assignment.

When piping strings, RiX natively treats them as sequences of **Unicode Code Points**, safely keeping emojis and surrogate pairs intact across all slice, map, and filter operations.


Pipes pass values through transformations. All collection-pipe operators return **new** collections and never mutate the source.

### Plain pipe

```rix
val |> fn        ## pipe val as first arg to fn
val ||> fn(_1)   ## explicit placeholder form
```

### Collection traversal pipes

The following pipes traverse elements of a collection and invoke a callback on each. They support sequences, strings, and (for the traversal/fold operators) maps.

```rix
coll |>> fn      ## PMAP:    map fn over elements
coll |>? pred    ## PFILTER: keep elements where pred passes
coll |>&& pred   ## PALL:    every element passes (short-circuits)
coll |>|| pred   ## PANY:    any element passes (short-circuits)
coll |>: fn      ## PREDUCE: fold, first element/value as init
coll |:> init >: fn   ## PREDUCE: fold with explicit initial value
coll |>/| sep    ## PSPLIT:  split by delimiter, regex, or predicate
coll |>#| n      ## PCHUNK:  chunk by size or predicate boundary
coll |>< fn      ## Not a pipe; |>< is PREVERSE (reverse)
coll |<> fn      ## PSORT:   sort with comparator
```

### Callback contract

For **traversal pipes** (`|>>`, `|>?`, `|>&&`, `|>||`, predicate form of `|>/|`, predicate form of `|>#|`):

```
callback(val, locator, src)
```

For **reduce** (`|>:` and `|:> init >: fn`):

```
callback(acc, val, locator, src)
```

For **sort** (`|<>`), the comparator receives only:

```
comparator(a, b)
```

**Locator** is the native indexing/key form for the source collection kind:
- **Sequences and strings**: 1-based integer position (position 1 is the first element)
- **Maps**: the canonical map key as a RiX string
- **Tensors**: a 1-based index tuple

Callbacks that declare fewer parameters simply ignore the extra arguments.

### Examples — sequences

```rix
## Map with value only (backward-compatible)
[1, 2, 3] |>> (x) -> x * x         ## [1, 4, 9]

## Map with value + locator
[10, 20, 30] |>> (v, k) -> k        ## [1, 2, 3]  (1-based positions)

## Map using all three args (value, locator, source)
[10, 20, 30] |>> (v, k, s) -> {: v, k, .LEN(s) }
## [{: 10, 1, 3 }, {: 20, 2, 3 }, {: 30, 3, 3 }]

## Filter by locator (keep even-indexed elements)
[10, 20, 30, 40] |>? (v, k) -> k % 2 == 0    ## [20, 40]

## Reduce summing locators (1+2+3)
[10, 20, 30] |:> 0 >: (acc, v, k) -> acc + k  ## 6

## Reduce — implicit init (first element is accumulator)
[1, 2, 3, 4] |>: (acc, v) -> acc + v           ## 10
```

### Examples — strings

Strings are traversed as Unicode code points. The locator is the 1-based code-point position.

```rix
"abc" |>> (ch, k) -> k        ## [1, 2, 3]  (code-point positions)
"😀a😃" |>> (ch) -> ch        ## "😀a😃"  (identity map returns string)
"aAbBc" |>? (ch) -> ch != "A" ## "aBbc"  (filter on char value)
```

### Examples — maps

Maps support `|>>`, `|>?`, `|>&&`, `|>||`, `|>:`, and `|:> init >: fn`. Maps are **unordered** — no iteration-order guarantee is exposed to users.

For map traversal, callbacks receive `(value, key, sourceMap)`. The key is the canonical map key string.

`|>>` on a map **preserves original keys and transforms only values**. For structural reshaping, use reduce.

```rix
m = {= a=2, b=3 }

## Map values (preserve keys)
m |>> (v, k) -> v * 10          ## {= a=20, b=30 }

## Map — callback can use the key
m |>> (v, k) -> k ++ "=" ++ v   ## {= a="a=2", b="b=3" }

## Filter by value
{= a=2, b=7, c=1 } |>? (v, k) -> v > 1    ## {= a=2, b=7 }

## Filter by key
{= a=2, b=7, c=1 } |>? (v, k) -> k == "b" ## {= b=7 }

## All values positive?
{= a=2, b=7 } |>&& (v) -> v > 0   ## 7  (last value; null if any fail)

## Any value > 5?
{= a=2, b=7 } |>|| (v) -> v > 5   ## 7  (first passing value)

## Explicit-init reduce over values
{= a=2, b=7 } |:> 0 >: (acc, v) -> acc + v  ## 9

## Implicit-init reduce (first value encountered is accumulator; order unspecified)
{= a=2, b=7 } |>: (acc, v) -> acc + v       ## 9  (result, order unspecified)
```

Maps do **not** support `|>/|` (split), `|>#|` (chunk), or `|<>` (sort).

RiX has two distinct reduce forms with intentionally different semantics:

| Form | Syntax | Init source |
|------|--------|-------------|
| Implicit init | `coll \|>: fn` | First element/value of `coll` |
| Explicit init | `coll \|:> init >: fn` | `init` expression |

Both forms pass `(acc, val, locator, src)` to the callback.

### Backward compatibility with partial functions

Existing partial callbacks continue to work. When a partial is invoked via a traversal pipe, it receives only as many arguments as needed to satisfy its placeholders. Extra locator/src arguments are not forwarded to partials to avoid unintended behavior with N-ary system functions.

```rix
## These all work as before
[1, 2, 3] |>> @*(_1, 10)           ## [10, 20, 30]
[1, 2, 3] |>: @+(_1, _2)           ## 6
[1, 2, 3] |>? @>(_1, 0)            ## [1, 2, 3]
```

To access the locator or source in a partial, use explicit placeholder positions:

```rix
## _1 = val, _2 = locator, _3 = src
[10, 20, 30] |>> @+(_1, _2)   ## [11, 22, 33]  (value + 1-based position)
```



The sort comparator receives `(a, b)` only — no locator or source. Sort does not support maps.

```rix
[3, 1, 2] |<> (a, b) -> a - b   ## [1, 2, 3]  ascending
```

---

### Sequences and Generator Syntax
RiX has compact list-generation syntax using the pipe `|` inside brackets `[...]`. Generator chains use one primary source followed by candidate transforms and filters.

**Common Generation Rules:**
- `\|+n`: Add `n` to the previous source value.
- `\|*n`: Multiply the previous source value by `n`.
- `\|:f`: Generate from the one-based index with `f(index, self)`.
- `\|>f`: Generate from newest-first history when it is the source, or transform candidates after another source.
- `\|?p`: Keep candidates satisfying `p(value, sourceIndex, self)`.

**Example Generator Syntax:**
```rix
[2, |+2, |; 5]           ## Eager Arithmetic: [2, 4, 6, 8, 10]
[1, |*3, |; 4]           ## Eager Geometric: [1, 3, 9, 27]
[|: (i) -> i^2, |; 5]    ## [1, 4, 9, 16, 25]
[1, 1, |>F(_2,_1), |; 7] ## newest-first history placeholders
```

### Target Stopping and Laziness Status
The stop condition specifies both *when* to stop and *how* to evaluate:
- **Eager (`|;`)**: Computes accepted values immediately.
    - `|; 5`: Make exactly `5` elements.
    - `|; predicate`: Include the triggering value, then stop.
- **Lazy (`|^`)**: Produces and caches values on demand.
    - `|^ 1000`: Lazily bounds the generator to 1000 elements max.
    - `|^ (x) -> x > 1000`: Lazily stops when the predicate hits.

With neither terminator, a chain containing a source is lazy and unbounded.
Safety exhaustion throws an error rather than returning truncated output.


---

## Number Systems and Notation
RiX is built on an exact rational arithmetic core, and as such it supports multiple expressive ways to input and represent numbers perfectly accurately without floating point failure.

### Repeating Decimals (`#`)
The `#` character separates the non-repeating fractional digits from the infinitely repeating digits:
- `0.12#45` evaluates exactly to $0.12\overline{45}$.
- `0.#3` evaluates to $0.\overline{3} = 1/3$ (no non-repeating fractional part).
- `1.#6` evaluates to $1.\overline{6} = 5/3$.
- `7#3` evaluates exactly to $7.\overline{3}$ (= 22/3).

### Radix Shift (`_^`)
`n_^k` multiplies `n` by `10^k`, shifting the decimal point without floating point error:
- `1_^2` is exactly `100`.
- `3.14_^2` is exactly `314`.
- `1_^-2` is exactly `1/100`.

### Continued Fractions (`.~`)

RiX natively parses continued fraction representations as exact rationals.

A continued fraction $[a_0; a_1, a_2, \ldots]$ is written as `a0.~a1~a2~...`. There are two forms:

**Implicit-start** — integer part is unsigned (no leading sign or `~`):
- `3.~7~15~1` evaluates exactly to `355/113`.
- `1.~2` evaluates to `3/2`.

**Explicit-start** — a leading `~` marks the coefficient, and the integer part may be negative:
- `~1.~2` is the same as `1.~2` (= `3/2`).
- `~-1.~2` has first coefficient −1: evaluates to `−1 + 1/2 = −1/2`.
- `~-2.~1~2~2` evaluates to `−9/7`.

To **negate** a continued fraction value, apply unary minus to an explicit-start CF:
- `-~1.~2` = `−(1 + 1/2) = −3/2`.

> **Note:** Writing `-1.~2` (minus directly attached to an implicit-start CF) is a **syntax error** because it is ambiguous — it could mean a negative first coefficient or a negated value. Use `~-1.~2` or `-~1.~2` as appropriate.

### Mixed Numbers
Mixed numbers are supported using a double period `..` to attach an integer to a fraction seamlessly (with no internal spaces):
- `1..3/4` parses exactly as $1 + 3/4 = 7/4$.
- `-2..1/2` parses exactly as $-5/2$.

### Intervals and Betweenness

RiX treats intervals as first-class objects using the colon `:` operator. An interval represents the range of values between two endpoints.
- `1:5` creates a **RationalInterval** from 1 to 5.
- `5:2` creates an interval from 5 down to 2. RiX preserves the input order for display, but mathematically they cover the same range.

#### Betweenness
When three or more values are chained with colons, RiX automatically switches from interval creation to a **betweenness check**. It evaluates whether the values are in monotonic (ascending or descending) order.
- `2:3:5` returns `1` (true) because 3 is between 2 and 5.
- `2:6:5` returns `null` because 6 is not between 2 and 5.

This n-ary betweenness works for arbitrary chain lengths (e.g., `1:2:3:4:5`) and even supports **nested containers**:
- `2:(3:4):5` checks if the interval `3:4` is entirely contained within `2:5`.
- `2:{|3, 4, 4.5|}:5` checks if every element in the set is between 2 and 5.

### Bases
Input numbers are in base 10 unless they have a leading `0` followed by a letter. There are some bases that are named by default, such as `0b` for binary. Capital letters are available for user defined bases. 

Defined default bases are:
- `b` for binary (Base 2)
- `t` for ternary (Base 3)
- `q` for quaternary (Base 4)
- `f` for Base 5
- `s` for Base 7
- `d` for Base 12 (duodecimal)
- `x` for hexadecimal (Base 16)
- `v` for Base 20 (vigesimal)
- `u` for Base 36 (url shorteners)
- `m` for Base 60 (mesopotamia)
- `y` for Base 64 (0-9A-Za-z@&)

`0z[23]13FASD3` indicates a custom base of 23 which goes from 0 to 9 and then A-M. Base 64 is as high as the default goes; above that one must define a custom set of symbols, presumably going into unicode territory.

You can also define custom uppercase base prefixes directly:
- `0A = "0123456789ABCDEF"`
- `0B = {: 2, "01" }`

Base conversion operators:
- `n _> baseSpec` formats a number to a base string.
- `str <_ baseSpec` parses a base string back into an exact number.

Examples:
- `74 _> 0A` gives `"4A"`.
- `"4A.F" <_ 0A` gives `74 + 15/16`.

Prefixed literals also support quoted digit streams:
- `0A4A.F`
- `0A"4A.F"`


---

## Set and Collection Algebra
RiX provides a concise symbolic algebra for sets, intervals, and collections:

- `A \/ B`: Union (sets) or Hull (intervals).
- `A /\ B`: Intersection (sets) or Overlap (intervals).
- `A \ B`: Set difference (or key removal from maps).
- `A <> B`: Symmetric difference.
- `x ? S`: Membership test for sets/intervals; for maps, key existence test using `.KEYOF(x)`.
- `x !? S`: Non-membership test (for maps: key does not exist).
- `A ?& B`: Intersects predicate.
- `A ** B`: Cartesian product of sets.
- `A ++ B`: Concatenation of ordered collections (arrays, tuples, strings, maps).

## Symbolic System Specs

RiX now uses `{# ... }` for symbolic system specs.

```rix
S = {#x,y,z:p#
  p = x^2 * y + z
}
```

This form does not execute its body as a runtime block. Instead it returns a first-class symbolic spec object with:

- `kind = "systemSpec"`
- `inputs`
- `outputs`
- `statements`

Header forms:

```rix
{# ... }
{#x,y,z# ... }
{#:p,q# ... }
{#x,y,z:p,q# ... }
```

Rules for the header:

- Names before `:` are declared inputs.
- Names after `:` are declared outputs.
- Header names must be bare identifiers.
- Duplicate input names, duplicate output names, and input/output overlap are rejected.

Rules for the body in the current implementation:

- Only symbolic assignment statements are supported: `name = expr`
- The left-hand side must be a bare identifier.
- `=` inside `{# ... }` means symbolic definition inside the spec, not runtime assignment and not solver equality.
- If outputs are declared, each declared output must be assigned exactly once.
- If outputs are omitted, outputs are inferred from top-level assignment targets in encounter order.

Expression trees are stored structurally, not as precomputed values and not as reparsed source strings. Outer references such as `@name` are preserved symbolically for later consumers to interpret.

Current symbolic capabilities:

```rix
P = .Poly({#x,y,z:p# p = x^2 * y + z })
Dx = .Deriv({#x,y,z:p# p = x^2 * y + z }, "x")
```

`.Poly` and `.Deriv` currently support a restricted polynomial subset:

- constants
- identifiers
- `+`
- `-`
- `*`
- `^` with a nonnegative integer literal exponent

Relation and constraint forms such as `:=:`, `:<:`, and `:>:` remain separate and are reserved for later relational/solver work.


---

## Regex Literals
RiX provides first-class support for Regular Expressions using the `{/pattern/flags?mode}` syntax. A regex literal evaluates to a function that you can then call with a string to perform matching.

### Syntax and Modes
The character following the trailing slash determines the evaluation **mode**:

| Mode | Syntax | Returns |
|------|--------|---------|
| **ONE** | `{/pat/}` | The first Match object found, or `null`. |
| **TEST** | `{/pat/?}` | `1` if a match exists, otherwise `null`. |
| **ALL** | `{/pat/*}` | A sequence of all Match objects found. |
| **ITER** | `{/pat/:}` | A stateful iterator function for sequential or indexed access. |

### Match Objects
When a regex matches, it returns a **Map** containing:
- `text`: The full text of the match.
- `span`: A tuple `{: start, end }` (1-based indices).
- `groups`: A sequence of all capture groups.
- `spans`: A sequence of tuples for each capture group's span.
- `named`: A map of named capture groups.
- `named spans`: A map of spans for named capture groups.
- `input`: The original input string.

### Examples
```rix
## Simple check
IsEmail := {/^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/?}
IsEmail("test@example.com") ## Returns 1

## Iterator usage
Scanner := {/\d+/:}
it := Scanner("12 apples, 45 oranges")
it() ## Returns match object for "12"
it() ## Returns match object for "45"
it(1) ## Random access: returns "12" again
```

---

## 10. Units and Exact Generators

Physical units and exact symbolic generators are ordinary RiX values stored in
the `.Units` and `.Exact` map collections:

```rix
m := .Units[:m]
s := .Units[:s]
pi := .Exact[:pi]

distance := 3 * m
speed := distance / (2 * s)
angle := pi/2 * .Units[:rad]
```

Scientific-unit syntax is lookup-and-multiply sugar:

- `9.8~[m/s^2]` means `9.8 * (.Units[:m] / .Units[:s]^2)`.
- `3~{pi}` means `3 * .Exact[:pi]`.
- `2~{i}` uses the algebraic generator whose relation is `i^2 + 1 = 0`.

Compatible quantities convert automatically for addition and preserve the
left operand's display unit. Incompatible dimensions are errors. Explicit
conversion uses `.ConvertUnit(value, targetUnit)`; the source unit is already
carried by the value.

Unit values are callable constructors, which is especially useful for affine
coordinates: `.Units[:degC](20)`. See
[`units-and-exact-values.md`](tutorial/units-and-exact-values.md) for the
tutorial and [`units-and-exact-generators.md`](design/eval/units-and-exact-generators.md)
for the runtime design.

Exact complex values use `.Exact[:i]` and the `.Complex` operation map. Division
within a single algebraic extension is exact, so `1/.Exact[:i]` reduces to
`-i`. `.Complex.Conjugate(z)`, `.Complex.Re(z)`, `.Complex.Im(z)`, and
`.Complex.NormSquared(z)` work without selecting a floating approximation.

For multiplication-oriented work, `.Complex.Cayley(z)` converts to exact
Cayley polar form `Cayley(r, t)`, with `t = tan(Arg(z)/2)`. The direction is an
algebraic stereographic coordinate rather than a stored angle. Multiplication,
division, powers, reciprocal, and conjugation stay in that form; addition and
subtraction take an exact Cartesian bridge. Convert back with `c.Cartesian()`.
See [the Cayley polar design](design/eval/cayley-polar.md).

---

---

## 11. Other Notable Features
### Division Variants
Because RiX operates internally on rich math types, division is highly granular:
- `/` performs rational (fractional) division.
- `//` performs integer (floor) division.
- `/%` performs division returning the remainder.
- `/~` performs rounded division.
- `/^` performs ceiling division.

### Ternary Operators
RiX replaces the traditional `C` style ternary (`cond ? true : false`) with its own null-coalscing style syntax using `??` and `?:`.
```rix
result := (score > 50) ?? "Pass" ?: "Fail"
```

### Assertions
When validating equations or tests, you have special assertion operators:
- `:=:` Asserts equality (or acts as a solver check)
- `:<:` Asserts less than
- `:>:` Asserts greater than
- `:<=:` / `:>=:` Asserts boundaries.


### Utility System Function
`.RAND_NAME(len=10, alphabet="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ")` returns a random string. Like all system capabilities, it is called via the dot prefix.

Examples:
```rix
.RAND_NAME()
.RAND_NAME(5)
.RAND_NAME(12, "abc")
```

## Diagnostics, Testing, and Debugging

RiX includes a built-in diagnostics subsystem accessed through system capabilities. All diagnostic operations produce structured RiX map values with a consistent `kind` field, making them inspectable and composable.

Runtime errors include source line/column locations when RiX is evaluated from
source text through the standard evaluator or script-import paths. Direct
low-level IR evaluation only has locations if the host attaches source metadata
to the IR.

### Warnings and Info

`.Warn` and `.Info` emit diagnostic events and return the event object:

```rix
.Warn("large interval", {= width = 1000 })
.Info("processing", 2, {= step = "parse" })
```

`.Info` accepts an optional level (default 1) and optional data map.

### Errors and Stops

`.Error` emits an error event and aborts evaluation:

```rix
.Error("invalid input", {= value = x })
```

`.Stop` conditionally aborts. If the condition is null, it does nothing and returns null. If non-null, it aborts:

```rix
value := F(n);
.Stop("negative result", value < 0, {= value = value })
```

### Debug

`.Debug` is AST-aware: it captures the expression structure before evaluating, records both the source representation and the final value, then returns the value so it composes inline:

```rix
x := .Debug("sum check", a + b)
```

### Trace

`.Trace` wraps a callable invocation with execution tracing up to a specified depth, optionally tracking named variables:

```rix
.Trace("fib run", 3, ["n", "acc"], () -> Fib(10))
```

It returns the callable's result and records function entry/exit events.

### Testing

`.Test` runs test groups with two modes:

**Sequential shared-state mode** runs setup once and executes tests in order. Each test sees mutations from prior tests. A null result or runtime error stops remaining tests:

```rix
.Test("arithmetic", {; x := 10 }, [
    x + 1 == 11,
    {; x ~= x * 2; x == 20 },
    x > 15
])
```

**Isolated mode** reruns setup freshly for each labeled test. All tests are attempted regardless of individual failures:

```rix
.Test("operations", {; x := 5 }, {=
    add = x + 1 == 6,
    mul = x * 2 == 10,
    sub = x - 3 == 2
})
```

Both modes return a rich result map with `kind`, `label`, `mode`, `passed`, `results`, and `summary` fields. Test results are registered in the diagnostics registry for CLI consumption.

### Testing for Expected Aborts: `.TestError` and `.TestStop`

Ordinary `.Test(...)` checks whether evaluation completes normally and yields a non-null value. Sometimes the behavior you want to verify is that a computation *fails* in a specific way. That is what `.TestError` and `.TestStop` are for.

**`.TestError(label, setup, expr)`** passes when `expr` aborts with an error:

```rix
.TestError("division by zero", {;
    x := 10;
    y := 0
}, x / y)

.TestError("explicit error", {;
    x := 5
}, .Error("bad input", {= x = x }))
```

It passes if `expr` aborts via `.Error(...)` or any runtime error, and fails if `expr` returns normally (even `_`), or if `expr` aborts via `.Stop(...)`.

**`.TestStop(label, setup, expr)`** passes when `expr` aborts via `.Stop(...)`:

```rix
.TestStop("negative guard", {;
    x := -3
}, .Stop("negative", x < 0, {= x = x }))
```

It passes only for stop-kind aborts, and fails if `expr` returns normally, errors, or produces a runtime error.

In both forms the setup block runs first and must complete normally. If setup itself aborts, the test fails regardless of what `expr` would have done — the point is to isolate the expected abort to the target expression.

**How these differ from `.Test`:**

| Form | Passes when |
|------|-------------|
| `.Test(...)` | expression returns non-null |
| `.TestError(...)` | expression aborts with `.Error()` or runtime error |
| `.TestStop(...)` | expression aborts via `.Stop()` |

All three register structured results in the diagnostics registry and are reported in the CLI test runner.

### CLI Test Runner

Run test files from the command line:

```sh
bun bin/rix.js test              # discover all *.test.rix files
bun bin/rix.js test parser       # filter by substring match
bun bin/rix.js test math core    # multiple filters (OR)
```

The runner discovers `*.test.rix` files recursively, runs each in a fresh context, and prints per-file and per-test-group summaries. Exit code is 0 if all pass, nonzero otherwise.
