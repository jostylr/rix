import { mkdirSync,mkdtempSync,writeFileSync,rmSync } from "node:fs";
import path from "node:path";
import { createNodeHostAdapter } from "../../src/runtime/host-adapter-node.js";
import { HOST_ADAPTER_ENV } from "../../src/runtime/host-adapter.js";
import { describe, expect, test } from "bun:test";
import { Rational, RationalInterval } from "@ratmath/core";
import { Context, createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate, parseAndEvaluateAsync } from "../../src/index.js";
import { createEvaluationBudget, EVALUATION_BUDGET_ENV } from "../../src/runtime/evaluation-budget.js";
import { validatedClaimKey } from "../../src/runtime/validated-boxes.js";
const e=(value,key)=>value.entries.get(key.toLowerCase());
const v=(value,key)=>e(value,key)?.value;
const source=`.Plugin.Load("ode");t:=.calculus.Variable(:t);y:=.calculus.Variable(:y);v:=.calculus.Variable(:v);s:=.calculus.Variable(:s);`;
const run=(code)=>parseAndEvaluate(source+code,{context:new Context()});
const q=(n,d=1)=>new Rational(BigInt(n),BigInt(d));
const I=(a,b=a)=>new RationalInterval(a,b);

describe("bounded ODE increments",()=>{
 test("Taylor preparation reuses checked state partials with identical derivative evidence",()=>{
   const result=run(`p:=.ode.IVP([v,-y],0,[1,0],0:1/4,{= stateNames=[:y,:v] });
     a:=p.PrepareTaylor({= order=4 });b:=p.PrepareTaylor({= order=4,cacheDerivatives=_ });
     [a[:work],b[:work],.ValidatedClaimEqual(a[:derivativeRows],b[:derivativeRows]),.ValidatedClaimEqual(a[:higherDerivatives],b[:higherDerivatives])];`);
   const [a,b,same,proofs]=result.values;
   expect(v(a,"partialcomputed")).toBe(18n);expect(v(b,"partialcomputed")).toBe(22n);
   expect(v(a,"partialcachehits")).toBe(4n);expect(same.value).toBe(1n);expect(proofs.value).toBe(1n);
   expect(()=>run('.ode.IVP([v,-y],0,[1,0],0:1,{= stateNames=[:y,:v] }).PrepareTaylor({= maxConstructionWork=1 });')).toThrow("construction work budget");
 });
 test("construction evaluator work decreases, preserving async scheduling and parity",async()=>{
   const counts=[];const claims=[];
   for(const mode of ["sync","async"]) for(const cache of ["_","1"]) {
     const context=new Context();const options={context,registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()};
     const evaluate=mode==="sync"?parseAndEvaluate:parseAndEvaluateAsync;
     await evaluate(source+'p:=.ode.IVP([v,-y],0,[1,0],0:1/4,{= stateNames=[:y,:v] });',options);
     const budget=createEvaluationBudget({maxSteps:1000000});context.setEnv(EVALUATION_BUDGET_ENV,budget);
     const result=await evaluate(`p.PrepareTaylor({= order=3,cacheDerivatives=${cache} });`,options);
     counts.push(budget.steps);claims.push(result);
   }
   expect(counts[1]).toBeLessThan(counts[0]);expect(counts[3]).toBeLessThan(counts[2]);
   expect(validatedClaimKey(e(claims[1],"derivativerows"))).toBe(validatedClaimKey(e(claims[3],"derivativerows")));
 },60000);
 test("higher-order reduction retains derivative coordinates and rejects changed evidence",()=>{
   const result=run(`h:=.ode.HigherOrder(-y,0,[1,0],0:1,{= stateNames=[:y,:v] });[h,.ode.ReduceHigherOrder(h).RK4({= steps=1 })];`);
   const [h,solution]=result.values;
   expect(e(h,"correspondence").values.map(x=>v(x,"derivativeorder"))).toEqual([0n,1n]);
   expect(e(solution,"finalstate").values.map(String)).toEqual(["13/24","-5/6"]);
   expect(()=>run('h:=.ode.HigherOrder(-y,0,[1,0],0:1,{= stateNames=[:y,:v] });.ode.ReduceHigherOrder(h.Set("order",3));')).toThrow("evidence changed");
   expect(()=>run('.ode.HigherOrder(y,0,[1,0],0:1);')).toThrow("stateNames");
 });
 test("exact affine families verify initial and differential coefficient identities",()=>{
   const result=run(`a:=.ode.IVP(2*y+3*t+4,0,1,0:1).Exact();b:=.ode.IVP(t,1,3/2,1:0).Exact();
     [a,b,.ode.ExactAt(b,0)[:interval],.ode.CheckExact(a),.ode.CheckExact(a.Set("coefficients",{= exponential=99 })),.ode.IVP(y^2,0,1,0:1).Exact()];`);
   const [a,b,at,check,tampered,unsupported]=result.values,c=e(a,"coefficients");
   const C=e(c,"exponential"),D=e(c,"timelinear"),E=e(c,"offset"),rate=e(c,"rate");
   expect(C.add(E).equals(q(1))).toBe(true);
   expect(rate.multiply(D).add(q(3)).equals(q(0))).toBe(true);
   expect(rate.multiply(E).add(q(4)).equals(D)).toBe(true);
   expect(String(at)).toBe("1:1");expect(check.value).toBe(1n);expect(tampered).toBeNull();
   expect(v(b,"certified")).toBe(1n);expect(v(unsupported,"status")).toBe("unsupported");
   expect(()=>run('a:=.ode.IVP(t,0,0,0:1).Exact();.ode.ExactAt(a,2);')).toThrow("outside");
 });
 test("Dormand-Prince stages replay independently and FSAL saves one call",()=>{
   const solution=run('.ode.IVP(y,0,1,0:1/2).DormandPrince({= initialSteps=2,tolerance=1 });');
   const first=e(solution,"segments").values[0],data=e(first,"data"),slopes=e(data,"slopes").values.map(row=>row.values[0]);
   // Published DP5 coefficients; direct scalar stage evaluation is independent of plugin stage storage.
   const a=[[],[q(1,5)],[q(3,40),q(9,40)],[q(44,45),q(-56,15),q(32,9)],
      [q(19372,6561),q(-25360,2187),q(64448,6561),q(-212,729)],
      [q(9017,3168),q(-355,33),q(46732,5247),q(49,176),q(-5103,18656)],
      [q(35,384),q(0),q(500,1113),q(125,192),q(-2187,6784),q(11,84)]];
   const k=[];for(const row of a) k.push(q(1).add(row.reduce((sum,c,i)=>sum.add(c.multiply(k[i])),q(0)).multiply(q(1,4))));
   expect(slopes.map(String)).toEqual(k.map(String));
   expect(String(e(first,"stateend").values[0])).toBe(String(k[6]));
   const low=[q(5179,57600),q(0),q(7571,16695),q(393,640),q(-92097,339200),q(187,2100),q(1,40)];
   const embedded=q(1).add(low.reduce((sum,c,i)=>sum.add(c.multiply(k[i])),q(0)).multiply(q(1,4)));
   expect(String(e(data,"embeddedstate").values[0])).toBe(String(embedded));
   expect(String(e(data,"localerrorestimate"))).toBe(String(k[6].subtract(embedded).abs()));
   expect(v(e(solution,"work"),"rhsevaluations")).toBe(13n);expect(e(solution,"certified")).toBeNull();
   expect(v(e(solution,"errormodel"),"globalestimate")).toBe("notCertified");
 });
 test("embedded provider handles backward time, events, stiff failure and retained partial prefixes",()=>{
   const result=run(`back:=.ode.IVP(t^3,1,1/4,1:0).DormandPrince({= initialSteps=2 });
      p:=.ode.IVP(.calculus.Constant(1),0,0,0:1).DormandPrince({= initialSteps=4,maxAttempts=1 });
      event:=.ode.IVP(.calculus.Constant(1),0,0,0:1).DormandPrince().IsolateEvents(.ode.Event(y-1/2));
      stiff:=.ode.IVP(-1000*y,0,1,0:1).DormandPrince({= initialSteps=1,maxRejected=2,tolerance=1/1000000 });
      [back,p,event,stiff];`);
   const [back,p,event,stiff]=result.values;
   expect(String(e(back,"finalstate").values[0])).toBe("0");
   expect(String(e(p,"coveredinterval"))).toBe("0:1/4");expect(e(p,"points").values).toHaveLength(2);
   expect(String(e(e(p,"unresolved").values[0],"interval"))).toBe("1/4:1");
   expect(v(e(stiff,"work"),"stopreason")).toBe("rejectionBudgetExhausted");
   expect(String(e(e(stiff,"unresolved").values[0],"interval"))).toBe("0:1");
   expect(v(event.values[0],"evidencelevel")).toBe("observed");
   expect(()=>run('.ode.IVP(y,0,1:2,0:1).DormandPrince();')).toThrow("point initial state");
   expect(()=>run('.ode.IVP(y,0,1,0:1).DormandPrince({= maxAttempts=4097 });')).toThrow("4096");
 });
 test("time models enclose every interval-coefficient polynomial, with checked fallback",()=>{
   const result=run(`a:=.ode.TimePolynomialRange([0,0,1/2,-1/3],0:1);b:=.ode.TimePolynomialRange([0,0,1/2,-1/3],0:1,{= mode=:affine,subintervals=4 });
     c:=.ode.TimePolynomialRange([0,1:2,-1],0:1);d:=.ode.TimePolynomialRange([0,0,1/2,-1/3],0:1,{= maxTerms=2 });
     [a,b,c,d,.ode.CheckTimePolynomialRange(a),.ode.CheckTimePolynomialRange(a.Set("range",0:0))];`);
   const [a,b,c,d,check,tampered]=result.values;
   expect(e(e(e(a,"partitions").values[0],"evidence"),"bernsteincoefficients").values.map(String)).toEqual(["0:0","0:0","1/6:1/6","1/6:1/6"]);
   expect(String(e(a,"range"))).toBe("0:1/6");expect(v(d,"status")).toBe("budgetExceeded");
   expect(v(d,"certified")).toBe(1n);expect(e(d,"applied")).toBeNull();
   for(let i=0;i<=24;i++){
     const x=q(i,24),square=x.multiply(x),cube=square.multiply(x),value=square.divide(q(2)).subtract(cube.divide(q(3)));
     for(const model of [a,b,d])expect(e(model,"range").containsValue(value)).toBe(true);
     for(const coefficient of [q(1),q(3,2),q(2)])expect(e(c,"range").containsValue(coefficient.multiply(x).subtract(square))).toBe(true);
   }
   expect(check.value).toBe(1n);expect(tampered).toBeNull();
 });
 test("Taylor time dependency control retains certified interval-state flow and budget fallbacks",()=>{
   const result=run(`p:=.ode.IVP(t-t^2,0,0:1/10,0:1);a:=p.ValidatedTaylor({= order=4,steps=1,maxSubintervals=1,dependencyModel=:polynomial });
      b:=p.ValidatedTaylor({= order=4,steps=1,maxSubintervals=1,dependencyModel=:affine,maxModelTerms=2 });[a,b,a.At(1/2)];`);
   const [a,b,at]=result.values;
   expect(v(a,"certified")).toBe(1n);expect(v(b,"certified")).toBe(1n);
   for(const solution of [a,b]){
     const final=e(solution,"finalstate").values[0];expect(final.containsValue(q(1,6))).toBe(true);expect(final.containsValue(q(4,15))).toBe(true);
   }
   expect(at.containsValue(q(1,12))).toBe(true);
   expect(v(e(e(b,"segments").values[0],"dependencymodels").values[0],"status")).toBe("budgetExceeded");
 });
 test("boundary shooting proves a parameter root, retains singular/boundary/unfinished regions and replays",()=>{
   const result=run(`b:=.ode.BVP([v,.calculus.Constant(0)],0,[.calculus.Constant(0),s],0:1,y-1,{= s=0:2 },{= stateNames=[:y,:v] });
     r:=.ode.Shoot(b,{= order=3,boxOptions={= maxBoxes=1 },flowOptions={= order=3,steps=2,maxSubintervals=1 } });
     singular:=.ode.Shoot(.ode.BVP(.calculus.Constant(0),0,s^2,0:1,y,{= s=(-1):1 }),{= boxOptions={= maxBoxes=1 } });
     boundary:=.ode.Shoot(.ode.BVP(.calculus.Constant(0),0,s,0:1,y,{= s=0:1 }),{= boxOptions={= maxBoxes=1 } });
     unknown:=.ode.Shoot(.ode.BVP(y,0,s,0:1,y-2,{= s=0:3 }));
     [r,.ode.CheckShooting(r),.ode.CheckShooting(r.Set("status",:unresolved)),singular,boundary,unknown];`);
   const [r,check,tampered,singular,boundary,unknown]=result.values;
   expect(e(r,"unique").values).toHaveLength(1);expect(check.value).toBe(1n);expect(tampered).toBeNull();
   expect(v(e(e(r,"trajectories").values[0],"flow"),"certified")).toBe(1n);
   // Exact terminal map y(1)=s for y''=0; evaluate independently at endpoints/interior.
   const expr=e(e(r,"terminalmap"),"terminal").values[0];
   for(const value of [0,1,2]){
     const context=new Context();context.set('terminal',expr);
     expect(String(parseAndEvaluate(`.Plugin.Load("calculus");.calculus.Evaluate(terminal,{= s=${value} });`,{context}))).toBe(String(value));
   }
   for(const partial of [singular]) {
     expect(e(partial,"unique").values).toHaveLength(0);expect(e(partial,"unresolved").values.length).toBeGreaterThan(0);
     const boxes=e(partial,"unresolved").values.map(node=>e(e(node,"box"),"axes").entries.get("s"));
     for(const point of [q(0),q(1)])expect(boxes.some(box=>box.containsValue(point))).toBe(true);
   }
   expect(e(boundary,"unique").values).toHaveLength(1);
   const proof=e(e(boundary,"subdivision"),"nodes").values[0];
   expect(e(e(e(proof,"result"),"trace").values[0],"verifiedboundaryroot").values.map(String)).toEqual(["0"]);
   expect(v(unknown,"status")).toBe("unresolved");expect(String(e(e(unknown,"unresolved").values[0],"box").entries.get("s"))).toBe("0:3");
 },60000);
});


test("ODE increment work limits and unsupported families reject or preserve complete input",()=>{
 const result=run(`
   unsupported:=.ode.IVP(1/y,0,1,0:1).Exact();
   negative:=.ode.IVP(y^(-1),0,1,0:1).Exact();
   finite:=.ode.IVP(-1000*y,0,1,0:1).DormandPrince({= initialSteps=1,minimumStep=3/4 });
   bad:=.ode.IVP(1/y,0,0,0:1).DormandPrince();
   absent:=.ode.Shoot(.ode.BVP(.calculus.Constant(0),0,s+1,0:1,y,{= s=0:2 }),{= boxOptions={= maxBoxes=1 } });
   partial:=.ode.Shoot(.ode.BVP(.calculus.Constant(0),0,s^2-1,0:1,y,{= s=(-2):2 }),{= boxOptions={= maxBoxes=1 } });
   [unsupported,negative,finite,bad,absent,partial];`);
 const [unsupported,negative,finite,bad,absent,partial]=result.values;
 expect(v(unsupported,"status")).toBe("unsupported");expect(v(negative,"status")).toBe("unsupported");
 expect(v(e(finite,"work"),"stopreason")).toBe("minimumStepReached");
 expect(v(e(bad,"work"),"stopreason")).toBe("rhsOrArithmeticBudgetFailure");
 expect(v(e(bad,"work"),"attemptedsteps")).toBe(1n);expect(String(e(e(bad,"unresolved").values[0],"interval"))).toBe("0:1");
 expect(e(absent,"excluded").values).toHaveLength(1);expect(e(absent,"unique").values).toHaveLength(0);
 expect(e(partial,"pending").values).toHaveLength(2);
 const boxes=e(partial,"unresolved").values.map(node=>e(e(node,"box"),"axes").entries.get("s"));
 for(let i=-4;i<=4;i++)expect(boxes.some(box=>box.containsValue(q(i,2)))).toBe(true);
 expect(()=>run('.ode.TimePolynomialRange([0,1],0:1,{= subintervals=17 });')).toThrow("16");
 expect(()=>run('.ode.TimePolynomialRange([0,1],0:1,{= mode=:unknown });')).toThrow("dependency mode");
 expect(()=>run('.ode.IVP([v,y],0,[0,0],0:1,{= stateNames=["Y","y"] });')).toThrow("distinct");
 expect(()=>run('b:=.ode.BVP(.calculus.Constant(0),0,s,0:1,y,{= s=0:2 });.ode.Shoot(b,{= boxOptions={= maxBoxes=257 } });')).toThrow("256");
});

test("new providers preserve complete async/sync evidence",async()=>{
 const code=source+`b:=.ode.BVP(.calculus.Constant(0),0,s,0:1,y-1,{= s=0:2 });
   [.ode.IVP(t^3,0,0,0:1).DormandPrince({= initialSteps=2 }),
    .ode.IVP(y+t,0,1,0:1).Exact(),
    .ode.TimePolynomialRange([0,0,1/2,-1/3],0:1),
    .ode.Shoot(b,{= order=2,boxOptions={= maxBoxes=1 },flowOptions={= order=2,steps=1,maxSubintervals=1 } })];`;
 const sync=parseAndEvaluate(code,{context:new Context()});
 const asyncValue=await parseAndEvaluateAsync(code,{context:new Context()});
 expect(validatedClaimKey(asyncValue)).toBe(validatedClaimKey(sync));
},60000);

test("ODE methods use existing script capabilities without host permissions",()=>{
 const root=path.resolve(import.meta.dir,"../../../tmp");mkdirSync(root,{recursive:true});const directory=mkdtempSync(path.join(root,"m3-permission-"));
 try {
   writeFileSync(path.join(directory,"ode.rix"),'.Plugin.Load("ode");t:=.calculus.Variable(:t);.ode.IVP(t,0,0,0:1).DormandPrince({= initialSteps=1 })[:finalState][1];');
   const invoke=(policy)=>{const context=new Context();context.setEnv(HOST_ADAPTER_ENV,createNodeHostAdapter());context.setEnv("scriptBaseDir",directory);
     const options={context,registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()};
     return parseAndEvaluate(`<"ode" /${policy}/>`,options);};
   expect(String(invoke("+Plugins,-Files,-Net"))).toBe("1/2");
   expect(()=>invoke("-All,+Core")).toThrow();
 }finally{rmSync(directory,{recursive:true,force:true});}
});
