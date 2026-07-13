# RiX Array Generators

Array generator chains are parsed into a `GeneratorChain` with a seed and an
ordered operator list, then lowered to `GENERATOR` IR. The runtime compiles
that IR into a cached incremental sequence producer.

## Canonical operators

- `|+ n` — primary arithmetic source.
- `|* n` — primary geometric source.
- `|: f` — primary one-based index source; calls `f(index, self)`.
- `|> f` — primary newest-first history source when no source precedes it;
  otherwise a per-candidate transformation.
- `|? p` — filter with `p(value, sourceIndex, self)`.
- `|; n` / `|; p` — eager count or predicate termination.
- `|^ n` / `|^ p` — lazy count or predicate termination.

The removed `|^:` spelling is reserved and rejected by the parser.

## Runtime rules

A chain has one primary source. Explicit seeds initialize that source and then
travel through downstream transforms and filters. Rejected candidates still
advance upstream source state. Numeric limits count accepted output values,
including accepted seeds. Predicate termination includes the triggering value.

History placeholders are newest-first: `_1` is the most recent source value,
`_2` the second most recent, and so on. Missing history is an error.

```rix
[2, |+2, |; 5]                         ## [2,4,6,8,10]
[|: (i) -> i^2, |; 5]                  ## [1,4,9,16,25]
[1,1, |> F(_2,_1), |; 7]               ## Fibonacci
[2 |+3 |> (x)->x^2 |? (x)->x%2==0 |;5]
```

Without `|;` or `|^`, a chain with a source is lazy and unbounded. A chain
containing only seeds/transforms/filters is finite. Lazy sequences cache
emitted values, support positive indexing and bounded slicing, and preserve
laziness through map/filter pipes.

Generator iteration limits are runtime safety limits, not semantic output
limits. Exhaustion throws a diagnostic; it never returns silently truncated
output.
