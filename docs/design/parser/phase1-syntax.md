# RiX Phase 1 Syntax Reference

This document describes the syntax changes implemented in Phase 1 of the RiX/Calc merger.

---

## 1. Assignment: `=` and `:=`

Both `=` and `:=` are assignment operators. They have the same precedence (ASSIGNMENT = 20) and are right-associative.

```
x = 5           # assignment
x := 5          # assignment (same behavior)
x = y = 3       # chained: x = (y = 3)
```

`==` is boolean equality comparison (precedence EQUALITY = 60):

```
x == 5          # equality test, not assignment
a + b == c      # (a + b) == c
```

### Precedence summary

| Operator | Role           | Precedence | Assoc |
|----------|----------------|------------|-------|
| `=`      | Assignment     | 20         | Right |
| `:=`     | Assignment     | 20         | Right |
| `==`     | Equality       | 60         | Left  |
| `!=`     | Not-equal      | 60         | Left  |

---

## 2. Identifier Case Convention

### Uppercase = Function / System

Identifiers starting with an uppercase letter are **System identifiers**. When followed by `(...)`, they produce a **FunctionCall** AST node.

```
SIN(x)          # FunctionCall → SystemIdentifier "SIN"
F(x, y)         # FunctionCall → SystemIdentifier "F"
PI              # SystemIdentifier (constant)
```

### Lowercase = Variable / Implicit Multiplication

Identifiers starting with a lowercase letter are **User identifiers** (variables). When followed by `(...)`, they produce **ImplicitMultiplication** — meaning `f(x)` is interpreted as `f * (x)`.

```
f(x)            # ImplicitMultiplication: f * (x)
abc(2 + 3)      # ImplicitMultiplication: abc * (2 + 3)
f(x, y)         # ImplicitMultiplication: f * (x, y)  [f * Tuple]
x               # UserIdentifier
```

### Function definitions still work with lowercase

When `f(x)` appears on the left of `:->` or `:=>`, the parser recognizes it as a function definition regardless of case:

```
f(x) :-> x + 1          # FunctionDefinition, name=f, params=[x]
F(x) :-> x + 1          # FunctionDefinition, name=F, params=[x]
f(x, y; n := 2) :-> ... # FunctionDefinition with keyword params
```

### Operator-as-function syntax

Operator symbols (`+`, `*`, `<`, etc.) followed by `(...)` remain function calls:

```
+(3, 4, 7)      # FunctionCall: function="+", args=[3, 4, 7]
*(2, 3)         # FunctionCall: function="*", args=[2, 3]
<(x, y)         # FunctionCall: function="<", args=[x, y]
```

---

## 3. System Function Access: `@_`

The `@_` prefix provides direct access to system functions from user-land code. System functions are the internal operations that all syntax lowers to during evaluation.

### Syntax

```
@_NAME(args...)     # SystemCall — invoke system function NAME
@_NAME              # SystemFunctionRef — reference without calling
```

### Examples

```
@_ASSIGN("i", 0)        # Direct system function call → ASSIGN
@_ADD(a, b)              # Direct system function call → ADD
@_RETRIEVE("x")          # Direct system function call → RETRIEVE
@_CALL(f, x)             # Call user function via system
```

### Nesting

```
@_ASSIGN(i, @_ADD(i, 1))   # i = i + 1 via system functions
```

### Key properties

- `@_` prefix is **only needed in user-land code** to access system functions
- In the lowered/translated IR, all functions are system functions (no prefix needed)
- System functions are **read-only** — user code cannot modify them
- The name after `@_` is always normalized to UPPERCASE
- `@_NAME` without `(...)` produces a `SystemFunctionRef` node (first-class reference)

### AST nodes

| Syntax | AST Node | Fields |
|--------|----------|--------|
| `@_ADD(x, y)` | `SystemCall` | `name: "ADD"`, `arguments: {positional, keyword}` |
| `@_ADD` | `SystemFunctionRef` | `name: "ADD"` |

---

## 4. Brace Sigil Containers

Brace sigil containers use a character immediately after `{` to explicitly declare the container type. This replaces the old approach of inferring container type from contents.

### Sigil table

| Sigil | Container | Separator | Description |
|-------|-----------|-----------|-------------|
| `{=`  | MapContainer   | `,` (spatial)   | Key-value map |
| `{?`  | CaseContainer  | `;` (temporal)  | Pattern matching / case expressions |
| `{;`  | BlockContainer | `;` (temporal)  | Sequential statement block |
| `{\|` | SetContainer   | `,` (spatial)   | Unordered set |
| `{:`  | TupleContainer | `,` (spatial)   | Ordered tuple |
| `{@`  | LoopContainer  | `;` (temporal)  | Loop construct |

All sigil containers close with `}`.

### Temporal vs Spatial

- **Spatial** (`,`): Elements are independent, order may not matter (sets, maps, tuples)
- **Temporal** (`;`): Elements are sequential, order matters (blocks, cases, loops)

### Examples

```
{= "a", 1, "b", 2 }        # MapContainer (key-value pairs)
{? x > 0; x < 10 }          # CaseContainer (conditions)
{; a := 1; b := 2; a + b }  # BlockContainer (statements)
{| 1, 2, 3 }                # SetContainer
{: a, b, c }                # TupleContainer
{@ i := 0; i + 1 }          # LoopContainer
```

### Empty and trailing separators

```
{| }            # Empty SetContainer
{| 1, 2, 3, }  # Trailing comma allowed
{; a; b; }      # Trailing semicolon allowed
```

### Relation to existing containers

The plain `{` brace still works for the old inference-based containers (`Set`, `Map`, `System`). The `{;` `}` code block syntax is also unchanged.

---

## 5. Meta Property vs Collection Access

RiX separates two distinct access concepts:

- **Meta properties** (`obj.name`) — external annotations/metadata on any value, stored in `obj._ext` (separate from map contents). Accessed with single dot.
- **Collection indices/keys** (`obj[expr]`) — actual content of sequences, strings, and maps. Accessed with brackets.

### Syntax

```
obj.name            # Meta property access (META_GET) — returns null if absent
obj.name = val      # Set meta property (META_SET) — null value = delete
obj .= map          # Bulk merge map into meta properties (META_MERGE)
obj..               # All meta properties as read-only map (META_ALL)

obj[i]              # Sequence index, 1-based (INDEX_GET)
obj[-1]             # Last element (negative = from end)
obj["key"]          # Map access by string expression
obj[:name]          # Map access by string key literal (KeyLiteral syntax)
obj[i] = val        # Set index (INDEX_SET) — requires mutable=true meta flag
```

**Removed:** `obj..name` (previously EXTGET) is now a **parse error**. Use `obj.name` for meta access.

### Indexing rules

| Collection type | Index type | Behavior |
|----------------|------------|----------|
| sequence / tuple | Integer (1-based) | `arr[1]` = first; `arr[-1]` = last; null if out of range |
| string | Integer (1-based) | Returns single character; null if out of range |
| map | String or any value | Returns entry or null |

### Related operators

| Operator | Returns | Description |
|----------|---------|-------------|
| `obj.name` | value | Meta property (null if absent) |
| `obj..` | map | All meta properties (read-only copy) |
| `obj .= map` | obj | Bulk meta merge |
| `obj[expr]` | value | Collection index/key |
| `obj[:name]` | value | Map key literal shorthand |
| `obj.\|` | set | Set of map keys |
| `obj\|.` | set | Set of map values |

### AST nodes

| Syntax | AST Node | Fields |
|--------|----------|--------|
| `obj.name` | `DotAccess` | `object`, `property: "name"` |
| `obj..` | `ExternalAccess` | `object`, `property: null` |
| `obj..name` | *(parse error)* | — |
| `obj[expr]` | `PropertyAccess` | `object`, `property: expr` |
| `obj[:name]` | `PropertyAccess` | `object`, `property: {type:"KeyLiteral", name:"name"}` |
| `obj.\|` | `KeySet` | `object` |
| `obj\|.` | `ValueSet` | `object` |

### Method calls

When a `DotAccess` is used as the target of a function call, it desugars automatically:

```
obj.Method(args)    # CALL_EXPR(META_GET(obj, "Method"), obj, args...)
```

---

## 6. Deferred Blocks: `@{...}`

The `@` prefix before a brace container creates a **deferred block** — a computation that is not evaluated immediately but stored for later execution.

```
@{; x + 1; x * 2 }       # Deferred BlockContainer
@{? x > 0; x < 10 }      # Deferred CaseContainer
@{ a, b }                 # Deferred plain brace container
@{; a; b }               # Deferred BlockContainer
```

### Use in control structures

Deferred blocks are essential for CASE, LOOP, and other lazy-evaluation contexts:

```
CASE(@{; x > 0}, @{; 3*x}, @{; x+2})
LOOP(@{; i = 0}, @{; i < 10}, @{; x = x + i}, @{; i = i + 1})
```

### AST node

| Syntax | AST Node | Fields |
|--------|----------|--------|
| `@{; ...}` | `DeferredBlock` | `body` (the inner container node) |

---

## 7. Object Mutation: `obj{= ...}` and `obj{! ...}`

Mutation syntax modifies objects using operations prefixed with `+` (add/change) or `-` (remove).

### Copy mutation (`{=`)

Creates a **new object** with the specified changes:

```
obj{= +a=3, -.b, +c }
```

- `+a=3` — add or change key `a` to value `3`
- `-.b` — remove key `b`
- `+c` — merge in properties from `c`

### In-place mutation (`{!`)

Modifies the **existing object** directly:

```
obj{! +a=3, -.b }
```

### AST node

| Syntax | AST Node | Fields |
|--------|----------|--------|
| `obj{= +a=3}` | `Mutation` | `target`, `mutate: false`, `operations: [{action, key, value}]` |
| `obj{! +a=3}` | `Mutation` | `target`, `mutate: true`, `operations: [...]` |

---

## 8. Extended Number Base Prefixes

Numbers are base-10 by default. Other bases use `0` + letter prefix:

| Prefix | Base | Name |
|--------|------|------|
| `0b` | 2 | Binary |
| `0t` | 3 | Ternary |
| `0q` | 4 | Quaternary |
| `0f` | 5 | Base-5 |
| `0s` | 7 | Base-7 |
| `0d` | 10 | Decimal (never needed) |
| `0x` | 16 | Hexadecimal |
| `0c` | 12 | Clock (duodecimal) |
| `0m` | 60 | Mesopotamian |
| `0y` | 64 | (0-9A-Za-z@&) |
| `0u` | 36 | URL shorteners |
| `0j` | 20 | Vigesimal |
| `0z[N]` | N | Custom base |

Capital letters (`0A`–`0Z` except reserved) are available for user-defined bases.

### Custom base syntax

```
0z[23]13FASD3       # Base 23 number
0z[7]123            # Base 7 number (same as 0s123)
```

---

## 9. Implicit Adjacency (Multiplication & Application)

Uppercase system identifiers followed by an adjacent expression (no operator) produce **ImplicitApplication** nodes — the callable consumes the maximal multiplicative chunk as its argument.

```
F 3x          # ImplicitApplication: callable=F, argument=MUL(3, x)
F G 7         # ImplicitApplication: callable=F, argument=ImplicitApplication(G, 7)
3 F 7         # ImplicitMultiplication: left=3, right=ImplicitApplication(F, 7)
```

Non-callable adjacent expressions produce **ImplicitMultiplication** (as before):

```
3a            # ImplicitMultiplication: left=3, right=a
a b           # ImplicitMultiplication: left=a, right=b
5 10          # ImplicitMultiplication: left=5, right=10
```

### AST nodes

| Syntax | AST Node | Fields |
|--------|----------|--------|
| `F 3x` | `ImplicitApplication` | `callable`, `argument` |
| `3a` | `ImplicitMultiplication` | `left`, `right` |

---

## 10. AST Node Summary

### All new nodes introduced in Phase 1

| Node | Source syntax | Fields |
|------|-------------|--------|
| `ImplicitMultiplication` | `f(x)` | `left`, `right` |
| `SystemCall` | `@_NAME(...)` | `name`, `arguments` |
| `SystemFunctionRef` | `@_NAME` | `name` |
| `MapContainer` | `{= ... }` | `sigil`, `elements` |
| `CaseContainer` | `{? ... }` | `sigil`, `elements` |
| `BlockContainer` | `{; ... }` | `sigil`, `elements` |
| `SetContainer` | `{\| ... }` | `sigil`, `elements` |
| `TupleContainer` | `{: ... }` | `sigil`, `elements` |
| `LoopContainer` | `{@ ... }` | `sigil`, `elements` |
| `DotAccess` | `obj.name` | `object`, `property: string` |
| `ExternalAccess` | `obj..` | `object`, `property: null` |
| `KeySet` | `obj.\|` | `object` |
| `ValueSet` | `obj\|.` | `object` |
| `DeferredBlock` | `@{...}` | `body` |
| `Mutation` | `obj{= ...}` / `obj{! ...}` | `target`, `mutate`, `operations` |
| `ImplicitApplication` | `F 3x` | `callable`, `argument` |

### Modified behavior

| Node | Change |
|------|--------|
| `BinaryOperation` with `=` | Now assignment (precedence 20), not equality |
| `FunctionCall` | Only produced for uppercase identifiers and operator symbols |

---

## 11. System Function Mapping (Preview)

In Phase 2 (lowering pass), all syntax will lower to system function calls. Here is a preview of the mapping:

| Source syntax | Lowered form |
|---------------|-------------|
| `x = 5` | `ASSIGN("x", 5)` |
| `x` (in expression) | `RETRIEVE("x")` |
| `a + b` | `ADD(a, b)` |
| `a * b` | `MUL(a, b)` |
| `F(x)` | `CALL("F", x)` |
| `f(x)` | `MUL(RETRIEVE("f"), x)` |
| `@_ADD(a, b)` | `ADD(a, b)` (direct, no translation needed) |
| `obj.name` | `META_GET(obj, "name")` |
| `obj.name = val` | `META_SET(obj, "name", val)` |
| `obj..` | `META_ALL(obj)` |
| `obj .= map` | `META_MERGE(obj, map)` |
| `obj[i]` | `INDEX_GET(obj, i)` |
| `obj[:key]` | `INDEX_GET(obj, "key")` |
| `obj[i] = val` | `INDEX_SET(obj, i, val)` |
| `obj.Method(args)` | `CALL_EXPR(META_GET(obj,"Method"), obj, args...)` |
| `@{; x+1}` | `DEFER({fn:"ADD", ...})` |
| `HELP topic` | `HELP("topic")` |

The `@_` prefix in user code maps 1:1 to system functions in the IR, making it possible to bypass the lowering pass for direct system access.
