---
title: "Generated runtime catalog"
description: "Source-derived system capabilities, internal IR functions, methods, semantic types, traits, and sandbox groups."
toc-depth: 2
---

::: {.callout-note}
This page is generated from the current RiX implementation by `documentation/scripts/generate-reference.js`. Do not edit it by hand. Descriptions come from registry documentation strings; the narrative [syntax guide](../eval/syntax-guide.md) and [methods guide](../eval/methods-guide.md) provide signatures and examples.
:::

At this revision RiX exposes **90 named entries** on the default system context and registers **164 internal IR operations**. Aliases with different spelling are listed separately because they are separately addressable names.

## Public system context

These names are available through the leading-dot system object, such as `.Len(value)`. Uppercase names are also used by explicit system/operator forms where applicable.

| Name | Kind | Capability groups | Implementation description |
| --- | --- | --- | --- |
| `.ACOS` | function | — | Dispatch ACOS through the active system multifunction registry |
| `.ADD` | function | Arith | Addition or string concatenation |
| `.AND` | lazy function | Logic | Logical AND (short-circuits on first falsy, returns deciding value) |
| `.ASIN` | function | — | Dispatch ASIN through the active system multifunction registry |
| `.ATAN` | function | — | Dispatch ATAN through the active system multifunction registry |
| `.ATAN2` | function | — | Dispatch ATAN2 through the active system multifunction registry |
| `.CAPABILITYREGISTER` | function | — | Register a package system capability during trusted package startup |
| `.COMPLEX` | value | Exact | Exact complex-number operations |
| `.CONVERTUNIT` | function | Units | Convert a quantity to a compatible display unit |
| `.COS` | function | — | Dispatch COS through the active system multifunction registry |
| `.CapabilityRegister` | function | — | Register a package system capability during trusted package startup |
| `.Complex` | value | Exact | Exact complex-number operations |
| `.ConvertUnit` | function | Units | Convert a quantity to a compatible display unit |
| `.DEBUG` | lazy function | — | Debug expression: .Debug(label, expr) — returns expr value, records AST/source |
| `.DEEPMUTABLE` | function | — | Recursively set (flag≠\_) or remove (flag=\_) .\_mutable on all nested arrays/maps/tensors. Called via .DeepMutable(value, flag). |
| `.DEFINEEXACTGENERATOR` | function | Exact | Create an algebraic exact generator from low-to-high polynomial coefficients |
| `.DEFINEUNIT` | function | Units | Create a linear Unit value from a name and Unit/Quantity definition |
| `.DERIV` | function | Symbolic | Differentiate a supported symbolic system specification exactly |
| `.DIV` | function | Arith | Division |
| `.DefineExactGenerator` | function | Exact | Create an algebraic exact generator from low-to-high polynomial coefficients |
| `.DefineUnit` | function | Units | Create a linear Unit value from a name and Unit/Quantity definition |
| `.EQ` | function | Logic | Equality check — returns 1 or null |
| `.ERROR` | function | — | Emit an error event and abort: .Error(label, dataMap ?= {=}) |
| `.EVAL` | lazy function | — | Evaluate a deferred AST node or expression: .Eval(ast, bindings ?= \_, mode ?= :inherit) |
| `.EXACT` | value | Exact | Canonical RiX exact-generator collection |
| `.EXP` | function | — | Dispatch EXP through the active system multifunction registry |
| `.Exact` | value | Exact | Canonical RiX exact-generator collection |
| `.FILTER` | lazy function | Collections, Arrays | Filter a collection |
| `.FIRST` | function | Core, Collections, Arrays | First element of a collection |
| `.GETEL` | function | Core, Collections, Arrays | Get element at index (1-based) |
| `.GT` | function | Logic | Greater than — returns 1 or null |
| `.GTE` | function | Logic | Greater than or equal — returns 1 or null |
| `.IF` | lazy function | Core | Conditional function IF(cond, t, f) |
| `.IMPORTJS` | function | — | Import a local JavaScript module for use from a .js.rix startup file |
| `.INFO` | function | — | Emit an info event: .Info(label, level ?= 1, dataMap ?= {=}) |
| `.INTDIV` | function | Arith | Integer division (floor) |
| `.IRANGE` | function | Core, Collections, Arrays | Create an integer range [start, end] |
| `.ImportJS` | function | — | Import a local JavaScript module for use from a .js.rix startup file |
| `.JSCALL` | function | — | Call a named export from a local JavaScript module |
| `.JSCall` | function | — | Call a named export from a local JavaScript module |
| `.KEYOF` | function | Core, Maps | Resolve canonical map key string for a value |
| `.KEYS` | function | Core, Maps | Get the keys of a map as a set (obj.\|) |
| `.LAST` | function | Core, Collections, Arrays | Last element of a collection |
| `.LEN` | function | Core, Collections, Arrays | Length of a collection or string |
| `.LN` | function | — | Dispatch LN through the active system multifunction registry |
| `.LOG` | function | — | Dispatch LOG through the active system multifunction registry |
| `.LOG10` | function | — | Dispatch LOG10 through the active system multifunction registry |
| `.LOOP` | lazy function | Core | Loop construct with init, condition, body[, update[, after]] |
| `.LT` | function | Logic | Less than — returns 1 or null |
| `.LTE` | function | Logic | Less than or equal — returns 1 or null |
| `.MAP` | lazy function | Collections, Maps, Arrays | Map a function over a collection |
| `.MOD` | function | Arith | Modulo |
| `.MUL` | function | Arith | Multiplication (Product of values) |
| `.MULTI` | lazy function | Core | Evaluate multiple expressions, return last |
| `.NEQ` | function | Logic | Inequality check — returns 1 or null |
| `.NOT` | function | Logic | Logical NOT — returns Integer(1) for null input, null otherwise |
| `.OR` | lazy function | Logic | Logical OR (short-circuits on first truthy, returns deciding value) |
| `.POLY` | function | Symbolic | Create an exact callable from a supported symbolic system specification |
| `.POW` | function | Arith | Exponentiation |
| `.POWPROD` | function | — | Exponentiation/product power (currently same implementation as POW) |
| `.PRINT` | function | Core, Strings | Print each argument through the replaceable \_\_io\_\_ hook |
| `.RANDOMSEED` | function | Random | Seed the current runtime random-number stream |
| `.RAND_NAME` | function | Core, Random | Generate a random name string RAND\_NAME(len=10, alphabet=a-zA-Z) |
| `.REDUCE` | lazy function | Collections, Arrays | Reduce a collection |
| `.SAME_CELL` | lazy function | — | Identity comparison (===) — returns 1 if both sides refer to the same cell, null otherwise |
| `.SIN` | function | — | Dispatch SIN through the active system multifunction registry |
| `.STOP` | lazy function | — | Conditional abort: .Stop(label, condition, dataMap ?= {=}) |
| `.SUB` | function | Arith | Subtraction |
| `.SUBSTR` | function | Strings | Get substring |
| `.TAN` | function | — | Dispatch TAN through the active system multifunction registry |
| `.TEST` | lazy function | — | Run tests: .Test(label, setup, [tests] \| {= tests }) |
| `.TESTERROR` | lazy function | — | Abort test: .TestError(label, setup, expr) — passes if expr aborts with .Error() or a runtime error |
| `.TESTSTOP` | lazy function | — | Abort test: .TestStop(label, setup, expr) — passes if expr aborts via .Stop() |
| `.TGEN` | lazy function | Core, Collections, Arrays | Generate a tensor from a shape and index callback |
| `.TRACE` | lazy function | — | Trace execution: .Trace(label, depth, trackedVars?, thunkOrCallable) |
| `.TRAITREGISTER` | function | — | Register an immutable semantic trait from a RiX map spec |
| `.TYPEEXPORT` | lazy function | — | Export a semantically typed value through its registered type exporter |
| `.TYPEIMPORT` | lazy function | — | Import a value from a tagged type export map |
| `.TYPEINSTALL` | function | — | Install a registered semantic type into system multifunctions |
| `.TYPEREGISTER` | function | — | Register an immutable semantic type from a RiX map spec |
| `.TraitRegister` | function | — | Register an immutable semantic trait from a RiX map spec |
| `.TypeExport` | lazy function | — | Export a semantically typed value through its registered type exporter |
| `.TypeImport` | lazy function | — | Import a value from a tagged type export map |
| `.TypeInstall` | function | — | Install a registered semantic type into system multifunctions |
| `.TypeRegister` | function | — | Register an immutable semantic type from a RiX map spec |
| `.UNITS` | value | Units | Canonical RiX unit collection |
| `.UPPER` | function | Strings | Convert string to uppercase |
| `.Units` | value | Units | Canonical RiX unit collection |
| `.VALUES` | function | Core, Maps | Get the values of a map as a set (obj\|.) |
| `.WARN` | function | — | Emit a warning event: .Warn(label, dataMap ?= {=}) |

## Built-in receiver methods

Method lookup is case-flexible at the language boundary. The table uses the registry keys and includes shared iterable methods. Read the [methods guide](../eval/methods-guide.md) for mutability rules, callback shapes, signatures, and examples.

| Receiver | Registered methods |
| --- | --- |
| Array | `ALL`, `ANY`, `CONCAT`, `CONCAT!`, `COUNT`, `DISTINCT`, `DISTINCT!`, `DROPFIRST`, `DROPLAST`, `FILTER`, `FIND`, `FINDINDEX`, `FIRST`, `FLATTEN`, `FLATTEN!`, `GET`, `HASAT`, `INCLUDES`, `INDEXOF`, `INSERT`, `INSERT!`, `ISEMPTY`, `ITERATOR`, `JOIN`, `LAST`, `LASTINDEXOF`, `LEN`, `MAP`, `MOVE`, `MOVE!`, `POP!`, `PUSH`, `PUSH!`, `REDUCE`, `REMOVEAT`, `REMOVEAT!`, `REVERSE`, `REVERSE!`, `SET`, `SET!`, `SHIFT!`, `SLICE`, `SORT`, `SORT!`, `SWAP`, `SWAP!`, `UNSHIFT`, `UNSHIFT!` |
| Lazy sequence | `FIRST`, `GET`, `ISEMPTY`, `ITERATOR`, `LAST`, `LEN`, `MATERIALIZE` |
| Iterator | `DONE`, `INDEX`, `NEXT`, `PEEK`, `RESET` |
| Map | `ALL`, `ANY`, `COUNT`, `DEFAULT`, `DEFAULT!`, `ENTRIES`, `FILTER`, `GET`, `HAS`, `ISEMPTY`, `ITERATOR`, `KEEP`, `KEEP!`, `KEYS`, `LEN`, `MAPVALUES`, `MERGE`, `MERGE!`, `OMIT`, `OMIT!`, `REDUCE`, `REDUCEKEYS`, `REMOVE`, `REMOVE!`, `SET`, `SET!`, `UPDATE`, `UPDATE!`, `VALUES` |
| Set | `ADD`, `ADD!`, `ALL`, `ANY`, `COUNT`, `DIFF`, `DIFF!`, `DISJOINT`, `FILTER`, `HAS`, `INTERSECT`, `INTERSECT!`, `ISEMPTY`, `ITERATOR`, `LEN`, `REDUCE`, `REMOVE`, `REMOVE!`, `SUBSETOF`, `SUPERSETOF`, `SYMDIFF`, `SYMDIFF!`, `UNION`, `UNION!`, `VALUES` |
| String | `CONCAT`, `ENDSWITH`, `FIRST`, `GET`, `INCLUDES`, `INDEXOF`, `ISEMPTY`, `ITERATOR`, `LAST`, `LASTINDEXOF`, `LEN`, `LOWER`, `PADLEFT`, `PADRIGHT`, `REDUCE`, `REPEAT`, `REPLACE`, `REPLACEALL`, `SLICE`, `SPLIT`, `STARTSWITH`, `TRIM`, `TRIMEND`, `TRIMSTART`, `UPPER` |
| Tuple | `FIRST`, `GET`, `ITERATOR`, `LAST`, `LEN`, `REDUCE`, `SET`, `SLICE`, `TOARRAY` |
| Tensor | `DOT`, `FILL!`, `FLATTEN`, `GET`, `ITERATOR`, `MAP`, `MATMUL`, `MEAN`, `PERMUTE`, `RANK`, `REDUCE`, `RESHAPE`, `SET`, `SET!`, `SHAPE`, `SIZE`, `SUM`, `TRANSPOSE` |
| Deferred expression | `DESUGAR`, `EVAL`, `INSPECT` |
| Exact generator | `CAYLEY`, `CONJUGATE`, `IM`, `NORMSQUARED`, `RE` |
| Exact expression | `CAYLEY`, `CONJUGATE`, `IM`, `NORMSQUARED`, `RE` |
| Cayley value | `CARTESIAN`, `CAYLEY`, `CONJUGATE`, `DIRECTION`, `IM`, `INVERSE`, `MAGNITUDE`, `NORMSQUARED`, `RE` |

Every built-in receiver also supports `CheckTraits` / `CHECKTRAITS`.

## Semantic types

| Type | Native type | Aliases | Default traits |
| --- | --- | --- | --- |
| `String` | string | `string` | — |
| `Array` | array | `array` | `sequence` |
| `Tuple` | tuple | `tuple` | `sequence` |
| `Map` | map | `map` | `maplike` |
| `Set` | set | `set` | `collection` |
| `Iterator` | iterator | `iterator` | — |
| `Function` | function | `function` | — |
| `Multifunction` | multifunction | `multifunction` | — |
| `Null` | null | `null` | — |
| `Hole` | hole | `hole` | — |
| `Rational` | rational | `rational` | `rational`, `number`, `ordered`, `field` |
| `Integer` | integer | `integer` | `integer`, `rational`, `number`, `ordered` |
| `RationalInterval` | interval | `Interval`, `interval` | `ordered` |
| `Tensor` | tensor | `tensor` | `tensor`, `indexable`, `shapeAware`, `collection` |
| `Length` | Length | — | — |
| `Point` | Point | — | — |
| `Matrix` | Matrix | — | `tensor` |
| `Vector` | Vector | — | — |

## Semantic traits

| Trait | Implies | Description |
| --- | --- | --- |
| `number` | — | number semantic trait |
| `ring` | `number` | ring semantic trait |
| `field` | `ring`, `number` | field semantic trait |
| `ordered` | `number` | ordered semantic trait |
| `rational` | `field`, `ordered` | rational semantic trait |
| `integer` | `rational` | integer semantic trait |
| `indexable` | — | indexable semantic trait |
| `shapeAware` | — | shapeAware semantic trait |
| `collection` | — | collection semantic trait |
| `sequence` | `collection`, `indexable` | sequence semantic trait |
| `maplike` | `collection`, `indexable` | maplike semantic trait |
| `tensor` | `indexable`, `shapeAware`, `collection` | tensor semantic trait |
| `meters` | — | meters semantic trait |
| `cartesian` | — | cartesian semantic trait |
| `square` | — | square semantic trait |
| `positive` | — | positive semantic trait |
| `verify` | — | verify semantic trait |

## Script capability groups

Imported scripts can add or withhold named groups. Permission-like names are interpreted separately from callable names by the host policy.

| Group | Members |
| --- | --- |
| `Core` | `LEN`, `FIRST`, `LAST`, `GETEL`, `IRANGE`, `IF`, `LOOP`, `MULTI`, `RAND_NAME`, `PRINT`, `TGEN`, `KEYOF`, `KEYS`, `VALUES` |
| `Arith` | `ADD`, `SUB`, `MUL`, `DIV`, `INTDIV`, `MOD`, `POW` |
| `Logic` | `EQ`, `NEQ`, `LT`, `GT`, `LTE`, `GTE`, `AND`, `OR`, `NOT` |
| `Collections` | `LEN`, `FIRST`, `LAST`, `GETEL`, `IRANGE`, `MAP`, `FILTER`, `REDUCE`, `TGEN` |
| `Maps` | `MAP`, `KEYOF`, `KEYS`, `VALUES` |
| `Arrays` | `LEN`, `FIRST`, `LAST`, `GETEL`, `IRANGE`, `MAP`, `FILTER`, `REDUCE`, `TGEN` |
| `Strings` | `UPPER`, `SUBSTR`, `PRINT` |
| `Imports` | `IMPORTS` |
| `Net` | `NET` |
| `Files` | `FILES` |
| `Units` | `UNITS`, `Units`, `CONVERTUNIT`, `ConvertUnit`, `DEFINEUNIT`, `DefineUnit` |
| `Exact` | `EXACT`, `Exact`, `COMPLEX`, `Complex`, `DEFINEEXACTGENERATOR`, `DefineExactGenerator` |
| `Symbolic` | `POLY`, `DERIV` |
| `Random` | `RANDOMSEED`, `RandomSeed`, `RAND_NAME` |

Default script policy includes all functions and the `IMPORTS` permission. Recognized permission names are `IMPORTS`, `NET`, `FILES`. The default loop limit is 10,000 iterations and the default constructor capture mode is `deep_copy`.

## Internal IR registry

This is the evaluator dispatch surface, not a promise that every name should be called directly from RiX source. Syntax normally lowers to these functions.

| IR function | Dispatch | Implementation description |
| --- | --- | --- |
| `ABS` | eager, pure, multifunction | Absolute value |
| `ACOS` | eager, pure, multifunction | Arccosine |
| `ADD` | eager, pure, multifunction | Addition or string concatenation |
| `AND` | lazy, pure | Logical AND (short-circuits on first falsy, returns deciding value) |
| `ARRAY` | lazy, pure | Create an array/sequence (supports sequence generators) |
| `ARRAY_CAPTURE` | lazy, pure | Create an array/sequence with constructor capture controls |
| `ASIN` | eager, pure, multifunction | Arcsine |
| `ASSERT_GT` | eager, pure | Assert a > b (:>:) |
| `ASSERT_GTE` | eager, pure | Assert a >= b (:>=:) |
| `ASSERT_LT` | eager, pure | Assert a < b (:<:) |
| `ASSERT_LTE` | eager, pure | Assert a <= b (:<=:) |
| `ASSIGN` | lazy, effectful/unspecified | Alias/rebind — lhs shares the same Cell as rhs variable, or gets a fresh Cell for expressions |
| `ASSIGN_COPY` | lazy, effectful/unspecified | Fresh copied-cell assignment (:=) — shallow-copy value + all meta into new binding |
| `ASSIGN_DEEP_COPY` | lazy, effectful/unspecified | Fresh deep-copied-cell assignment (::=) — deep-copy value + all meta into new binding |
| `ASSIGN_DEEP_UPDATE` | lazy, effectful/unspecified | In-place deep value replacement (~~=) — like ~= but deep-copies rhs value |
| `ASSIGN_EXPR` | lazy, effectful/unspecified | Assignment expression (lvalue = expr) |
| `ASSIGN_UPDATE` | lazy, effectful/unspecified | In-place value replacement (~=) — preserves cell identity, ordinary meta; replaces ephemeral; preserves sticky unless rhs overrides |
| `ATAN` | eager, pure, multifunction | Arctangent |
| `ATAN2` | eager, pure, multifunction | Two-argument arctangent |
| `BINOP` | eager, pure | Fallback for unrecognized binary operators |
| `BLOCK` | lazy, effectful/unspecified | Sequential block execution, returns last value |
| `BRACKET_GET` | lazy, effectful/unspecified | Tensor-aware bracket indexing and slicing |
| `BRACKET_SET` | lazy, effectful/unspecified | Tensor-aware bracket assignment |
| `BREAK` | lazy, effectful/unspecified | Structured break block that exits the nearest matching breakable construct |
| `CALL` | lazy, effectful/unspecified | Call a user-defined or built-in function |
| `CALL_EXPR` | lazy, effectful/unspecified | Call an expression that evaluates to a function |
| `CALL_METHOD` | lazy, effectful/unspecified | Resolve and invoke a receiver-first method call |
| `CAPABILITY_REGISTER` | eager, effectful/unspecified | Register a package system capability during trusted package startup |
| `CASE` | lazy, effectful/unspecified | Ordered case expression with condition arms, prepared-trial arms, and an optional fallback |
| `CONCAT` | eager, pure | — |
| `CONVERTUNIT` | eager, pure | Convert a quantity to a compatible display unit |
| `COS` | eager, pure, multifunction | Cosine |
| `DEFINEBASE` | lazy, effectful/unspecified | Define a custom uppercase base prefix (0A = ...), one-time global definition |
| `DEFINEEXACTGENERATOR` | eager, pure | Create an algebraic exact generator from low-to-high polynomial coefficients |
| `DEFINEUNIT` | eager, pure | Create a linear Unit value from a name and Unit/Quantity definition |
| `DERIVATIVE` | eager, pure | Symbolic derivative (future) |
| `DESTRUCTURE_ASSIGN` | lazy, effectful/unspecified | General lhs destructuring assignment |
| `DIV` | eager, pure, multifunction | Division |
| `DIVIDE` | eager, pure | Return n lazy equally spaced points including interval endpoints |
| `DIVROUND` | eager, pure | Rounded division |
| `DIVUP` | eager, pure | Ceiling division |
| `EQ` | eager, pure, multifunction | Equality check — returns 1 or null |
| `EVAL` | lazy, effectful/unspecified | Evaluate a deferred AST node or expression: .Eval(ast, bindings ?= \_, mode ?= :inherit) |
| `EXP` | eager, pure, multifunction | Exponential |
| `FROMBASE` | lazy, effectful/unspecified | Parse base string to number: str <\_ baseSpec |
| `FUNCDEF` | lazy, effectful/unspecified | Define a named function |
| `GENERATOR` | eager, effectful/unspecified | Internal array-generator marker |
| `GLOBAL` | lazy, effectful/unspecified | Assign a value to a variable in the global scope |
| `GT` | eager, pure, multifunction | Greater than — returns 1 or null |
| `GTE` | eager, pure, multifunction | Greater than or equal — returns 1 or null |
| `HOLE` | eager, pure | Internal hole/undefined sentinel — represents an explicitly omitted value |
| `HOLE_COALESCE` | lazy, effectful/unspecified | Hole-coalescing: x ?\| y returns x if x is not a hole, else y |
| `IMPORT_JS` | eager, effectful/unspecified | Import a local JavaScript module for use from a .js.rix startup file |
| `INDEX_GET` | eager, effectful/unspecified | Index into collection (1-based for sequences; string or value keys for maps) — obj[i] |
| `INDEX_SET` | lazy, effectful/unspecified | Set index in collection (requires .\_mutable meta flag) — obj[i] = val |
| `INFSEQ` | eager, pure | Lazy unbounded exact arithmetic sequence |
| `INTDIV` | eager, pure, multifunction | Integer division (floor) |
| `INTEGRAL` | eager, pure | Symbolic integral (future) |
| `INTERSECT` | eager, pure | Intersection of two collections (set intersection or interval overlap) |
| `INTERSECTS` | eager, pure | Check if two collections intersect (1 if true, null otherwise) |
| `INTERVAL` | eager, pure | Create an interval [lo, hi] or test betweenness like a:b:c |
| `JS_CALL` | eager, effectful/unspecified | Call a named export from a local JavaScript module |
| `KEYOF` | eager, pure | Resolve canonical map key string for a value |
| `KEYS` | eager, pure | Get the keys of a map as a set (obj.\|) |
| `KWARG` | eager, pure | Keyword argument wrapper |
| `LAMBDA` | lazy, effectful/unspecified | Create a lambda/anonymous function |
| `LITERAL` | eager, pure | Parse a number literal string into a ratmath type |
| `LN` | eager, pure, multifunction | Natural logarithm |
| `LOG` | eager, pure, multifunction | Natural logarithm |
| `LOG10` | eager, pure, multifunction | Base-10 logarithm |
| `LOOP` | lazy, effectful/unspecified | Loop construct with init, condition, body[, update[, after]] |
| `LT` | eager, pure, multifunction | Less than — returns 1 or null |
| `LTE` | eager, pure, multifunction | Less than or equal — returns 1 or null |
| `MAP_OBJ` | lazy, pure | Create a map/object |
| `MATHUNIT` | eager, pure | Resolve exact-generator sugar through the active Exact RiX collection |
| `MATRIX` | eager, pure | Matrix literal |
| `MAX` | eager, pure | Maximum over n arguments (ignores nulls) |
| `MEDIANTS` | eager, pure | Return nested levels of exact mediants |
| `MEDIANT_PARTITION` | eager, pure | Partition an interval using exact mediant boundaries |
| `MEMBER` | eager, pure | Check membership (1 if present, null otherwise) |
| `META_ALL` | eager, effectful/unspecified | Get all meta properties as a map (read-only copy) — obj.. |
| `META_GET` | eager, effectful/unspecified | Get meta property (returns null if absent) — obj.name |
| `META_MERGE` | lazy, effectful/unspecified | Bulk merge map into object meta properties (null values = delete) — obj .= map |
| `META_SET` | lazy, effectful/unspecified | Set meta property (null deletes; respects immutable/frozen) — obj.name = val |
| `MIN` | eager, pure | Minimum over n arguments (ignores nulls) |
| `MOD` | eager, pure, multifunction | Modulo |
| `MUL` | eager, pure, multifunction | Multiplication (Product of values) |
| `MULTIFUNCDEF` | lazy, effectful/unspecified | Append or prepend a multifunction variant |
| `MULTIFUNCTION` | lazy, effectful/unspecified | Create an ordered multifunction literal, flattening nested multifunctions |
| `MUTCOPY` | eager, effectful/unspecified | Clone a map and apply mutations (obj{= +a=3, -.b }) |
| `MUTINPLACE` | eager, effectful/unspecified | Mutate a map in-place (obj{! +a=3, -.b }) |
| `NARY_CONCAT` | eager, pure | N-ary concatenation fold |
| `NARY_INTERSECT` | eager, pure | N-ary intersection/overlap fold for sets or intervals |
| `NARY_UNION` | eager, pure | N-ary union/hull fold for sets or intervals |
| `NEG` | eager, pure, multifunction | Negation |
| `NEQ` | eager, pure, multifunction | Inequality check — returns 1 or null |
| `NOP` | eager, pure | No operation |
| `NOT` | eager, pure | Logical NOT — returns Integer(1) for null input, null otherwise |
| `NOT_MEMBER` | eager, pure | Check non-membership (1 if not present, null otherwise) |
| `NULL` | eager, pure | Null value |
| `OR` | lazy, pure | Logical OR (short-circuits on first truthy, returns deciding value) |
| `OUTER_ASSIGN` | lazy, effectful/unspecified | Assign a value to an existing outer scope variable |
| `OUTER_RETRIEVE` | eager, effectful/unspecified | Look up a variable strictly in the outer scope chains |
| `OUTER_UPDATE` | lazy, effectful/unspecified | In-place value replacement on an outer scope variable (~= / ~~= with @) |
| `PALL` | lazy, effectful/unspecified | Every: returns last element if predicate is truthy for ALL elements, null on first failure — callback receives (val, locator, src) |
| `PANY` | lazy, effectful/unspecified | Any: returns first item that passed predicate, null if none pass — callback receives (val, locator, src) |
| `PARENT_SELF` | eager, effectful/unspecified | Resolve the parent multifunction inside a variant body |
| `PARTITION` | eager, pure | Partition an interval into n equal touching subintervals |
| `PCHUNK` | lazy, effectful/unspecified | Chunk a collection into subarrays by size or boundary predicate |
| `PFILTER` | lazy, effectful/unspecified | Filter a collection with a predicate — callback receives (val, locator, src) |
| `PIPE` | lazy, effectful/unspecified | Pipe a value into a function |
| `PIPE_EXPLICIT` | lazy, effectful/unspecified | Explicit pipe operator — placeholders \_1, \_2, … map tuple elements to specific argument positions |
| `PLACEHOLDER` | eager, pure | Numbered placeholder for partial application and explicit pipes |
| `PMAP` | lazy, effectful/unspecified | Map a function over a collection — callback receives (val, locator, src) |
| `POW` | eager, pure, multifunction | Exponentiation |
| `POWPROD` | eager, pure, multifunction | Exponentiation/product power (currently same implementation as POW) |
| `PREDUCE` | lazy, effectful/unspecified | Reduce a collection with an accumulator function — callback receives (acc, val, locator, src) |
| `PREP_TRIAL` | lazy, effectful/unspecified | Evaluate a candidate through ordered soft/strict prep gates, returning null on soft failure |
| `PREP_TRIAL_CASE` | lazy, effectful/unspecified | Evaluate a prepared-trial case arm while preserving its no-match status |
| `PREVERSE` | eager, pure | Reverse a collection (returns new copy) |
| `PSLICE_CLAMP` | lazy, effectful/unspecified | Clamped slice operator \|>// |
| `PSLICE_STRICT` | lazy, effectful/unspecified | Strict slice operator \|>/ |
| `PSORT` | lazy, effectful/unspecified | Sort a collection with comparator function (returns new copy) |
| `PSPLIT` | lazy, effectful/unspecified | Split a collection by a delimiter or predicate |
| `RANDOM` | eager, effectful/unspecified | Sample exact rational points from an interval |
| `RANDOM_PARTITION` | eager, effectful/unspecified | Partition an interval at distinct random rational points |
| `REGEX` | eager, effectful/unspecified | Create a regex matching function |
| `RETRIEVE` | eager, effectful/unspecified | Look up a variable in the current scope chain |
| `SAME_CELL` | lazy, effectful/unspecified | Identity comparison (===) — returns 1 if both sides refer to the same cell, null otherwise |
| `SELF` | eager, effectful/unspecified | Resolve the current callable object inside a function body |
| `SEMANTIC_CONVERT_SOFT` | lazy, effectful/unspecified | Convert a value to a semantic type, returning null on failure |
| `SEMANTIC_CONVERT_STRICT` | lazy, effectful/unspecified | Convert a value to a semantic type, throwing on failure |
| `SEMANTIC_HAS` | lazy, effectful/unspecified | Check semantic type/trait membership against \_\_type, \_type, and \_\_traits |
| `SEQ` | lazy, effectful/unspecified | Expression sequence: evaluate arguments left-to-right in the current scope and return the last value |
| `SET` | lazy, pure | Create a set (unique values) |
| `SET_DIFF` | eager, pure | — |
| `SET_PROD` | eager, pure | — |
| `SET_SYMDIFF` | eager, pure | — |
| `SIN` | eager, pure, multifunction | Sine |
| `SOLVE` | lazy, effectful/unspecified | Solve/constrain: x :=: expr |
| `SQRT` | eager, pure, multifunction | Square root (approximate rational) |
| `STEP` | eager, pure | Lazy exact stepped range over a rational interval |
| `STRING` | eager, pure | Create a string value |
| `SUB` | eager, pure, multifunction | Subtraction |
| `SYSREF` | eager, pure | Reference to a system function |
| `SYSTEM` | lazy, effectful/unspecified | Mathematical system container, currently evaluates as a block |
| `SYSTEM_SPEC` | lazy, pure | Create a symbolic system specification value |
| `TAIL_SELF` | lazy, effectful/unspecified | Tail-position self call that reuses the current function frame |
| `TAN` | eager, pure, multifunction | Tangent |
| `TENSOR` | lazy, pure | Tensor literal |
| `TENSOR_LITERAL` | lazy, pure | Tensor literal with explicit shape |
| `TENSOR_TRANSPOSE` | eager, pure | Transpose a rank-2 tensor view |
| `TERNARY` | lazy, effectful/unspecified | Ternary conditional: condition ?? trueExpr ?: falseExpr |
| `TOBASE` | lazy, effectful/unspecified | Format number to base string: expr \_> baseSpec |
| `TRAIT_REGISTER` | eager, effectful/unspecified | Register an immutable semantic trait from a RiX map spec |
| `TUPLE` | lazy, pure | Create a tuple |
| `TYPE_EXPORT` | lazy, effectful/unspecified | Export a semantically typed value through its registered type exporter |
| `TYPE_IMPORT` | lazy, effectful/unspecified | Import a value from a tagged type export map |
| `TYPE_INSTALL` | eager, effectful/unspecified | Install a registered semantic type into system multifunctions |
| `TYPE_REGISTER` | eager, effectful/unspecified | Register an immutable semantic type from a RiX map spec |
| `UNION` | eager, pure | Join/Union of two collections (set union or interval hull) |
| `UNIT` | eager, pure | Resolve scientific unit sugar through the active Units RiX collection |
| `VALUES` | eager, pure | Get the values of a map as a set (obj\|.) |
| `VALUE_OUTFIT` | lazy, effectful/unspecified | Apply semantic/value outfitting metadata to a value |
