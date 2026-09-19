import { describe, expect, test } from "bun:test";
import { Integer, Rational, RationalInterval } from "@ratmath/core";
import { Context, createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate, formatValue,
    evaluateIntervalLinearSolve, evaluateIntervalNewtonBox, evaluateBoxSubdivision, resumeBoxSubdivision,
    checkValidatedBoxResult } from "../../src/index.js";

const q=(n,d=1)=>new Rational(BigInt(n),BigInt(d));
const I=(low,high=low)=>new RationalInterval(low instanceof Rational?low:q(low),high instanceof Rational?high:q(high));
const get=(value,key)=>value.entries.get(key.toLowerCase());
function evaluate(source) { return parseAndEvaluate(source,{context:new Context(),registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()}); }
function system(expressions,box="{= x=(-3/2):(3/2), y=(-3/2):(3/2) }") {
    const result=evaluate(`.Plugin.Load("calculus"); .Plugin.Load("numerics"); x := .calculus.Variable(:x); y := .calculus.Variable(:y);
        equations := ${expressions}; [equations,.calculus.JacobianResult(equations,[:x,:y]),${box}];`);
    return result.values;
}
function leafCover(result) {
    const leaves=[...result.excluded,...result.unique,...result.unresolved];
    const ids=new Set(leaves.map(({id})=>id));
    expect(ids.size).toBe(leaves.length);
    const nodes=new Map(result.nodes.map((node)=>[node.id,node]));
    for(const leaf of result.pending) nodes.set(leaf.id,leaf);
    for(const node of result.nodes) if(node.action==="split") {
        const [left,right]=node.children.map((id)=>nodes.get(id));
        expect(left).toBeDefined();expect(right).toBeDefined();
        for(const name of result.variables) {
            const parentRange=node.box.axes.get(name),l=left.box.axes.get(name),r=right.box.axes.get(name);
            expect(l.union(r).equals(parentRange)).toBe(true);
            if(name!==node.axis) {expect(l.equals(parentRange)).toBe(true);expect(r.equals(parentRange)).toBe(true);}
        }
    } else expect(ids.has(node.id)).toBe(true);
    // Independent exact sample-cover check, including boundaries and split faces.
    for(const x of [q(-3,2),q(-1),q(0),q(1),q(3,2)]) for(const y of [q(-3,2),q(0),q(3,2)]) {
        expect(leaves.some(({box})=>box.axes.get("x").containsValue(x)&&box.axes.get("y").containsValue(y))).toBe(true);
    }
}

describe("validated interval linear systems",()=>{
    test("encloses every exact endpoint system without certifying a midpoint guess",()=>{
        const A=[[I(2,3),I(1)],[I(1),I(3,4)]],b=[I(1),I(2)];
        const result=evaluateIntervalLinearSolve(A,b);
        expect(result.certified).toBe(true);expect(result.regular).toBe(true);
        expect(result.proof).toBe("nonzeroIntervalEliminationPivots");
        expect(result.pivots.every(({interval})=>!interval.containsZero())).toBe(true);
        // Independent 2x2 inverse formula, all coefficient endpoint choices.
        for(const a of [q(2),q(3)])for(const d of [q(3),q(4)]){
            const determinant=a.multiply(d).subtract(q(1));
            const x=d.subtract(q(2)).divide(determinant),y=a.multiply(q(2)).subtract(q(1)).divide(determinant);
            expect(result.solution[0].containsValue(x)).toBe(true);
            expect(result.solution[1].containsValue(y)).toBe(true);
        }
        expect(checkValidatedBoxResult(result)).toMatchObject({accepted:true,certified:true});
        expect(checkValidatedBoxResult({...result,solution:[I(99),I(99)]}).accepted).toBe(false);
        expect(checkValidatedBoxResult({...result,preconditioner:[[q(0),q(0)],[q(0),q(0)]]}).accepted).toBe(false);
    });
    test("singular and zero-crossing pivots remain unresolved, while ill-conditioned exact systems retain proof",()=>{
        expect(evaluateIntervalLinearSolve([[I(-1,1)]],[1])).toMatchObject({certified:false,regular:false,solution:null,classification:"singularPreconditioner"});
        expect(evaluateIntervalLinearSolve([[I(0,2)]],[1])).toMatchObject({certified:false,regular:false,classification:"pivotContainsZero"});
        const tiny=q(1,1000000000);
        const ill=evaluateIntervalLinearSolve([[1,0],[0,tiny]],[1,tiny]);
        expect(ill.certified).toBe(true);expect(ill.diagnostics).toContain("illConditionedMidpointMatrix");
        expect(ill.solution.map(String)).toEqual(["1:1","1:1"]);
        expect(()=>evaluateIntervalLinearSolve([[1]],[1],{preconditioner:[[0]]})).toThrow("Nonsingular");
    });
    test("RiX Matrix inputs, Ball inputs and plugin checkers reuse the same service",()=>{
        const result=evaluate(`.Plugin.Load("ball");
            exact := .numerics.IntervalLinearSolve([2,1;1,3],[1,2]);
            uncertain := .ball.LinearSolve([[.ball(5/2,1/2),1],[1,.ball(7/2,1/2)]],[1,2]);
            [exact[:solution],.numerics.CheckIntervalLinearSolve(exact)[:accepted],uncertain[:certified],uncertain[:solution][1].Interval()];`);
        expect(formatValue({type:"sequence",values:result.values.slice(0,3)})).toBe("[[1/5:1/5, 3/5:3/5], 1, 1]");
        expect(result.values[3]).toBeInstanceOf(RationalInterval);
    });
});

describe("checked multidimensional interval Newton",()=>{
    test("proves interior uniqueness and an exact boundary root with replayable evidence",()=>{
        const [expressions,jacobian,box]=system("[x+y-3,x-y-1]","{= x=0:3, y=0:3 }");
        const interior=evaluateIntervalNewtonBox(expressions,jacobian,box);
        expect(interior).toMatchObject({certified:true,classification:"unique",rootExistence:"unique"});
        expect(interior.trace[0].strictInclusion).toBe(true);
        expect(checkValidatedBoxResult(interior).accepted).toBe(true);
        const [f,j,b]=system("[x,y]","{= x=0:1, y=0:1 }");
        const boundary=evaluateIntervalNewtonBox(f,j,b);
        expect(boundary.classification).toBe("unique");
        expect(boundary.trace[0].strictInclusion).toBe(false);
        expect(boundary.trace[0].verifiedBoundaryRoot.map(String)).toEqual(["0","0"]);
        expect(checkValidatedBoxResult({...boundary,rootExistence:"none"}).accepted).toBe(false);
    });
    test("certifies nonlinear inclusion, excludes no-root boxes, and retains singular boxes",()=>{
        const [f,j,b]=system("[x^2+y^2-1,x-y]","{= x=(1/2):1, y=(1/2):1 }");
        const root=evaluateIntervalNewtonBox(f,j,b,{maxIterations:4});
        expect(root.classification).toBe("unique");expect(checkValidatedBoxResult(root).accepted).toBe(true);
        const [g,k,c]=system("[x^2+1,y]");
        const absent=evaluateIntervalNewtonBox(g,k,c);
        expect(absent).toMatchObject({classification:"excluded",box:null,rootExistence:"none"});
        expect(absent.trace[0].reason).toBe("functionRangeExcludesZero");
        const [s,t,d]=system("[x^2,y]");
        const singular=evaluateIntervalNewtonBox(s,t,d);
        expect(singular).toMatchObject({classification:"singularPreconditioner",rootExistence:"unproved"});
        expect(singular.box.axes.get("x").equals(singular.inputBox.axes.get("x"))).toBe(true);
    });
});

describe("complete deterministic box subdivision",()=>{
    test("zero and exhausted budgets retain every pending region and stable split ordering",()=>{
        const [f,j,b]=system("[x^2-1,y^2-1]");
        const zero=evaluateBoxSubdivision(f,j,b,{maxBoxes:0});
        expect(zero.pending).toHaveLength(1);expect(zero.unresolved).toHaveLength(1);expect(zero.work.processed).toBe(0);
        const first=evaluateBoxSubdivision(f,j,b,{maxBoxes:1});
        expect(first.nodes[0]).toMatchObject({axis:"x",action:"split",children:["r.0","r.1"]});
        expect(first.pending.map(({id})=>id)).toEqual(["r.0","r.1"]);
        leafCover(first);expect(checkValidatedBoxResult(first).accepted).toBe(true);
        expect(checkValidatedBoxResult({...first,pending:first.pending.slice(1)}).accepted).toBe(false);
        expect(()=>resumeBoxSubdivision({...first,pending:[]},{maxBoxes:2})).toThrow("Unchecked");
    });
    test("resuming equals a single longer run and replay checks all classifications and coverage",()=>{
        const [f,j,b]=system("[x^2-1,y^2-1]");
        const initial=evaluateBoxSubdivision(f,j,b,{maxBoxes:5,maxDepth:12});
        const resumed=resumeBoxSubdivision(initial,{maxBoxes:26});
        const direct=evaluateBoxSubdivision(f,j,b,{maxBoxes:31,maxDepth:12});
        expect(resumed.nodes.map(({id,classification,action})=>[id,classification,action])).toEqual(direct.nodes.map(({id,classification,action})=>[id,classification,action]));
        expect(resumed.unique.length).toBeGreaterThan(0);leafCover(resumed);
        expect(checkValidatedBoxResult(resumed).accepted).toBe(true);
        const changed={...resumed,nodes:resumed.nodes.map((entry,index)=>index===0?{...entry,splitAt:q(99)}:entry)};
        expect(checkValidatedBoxResult(changed).accepted).toBe(false);
    });
    test("singular, boundary and invalid-domain regions remain explicit at stopping limits",()=>{
        const [f,j,b]=system("[x^2,y]");
        const singular=evaluateBoxSubdivision(f,j,b,{maxBoxes:31,maxDepth:3});
        expect(singular.unresolved.length).toBeGreaterThan(0);expect(singular.pending).toHaveLength(0);leafCover(singular);
        expect(singular.unique).toHaveLength(0);
        const [g,k,c]=system("[1/x,y]");
        const invalid=evaluateBoxSubdivision(g,k,c,{maxBoxes:4});
        expect(invalid.certified).toBe(false);expect(invalid.unresolved).toHaveLength(1);
        expect(invalid.unresolved[0].reason).toBe("invalidEvidence");expect(checkValidatedBoxResult(invalid).accepted).toBe(true);
        const result=evaluate(`.Plugin.Load("calculus");.Plugin.Load("numerics");x := .calculus.Variable(:x);f := [x^2-2];j := .calculus.JacobianResult(f,[:x]);r := .numerics.SubdivideBoxes(f,j,{= x=0:2 },{= maxBoxes=1 });s := .numerics.ResumeBoxes(r,{= maxBoxes=3 });[s[:work][:processed],.numerics.CheckBoxSubdivision(s)[:accepted]];`);
        expect(result.values[1].value).toBe(1n);
    });
});

describe("Ball polynomial adapters",()=>{
    test("Horner and derivative bounds stay exact on the entire Ball",()=>{
        const result=evaluate(`.Plugin.Load("ball");b := .ball(3/2,1/2);p := .ball.Polynomial([1,0,-2],b);d := .ball.DerivativeBound([1,0,-2],b);z := .ball.DerivativeBound([1,0,-2],b,3);[p.Interval(),d[:interval],d[:absoluteBound],z[:interval],d[:certified]];`);
        expect(formatValue(result)).toBe("[-1:2, 2:4, 4, 0:0, 1]");
        expect(()=>evaluate('.Plugin.Load("ball");.ball.DerivativeBound([1],.ball(0,1),257);')).toThrow("must not exceed 256");
    });
});
