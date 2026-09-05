---
title: Truth tables, scoped proofs, and semantic tableaux
description: Explore propositional validity, countermodels, scoped natural deduction, and bounded open/closed branch evidence.
theme: Algebra and analysis
status: implemented
---

## Find a model and a countermodel

```rix
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

```rix
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

```rix
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

```rix
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

## Discharge a scoped assumption

```rix
.Plugin.Load("logic");
p := .logic.Atom(:p);
inside := .logic.Subproof(p,[],p);
identity := .logic.Proof([
  .logic.Step(:implicationIntro,p.Implies(p),[],{= subproofs=[inside] })
],p.Implies(p));
{: identity[:accepted],identity[:checks][1][:discharged],identity.Tree() };
```

`Subproof` inserts the assumption as its first local line. The outer proof sees
only the checked subproof record, not its assumption as a freely usable outer
premise. Additional free `premise` and `assumption` lines are rejected inside
this first self-contained subproof model. This makes implication introduction
a real scope operation; a later outer-line import feature will need to name and
replay every imported dependency explicitly.

## Reason by cases

```rix
.Plugin.Load("logic");
p := .logic.Atom(:p);
q := .logic.Atom(:q);
either := p.Or(q);
fromP := .logic.Subproof(p,[
  .logic.Step(:orIntroLeft,either,[1])
],either);
fromQ := .logic.Subproof(q,[
  .logic.Step(:orIntroRight,either,[1])
],either);
cases := .logic.Proof([
  .logic.Step(:premise,either),
  .logic.Step(:orElim,either,[1],{= subproofs=[fromP,fromQ] })
],either);
{: cases[:accepted],cases[:checks][2],.logic.ProofTree(cases) };
```

Both cases must start from the corresponding disjunct and reach exactly the
same conclusion. Reversing the two case records is allowed; omitting a case or
changing either goal is rejected.

## Prove a negation from contradiction

```rix
.Plugin.Load("logic");
p := .logic.Atom(:p);
impossible := p.And(p.Not());
contradiction := .logic.Subproof(impossible,[
  .logic.Step(:andElimLeft,p,[1]),
  .logic.Step(:andElimRight,p.Not(),[1]),
  .logic.Step(:notElim,.logic.Bottom(),[2,3])
],.logic.Bottom());
proof := .logic.Proof([
  .logic.Step(:notIntro,impossible.Not(),[],{= subproofs=[contradiction] })
],impossible.Not());
{: proof[:accepted],impossible.Not().SyntaxTree() };
```

`bottomElim` is also available when a derivation already contains `Bottom`.
These are explicit checked rules, not automatic theorem search.

## Bounded work stays visible

```rix
.Plugin.Load("logic");
{: .logic.Capabilities(),.logic.Valuations([:p,:q]) };
```

Truth tables reject requests above their explicit atom budget. Tableaux offer
a different route: expand connectives on branches and stop a branch as soon
as it contains a contradiction.

## Close a tableau to prove classical validity

```{.rix exec=true}
.Plugin.Load("logic");
p := .logic.Atom(:p);
q := .logic.Atom(:q);
modusPonens := p.And(p.Implies(q)).Implies(q);
tableau := modusPonens.Tableau({= mode=:validity });
tableau[:status]==:valid ?: 1 ?_ .Error("Expected all branches to close");
.logic.CheckTableau(tableau)[:accepted] ?: 1 ?_ .Error("Tableau replay failed");
{: tableau[:status],tableau[:trace],tableau[:branches] };
```

Validity search starts by asking for a valuation making the formula **false**.
Every branch closes, so no such valuation exists. Trace rules `:alpha` extend
one branch; `:beta` splits it. A closed branch retains the contradictory signed
formula and its prior literal assignments so the closure can be inspected.

## Read an open branch as a countermodel

```{.rix exec=true}
.Plugin.Load("logic");
p := .logic.Atom(:p);
q := .logic.Atom(:q);
formula := p.Implies(q);
attempt := formula.Tableau({= mode=:validity });
attempt[:status]==:invalid ?: 1 ?_ .Error("Expected a countermodel");
formula.Evaluate(attempt[:witness]) ?: .Error("Countermodel must falsify the source") ?_ 1;
{: attempt[:witnessKind],attempt[:witness],attempt[:branches] };
```

The countermodel sets `p=1,q=0`, just as the truth table did. In default
satisfiability mode, an open branch instead supplies a model making the source
true. All witnesses are checked against the original formula.

## Distinguish an answer from exhaustive search

```{.rix exec=true}
.Plugin.Load("logic");
p := .logic.Atom(:p);
q := .logic.Atom(:q);
r := .logic.Atom(:r);
stopped := p.Or(q).Tableau({= maxBranches=1 });
partial := p.Or(q.And(r)).Tableau({= maxSteps=2 });
stopped[:status]==:unresolved ?: 1 ?_ .Error("A blocked split is not a proof");
partial[:status]==:satisfiable ?: 1 ?_ .Error("The p branch supplies a model");
partial[:complete] ?: .Error("Other work must remain unresolved") ?_ 1;
.logic.CheckTableau(partial)[:accepted] ?: 1 ?_ .Error("Partial evidence must replay");
{: stopped[:branches],partial[:decided],partial[:complete],partial[:witness] };
```

The second search finds the open `p` branch within two steps, although the
other branch remains unresolved. It has answered satisfiability without
finishing every branch. Never interpret a mere budget limit as a theorem.

Finally, try `p.Or(p.Not()).Tableau({= mode=:validity })`: it proves excluded
middle in **classical** semantics. The natural-deduction core above is
intuitionistic-compatible and has no excluded-middle axiom. The systems are
complementary course topics, not interchangeable proof labels.

## Further work

1. Build the truth table for contraposition.
2. Compare canonical CNF with a shorter equivalent written by hand.
3. Construct an `andIntro` proof and eliminate each conjunct on later lines.
4. Change one `orElim` case goal and inspect the retained failure reason.
5. Use `bottomElim` to derive a chosen formula from an explicit contradiction.
6. Compare a tableau for contraposition with its complete truth table.
7. Change a tableau witness or remove a trace step and inspect `CheckTableau`.
