---
title: Truth tables, normal forms, and checked derivations
description: Explore propositional validity, countermodels, canonical normal forms, and a small replayable natural-deduction proof.
theme: Algebra and analysis
status: implemented
---

# Truth tables, normal forms, and checked derivations

## Find a model and a countermodel

```{.rix exec=true}
.Plugin.Load("logic");
p := .logic.Atom(:p);
q := .logic.Atom(:q);
formula := p.Implies(q);
table := formula.TruthTable();
{: table[:classification],table[:model],table[:countermodel],table[:rows] };
```

The implication is contingent. The countermodel makes `p` true and `q` false;
the table is complete for its two atoms, not a sample.

## Compare valid and contradictory formulas

```{.rix exec=true}
.Plugin.Load("logic");
p := .logic.Atom(:p);
tautology := p.Or(p.Not()).TruthTable();
contradiction := p.And(p.Not()).TruthTable();
.Table({=
  columns=["formula kind","classification","satisfiable","valid"],
  rows=[
    ["excluded middle",tautology[:classification],tautology[:satisfiable],tautology[:valid]],
    ["contradiction",contradiction[:classification],contradiction[:satisfiable],contradiction[:valid]]
  ]
});
```

## Construct and replay normal forms

```{.rix exec=true}
.Plugin.Load("logic");
p := .logic.Atom(:p);
q := .logic.Atom(:q);
source := p.Iff(q.Not());
nnf := source.NNF();
cnf := source.CNF();
dnf := source.DNF();
{: nnf[:expression],cnf[:expression],dnf[:expression],.logic.CheckNormalForm(cnf) };
```

Canonical CNF and DNF can be much larger than a hand-simplified equivalent.
Their purpose here is to expose minterms and maxterms and make replay simple.

## Check a line-by-line derivation

```{.rix exec=true}
.Plugin.Load("logic");
p := .logic.Atom(:p);
q := .logic.Atom(:q);
proof := .logic.Proof([
  .logic.Step(:premise,p),
  .logic.Step(:premise,p.Implies(q)),
  .logic.Step(:modusPonens,q,[1,2])
],q);
{: proof[:accepted],proof[:checks],.logic.CheckProof(proof) };
```

Changing the last conclusion to `p` leaves a failed `:modusPonensMismatch`
record. RiX checks the rule; it does not trust the rule label.

## Bounded work stays visible

```{.rix exec=true}
.Plugin.Load("logic");
{: .logic.Capabilities(),.logic.Valuations([:p,:q]) };
```

Truth tables reject requests above their explicit atom budget. The future
finite-model explorer will use the same distinction between exhaustive bounded
search and an unbounded theorem.

## Further work

1. Build the truth table for contraposition.
2. Compare canonical CNF with a shorter equivalent written by hand.
3. Construct an `andIntro` proof and eliminate each conjunct on later lines.
4. Sketch the scope information needed to check implication introduction.
