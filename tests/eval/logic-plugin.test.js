import { describe, expect, test } from "bun:test";
import {
    Context,
    createDefaultRegistry,
    createDefaultSystemContext,
    parseAndEvaluate,
} from "../../src/index.js";

function runtime() {
    return {
        context: new Context(),
        registry: createDefaultRegistry(),
        systemContext: createDefaultSystemContext(),
    };
}

function entry(value, key) {
    return value.entries.get(String(key).toLowerCase());
}

function text(value) {
    return value?.value ?? null;
}

describe("introductory Logic plugin", () => {
    test("signed tableaux agree with exhaustive truth tables for every connective and polarity", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("logic");
            p:=.logic.Atom(:p); q:=.logic.Atom(:q); r:=.logic.Atom(:r);
            basics := [p,p.Not(),.logic.Top(),.logic.Bottom(),p.And(q),p.Or(q),p.Implies(q),p.Iff(q)];
            formulas := basics.Concat(basics.Map((f)->f.Not())).Concat([
                p.Or(p.Not()),p.And(p.Not()),p.Implies(q).And(q.Implies(r)).Implies(p.Implies(r)),
                p.Iff(q).Iff(r),p.And(q.Or(r)).Iff(p.And(q).Or(p.And(r)))
            ]);
            formulas.Map((f)->{: f,f.TruthTable(),f.Tableau(),f.Tableau({= mode=:validity }) });
        `, runtime());
        for (const row of result.values) {
            const [,table,sat,valid] = row.values;
            const classification = text(entry(table,"classification"));
            expect(text(entry(sat,"status"))).toBe(classification === "contradiction" ? "unsatisfiable" : "satisfiable");
            expect(text(entry(valid,"status"))).toBe(classification === "valid" ? "valid" : "invalid");
            expect(entry(sat,"complete").value).toBe(1n);
            expect(entry(valid,"complete").value).toBe(1n);
            for (const [t,expected] of [[sat,1n],[valid,undefined]]) {
                const witness = entry(t,"witness");
                if (witness !== null) {
                    const valuationKey = v => [...v.entries].map(([k,v]) => `${k}:${v.value}`).sort().join();
                    const match = entry(table,"rows").values.find(r => valuationKey(entry(r,"valuation")) === valuationKey(witness));
                    expect(match).toBeDefined();
                    expect(entry(match,"result")?.value).toBe(expected);
                }
            }
        }
    });

    test("tableau budgets retain unresolved work and distinguish a witness from exhaustive closure", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("logic");
            p:=.logic.Atom(:p); q:=.logic.Atom(:q); r:=.logic.Atom(:r);
            {: p.Tableau({= maxSteps=0 }),p.Or(q).Tableau({= maxBranches=1 }),
               p.Or(q.And(r)).Tableau({= maxSteps=2 }) };
        `, runtime());
        for (const t of result.values.slice(0,2)) {
            expect(text(entry(t,"status"))).toBe("unresolved");
            expect(entry(t,"complete")).toBeNull();
            expect(entry(t,"decided")).toBeNull();
            expect(entry(t,"witness")).toBeNull();
            expect(entry(entry(t,"branches").values[0],"pending").values.length).toBeGreaterThan(0);
        }
        const partial = result.values[2];
        expect(text(entry(partial,"status"))).toBe("satisfiable");
        expect(entry(partial,"decided").value).toBe(1n);
        expect(entry(partial,"complete")).toBeNull();
        expect(entry(entry(partial,"work"),"steps").value).toBe(2n);
        expect(entry(partial,"branches").values.map(b=>text(entry(b,"status"))).sort()).toEqual(["open","unresolved"]);
    });

    test("tableau replay checks traces, branches, witnesses, and incomplete evidence", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("logic");
            p:=.logic.Atom(:p); q:=.logic.Atom(:q);
            t:=p.Implies(q).Tableau({= mode=:validity });
            closed:=p.Or(p.Not()).Tableau({= mode=:validity });
            partial:=p.Or(q).Tableau({= maxBranches=1 });
            [.logic.CheckTableau(t),.logic.CheckTableau(closed),.logic.CheckTableau(partial),
             .logic.CheckTableau(t.Set("witness",{= p=0,q=1 })),
             .logic.CheckTableau(t.Set("trace",[])),
             .logic.CheckTableau(closed.Set("branches",[])),
             .logic.CheckTableau(partial.Set("status",:valid))];
        `, runtime());
        expect(result.values.map(r=>entry(r,"accepted")?.value ?? null)).toEqual([1n,1n,1n,null,null,null,null]);
    });

    test("tableaux reject invalid options", () => {
        const rt = runtime();
        parseAndEvaluate('.Plugin.Load("logic"); p:=.logic.Atom(:p);',rt);
        for (const options of ["maxSteps=-1","maxSteps=2049","maxBranches=0","maxBranches=257","mode=:guess"]) {
            expect(()=>parseAndEvaluate(`p.Tableau({= ${options} });`,rt)).toThrow("Logic Tableau");
        }
    });

    test("subproof replay rejects hidden free premises and a substituted assumption", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("logic");
            p:=.logic.Atom(:p); q:=.logic.Atom(:q);
            identity:=.logic.Subproof(p,[],p);
            hidden:={= schema="rix.logic.proof@1",proofKind=:subproof,assumption=p,
                steps=[.logic.Step(:assumption,p),.logic.Step(:premise,q)],goal=q,accepted=1 };
            swapped:={= schema="rix.logic.proof@1",proofKind=:subproof,assumption=q,
                steps=identity[:steps],goal=p,accepted=1 };
            {: .logic.CheckProof(hidden),.logic.CheckProof(swapped),
               .logic.Proof([.logic.Step(:implicationIntro,p.Implies(q),[],{= subproofs=[hidden] })],p.Implies(q)) };
        `, runtime());
        for (const proof of result.values) expect(entry(proof,"accepted")).toBeNull();
        expect(text(entry(result.values[0],"reason"))).toBe("invalidSubproofScope");
        expect(text(entry(result.values[1],"reason"))).toBe("invalidSubproofScope");
    });

    test("is a bundled pure RiX propositional service", () => {
        const info = parseAndEvaluate('.Plugin.Info("logic")', runtime());
        expect(text(entry(info, "kind"))).toBe("rix");
        expect(entry(info, "permissions").values).toHaveLength(0);
        expect(entry(info, "schemas").values.map(text)).toEqual([
            "rix.logic.formula@1",
            "rix.logic.truth-table@1",
            "rix.logic.normal-form@1",
            "rix.logic.proof@1",
            "rix.logic.tree@1",
            "rix.logic.tableau@1",
            "rix.logic.sequent@1",
            "rix.logic.sequent-tree@1",
            "rix.logic.exact-proposition@1",
        ]);
    });

    test("evaluates formulas and returns complete bounded truth tables", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("logic");
            p := .logic.Atom(:p);
            q := .logic.Atom(:q);
            implication := p.Implies(q);
            table := implication.TruthTable();
            {: implication.Evaluate({= p=1,q=0 }),table };
        `, runtime());
        expect(result.values[0]).toBeNull();
        const table = result.values[1];
        expect(entry(table, "rowcount").value).toBe(4n);
        expect(text(entry(table, "classification"))).toBe("contingent");
        expect(entry(table, "model")).not.toBeNull();
        expect(entry(table, "countermodel")).not.toBeNull();
    });

    test("classifies validity and contradiction with witnesses", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("logic");
            p := .logic.Atom(:p);
            {: .logic.Or(p,p.Not()).TruthTable(),.logic.And(p,p.Not()).TruthTable() };
        `, runtime());
        expect(text(entry(result.values[0], "classification"))).toBe("valid");
        expect(entry(result.values[0], "valid").value).toBe(1n);
        expect(text(entry(result.values[1], "classification"))).toBe("contradiction");
        expect(entry(result.values[1], "satisfiable")).toBeNull();
    });

    test("constructs NNF, canonical CNF and DNF and rejects semantic tampering", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("logic");
            p := .logic.Atom(:p);
            q := .logic.Atom(:q);
            source := p.Implies(q);
            nnf := source.NNF();
            cnf := source.CNF();
            dnf := source.DNF();
            good := .logic.CheckNormalForm(cnf);
            bad := .logic.CheckNormalForm(cnf.Set("expression",p));
            {: nnf,cnf,dnf,good,bad };
        `, runtime());
        expect(text(entry(result.values[0], "form"))).toBe("nnf");
        expect(text(entry(result.values[1], "form"))).toBe("cnf");
        expect(text(entry(result.values[2], "form"))).toBe("dnf");
        expect(entry(result.values[3], "accepted").value).toBe(1n);
        expect(entry(result.values[4], "accepted")).toBeNull();
    });

    test("checks introductory natural-deduction lines locally", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("logic");
            p := .logic.Atom(:p);
            q := .logic.Atom(:q);
            implication := p.Implies(q);
            proof := .logic.Proof([
              .logic.Step(:premise,p),
              .logic.Step(:premise,implication),
              .logic.Step(:modusPonens,q,[1,2])
            ],q);
            replay := .logic.CheckProof(proof);
            {: proof,replay };
        `, runtime());
        expect(entry(result.values[0], "accepted").value).toBe(1n);
        expect(entry(result.values[0], "checks").values).toHaveLength(3);
        expect(entry(result.values[1], "accepted").value).toBe(1n);
    });

    test("preserves a failed proof step and enforces the atom budget", () => {
        const failed = parseAndEvaluate(`
            .Plugin.Load("logic");
            p := .logic.Atom(:p);
            q := .logic.Atom(:q);
            .logic.Proof([
              .logic.Step(:premise,p),
              .logic.Step(:andElimLeft,q,[1])
            ],q);
        `, runtime());
        expect(entry(failed, "accepted")).toBeNull();
        expect(text(entry(entry(failed, "checks").values[1], "reason")))
            .toBe("andEliminationRequiresConjunction");
        expect(() => parseAndEvaluate(`
            .Plugin.Load("logic");
            p := .logic.Atom(:p);
            q := .logic.Atom(:q);
            .logic.And(p,q).TruthTable({= maxAtoms=1 });
        `, runtime())).toThrow("exceeding maxAtoms");
    });

    test("checks implication introduction through an accepted scoped subproof", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("logic");
            p := .logic.Atom(:p);
            inner := .logic.Subproof(p,[],p);
            proof := .logic.Proof([
              .logic.Step(:implicationIntro,p.Implies(p),[],{= subproofs=[inner] })
            ],p.Implies(p));
            {: inner,proof,proof.Tree() };
        `, runtime());
        expect(text(entry(result.values[0], "proofkind"))).toBe("subproof");
        expect(entry(result.values[0], "accepted").value).toBe(1n);
        expect(entry(result.values[1], "accepted").value).toBe(1n);
        const tree = result.values[2];
        expect(text(entry(tree, "treekind"))).toBe("naturalDeduction");
        expect(entry(entry(tree, "root"), "subproofs").values).toHaveLength(1);
    });

    test("checks disjunction elimination with two independently scoped cases", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("logic");
            p := .logic.Atom(:p);
            q := .logic.Atom(:q);
            conclusion := p.Or(q);
            fromP := .logic.Subproof(p,[
              .logic.Step(:orIntroLeft,conclusion,[1])
            ],conclusion);
            fromQ := .logic.Subproof(q,[
              .logic.Step(:orIntroRight,conclusion,[1])
            ],conclusion);
            proof := .logic.Proof([
              .logic.Step(:premise,conclusion),
              .logic.Step(:orElim,conclusion,[1],{= subproofs=[fromP,fromQ] })
            ],conclusion);
            {: proof,proof[:checks][2][:discharged] };
        `, runtime());
        expect(entry(result.values[0], "accepted").value).toBe(1n);
        expect(result.values[1].values).toHaveLength(2);
    });

    test("checks negation rules, bottom elimination, and syntax trees", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("logic");
            p := .logic.Atom(:p);
            impossible := p.And(p.Not());
            contradiction := .logic.Subproof(impossible,[
              .logic.Step(:andElimLeft,p,[1]),
              .logic.Step(:andElimRight,p.Not(),[1]),
              .logic.Step(:notElim,.logic.Bottom(),[2,3])
            ],.logic.Bottom());
            negation := .logic.Proof([
              .logic.Step(:notIntro,impossible.Not(),[],{= subproofs=[contradiction] })
            ],impossible.Not());
            explosion := .logic.Proof([
              .logic.Step(:premise,.logic.Bottom()),
              .logic.Step(:bottomElim,p,[1])
            ],p);
            tree := p.Implies(p.Not()).SyntaxTree();
            {: negation,explosion,tree };
        `, runtime());
        expect(entry(result.values[0], "accepted").value).toBe(1n);
        expect(entry(result.values[1], "accepted").value).toBe(1n);
        expect(text(entry(result.values[2], "treekind"))).toBe("syntaxTree");
        expect(entry(entry(result.values[2], "root"), "children").values).toHaveLength(2);
    });

    test("retains a rejected discharge when the subproof conclusion mismatches", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("logic");
            p := .logic.Atom(:p);
            q := .logic.Atom(:q);
            inner := .logic.Subproof(p,[],p);
            .logic.Proof([
              .logic.Step(:implicationIntro,p.Implies(q),[],{= subproofs=[inner] })
            ],p.Implies(q));
        `, runtime());
        expect(entry(result, "accepted")).toBeNull();
        expect(text(entry(entry(result, "checks").values[0], "reason")))
            .toBe("implicationIntroductionSubproofMismatch");
    });

    test("rejects leaked free premises inside a discharged subproof", () => {
        expect(() => parseAndEvaluate(`
            .Plugin.Load("logic");
            p := .logic.Atom(:p);
            q := .logic.Atom(:q);
            .logic.Subproof(p,[.logic.Step(:premise,q)],q);
        `, runtime())).toThrow("cannot introduce additional premise or assumption lines");
    });

    test("replays attached subproofs instead of trusting a stored accepted flag", () => {
        const result = parseAndEvaluate(`
            .Plugin.Load("logic");
            p := .logic.Atom(:p);
            q := .logic.Atom(:q);
            inner := .logic.Subproof(p,[],p);
            forged := {=
              schema="rix.logic.proof@1",proofKind=:subproof,assumption=p,
              steps=inner[:steps],goal=q,accepted=1
            };
            .logic.Proof([
              .logic.Step(:implicationIntro,p.Implies(q),[],{= subproofs=[forged] })
            ],p.Implies(q));
        `, runtime());
        expect(entry(result, "accepted")).toBeNull();
        expect(text(entry(entry(result, "checks").values[0], "reason")))
            .toBe("implicationIntroductionSubproofMismatch");
    });
});
