import {expect,test} from 'bun:test';
import {parseAndEvaluate,parseAndEvaluateAsync,formatValue} from '../../src/index.js';
const prefix='.Plugin.Load("cas");x:=.calculus.Variable(:x);Sin:=.calculus.Sin();Cos:=.calculus.Cos();Sqrt:=.calculus.Sqrt();Exp:=.calculus.Exp();Abs:=.calculus.Abs();';
const run=s=>parseAndEvaluate(prefix+s);
const show=s=>formatValue(run(s));
const get=(v,k)=>v.entries instanceof Map ? v.entries.get(k.toLowerCase()) : v[k];
const txt=v=>v?.value??v;
const number=v=>{const [a,b='1']=String(v).split('/');return Number(a)/Number(b)};
function evaluate(g,x){
 const kind=txt(get(g,'kind'));if(kind==='constant')return number(get(g,'value'));if(kind==='variable')return x;
 const children=(get(g,kind==='apply'?'arguments':'operands')?.values??[]).map(v=>evaluate(v,x));const [a,b]=children;
 if(kind==='apply'){
  const fn={'rix.function.sin@1':Math.sin,'rix.function.cos@1':Math.cos,'rix.function.exp@1':Math.exp,'rix.function.log.real-principal@1':Math.log,'rix.function.sqrt.real-principal@1':Math.sqrt,'rix.function.asin.real-principal@1':Math.asin,'rix.function.abs.real@1':Math.abs}[txt(get(g,'semanticId'))];
  if(!fn)throw Error('Unhandled test function');return fn(a);
 }
 return ({add:()=>a+b,subtract:()=>a-b,multiply:()=>a*b,divide:()=>a/b,negate:()=>-a,power:()=>a**b})[txt(get(g,'operation'))]();
}
test('mixed trig primitives differentiate to original functions for odd and even cases',()=>{
 for(const [source,f] of [
  ['Sin(x)^2*Cos(x)^3',x=>Math.sin(x)**2*Math.cos(x)**3],
  ['Cos(x)^4*Sin(x)^3',x=>Math.cos(x)**4*Math.sin(x)**3],
  ['Sin(2*x+1)^2*Cos(2*x+1)^2',x=>Math.sin(2*x+1)**2*Math.cos(2*x+1)**2],
  ['Sin(x)^4*Cos(x)^4',x=>Math.sin(x)**4*Math.cos(x)**4]
 ]){
  const result=run(`r:=.cas.Integrate(${source});[r,.calculus.DifferentiateResult(r[:antiderivative],:x),.cas.CheckIntegral(r)];`).values;
  expect(txt(get(result[0],'status'))).toBe('complete');expect(txt(get(result[2],'accepted'))).toBe(1n);
  for(const x of [-0.7,0.1,0.6])expect(evaluate(get(result[1],'expression'),x)).toBeCloseTo(f(x),9);
 }
 expect(show('r:=.cas.Integrate(Sin(x)^6*Cos(x)^4);[r[:status],r[:reason]];')).toBe('[unsupported, mixedTrigonometricDegreeBudgetExceeded]');
});
test('quadratic radical primitives preserve open domains and agree with independent numerical derivatives',()=>{
 for(const [source,f,points] of [
  ['Sqrt(4-x^2)',x=>Math.sqrt(4-x*x),[-1,0.2,1]],
  ['1/Sqrt(4-x^2)',x=>1/Math.sqrt(4-x*x),[-1,0.2,1]],
  ['Sqrt(2*x^2+4*x+4)',x=>Math.sqrt(2*x*x+4*x+4),[-2,0,1]],
  ['1/Sqrt(x^2+1)',x=>1/Math.sqrt(x*x+1),[-2,0,1]],
  ['Sqrt(x^2-4)',x=>Math.sqrt(x*x-4),[-3,3,4]],
  ['1/Sqrt(x^2-4)',x=>1/Math.sqrt(x*x-4),[-3,3,4]],
  ['Sqrt(x^2)',x=>Math.abs(x),[-2,0.5,3]]
 ]){
  const result=run(`r:=.cas.Integrate(${source});[r,.cas.CheckIntegral(r)];`).values;
  expect(txt(get(result[0],'status'))).toBe('complete');expect(txt(get(result[1],'accepted'))).toBe(1n);
  const g=get(result[0],'antiderivative');for(const x of points){const h=1e-5;expect((evaluate(g,x+h)-evaluate(g,x-h))/(2*h)).toBeCloseTo(f(x),6);}
 }
 expect(show('r:=.cas.Integrate(Sqrt(-x^2-1));[r[:status],r[:reason]];')).toBe('[unsupported, noRealQuadraticRadicalInterior]');
 expect(show('r:=.cas.Integrate(Sqrt(x^3+1));r[:status];')).toBe('unsupported');
});
test('integral replay rejects erased obligations and forged rule evidence',()=>{
 expect(show('r:=.cas.Integrate(1/x);.cas.CheckIntegral(r.Set("obligations",[]))[:accepted];')).toBe('_');
 expect(show('r:=.cas.Integrate(Sqrt(x^2+1));.cas.CheckIntegral(r.Set("rules",[]))[:accepted];')).toBe('_');
});
test('definite integrals honor exact endpoints, oriented intervals and odd centered symmetry',()=>{
 expect(show('r:=.cas.Definite(x^2,:x,0,1);[r[:status],r[:value],.cas.CheckDefinite(r)];')).toBe('[exact, 1/3, 1]');
 expect(show('r:=.cas.Definite(x^2,:x,1,0);r[:value];')).toBe('-1/3');
 expect(show('r:=.cas.Definite((x-2)^3,:x,1,3);[r[:value],r[:method],r[:parity]];')).toBe('[0, intervalSymmetry, odd]');
 expect(show('r:=.cas.Definite(1/x,:x,-1,1);[r[:status],r[:certified],r[:unresolved].Len()];')).toBe('[unresolved, _, 1]');
 expect(show('r:=.cas.Definite(x,:x,0,0);[r[:value],r[:status]];')).toBe('[0, exact]');
});
test('certified quadrature and explicitly approximate fallback remain distinct and bounded',()=>{
 const r=run('r:=.cas.Definite(Exp(-x^2),:x,0,1,{= panels=8,tolerance=1/10000 });[r,.cas.CheckDefinite(r)];').values;
 expect(txt(get(r[0],'status'))).toBe('certified');expect(txt(get(r[0],'certified'))).toBe(1n);
 const interval=get(r[0],'interval');expect(number(interval.low)).toBeLessThan(0.746824133);expect(number(interval.high)).toBeGreaterThan(0.746824133);
 expect(get(r[0],'goalmet')).toBeNull();expect(txt(r[1])).toBe(1n);
 expect(show('r:=.cas.Definite(Exp(-x^2),:x,0,1,{= panels=4,fallback=:approximate });[r[:status],r[:certified],r[:interval],r[:candidate]>0,.cas.CheckDefinite(r)];')).toBe('[approximate, _, _, 1, 1]');
 expect(show('r:=.cas.Definite(Sin(x^2),:x,-1,1,{= panels=4 });[r[:status],r[:parity],r[:symmetryFactor],.cas.CheckDefinite(r)];')).toBe('[certified, even, 2, 1]');
 expect(()=>run('.cas.Definite(x,:x,0,1,{= panels=300 });')).not.toThrow(); // Exact path needs no panel allocation.
 expect(()=>run('.cas.Definite(Sin(x^2),:x,0,1,{= panels=300 });')).toThrow('panels');
 expect(show('r:=.cas.Definite(x^2,:x,0,1);.cas.CheckDefinite(r.Set("value",7));')).toBe('_');
});
test('closed elementary range services check domains and reject altered enclosures',()=>{
 expect(show('r:=.numerics.GraphRange(Sqrt(x),{= x=1:4 });[r[:certified],r[:interval],.numerics.CheckGraphRange(r)[:accepted]];')).toBe('[1, 1:2, 1]');
 expect(show('r:=.numerics.GraphRange(Sqrt(x),{= x=(-1):1 });[r[:certified],r[:domainstatus]];')).toBe('[_, unresolved]');
 expect(show('r:=.numerics.GraphRange(.calculus.Log()(x),{= x=0:1 });r[:certified];')).toBe('_');
 expect(show('r:=.numerics.GraphRange(Abs(x),{= x=(-2):1 });r[:interval];')).toBe('0:2');
});
test('course rewrites retain local assumptions, singular holes and replayable piecewise domains',()=>{
 expect(show('r:=.cas.Rewrite(Abs(x),:absNonnegative,[.calculus.Obligation(:domain,:nonnegative,x)]);[r[:status],r[:certified],.cas.CheckRewrite(r)];')).toBe('[assumed, _, 1]');
 for(const [src,rule] of [['Sqrt(x^2)','sqrtSquare'],['(x^2)^3','nestedIntegerPower'],['Sin(x)^2+Cos(x)^2','trigPythagorean'],['x/x','cancelSelf'],['x*(x+1)/x','cancelFactor']]){
  expect(show(`r:=.cas.Rewrite(${src},:${rule});[r[:status],.cas.CheckRewrite(r),.cas.CheckRewrite(r.Set("obligations",[]))];`)).toBe('[conditional, 1, _]');
 }
 expect(show('r:=.cas.Rewrite(x/x,:cancelSelf);r[:excludedZeros].Len();')).toBe('1');
 expect(show('d:=.cas.AbsDomain(x);[d[:branches].Len(),d[:branches][2][:relation],.cas.CheckDomain(d)];')).toBe('[2, lt, 1]');
 expect(()=>run('.cas.Rewrite(Sin(x)^2+Cos(x+1)^2,:trigPythagorean);')).toThrow('matching');
 expect(()=>run('.cas.Rewrite((x^9)^2,:nestedIntegerPower);')).toThrow('between');
});
test('equation problems are inert and declared opaque derivative providers stay unverified',()=>{
 expect(show('p:=.calculus.DifferentialProblem([-x],:t,[:x],{= domain=0:1 });b:=.calculus.BoundaryProblem(p,[{= at=0,expression=x-1 }]);i:=.calculus.IntegralEquation("u",x,:t,0,1,x);[p[:execution],b[:verification],i[:solver]];')).toBe('[inert, unverified, unavailable]');
 const result=run('F:=.calculus.Function("course.f");D:=.calculus.Function("course.df");claim:=.calculus.DerivativeDeclaration("course.f","course.df",0:1,(-2):2);.calculus.UseDeclaredDerivative(F,D,claim);r:=.calculus.DifferentiateResult(F(x),:x);[claim,r,.numerics.CheckDerivativeGraph(r)];').values;
 expect(get(result[0],'certified')).toBeNull();expect(txt(get(result[0],'execution'))).toBe('inert');
 expect(String(get(get(get(result[1],'obligations').values[0],'evidence'),'interval'))).toBe('0:1');
 expect(get(result[2],'accepted')).toBeNull();
 expect(()=>run('p:=.calculus.DifferentialProblem([-x],:t,[:x],{= domain=0:1 });.calculus.BoundaryProblem(p,[{= at=2,expression=x }]);')).toThrow('outside');
 expect(()=>run('.calculus.DifferentialProblem([-x],:x,[:x]);')).toThrow('distinct');
 expect(()=>run('F:=.calculus.Function("f");D:=.calculus.Function("d");c:=.calculus.DerivativeDeclaration("f","d",0:1,0:1);.calculus.UseDeclaredDerivative(F,D,c.Set("certified",1));')).toThrow('Altered');
});
test('new integration rules and replay work in the async evaluator',async()=>{
 const r=await parseAndEvaluateAsync(prefix+'r:=.cas.Integrate(Sin(x)^2*Cos(x)^3);[r[:status],.cas.CheckIntegral(r)[:accepted]];');expect(formatValue(r)).toBe('[complete, 1]');
},120000);
