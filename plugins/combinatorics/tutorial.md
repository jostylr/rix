---
title: Enumerate finite combinatorial spaces lazily
description: Generate products, permutations, and combinations only as they are consumed.
theme: Algorithms and computer science
plugin: combinatorics
status: implemented
---

## Inspect a product without constructing it eagerly

```rix
.Plugin.Load("combinatorics");
bits := .combinatorics.CartesianPower([0,1],12);
{: bits.Len(),bits[1],bits[4096] };
```

The returned value is a known-finite lazy sequence. Indexing computes only the
prefix required by the lazy protocol; `Materialize()` is an explicit request
to build an Array.

## Permutations and combinations

```rix
.Plugin.Load("combinatorics");
permutations := .comb.Permutations([:a,:b,:c],2).Materialize();
combinations := .comb.Combinations([:a,:b,:c,:d],2).Materialize();
{:
  permutations,.comb.CountPermutations(3,2),
  combinations,.comb.CountCombinations(4,2)
};
```
