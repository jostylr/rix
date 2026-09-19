import {describe,expect,test} from 'bun:test';
import {Rational,RationalInterval} from '@ratmath/core';
import {Context,parseAndEvaluate} from '../../src/index.js';
import {evaluateImplicitRegion,checkImplicitRegion,refineImplicitRegion} from '../../src/runtime/implicit-region.js';
import {validatedClaimKey,validatedClaimCost} from '../../src/runtime/validated-boxes.js';
const q=n=>new Rational(BigInt(n));
const f=(value,key)=>value.entries.get(key.toLowerCase());
const run=source=>parseAndEvaluate('.Plugin.Load("calculus");x:=.calculus.Variable(:x);y:=.calculus.Variable(:y);z:=.calculus.Variable(:z);w:=.calculus.Variable(:w);'+source,{context:new Context()});
const problem=(expression,box='{= x=(-1):1,y=(-1):1,z=(-1):1 }')=>run(`[${expression},${box}];`).values;
function checkCover(result){
 const nodes=new Map([...result.nodes,...result.pending].map(n=>[n.id,n]));
 for(const parent of result.nodes)if(parent.action==='split'){
  const [a,b]=parent.children.map(id=>nodes.get(id));expect(a&&b).toBeTruthy();
  for(const axis of result.variables)expect(a.box.axes.get(axis).union(b.box.axes.get(axis)).equals(parent.box.axes.get(axis))).toBe(true);
  expect(a.box.axes.get(parent.axis).toRationalInterval().high.equals(b.box.axes.get(parent.axis).toRationalInterval().low)).toBe(true);
 }
 const leaves=[...result.inside,...result.excluded,...result.unresolved];
 expect(new Set(leaves.map(n=>n.id)).size).toBe(leaves.length);
 expect(checkImplicitRegion(result).accepted).toBe(true);
 return leaves;
}
describe('bounded implicit whole-box covers',()=>{
 test('whole-range classifications replay without midpoint or topology claims',()=>{
  const none=evaluateImplicitRegion(...problem('x^2+y^2+z^2+1'));expect(none.excluded).toHaveLength(1);expect(none.status).toBe('complete');checkCover(none);
  const all=evaluateImplicitRegion(...problem('x^2+y^2+z^2-4'),{relation:'le'});expect(all.inside).toHaveLength(1);checkCover(all);
  const zero=evaluateImplicitRegion(...problem('.calculus.Constant(0)'));expect(zero.inside).toHaveLength(1);expect(zero.topology).toBe('unproved');
  const boundary=evaluateImplicitRegion(...problem('x','{= x=0:1 }'),{maxDepth:0});expect(boundary.unresolved[0].classification).toBe('boundaryUnknown');expect(boundary.inside).toHaveLength(0);
  const singular=evaluateImplicitRegion(...problem('x^2+y^2+z^2'),{maxCells:7});expect(singular.unresolved.length).toBeGreaterThan(0);expect(singular.topology).toBe('unproved');checkCover(singular);
  const invalid=evaluateImplicitRegion(...problem('1/x+y'),{maxCells:5});expect(invalid.certified).toBe(false);expect(invalid.unresolved[0].classification).toBe('domainOrRangeUnknown');checkCover(invalid);
 });
 test('deterministic full-box splitting preserves every pending region and boundary point',()=>{
  const input=problem('x+y+z');const a=evaluateImplicitRegion(...input,{maxCells:15,maxDepth:4,maxWidth:q(0)});const leaves=checkCover(a);
  expect(validatedClaimKey(a)).toBe(validatedClaimKey(evaluateImplicitRegion(...input,{maxCells:15,maxDepth:4,maxWidth:q(0)})));
  for(const x of [-1,0,1])for(const y of [-1,0,1])for(const z of [-1,0,1])expect(leaves.some(n=>['x','y','z'].every((axis,i)=>n.box.axes.get(axis).containsValue(q([x,y,z][i]))))).toBe(true);
  const zero=evaluateImplicitRegion(...input,{maxCells:0});expect(zero.pending).toHaveLength(1);expect(zero.unresolved).toHaveLength(1);checkCover(zero);
  const more=refineImplicitRegion(zero,{maxCells:15,maxWidth:q(0)});expect(more.work.processed).toBe(15);checkCover(more);
  expect(()=>refineImplicitRegion(zero,{relation:'le'})).toThrow('OnlyChangeWorkLimits');
 });
 test('changed classifications, ranges, cover, and proof are independently rejected',()=>{
  const a=evaluateImplicitRegion(...problem('x+y+z'),{maxCells:1});
  for(const tampered of [{...a,pending:[]},{...a,unresolved:[]},{...a,nodes:[{...a.nodes[0],range:new RationalInterval(q(99),q(100))}]},{...a,nodes:[{...a.nodes[0],splitAt:q(99)}]},{...a,evidence:{...a.evidence,expression:problem('x+9')[0]}}])expect(checkImplicitRegion(tampered).accepted).toBe(false);
  expect(()=>refineImplicitRegion({...a,pending:[]})).toThrow('Unchecked');
 });
 test('affine sections substitute all variables simultaneously and retain section identity',()=>{
  const [expression]=problem('x^2+y^2+z^2+w^2-1');const source=run('{= u=(-1):1,v=(-1):1 };');
  const affine={variables:['x','y','z','w'],matrix:[[1,0],[0,1],[0,0],[0,0]],offset:[0,0,0,2]};
  const sliced=evaluateImplicitRegion(expression,source,{affine});expect(sliced.excluded).toHaveLength(1);checkCover(sliced);
  const swap=evaluateImplicitRegion(...problem('x-y','{= x=0:1,y=2:3 }'),{affine:{variables:['x','y'],matrix:[[0,1],[1,0]],offset:[0,0]}});expect(swap.nodes[0].range.toString()).toBe('1:3');
  expect(()=>evaluateImplicitRegion(expression,source,{affine:{...affine,matrix:[[1]]}})).toThrow('DimensionMismatch');
 });
 test('aggregate evidence, rational digits, dimensions, depth, and work are bounded',()=>{
  const input=problem('x+y+z');const limited=evaluateImplicitRegion(...input,{maxCells:255,maxDepth:10,maxWidth:q(0),maxEvidenceText:18000});
  expect(limited.work.outputExhausted).toBe(true);expect(limited.pending.length).toBeGreaterThan(0);expect(validatedClaimCost(limited).text).toBeLessThanOrEqual(18000);checkCover(limited);
  expect(()=>evaluateImplicitRegion(...input,{maxEvidenceText:10})).toThrow('InputEvidenceBudgetExceeded');
  expect(()=>evaluateImplicitRegion(...input,{maxCells:4097})).toThrow('OutOfRange');expect(()=>evaluateImplicitRegion(...input,{maxDepth:65})).toThrow('OutOfRange');expect(()=>evaluateImplicitRegion(...input,{maxWidth:q(-1)})).toThrow('Nonnegative');
  expect(()=>evaluateImplicitRegion(input[0],new Map(Array.from({length:9},(_,i)=>[`x${i}`,new RationalInterval(q(0),q(1))])))).toThrow('ExceedsEight');
  expect(()=>evaluateImplicitRegion(...input,{level:new Rational(10n**4097n)})).toThrow('DigitBudgetExceeded');
  const cyclic={};cyclic.cycle=cyclic;expect(()=>evaluateImplicitRegion(...input,cyclic)).toThrow();
 });
 test('public facades replay and refine the same bounded cover',()=>{
  const result=run('.Plugin.Load("nd");r:=.nd.ImplicitRegion(x+y+z,{= x=(-1):1,y=(-1):1,z=(-1):1 },{= maxCells=0 });[.nd.CheckRegion(r)[:accepted],.nd.RefineRegion(r,{= maxCells=1 })[:work][:processed]];');expect(result.values.map(v=>v.value)).toEqual([1n,1n]);
 });
});

test('script permissions gate native region replay and linked Graphics composition',async()=>{
 const {mkdirSync,mkdtempSync,writeFileSync,rmSync}=await import('node:fs');const path=await import('node:path');
 const {createNodeHostAdapter}=await import('../../src/runtime/host-adapter-node.js');const {HOST_ADAPTER_ENV}=await import('../../src/runtime/host-adapter.js');
 const {createDefaultRegistry,createDefaultSystemContext}=await import('../../src/index.js');
 const root=path.resolve(import.meta.dir,'../../../tmp');mkdirSync(root,{recursive:true});const directory=mkdtempSync(path.join(root,'m4-permissions-'));
 try{
  writeFileSync(path.join(directory,'check.rix'),'.ImplicitRegionCheck({= })[:reason];');
  writeFileSync(path.join(directory,'panels.rix'),'.LinkedViews([.Graphics.Graphic([10,10],[])],[]);');
  const execute=(name,policy)=>{const context=new Context();context.setEnv(HOST_ADAPTER_ENV,createNodeHostAdapter());context.setEnv('scriptBaseDir',directory);return parseAndEvaluate(`<"${name}" /${policy}/>`,{context,registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()});};
  expect(execute('check','-All,+Core,+Geometry').value).toBe('unsupportedImplicitRegionEvidence');expect(()=>execute('check','-All,+Core')).toThrow('IMPLICITREGIONCHECK');
  expect(execute('panels','-All,+Core,+Graphics').kind).toBe('graphic');expect(()=>execute('panels','-All,+Core')).toThrow('LINKEDVIEWS');
 }finally{rmSync(directory,{recursive:true,force:true});}
});
