import {expect,test} from 'bun:test';
import {parseAndEvaluate,formatValue} from '../../src/index.js';
const run=s=>parseAndEvaluate('.Plugin.Load("optimize");'+s);
const show=s=>formatValue(run(s));
const val=(x,k)=>x.entries.get(k.toLowerCase());
const text=x=>x?.value??x;

test('integer optimum agrees with exhaustive exact feasible grid and deterministic replay',()=>{
  const result=run('p:=.optimize.LinearProgram([3,2],[2,1;1,2],[7,7]);r:=.optimize.MixedInteger(p,[1,2]);[r,.optimize.CheckMixedInteger(r)];');
  const r=result.values[0];let best=-Infinity;
  for(let x=0;x<8;x++)for(let y=0;y<8;y++)if(2*x+y<=7&&x+2*y<=7)best=Math.max(best,3*x+2*y);
  expect(text(val(r,'status'))).toBe('optimal');expect(Number(String(val(r,'objectiveValue')))).toBe(best);
  expect(String(val(r,'gap'))).toBe('0');expect(String(result.values[1])).toBe('1');
});
test('mixed continuous coordinates and negative free integer variables stay exact',()=>{
 expect(show('p:=.optimize.LinearProgram([1,1],{:1x2: 2,1},[5/2],{= upperBounds=[_,1] });r:=.optimize.MixedInteger(p,[1]);[r[:solution],r[:objectiveValue]];')).toBe('[{:2: 1, 1/2 }, 1..1/2]');
 expect(show('p:=.optimize.LinearProgram([1],{:1x1: 2},[-3],{= relations=[:ge],sense=:min,lowerBounds=[_] });r:=.optimize.MixedInteger(p,[1]);[r[:solution],r[:objectiveValue]];')).toBe('[{:1: -1 }, -1]');
});
test('integer infeasibility and scaled integral recession rays are checked',()=>{
 expect(show('p:=.optimize.LinearProgram([1],{:1x1: 2},[1],{= relations=[:eq] });r:=.optimize.MixedInteger(p,[1]);[r[:status],.optimize.CheckMixedInteger(r)];')).toBe('[infeasible, 1]');
 expect(show('p:=.optimize.LinearProgram([1,0],{:1x2: 2,-1},[0],{= relations=[:eq] });r:=.optimize.MixedInteger(p,[1,2]);[r[:status],r[:ray][:direction],.optimize.CheckMixedInteger(r)];')).toBe('[unbounded, [1, 2], 1]');
});
test('node exhaustion retains the exact queue and resumption matches fresh work',()=>{
 expect(show('p:=.optimize.LinearProgram([1,1],[2,1;1,2],[4,4]);r:=.optimize.MixedInteger(p,[1,2],{= maxNodes=1 });s:=.optimize.ResumeMixedInteger(r,6);[r[:status],r[:pending].Len(),r[:bound],s[:status],.optimize.CheckMixedInteger(s),.ValidatedClaimEqual(s,.optimize.MixedInteger(p,[1,2],{= maxNodes=7 }))];')).toBe('[exhausted, 2, 2..2/3, optimal, 1, 1]');
});
test('iteration exhaustion stays unresolved and altered claims cannot resume',()=>{
 expect(show('p:=.optimize.LinearProgram([1,1],[2,1;1,2],[4,4]);r:=.optimize.MixedInteger(p,[1,2],{= maxIterations=1 });[r[:status],r[:unresolved].Len(),r[:certified],.optimize.CheckMixedInteger(r)];')).toBe('[exhausted, 1, _, 1]');
 expect(show('p:=.optimize.LinearProgram([1],{:1x1: 1},[2]);r:=.optimize.MixedInteger(p,[1]);.optimize.CheckMixedInteger(r.Set("objectiveValue",9));')).toBe('_');
 expect(()=>run('p:=.optimize.LinearProgram([1],{:1x1: 1},[2]);r:=.optimize.MixedInteger(p,[1]);.optimize.ResumeMixedInteger(r.Set("objectiveValue",9));')).toThrow('altered');
 for(const axes of ['[]','[0]','[1,1]','[1/2]'])expect(()=>run(`.optimize.MixedInteger(.optimize.LinearProgram([1],{:1x1: 1},[2]),${axes});`)).toThrow();
});
test('LP ray checking rejects a direction whose first step alone is feasible',()=>{
 expect(show('p:=.optimize.LinearProgram([1],{:1x1: 1},[1]);c:={= schema="rix.optimize.certificate@1",kind=:unbounded,program=p.Record(),point=[0],direction=[1] };.optimize.CheckCertificate(c);')).toBe('_');
});
test('convex quadratic exact KKT solution satisfies independently computed residuals',()=>{
 const result=run('q:=.optimize.Quadratic([2,0;0,2],[-2,-4],{:1x2: 1,1},[10],{= lowerBounds=[_,_] });r:=.optimize.SolveQuadratic(q);[r,.optimize.CheckQuadratic(r)];');
 const r=result.values[0], point=val(val(r,'kkt'),'point').values.map(x=>Number(String(x)));
 expect(point).toEqual([1,2]);expect([2*point[0]-2,2*point[1]-4]).toEqual([0,0]);
 expect(point[0]**2+point[1]**2-2*point[0]-4*point[1]).toBe(-5);expect(String(val(r,'objectiveValue'))).toBe('-5');expect(String(result.values[1])).toBe('1');
});
test('active bounds, equality constraints, and semidefinite Hessians',()=>{
 expect(show('q:=.optimize.Quadratic({:1x1: 2},[-4],{:1x1: 1},[1]);r:=.optimize.SolveQuadratic(q);[r[:status],r[:solution],r[:objectiveValue],r[:kkt][:residual],.optimize.CheckQuadratic(r)];')).toBe('[optimal, {:1: 1 }, -3, [0], 1]');
 expect(show('q:=.optimize.Quadratic([2,0;0,0],[-2,0],{:1x2: 1,1},[3],{= relations=[:eq] });r:=.optimize.SolveQuadratic(q);[r[:status],r[:solution],.optimize.CheckQuadratic(r)];')).toBe('[optimal, {:2: 1, 2 }, 1]');
});
test('quadratic infeasible, unbounded, nonconvex and exhausted results do not claim an optimum',()=>{
 expect(show('q:=.optimize.Quadratic({:1x1: 2},[0],{:1x1: 1},[-1]);r:=.optimize.SolveQuadratic(q);[r[:status],.optimize.CheckQuadratic(r)];')).toBe('[infeasible, 1]');
 expect(show('q:=.optimize.Quadratic({:1x1: 0},[-1],{:1x1: 1},[0],{= relations=[:ge] });r:=.optimize.SolveQuadratic(q);[r[:status],.optimize.CheckQuadratic(r)];')).toBe('[unbounded, 1]');
 expect(show('q:=.optimize.Quadratic({:1x1: -2},[0],{:1x1: 1},[1]);r:=.optimize.SolveQuadratic(q);[r[:status],r[:certified]];')).toBe('[unsupportedNonconvex, _]');
 expect(show('q:=.optimize.Quadratic({:1x1: 2},[-4],{:1x1: 1},[1]);r:=.optimize.SolveQuadratic(q,{= maxActiveSets=1 });[r[:status],r[:certified],r[:pendingMasks].Len()];')).toBe('[unknown, _, 1]');
 expect(()=>run('.optimize.Quadratic([1,2;0,1],[0,0],{:1x2: 1,1},[1]);')).toThrow('symmetric');
});
test('nonlinear box proof distinguishes optimum, infeasible, and open-bound infimum',()=>{
 expect(show('.Plugin.Load("calculus");x:=.calculus.Variable(:x);r:=.optimize.Nonlinear(x^2,[],{= x=(-1):1 });[r[:status],r[:lowerBound],r[:upperBound],.optimize.CheckNonlinear(r)];')).toBe('[optimal, 0, 0, 1]');
 expect(show('.Plugin.Load("calculus");x:=.calculus.Variable(:x);r:=.optimize.Nonlinear(x,[{= expression=x+1,relation=:le }],{= x=0:1 });[r[:status],.optimize.CheckNonlinear(r)];')).toBe('[infeasible, 1]');
 expect(show('.Plugin.Load("calculus");x:=.calculus.Variable(:x);r:=.optimize.Nonlinear(x,[{= expression=x,relation=:gt }],{= x=0:1 },{= maxBoxes=7,tolerance=1/10 });[r[:status],r[:lowerBound],r[:upperBound],r[:pending].Len(),r[:incumbent][:point][:x]>0,.optimize.CheckNonlinear(r)];')).toBe('[boundedGap, 0, 1/16, 2, 1, 1]');
});
test('nonlinear maximization, equality feasibility, unavailable ranges and depth limits retain evidence',()=>{
 expect(show('.Plugin.Load("calculus");x:=.calculus.Variable(:x);r:=.optimize.Nonlinear(-x^2,[],{= x=(-1):1 },{= sense=:max });[r[:status],r[:lowerBound],r[:upperBound]];')).toBe('[optimal, 0, 0]');
 expect(show('.Plugin.Load("calculus");x:=.calculus.Variable(:x);r:=.optimize.Nonlinear(x,[{= expression=x^2+1,relation=:eq }],{= x=(-1):1 });r[:status];')).toBe('infeasible');
 expect(show('.Plugin.Load("calculus");x:=.calculus.Variable(:x);r:=.optimize.Nonlinear(1/x,[],{= x=(-1):1 });[r[:status],r[:unresolved].Len(),r[:unresolved][1][:box][:x],r[:certified],.optimize.CheckNonlinear(r)];')).toBe('[exhausted, 1, -1:1, _, 1]');
 expect(show('.Plugin.Load("calculus");x:=.calculus.Variable(:x);r:=.optimize.Nonlinear(x,[],{= x=0:1 },{= maxDepth=1 });[r[:status],r[:pending].Len(),r[:unresolved].Len(),.optimize.CheckNonlinear(r.Set("lowerBound",1))];')).toBe('[exhausted, 0, 1, _]');
});
test('Solve reuses affine normalization for integer and quadratic requests and checks integer candidates',()=>{
 expect(show('.Plugin.Load("solve");r:=.solve.System({#:x,y# 2*x+y<=4;x+2*y<=4 },{= objective={= x=1,y=1 },integer=[:x,:y] });[r[:solution],r.Check(),r.Check({= x=1/2,y=1/2 })];')).toBe('[{= x=2, y=0 }, 1, _]');
 expect(show('.Plugin.Load("solve");r:=.solve.System({#:x# 2*x==1 },{= integer=[:x] });[r[:kind],r[:status],r.Check()];')).toBe('[empty, infeasible, 1]');
 expect(show('.Plugin.Load("solve");r:=.solve.System({#:x# x<=1 },{= objective={= x=-4 },hessian={:1x1: 2} });[r[:kind],r[:solution],r.Check()];')).toBe('[finite, {= x=1 }, 1]');
 expect(show('.Plugin.Load("solve");r:=.solve.System({#:x,y# 2*x+y<=4;x+2*y<=4 },{= objective={= x=1,y=1 },integer=[:x,:y],work={= maxNodes=1 } });r[:kind];')).toBe('unknown');
 expect(()=>run('.Plugin.Load("solve");.solve.System({#:x# x<1 },{= integer=[:x] });')).toThrow('closed affine');
});

test('Solve box dispatch checks the retained claim and rejects point-certification confusion',()=>{
 expect(show('.Plugin.Load("solve");.Plugin.Load("calculus");x:=.calculus.Variable(:x);r:=.solve.OptimizeBox(x^2,[],{= x=(-1):1 });[r[:status],.solve.Check(r)];')).toBe('[optimal, 1]');
 expect(()=>run('.Plugin.Load("solve");.Plugin.Load("calculus");x:=.calculus.Variable(:x);r:=.solve.OptimizeBox(x^2,[],{= x=(-1):1 });.solve.Check(r,{= x=0 });')).toThrow('supplied point');
 expect(()=>run('.optimize.Nonlinear(x->x^2,[],{= x=0:1 });')).toThrow();
 expect(show('q:=.optimize.Quadratic({:1x1: 2},[-4],{:1x1: 1},[1]);r:=.optimize.SolveQuadratic(q);.optimize.CheckQuadratic(r.Set("objectiveValue",0));')).toBe('_');
});
