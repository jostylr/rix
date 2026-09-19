---
status: implemented
---
# Classical sequents with explicit rule evidence

This tutorial requires the Logic plugin. It uses existing propositional formulas
and exact arithmetic; no quantifiers or external prover are required.

```{.rix exec=true}
.Plugin.Load("logic");
p := .logic.Atom(:p); q := .logic.Atom(:q);
proof := .logic.Sequent([p,p.Implies(q)],[q]);
(proof[:status])==(:valid) ?: 1 ?_ .Error("Sequent example assertion failed");
(.logic.CheckSequent(proof)[:accepted])==(1) ?: 1 ?_ .Error("Sequent example assertion failed");
.logic.SequentTree(proof);
```

The classical excluded-middle sequent agrees with a validity tableau, while
retaining a separate derivation. The empty succedent means contradiction.

```{.rix exec=true}
.Plugin.Load("logic");
p := .logic.Atom(:p);
formula := p.Or(p.Not());
(.logic.Sequent([],[formula])[:status])==(formula.Tableau({= mode=:validity })[:status]) ?: 1 ?_ .Error("Sequent example assertion failed");
(.logic.Sequent([p],[])[:status])==(:invalid) ?: 1 ?_ .Error("Sequent example assertion failed");
```

Exhaustion retains the unprocessed sequent and is not invalidity. The checker can
accept that partial-work record without certifying a theorem.

```{.rix exec=true}
.Plugin.Load("logic");
p := .logic.Atom(:p);
partial := .logic.Sequent([],[p.Or(p.Not())],{= maxSteps=0 });
(partial[:status])==(:unresolved) ?: 1 ?_ .Error("Sequent example assertion failed");
(.logic.CheckSequent(partial)[:accepted])==(1) ?: 1 ?_ .Error("Sequent example assertion failed");
(.logic.CheckSequent(partial.Set("status",:valid))[:accepted])==(_) ?: 1 ?_ .Error("Sequent example assertion failed");
```

Only an exact decided arithmetic proposition supplies a logical formula. Source
intervals keep their orientation; universal comparisons use their ordered bounds.

```{.rix exec=true}
.Plugin.Load("logic");
fact := .logic.ExactProposition(:lt,2:1,3:4);
(fact[:truth])==(:true) ?: 1 ?_ .Error("Sequent example assertion failed");
(.logic.CheckProposition(fact)[:accepted])==(1) ?: 1 ?_ .Error("Sequent example assertion failed");
(.logic.Sequent([],[fact[:formula]])[:status])==(:valid) ?: 1 ?_ .Error("Sequent example assertion failed");
unknown := .logic.ExactProposition(:eq,1:2,2:3);
(unknown[:truth])==(:undecided) ?: 1 ?_ .Error("Sequent example assertion failed");
(unknown[:formula])==(_) ?: 1 ?_ .Error("Sequent example assertion failed");
```

The tree output is static and requires no browser interaction. The standalone
example `examples/logic/sequent-publication.rix` writes HTML/SVG/TeX plus exact
source evidence. PDF compilation can be added with the existing PDF plugin on a
host with LaTeX; unsupported binary tools do not affect the source/tree output.
