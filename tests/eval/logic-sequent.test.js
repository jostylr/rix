import { expect, test } from "bun:test";
import { Integer, Rational, RationalInterval } from "@ratmath/core";
import { Context, createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate } from "../../src/index.js";
import { createSequent, checkSequent, renderSequentTree, exactProposition, checkExactProposition, sequentValue } from "../../src/runtime/logic-sequent.js";
import { renderOutputHtml, formatOutputText, renderGraphicSvg } from "../../src/runtime/output.js";
import { formatValue } from "../../src/eval/format.js";
import { encodeOutputJSON, decodeOutputJSON } from "../../src/runtime/output-json.js";
import { createNodeHostAdapter } from "../../src/runtime/host-adapter-node.js";
import { HOST_ADAPTER_ENV } from "../../src/runtime/host-adapter.js";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
const atom=name=>({schema:"rix.logic.formula@1",valuekind:"logicFormula",kind:"atom",name});
const constant=kind=>({schema:"rix.logic.formula@1",valuekind:"logicFormula",kind});
const unary=f=>({...constant("not"),operand:f});
const binary=(kind,left,right)=>({...constant(kind),left,right});
const p=atom("p"),q=atom("q"),r=atom("r");
const runtime=()=>({context:new Context(),registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()});
const f=(v,k)=>v.entries.get(k),s=v=>v.value;
function evaluate(formula,v) {
    if(formula.kind==="atom")return v[formula.name];if(formula.kind==="top")return true;if(formula.kind==="bottom")return false;
    if(formula.kind==="not")return !evaluate(formula.operand,v);
    const a=evaluate(formula.left,v),b=evaluate(formula.right,v);
    return {and:a&&b,or:a||b,implies:!a||b,iff:a===b}[formula.kind];
}
const valuations=Array.from({length:8},(_,i)=>({p:!!(i&1),q:!!(i&2),r:!!(i&4)}));
test("classical sequent rules agree with independent truth evaluation on both sides and every connective",()=>{
    const bases=[p,q,constant("top"),constant("bottom"),unary(p),...['and','or','implies','iff'].map(k=>binary(k,p,q))];
    const formulas=[...bases,...bases.map(unary),...bases.map(b=>binary("implies",b,binary("or",r,unary(r))))];
    const used=new Set();
    for(const formula of formulas)for(const [left,right] of [[[],[formula]],[[formula],[p]],[[formula],[]],[[p],[formula]]]) {
        const proof=createSequent(left,right);
        const valid=valuations.every(v=>!left.every(a=>evaluate(a,v))||right.some(a=>evaluate(a,v)));
        expect(proof.status).toBe(valid?"valid":"invalid");
        expect(checkSequent(proof).accepted).toBe(1);
        proof.nodes.forEach(n=>used.add(n.rule));
        if(proof.countermodel){const v=Object.fromEntries(proof.countermodel.map(x=>[x.atom,!!x.truth]));expect(left.every(a=>evaluate(a,v))).toBe(true);expect(right.some(a=>evaluate(a,v))).toBe(false);}
    }
    expect([...used]).toEqual(expect.arrayContaining(["identity","open","top-left","top-right","bottom-left","bottom-right","not-left","not-right","and-left","and-right","or-left","or-right","implies-left","implies-right","iff-left","iff-right"]));
});
test("budgets retain unresolved premise sequents and replay rejects every altered evidence field",()=>{
    const goal=binary("and",binary("or",p,unary(p)),binary("or",q,unary(q)));
    for(const options of [{maxsteps:0},{maxnodes:1},{maxdepth:0}]) {
        const proof=createSequent([],[goal],options);expect(proof.status).toBe("unresolved");expect(proof.complete).toBeNull();expect(proof.nodes[0].right).toEqual([goal]);expect(checkSequent(proof).accepted).toBe(1);
    }
    const proof=createSequent([],[goal]);
    const partialInvalid=createSequent([],[binary("and",p,goal)],{maxsteps:2});
    expect(partialInvalid.status).toBe("invalid");expect(partialInvalid.complete).toBeNull();
    expect(checkSequent(partialInvalid).accepted).toBe(1);
    for(const mutate of [p=>p.status="invalid",p=>p.nodes[0].rule="or-right",p=>p.nodes[0].premises.pop(),p=>p.nodes[1].left.push(atom("forged")),p=>p.work.steps++,p=>p.checker="new",p=>p.countermodel=[],p=>p.extra="forged"]) {
        const candidate=structuredClone(proof);mutate(candidate);expect(checkSequent(candidate).accepted).toBeNull();
    }
    const cycle=structuredClone(proof);cycle.nodes.push(cycle);expect(checkSequent(cycle).accepted).toBeNull();
    expect(checkSequent({...proof,extra:"x".repeat(16*1024*1024)}).accepted).toBeNull();
    expect(()=>createSequent([],[atom("x".repeat(257))])).toThrow("atom name");
    expect(()=>createSequent([],[goal],{maxsteps:4097})).toThrow("maxsteps");
    let deep=p;for(let i=0;i<65;i++)deep=unary(deep);expect(()=>createSequent([],[deep])).toThrow("depth");
    const cyclic=unary(p);cyclic.operand=cyclic;expect(()=>createSequent([],[cyclic])).toThrow("cyclic");
    const wide=Array.from({length:60},(_,i)=>atom("x".repeat(100)+i));
    const textLimited=createSequent(wide,[binary("and",p,q)],{maxtext:20000});
    expect(textLimited.nodes[0].reason).toBe("text-limit");expect(checkSequent(textLimited).accepted).toBe(1);
});
test("exact arithmetic propositions only insert checked decided constants",()=>{
    for(const [op,a,b,truth] of [["eq",new Rational(2,4),new Rational(1,2),"true"],["lt",new RationalInterval(2,1),new RationalInterval(3,4),"true"],["eq",new RationalInterval(1,2),new RationalInterval(2,3),"undecided"],["gte",new Rational(1),new Rational(2),"false"]]) {
        const result=exactProposition(op,a,b);expect(result.truth).toBe(truth);expect(checkExactProposition(result).accepted).toBe(1);
        if(truth==="undecided")expect(result.formula).toBeNull();else expect(createSequent([],[result.formula]).status).toBe(truth==="true"?"valid":"invalid");
        expect(checkExactProposition({...result,truth:"forged"}).accepted).toBeNull();
    }
    expect(()=>exactProposition("eq",0.5,new Rational(1,2))).toThrow("exact rationals");
});
test("public plugin separates sequent records from natural deduction/tableaux and exports portable checked trees",()=>{
    const state=runtime();
    const result=parseAndEvaluate(`.Plugin.Load("logic");p:=.logic.Atom(:p);q:=.logic.Atom(:q);proof:=.logic.Sequent([p,p.Implies(q)],[q]);
        evidence:=.logic.ExactProposition(:lt,2:1,3:4);
        [.logic.CheckSequent(proof),.logic.SequentTree(proof),.logic.CheckProposition(evidence),p.Or(p.Not()).Tableau({= mode=:validity })];`,state).values;
    expect(s(f(result[0],"accepted"))).toBe(1n);expect(s(f(result[2],"accepted"))).toBe(1n);expect(s(f(result[3],"status"))).toBe("valid");
    const html=renderOutputHtml(result[1],formatValue),text=formatOutputText(result[1],formatValue);
    expect(html).toContain("Classical sequent: valid");expect(text).toContain("implies-left");
    const svg=renderGraphicSvg(result[1].children[2],formatValue);expect(svg).toContain("sequent-0");expect(svg).toContain("implies-left");
    const restored=decodeOutputJSON(encodeOutputJSON(result[1])).value;
    expect(formatOutputText(restored,formatValue)).toBe(text);
    expect(checkSequent(restored.metadata.get("source")).accepted).toBe(1);
    const bad=createSequent([],[p]);bad.status="valid";expect(()=>renderSequentTree(bad)).toThrow("unchecked");
    const bounded=renderSequentTree(sequentValue(createSequent([],[binary("or",p,unary(p))])),{maxnodes:1});
    expect(formatOutputText(bounded,formatValue)).toContain("Showing 1 of");
});
test("script grants control the sequent kernel through the Logic group",()=>{
    const root=path.resolve(import.meta.dir,"../../../tmp");mkdirSync(root,{recursive:true});
    const directory=mkdtempSync(path.join(root,"m8-permissions-"));
    try {
        writeFileSync(path.join(directory,"sequent.rix"),'.LogicSequent([],[])[:status];');
        const run=policy=>{const state=runtime();state.context.setEnv(HOST_ADAPTER_ENV,createNodeHostAdapter());state.context.setEnv("scriptBaseDir",directory);return parseAndEvaluate(`<"sequent" /${policy}/>`,state);};
        expect(run("-All,+Core,+Logic").value).toBe("invalid");
        expect(()=>run("-All,+Core")).toThrow("Unknown system capability: LOGICSEQUENT");
    }finally{rmSync(directory,{recursive:true,force:true});}
});
