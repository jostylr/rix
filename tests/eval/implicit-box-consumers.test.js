import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { createNodeHostAdapter } from "../../src/runtime/host-adapter-node.js";
import { HOST_ADAPTER_ENV } from "../../src/runtime/host-adapter.js";
import { Rational, RationalInterval } from "@ratmath/core";
import { Context, createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate, formatValue,
    evaluateImplicitTrace, checkImplicitTrace, refineImplicitTrace, renderOutputHtml, snapshotOutputDocument, encodeOutputJSON, decodeOutputJSON } from "../../src/index.js";
import { GraphicWidgetSession } from "../../src/tools/widget-session.js";
const field=(record,key)=>record.entries.get(key.toLowerCase());
const text=value=>value?.value??value;
import { validatedClaimCost, validatedPortable } from "../../src/runtime/validated-boxes.js";
const q=value=>new Rational(BigInt(value));
function run(source) {return parseAndEvaluate(source,{context:new Context(),registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()});}
function implicit(expression,box="{= x=(-1):1,y=(-2):2 }") {
    return run(`.Plugin.Load("calculus");x:=.calculus.Variable(:x);y:=.calculus.Variable(:y);f:=${expression};[f,.calculus.GradientResult(f,[:x,:y]),${box}];`).values;
}
const construction=`
    .Plugin.Load("calculus");.Plugin.Load("geometry");
    x:=.calculus.Variable(:x);y:=.calculus.Variable(:y);
    Build=(p)->{;
        f=[x^2-p[1],y];
        .numerics.IntervalNewtonBox(f,.calculus.JacobianResult(f,[:x,:y]),{= x=(1/2):2,y=(-1):1 });
    };
`;
describe("checked implicit box consumers",()=>{
    test("local chart hypotheses replay and exclude no-root regions",()=>{
        const problem=implicit("y-x^2");
        const result=evaluateImplicitTrace(...problem);
        expect(result.status).toBe("complete");expect(result.arcs).toHaveLength(1);expect(checkImplicitTrace(result).accepted).toBe(true);
        const arc=result.arcs[0];
        expect(arc.dependent).toBe("y");expect(arc.gradientRanges.map(String)).toEqual(["-2:2","1:1"]);
        expect(arc.lowerFace.high.lessThan(q(0))).toBe(true);expect(arc.upperFace.low.greaterThan(q(0))).toBe(true);
        expect(arc.rootBox.axes.get("y").toString()).toBe("[0,1]");
        expect(arc.slope.toString()).toBe("-2:2");
        expect(checkImplicitTrace({...result,arcs:[{...arc,slope:new RationalInterval(q(99),q(99))}]}).accepted).toBe(false);
        const none=evaluateImplicitTrace(...implicit("x^2+y^2+1"));expect(none.excluded).toHaveLength(1);expect(none.arcs).toHaveLength(0);
    });
    test("plugin methods and exact region plots consume checked boxes",()=>{
        const result=run(`.Plugin.Load("calculus");.Plugin.Load("geometry");.Plugin.Load("plot");
            x:=.calculus.Variable(:x);y:=.calculus.Variable(:y);f:=y-x^2;
            trace:=.geometry.TraceImplicit(f,.calculus.GradientResult(f,[:x,:y]),{= x=(-1):1,y=(-2):2 });
            refined:=trace.Refine({= maxWidth=1/2,maxBoxes=31 });
            [refined[:arcs].Len(),refined.Check()[:accepted],.plot.CertifiedRegions(refined)];`);
        expect(result.values[0].value).toBe(4n);expect(result.values[1].value).toBe(1n);
        expect(result.values[2].kind).toBe("graphic");expect(renderOutputHtml(result.values[2],formatValue)).toContain("certified-region");
        expect(renderOutputHtml(result.values[2],formatValue)).not.toContain("[object Object]");
        const restored=decodeOutputJSON(encodeOutputJSON(snapshotOutputDocument(result.values[2]))).value;
        const restoredTrace=field(field(restored.metadata.get("plot"),"evidence"),"source");
        expect(checkImplicitTrace(restoredTrace)).toMatchObject({accepted:true});
        expect(renderOutputHtml(restored,formatValue)).toBe(renderOutputHtml(result.values[2],formatValue));
    });
    test("parameter constraints preserve the last checked result",()=>{
        const result=run(`${construction}
            state:=.geometry.ParameterConstruction(Build,[1,0]);
            failed:=.geometry.ParameterDrag(state,[-1,0]);
            recovered:=.geometry.ParameterDrag(failed,[2,0]);
            [state[:status],failed[:status],failed[:parameter],failed[:diagnostic],recovered[:status]];`);
        expect(formatValue(result)).toBe("[accepted, retainedLastCertified, [1, 0], constraintsUnproved, accepted]");
    });
    test("boundary charts, singular topology, zero work and refinement preserve the complete cover",()=>{
        const boundary=evaluateImplicitTrace(...implicit("y","{= x=0:1,y=0:1 }"));
        expect(boundary.arcs[0].rootBox.axes.get("y").toString()).toBe("[0,0]");
        const problem=implicit("x^2+y^2","{= x=(-1):1,y=(-1):1 }");
        const zero=evaluateImplicitTrace(...problem,{maxBoxes:0});
        expect(zero.pending).toHaveLength(1);expect(zero.unresolved).toHaveLength(1);
        const singular=evaluateImplicitTrace(...problem,{maxBoxes:15,maxDepth:3});
        expect(singular.arcs).toHaveLength(0);expect(singular.unresolved.length).toBeGreaterThan(0);
        expect(singular.nodes[0].classification).toBe("singularOrTangentUnknown");
        const nodes=new Map([...singular.nodes,...singular.pending].map(node=>[node.id,node]));
        for(const node of singular.nodes)if(node.action==="split"){
            const children=node.children.map(id=>nodes.get(id));
            for(const axis of singular.variables)expect(children[0].box.axes.get(axis).union(children[1].box.axes.get(axis)).equals(node.box.axes.get(axis))).toBe(true);
        }
        const leaves=[...singular.excluded,...singular.arcs,...singular.unresolved];
        for(const x of [-1,0,1])for(const y of [-1,0,1])expect(leaves.some(node=>node.box.axes.get("x").containsValue(q(x))&&node.box.axes.get("y").containsValue(q(y)))).toBe(true);
        expect(checkImplicitTrace(singular).accepted).toBe(true);
        expect(checkImplicitTrace({...zero,pending:[]}).accepted).toBe(false);
        expect(()=>refineImplicitTrace({...zero,pending:[]})).toThrow("Unchecked");
        expect(()=>evaluateImplicitTrace(...problem,{maxBoxes:4097})).toThrow("OutOfRange");
        expect(()=>evaluateImplicitTrace(...problem,{maxWidth:-1})).toThrow("Nonnegative");
        const invalid=evaluateImplicitTrace(...implicit("1/x+y"));
        expect(invalid).toMatchObject({certified:false,status:"partial"});expect(invalid.unresolved[0].reason).toBe("invalidEvidence");
    });
    test("aggregate evidence exhaustion retains a replayable complete cover",()=>{
        const problem=implicit("y-x^2");
        const result=evaluateImplicitTrace(...problem,{maxBoxes:4096,maxWidth:new Rational(1,1024),maxEvidenceText:65536});
        expect(result.work.outputExhausted).toBe(true);expect(result.work.processed).toBeGreaterThan(0);
        expect(result.work.attempted).toBe(result.work.processed+1);
        expect(result.status).toBe("budgetExhausted");expect(result.certified).toBe(true);
        expect(result.pending.length).toBeGreaterThan(0);
        expect(result.pending.every(node=>node.reason==="outputEvidenceBudgetExceeded")).toBe(true);
        expect(validatedClaimCost(result).text).toBeLessThanOrEqual(65536);
        expect(checkImplicitTrace(result).accepted).toBe(true);
        expect(checkImplicitTrace(validatedPortable({...result,checker:checkImplicitTrace(result)})).accepted).toBe(true);
        const nodes=new Map([...result.nodes,...result.pending].map(node=>[node.id,node]));
        for(const node of result.nodes)if(node.action==="split")for(const axis of result.variables){
            const [a,b]=node.children.map(id=>nodes.get(id));
            expect(a.box.axes.get(axis).union(b.box.axes.get(axis)).equals(node.box.axes.get(axis))).toBe(true);
        }
        expect(()=>evaluateImplicitTrace(...problem,{maxEvidenceText:1})).toThrow("InputEvidenceBudgetExceeded");
        expect(()=>evaluateImplicitTrace(...problem,{maxEvidenceText:16777217})).toThrow("OutOfRange");
        expect(checkImplicitTrace({...result,work:{...result.work,outputExhausted:false}}).accepted).toBe(false);
        const wrongGradient=implicit("x+y")[1];
        const invalid=evaluateImplicitTrace(problem[0],wrongGradient,problem[2]);
        expect(invalid.certified).toBe(false);expect(invalid.unresolved).toHaveLength(1);
        const cyclic={...result};cyclic.cycle=cyclic;
        expect(checkImplicitTrace(cyclic)).toMatchObject({accepted:false,reason:"cyclicValidatedReplayClaim"});
        const extended=refineImplicitTrace(result,{maxWidth:new Rational(1,2),maxEvidenceText:262144});
        expect(extended.status).toBe("complete");expect(extended.arcs).toHaveLength(4);
    });
    test("Solve separates root enclosures, equality feasibility and optimization",()=>{
        const result=run(`.Plugin.Load("calculus");.Plugin.Load("solve");.Plugin.Load("plot");
            x:=.calculus.Variable(:x);f:=[x^2-2];j:=.calculus.JacobianResult(f,[:x]);
            roots:=.solve.RootBoxes(f,j,{= x=1:2 });
            feasible:=.solve.BoxFeasibility(f,j,{= x=1:2 });
            pending:=.solve.BoxFeasibility(f,j,{= x=0:2 },{= maxBoxes=0 });
            missing:=[x^2+1];absent:=.solve.BoxFeasibility(missing,.calculus.JacobianResult(missing,[:x]),{= x=(-1):1 });
            [roots[:rootExistence],roots.Check(),feasible[:status],pending[:status],pending[:certified],absent[:status],.plot.CertifiedRegions(roots[:boxes])];`);
        expect(formatValue({type:"sequence",values:result.values.slice(0,6)})).toBe("[atLeastOne, 1, feasible, unknown, _, infeasible]");
        expect(result.values[6].kind).toBe("graphic");
        expect(formatValue(run(`.Plugin.Load("calculus");.Plugin.Load("solve");x:=.calculus.Variable(:x);f:=[x^2-2];
            roots:=.solve.RootBoxes(f,.calculus.JacobianResult(f,[:x]),{= x=1:2 });
            [.solve.Check({= }.Merge(roots).Merge({= branches=[] })),.solve.Check({= }.Merge(roots).Merge({= rootExistence=:none }))];`))).toBe("[_, _]");
        expect(()=>run('.Plugin.Load("solve");.solve.RootBoxes([],_,_,{= objective=1 });')).toThrow("optimization");
        expect(()=>run('.Plugin.Load("solve");.solve.Check({= classification=:numericalBoxes },[1]);')).toThrow("supplied point");
        expect(run('.ValidatedClaimEqual(1,"1");')).toBe(null);
    });
    test("retained drag events validate proposals, preserve state, and recover",()=>{
        const result=run(`${construction}
            $$state:=.geometry.ParameterConstruction(Build,[1,0],{= maxHistory=2 });
            graphic:=.Graphics.Graphic([400,400],[.geometry.ParameterHandle($$state),
                .Graphics.Action({= target=$$state,action=(current)->current,children=[],id="inspect" })]);
            [graphic,$$state];`);
        const [graphic,target]=result.values;const session=new GraphicWidgetSession(graphic);
        try {
            expect(text(field(target.get(),"status"))).toBe("accepted");
            const before=target.get();const snapshot=snapshotOutputDocument(graphic);
            expect(snapshot.kind).toBe("graphic");expect(target.get()).toBe(before);
            session.dispatch({type:"graphic:position",targetId:target.id,position:[100,200]});
            expect(text(field(target.get(),"status"))).toBe("retainedLastCertified");
            expect(formatValue(field(target.get(),"parameter"))).toBe("[1, 0]");
            expect(field(target.get(),"repair").values).toHaveLength(2);
            session.dispatch({type:"graphic:position",targetId:target.id,position:[350,200]});
            expect(text(field(target.get(),"status"))).toBe("accepted");
            expect(formatValue(field(target.get(),"parameter"))).toBe("[1..1/2, 0]");
            expect(field(target.get(),"history").values).toHaveLength(2);
        }finally{session.dispose();}
        const failed=run('.Plugin.Load("geometry");state:=.geometry.ParameterConstruction((p)->.Error("failed constraint"),[1,0]);[state[:status],state[:diagnostic],state[:lastCertified]];');
        expect(formatValue(failed)).toBe("[unresolved, constructionCallbackRejected, _]");
        expect(()=>run(`${construction}state:=.geometry.ParameterConstruction(Build,[1,0]);bad:=state.Merge({= maxHistory=-1 });.geometry.ParameterDrag(bad,[1,0]);`)).toThrow("maxHistory");
        expect(()=>run(`${construction}state:=.geometry.ParameterConstruction(Build,[1,0]);bad:=state.Merge({= lastCertified={= schema="rix.numerics.interval-newton-box@1",rootExistence=:unique } });.geometry.ParameterDrag(bad,[1,0]);`)).toThrow("not certified");
    });
});


test("Geometry script permission gates the checked implicit services",()=>{
    const root=path.resolve(import.meta.dir,"../../../tmp");mkdirSync(root,{recursive:true});
    const directory=mkdtempSync(path.join(root,"m2-permission-"));
    try {
        writeFileSync(path.join(directory,"check.rix"),'.ImplicitTraceCheck({= })[:reason];');
        function execute(policy) {
            const context=new Context();context.setEnv(HOST_ADAPTER_ENV,createNodeHostAdapter());context.setEnv("scriptBaseDir",directory);
            return parseAndEvaluate(`<"check" /${policy}/>`,{context,registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()});
        }
        expect(text(execute("-All,+Core,+Geometry"))).toBe("unsupportedImplicitTraceEvidence");
        expect(()=>execute("-All,+Core")).toThrow("Unknown system capability: IMPLICITTRACECHECK");
    }finally{rmSync(directory,{recursive:true,force:true});}
});
