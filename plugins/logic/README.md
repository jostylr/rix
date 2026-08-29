# `.logic`

`.logic` is a browser-safe introductory logic laboratory. Formulas, truth
tables, normal forms, and proof attempts are portable RiX records. The plugin
does not invoke SAT/SMT software and does not claim unbounded first-order
theorems.

## Formulas and semantics

Construct formulas with `Atom`, `Top`, `Bottom`, `Not`, `And`, `Or`, `Implies`,
and `Iff`, or use receiver methods:

```rix
.Plugin.Load("logic");
p := .logic.Atom(:p);
q := .logic.Atom(:q);
formula := p.Implies(q);
formula.Evaluate({= p=1,q=0 });
```

Valuations accept `1`/`0`, `:true`/`:false`, or null for false. Generated
valuations use `1` and `0` so every atom remains an explicit map key.

`TruthTable` returns `rix.logic.truth-table@1` with a sorted atom order, every
valuation, classification (`:valid`, `:contradiction`, or `:contingent`), and
the first model and countermodel when present. Work is bounded by `maxAtoms`
(default 10, hard maximum 16); exceeding it is an explicit diagnostic rather
than an incomplete theorem claim.

## Checked normal forms

`NNF` eliminates implications and pushes negations inward. `CNF` and `DNF`
build canonical maxterm/minterm forms from the complete bounded truth table.
These canonical forms favor clarity and checking over compactness.

`CheckNormalForm` reevaluates the source and candidate on every valuation and
rejects a changed result. It checks semantic equivalence within the complete
propositional variable set; it is not a syntactic assertion that an arbitrary
formula merely looks like CNF.

## Introductory derivations

`Step` and `Proof` check a small line-numbered natural-deduction core:

- premises and assumptions;
- conjunction introduction and left/right elimination;
- disjunction introduction on either side; and
- implication elimination (`modusPonens`).

Every premise must refer to an earlier line. Each local check and the failed
reason remain in `rix.logic.proof@1`. `CheckProof` replays a proof record.

The current proof language intentionally omits discharged subproofs,
implication introduction, disjunction elimination, quantifiers, equality, and
induction. Those require explicit scope and substitution contracts rather than
being smuggled into labels.

## Next educational rung

The next useful additions are scoped subproofs with discharge, semantic
tableaux, and bounded finite-model exploration for a carefully defined
first-order subset. SAT/SMT integration, proof-assistant exchange, and general
automated theorem proving remain optional later work.

See [tutorial.md](tutorial.md) for runnable examples.
