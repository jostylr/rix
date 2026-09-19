# `.logic`

`.logic` is a browser-safe introductory logic laboratory. Formulas, truth
tables, normal forms, proof attempts, and educational trees are portable RiX
records. The plugin does not invoke SAT/SMT software and does not claim
unbounded first-order theorems.

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
- disjunction introduction on either side;
- implication elimination (`modusPonens`);
- implication introduction through one discharged `Subproof`;
- disjunction elimination through two independently checked `Subproof`s;
- negation introduction and elimination; and
- elimination from `Bottom`.

Every premise must refer to an earlier line. Each local check and the failed
reason remain in `rix.logic.proof@1`. `CheckProof` replays a proof record.

`Subproof(assumption, steps, goal)` creates a separate proof record whose first
line is the local assumption. Outer line numbers are unavailable inside it;
only an accepted subproof record may be attached to a discharge rule through
`{= subproofs=[...] }`. Consequently an assumption cannot leak into the outer
derivation merely because a label says it was discharged. This first scoped
core also rejects additional `premise` or `assumption` lines inside a subproof.
It is deliberately self-contained until an explicit, replayable contract for
importing outer lines is added.
The same scope checks run during `CheckProof`, including on edited/imported
records: the first line must match the declared assumption, and there must be
exactly one free assumption/premise line. Violations retain
`reason=:invalidSubproofScope` rather than accepting a stored flag.

```rix
p := .logic.Atom(:p);
caseP := .logic.Subproof(p,[],p);
identity := .logic.Proof([
  .logic.Step(:implicationIntro,p.Implies(p),[],{= subproofs=[caseP] })
],p.Implies(p));
```

The natural-deduction proof language omits quantifiers, equality and induction.
The separate bounded classical sequent service below shares formulas while
retaining its own rule and evidence records.

## Educational tree views

`SyntaxTree(formula)` (also `formula.SyntaxTree()`) returns the connective tree
for a formula. `ProofTree(proof)` (also `proof.Tree()`) recursively replaces
line-number references with premise nodes and retains nested subproof trees.
Both use `rix.logic.tree@1`; they are data for renderers and courses, not a
second proof checker. The proof record remains the replayable authority.

## Bounded semantic tableaux

`Tableau(formula, options)` (also `formula.Tableau(options)`) returns
`rix.logic.tableau@1`. It expands signed formulas directly, without truth-table
enumeration or exponential normal-form preprocessing. A sign is `truth=1` or
`truth=0`; alpha rules extend one branch and beta rules split it. All seven
connectives/constants supported by the formula constructors are handled.

| Mode | Initial sign | Closed branches only | Saturated open branch |
|---|---|---|---|
| `:satisfiability` (default) | source true | `:unsatisfiable` | `:satisfiable`, with model |
| `:validity` | source false | `:valid` | `:invalid`, with countermodel |

`maxSteps` defaults to 128 (0–2048); it counts each consumed signed formula,
including literals, constants, and closures. `maxBranches` defaults to 64
(1–256), limiting the total leaf partition, including closed branches.
Branches that cannot proceed retain `status=:unresolved`, their pending signed
formulas, partial valuation, and the exhausted budget's name. Formula input
size and construction are governed separately by the runtime sandbox; these
are search budgets, not a replacement for runtime resource controls.

`complete` means no branch remains unresolved. `decided` means the requested
question has an answer: one verified model suffices even if other branches
remain unresolved. Without such a witness, budget exhaustion returns
`status=:unresolved`, never a claim of validity or unsatisfiability.

The record retains every expansion in `trace` and every final branch in
`branches`. `path` starts at `root`; a beta split appends `L` and `R`. Closed
branches retain the conflicting signed formula at the front of `pending`
and the prior literal valuation. Open branches have no pending formulas.
Unassigned source atoms are filled with 0 in the final witness, which is
independently evaluated against the source before being returned.

`CheckTableau(record)` reruns deterministic search with the recorded source
and options and compares all retained evidence fields (including witnesses,
trace, branches, work, and completeness), not merely the status. It returns
`accepted`, `reason`, and the reconstructed `result`. An accepted replay of an
unresolved record validates its partial work; it is not a proved theorem.
Malformed source/options can raise diagnostics. Replay uses the same rule
implementation, so it is not an independently verified proof kernel.

These tableaux use **classical** propositional semantics. For example, all
branches close when testing excluded middle for validity. That does not add
excluded middle to the earlier intuitionistic-compatible natural-deduction
rule set: the two educational systems are explicitly labeled.

## Next educational rung

The next useful addition is bounded finite-model exploration for a carefully
defined first-order subset. The delivered sequent presentation shares formulas
while keeping its evidence distinct from natural deduction and tableaux. SAT/SMT integration, proof-assistant exchange,
and general automated theorem proving remain optional later work.

See [tutorial.md](tutorial.md) for runnable examples.

## Classical sequent calculus

`Sequent(left, right, options)` checks the classical multi-succedent assertion
that whenever all formulas on the left hold, at least one on the right holds.
An empty left side is no assumption; an empty right side is contradiction.
The finite contexts treat exchange and contraction implicitly. Explicit rule
IDs identify identity, constant, negation, conjunction, disjunction, implication,
and definitional biconditional rules on either side. There is no cut rule or
first-order quantification.

`rix.logic.sequent@1` retains every premise sequent, rule, principal position,
node dependency, work count and unprocessed leaf. Status is `valid`, `invalid`
with a directly checked countermodel, or `unresolved`. One countermodel decides
invalidity even when another branch is unfinished; `complete` separately reports
whether every branch finished. Input formulas have at most 4,096 nodes, depth 64,
64 atom names (256 characters each), and 256 entries in each context.

| Option | Default | Bounds |
|---|---|---|
| `maxSteps` | 512 | 0–4096 rule applications |
| `maxNodes` | 1024 | 1–4096 retained nodes |
| `maxDepth` | 64 | 0–128 proof depth |
| `maxText` | 1048576 | 4096–4194304 characters of serialized premise contexts |

`CheckSequent(record)` performs bounded deterministic replay and compares all
fields. Edited rules, missing premises, false status/work claims and substituted
countermodels fail. The replay checker shares the small inference kernel with
search; independent truth-table tests verify its rules. Accepting an unresolved
record validates retained work, not validity. This is a different classical
proof system from the existing scoped natural-deduction service and signed
tableaux; their records cannot be relabeled as sequents.

`SequentTree(record, {= maxNodes=128 })` first checks the record, then creates an
ordinary Fragment with a Graphic and full-text Table. The view budget is 1–512
nodes; `{= graphic=1 }` returns the Graphic alone for SVG export. Omitted nodes are disclosed and the complete source evidence remains in
metadata. Node IDs and premise edges are stable. SVG labels are shortened, with
complete formulas and statuses in the table. HTML, SVG, Markdown, LaTeX/PDF use
the ordinary output services and their source sidecars.

`ExactProposition(operation,left,right)` accepts only exact Integer/Rational or
RationalInterval operands. It checks `eq`, `neq`, `lt`, `lte`, `gt`, `gte` for all
values in the normalized interval bounds, retaining oriented source intervals.
The latter two operations normalize to their reversed comparisons. Decided
results supply Top/Bottom formulas; overlapping/uncertain comparisons return
`truth=:undecided` and `formula=_`. `CheckProposition(record)` rechecks these
arithmetic facts. There is no unchecked conversion from a theorem label,
approximate Float, or assumed expression to a logical premise. Rational
components are bounded to 4,096 digits. This covers evaluated algebraic constants
and exact interval facts; broader symbolic obligations remain their own services.

See [sequent-tutorial.md](sequent-tutorial.md) for runnable derivations, failure
cases and static output.
