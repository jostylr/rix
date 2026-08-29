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
