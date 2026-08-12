---
title: Explore the exact Stern–Brocot tree
description: Describe rational nodes, build bounded tree views, and evaluate RiX functions at exact fractions.
theme: Algebra and analysis
status: implemented
plugin: stern-brocot
---

The pure-RiX Stern–Brocot plugin builds portable records over the exact,
representation-sensitive values supplied by `.fraction`. Loading it also loads
that dependency.

## Describe one rational node

Start with `3/5`. The description retains its tree path, Farey boundaries,
parent, children, continued fraction, and convergents as exact values.

```rix
.Plugin.Load("stern-brocot");
node := .sternBrocot.Describe(.frac(3, 5));
{=
    current=node["current"],
    parent=node["parent"],
    children=node["children"],
    path=node["path"],
    boundaries=node["boundaries"],
    convergents=node["convergents"]
};
```

For `3/5`, the exact path from the signed-tree root is `R, L, R, L`. The two
Farey boundaries are `1/2` and `2/3`.

## Build a bounded portable tree

`VisibleTree` returns exact node and edge records rather than choosing a screen
layout. A browser, notebook, or renderer can therefore decide how to present
the same mathematical view.

```rix
.Plugin.Load("stern-brocot");
tree := .sternBrocot.VisibleTree(.frac(1, 2), 2);
{=
    schema=tree["schema"],
    current=tree["current"],
    descendantDepth=tree["descendantdepth"],
    nodes=tree["nodes"],
    edges=tree["edges"]
};
```

The second argument is a finite descendant depth. Keeping that bound explicit
makes the result deterministic and safe to render.

## Evaluate a RiX function exactly

`Evaluate` accepts a RiX callable, not source text. The selected Fraction is
converted to its exact Rational value before the function runs.

```rix
.Plugin.Load("stern-brocot");
value := .sternBrocot.Evaluate(
    (x) -> x^2 - 1/2,
    .frac(3, 5)
);
value;
```

The result is exactly `-7/50`. A host that accepts formula text should parse it
in a restricted RiX scope first, then pass the resulting callable to this API.
