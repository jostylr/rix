---
title: Proof-preserving simplification for certified ranges
description: Simplify Calculus graphs without silently filling holes in partial functions, then let Numerics consume the checked result.
theme: Numbers and numerics
status: implemented
---

# Proof-preserving simplification

For certified range work, an expression denotes a partial function: both its
values and the inputs on which those values exist matter. An algebraic identity
that agrees wherever both sides are defined is therefore not automatically a
safe replacement.

The familiar rewrite `x/x -> 1` is the central example. The left side is
undefined at zero; the right side is defined there. Using the replacement in a
range proof would incorrectly change `partiallyDefined` coverage into
`allDefined` coverage.

RiX consequently separates three roles:

- Symbolic and Calculus expose a transformation record;
- the small runtime checker independently recomputes the canonical rewrite;
- Numerics consumes the checked target only when explicitly requested.

## The unconditional v1 rules

The first rule set contains only neutral-element identities that retain every
possibly partial operand:

| Source | Target | Rule |
|---|---|---|
| `0+x`, `x+0` | `x` | additive identity |
| `x-0` | `x` | subtractive identity |
| `1*x`, `x*1` | `x` | multiplicative identity |
| `x/1` | `x` | division identity |
| `x^1` | `x` | power identity |
| `-(-x)` | `x` | double negation |

These rules remove only exact constants whose evaluation is total. They are
valid even if `x` itself contains a pole, a branch restriction, or another
undefined point.

The canonical simplifier intentionally does **not** apply `x/x -> 1`,
`x-x -> 0`, `0*x -> 0`, or `x^0 -> 1`. Each replacement can stop evaluating
an operand and thereby erase a domain hole. The separate theorem-named rewrite
surface supports the first three only by retaining a `nonzero` or `defined`
obligation. `x^0` remains convention-sensitive and is not a v1 rewrite rule.

## Inspect and recheck a transformation

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");

x := .calculus.Variable(:x);
safe := .numerics.SimplifyGraph(-(-(0+((x*1)/1))));
unsafe := .numerics.SimplifyGraph(x/x);

{:
  safe[:changed],
  safe[:rules].Map((step)->step[:rule]),
  safe[:checker][:accepted],
  unsafe[:changed],
  unsafe[:sourceGraph] == unsafe[:targetGraph],
  .numerics.CheckGraphSimplification(safe)[:accepted]
};
```

The record uses `rix.calculus.graph-simplification@1`. It binds the complete
source and target graphs, deterministic graph identities, an explanatory rule
trace, and `rix.runtime.calculus-graph-simplification-checker@1`. The trace is
not trusted: the checker derives the target and rule sequence again from the
source.

The same operation is available as `.calculus.SimplifyResult` and
`.symbolic.SimplifyResult`. All three surfaces return the same record and use
the same checker; there is no separate, weaker Symbolic certificate.

## Let GraphRange consume it

Set `checkedSimplify=1` to ask the graph evaluator to use the checked target.
The public `functionId` remains the identity of the original source, and the
full simplification record is embedded in the range evidence.

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("numerics");

x := .calculus.Variable(:x);
neutral := .numerics.GraphRange(-(-(x+0)), {= x=(-2):3 },
  {= checkedSimplify=1 });
quotient := .numerics.GraphRange(x/x, {= x=(-1):1 },
  {= checkedSimplify=1 });

{:
  neutral[:range], neutral[:simplification][:targetGraph],
  quotient[:range], quotient[:domainStatus],
  quotient[:simplification][:changed],
  quotient[:checker][:accepted]
};
```

The quotient remains `{1}` with `partiallyDefined` coverage. Rechecking the
range starts from the original expression and repeats both the simplification
and range evaluation under the recorded `0^0` convention.

## Checked proposed rewrites

Symbolic code can propose an explicit target and theorem:

```{.rix exec=true}
.Plugin.Load("calculus");
.Plugin.Load("symbolic");

x := .calculus.Variable(:x);
y := .calculus.Variable(:y);
commuted := .symbolic.RewriteResult(x+y,y+x,"add.commute");
cancelled := .symbolic.RewriteResult(x/x,1,"divide.cancelSelf");

{:
  commuted[:checker][:accepted],
  cancelled[:obligations][1][:relation],
  .symbolic.CheckRewrite(cancelled)[:accepted]
};
```

The v1 vocabulary is `add.commute`, `multiply.commute`, `add.associate`,
`multiply.associate`, `multiply.distributeLeft`,
`multiply.distributeRight`, `divide.cancelSelf`, `subtract.cancelSelf`, and
`multiply.zero`. The checker derives the unique target shape from the source
and theorem. A proposer cannot substitute an unrelated graph or omit a side
condition. Ring rearrangements are unconditional; the last three retain the
source's defined-input contract explicitly.

These proposal records are proof-preserving building blocks. They are not yet
automatically selected by `GraphRange`: a consumer must discharge their
obligations on the complete requested set before using a guarded target.

## Extending the rule set

An unconditional rule is suitable only when the checker can establish all of
the following from its syntax and theorem vocabulary:

1. source and target have the same defined-input set;
2. their values agree on that set;
3. the rewrite retains graph identities needed by later dependency reasoning;
4. any branch or convention dependency is explicit; and
5. the checker can recompute the claim without calling the proposer.

Any additional conditional rule must carry its witness in the common evidence
DAG, retain the original source-domain restriction in the transformed graph
contract, and fail closed when the witness does not cover the complete
requested input.
