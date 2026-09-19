import { expect, test } from 'bun:test';
import { Integer } from '@ratmath/core';
import { encodeMathematicalJSON,decodeMathematicalJSON } from '../../src/runtime/math-json.js';
import { Context, createDefaultRegistry, createDefaultSystemContext, parseAndEvaluate, formatValue } from '../../src/index.js';
const tensorTest=(name,body)=>test(name,body,30000);
const runtime=()=>({context:new Context(),registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()});
const prefix='.Plugin.Load("linalg");';
const run=source=>parseAndEvaluate(prefix+source);
const truth=value=>expect(value?.value).toBe(1n);
tensorTest('runtime identity tokens distinguish coincident numeric labels across contexts',()=>{
 const a=runtime(),b=runtime();
 const source='v:=.linalg.VectorSpace("V",2);e:=.linalg.Frame(v,"e",:defining);x:=.linalg.Vector([1,2],e);x;';
 const foreign=parseAndEvaluate(prefix+source,a);
 const local=parseAndEvaluate(prefix+source,b);
 expect(String(foreign.entries.get('identitykey'))).toBe(String(local.entries.get('identitykey')));
 b.context.set('foreign',foreign);
 const values=parseAndEvaluate('[x.SameTensor(foreign),x==foreign];',b).values;
 expect(values).toEqual([null,null]);
 expect(()=>parseAndEvaluate('x+foreign;',b)).toThrow('ordered VectorSpace');
 const imported=parseAndEvaluate('r:=.linalg.ImportGraph(.linalg.ExportGraph([x,foreign]));[r[1].SameTensor(r[2]),r[1]==r[2]];',b).values;
 expect(imported).toEqual([null,null]);
 expect(()=>parseAndEvaluate('r[1]+r[2];',b)).toThrow('ordered VectorSpace');
});
tensorTest('polynomial realizations preserve source identity across frames and distinguish ambient spaces',()=>{
 const values=run('a:=.linalg.PolynomialSpace(2,:x);b:=.linalg.PolynomialSpace(4,:x);p:=.p`x^2+2*x+3`;q:=.p`x^2+2*x+3`;e:=a.Frame();f:=.linalg.Frame(a[:space],{= relativeTo=e,basis=[1,1,0;0,1,1;0,0,1] });u:=a.Realize(p);w:=b.Realize(p);changed:=u.Transform(f);[u.SameSource(w),u.Vector().SameSource(w.Vector()),u.Vector().SameTensor(w.Vector()),u.SameSource(q),changed.SameSource(p),changed.Reconstruct()==p,a.Realize(p,f).Reconstruct()==p,p.__type,(u.Vector()+u.Vector()).SameSource(p)];').values;
 for(const i of [0,1,4,5,6])truth(values[i]);
 for(const i of [2,3,8])expect(values[i]).toBeNull();
 expect(values[7].value).toBe('Polynomial');
});
tensorTest('finite polynomial realizations check variables, bounds and Rational domains',()=>{
 for(const source of ['a:=.linalg.PolynomialSpace(2,:x);a.Realize(.p`y^2`);','a:=.linalg.PolynomialSpace(2,:x);a.Realize(.p`x^3`);','.linalg.PolynomialSpace(2,:x,{= over=:Float });'])expect(()=>run(source)).toThrow();
 const values=run('a:=.linalg.PolynomialSpace(3,:x);p:=.p`x^2+1`;q:=.p`- x^2+x`;[a.Realize(p+q).Vector()==a.Realize(p).Vector()+a.Realize(q).Vector(),a.Realize(2*p).Vector()==2*a.Realize(p).Vector(),a.Realize(p-p).Reconstruct()==p-p];').values;
 values.forEach(truth);
});
tensorTest('Rational field and finite coordinate-storage protocols reject implicit domain changes',()=>{
 const values=run('field:=.linalg.ScalarField();a:=.linalg.CoordinateStorage({:2x2: 1,2;3,4}.Permute({: 2,1}));[field.Contains(1/2),field.Contains(1:2),field.Add(1/2,1/3),a.Entries(),a.Get({: 2,1}),a.Materialize().Shape()];').values;
 truth(values[0]);expect(values[1]).toBeNull();expect(String(values[2])).toBe('5/6');expect(values[3].values.map(String)).toEqual(['1','3','2','4']);expect(String(values[4])).toBe('2');
 expect(()=>run('.linalg.ScalarField().Coerce(1:2);')).toThrow('exact Integer or Rational');
 expect(()=>run('.linalg.CoordinateStorage({:2: 1,2}).Materialize(1);')).toThrow('component budget');
});
const graphSetup='v:=.linalg.VectorSpace({= name="V",dimension=2,lineageLimit=2 });e:=.linalg.Frame(v,"e",:defining);f:=.linalg.Frame(v,{= name="f",relativeTo=e,basis=[1,1;0,1] });x:=.linalg.Vector([2,3],e);y:=x.Transform(f);';
tensorTest('graph round trips preserve sharing and exact maps while assigning fresh runtime identities',()=>{
 const values=run(graphSetup+'m:=.linalg.LinearMap(v,v,[2,0;0,3]);metric:=.linalg.Metric(e,[1,0;0,1]);g:=.linalg.ExportGraph([v,e,f,x,y,x,m,metric]);r:=.linalg.ImportGraph(.MathDecodeJSON(.MathEncodeJSON(g)));s:=.linalg.ImportGraph(g);resaved:=.linalg.ExportGraph(r);[r[4].SameTensor(r[5]),r[4].SameTensor(r[6]),r[4]==r[5],r[4].SameTensor(x),r[4].SameTensor(s[4]),r[7].Apply(r[4])==.linalg.Vector([4,9],r[2]),r[4].NormSquared(r[8]),r[4].Transform(r[3]).Components(),r[4].identity[:representations].Len(),resaved[:records].Len()==g[:records].Len()];').values;
 for(const i of [0,1,2,5,9])truth(values[i]);
 for(const i of [3,4])expect(values[i]).toBeNull();
 expect(String(values[6])).toBe('13');expect(String(values[8])).toBe('3');
});
tensorTest('bounded representation histories survive import, eviction and in-place changes',()=>{
 const values=run(graphSetup+'z:=y.Transform(e);w:=z.Transform(f);g:=.linalg.ExportGraph([x,y,z,w]);r:=.linalg.ImportGraph(g);before:=r[4].identity[:representations].Len();r[4].Transform!(r[1].Frame());[before,r[4].identity[:representations].Len(),r[4]==r[1],r[2].SameTensor(r[4]),.linalg.ImportGraph(.linalg.ExportGraph(r)).Len()];').values;
 expect(String(values[0])).toBe('3');expect(String(values[1])).toBe('3');truth(values[2]);truth(values[3]);expect(String(values[4])).toBe('4');
});
tensorTest('primal and dual Frames and canonical dual spaces retain their relationships',()=>{
 const values=run(graphSetup+'d:=e.Dual();chosen:=f.Dual("chosen",[2,0;0,3]);dual:=v.Dual();m:=.linalg.LinearMap(v,v,[2,0;0,3]).Dual();c:=.linalg.Covector([4,5],d);g:=.linalg.ExportGraph([v,e,d,chosen,dual,m,c]);r:=.linalg.ImportGraph(g);[r[1].Dual().identityToken==r[5].identityToken,r[2].Dual().identityToken==r[3].identityToken,r[6].Verify(),r[7].Components()==c.Components(),r[4].dualFrame,.linalg.ImportGraph(.linalg.ExportGraph(r)).Len()];').values;
 values.slice(0,5).forEach(truth);expect(String(values[5])).toBe('7');
});
tensorTest('graph polynomial views retain source sharing, scoped variables and frozen coefficients',()=>{
 const values=run('a:=.linalg.PolynomialSpace(2,:x);b:=.linalg.PolynomialSpace(4,:x);p:=.poly.Polynomial({= coefficients=[1,2],order=:ascending,variable=:x,degreeBound=2 });u:=a.Realize(p);w:=b.Realize(p);f:=.linalg.Frame(a[:space],{= relativeTo=a.Frame(),basis=[1,1,0;0,1,1;0,0,1] });t:=u.Transform(f);g:=.linalg.ExportGraph([p,a,b,u,w,t]);r:=.linalg.ImportGraph(g);[r[1].__type,r[1].degreeBound,r[4].SameSource(r[5]),r[4].SameSource(r[6]),r[4].Vector().SameTensor(r[5].Vector()),r[6].Reconstruct()==r[1],r[6].Domain().sourceIdentity==r[1].sourceIdentity,r[1].reactive,.linalg.ImportGraph(.linalg.ExportGraph(r)).Len()];').values;
 expect(values[0].value).toBe('Polynomial');expect(String(values[1])).toBe('2');for(const i of [2,3,5,6])truth(values[i]);expect(values[4]).toBeNull();expect(String(values[7])).toBe('0');expect(String(values[8])).toBe('6');
});
tensorTest('scoped Polynomial variables coalesce only within each graph import',()=>{
 const values=run('a:=.linalg.PolynomialSpace(2,::x);p:=.poly.Polynomial({= coefficients=[1,2],order=:ascending,variable=::x });v:=a.Realize(p);g:=.linalg.ExportGraph([p,a,v]);r:=.linalg.ImportGraph(g);s:=.linalg.ImportGraph(g);[.SameSymbol(r[1].Variable(),r[2][:variable]),.SameSymbol(r[1].Variable(),s[1].Variable()),.SameSymbol(r[1].Variable(),p.Variable()),r[3].Reconstruct()==r[1]];').values;
 truth(values[0]);expect(values[1]).toBeNull();expect(values[2]).toBeNull();truth(values[3]);
});
const entries=graph=>graph.entries.get('records').values;
const kind=record=>record.entries.get('kind').value;
const first=(graph,name)=>entries(graph).find(record=>kind(record)===name);
const integer=n=>new Integer(BigInt(n));
const fixture=()=>{const rt=runtime();const graph=parseAndEvaluate(prefix+graphSetup+'.linalg.ExportGraph([v,e,f,x,y]);',rt);return {rt,graph};};
const altered=(fixture,change)=>{const graph=decodeMathematicalJSON(encodeMathematicalJSON(fixture.graph));change(graph);fixture.rt.context.set('incoming',graph);return ()=>parseAndEvaluate('.linalg.ImportGraph(incoming);',fixture.rt);};
tensorTest('identity import rejects dangling references, forged identities and conflicting exact domains',()=>{
 const f=fixture();
 const cases=[
  [g=>first(g,'tensorRepresentation').entries.get('slots').values[0].entries.set('frameid',integer(999)),/reference/],
  [g=>first(g,'vectorSpace').entries.set('dimension',integer(3)),/dimension|shape/],
  [g=>first(g,'vectorSpace').entries.set('over',{type:'string',value:'Float'}),/Rational/],
  [g=>first(g,'vectorSpace').entries.set('identitytoken',{type:'string',value:'forged'}),/unexpected fields/],
  [g=>first(g,'vectorSpace').entries.set('id',integer(2)),/IDs/],
  [g=>first(g,'frame').entries.get('basis').entries.get('data').values.fill(integer(0)),/singular|invertible|pivot/],
  [g=>first(g,'tensorRepresentation').entries.get('slots').values[0].entries.set('dual',integer(0)),/variance/],
 ];
 for(const [change,error] of cases)expect(altered(f,change)).toThrow(error);
});
tensorTest('identity import validates acyclic lineage and the coordinates of equivalent representations',()=>{
 const f=fixture();
 expect(altered(f,g=>{const r=entries(g).find(r=>kind(r)==='frame'&&r.entries.get('defining')===null);r.entries.set('relativetoid',r.entries.get('id'));})).toThrow(/cyclic/);
 expect(altered(f,g=>{const r=first(g,'tensorRepresentation');r.entries.set('viewof',r.entries.get('id'));})).toThrow(/cyclic/);
 expect(altered(f,g=>{const r=first(g,'tensorIdentity');r.entries.get('representations').values.push(r.entries.get('origin'));})).toThrow(/duplicate/);
 expect(altered(f,g=>{const r=first(g,'tensorIdentity');const reps=r.entries.get('representations').values;reps.reverse();r.entries.set('origin',reps[0]);})).toThrow(/origin cannot/);
 expect(altered(f,g=>{const r=entries(g).filter(r=>kind(r)==='tensorRepresentation')[1];r.entries.get('components').entries.get('data').values[0]=integer(999);})).toThrow(/inconsistent coordinates/);
 expect(altered(f,g=>{const r=entries(g).filter(r=>kind(r)==='tensorRepresentation')[1];r.entries.get('transform').entries.get('matrices').values[0].entries.get('data').values[0]=integer(99);})).toThrow(/Frame change law/);
});
tensorTest('graph import and export enforce finite budgets and refuse callable metadata',()=>{
 const f=fixture();f.rt.context.set('incoming',f.graph);
 for(const options of ['{= maxNodes=2 }','{= maxComponents=2 }','{= maxDepth=1 }','{= maxNodes=1025 }'])expect(()=>parseAndEvaluate('.linalg.ImportGraph(incoming,'+options+');',f.rt)).toThrow(/budget|bounds/);
 expect(()=>run(graphSetup+'.linalg.ExportGraph([x,y],{= maxNodes=2 });')).toThrow('node budget');
 expect(()=>run('v:=.linalg.VectorSpace({= name="V",dimension=1,metadata={= compute=()->42 } });.linalg.ExportGraph(v);')).toThrow(/unsupported|callable/);
 const chain='v:=.linalg.VectorSpace("V",1);e:=.linalg.Frame(v,"e",:defining);f:=.linalg.Frame(v,{= relativeTo=e,basis=[[1]] });h:=.linalg.Frame(v,{= relativeTo=f,basis=[[1]] });j:=.linalg.Frame(v,{= relativeTo=h,basis=[[1]] });g:=.linalg.ExportGraph([e,f,h,j]);.linalg.ImportGraph(g,{= maxDepth=3 });';
 expect(()=>run(chain)).toThrow('depth budget');
});
tensorTest('reactive Polynomial providers become frozen snapshots and stale realizations are rejected',()=>{
 const rt=runtime();const values=parseAndEvaluate(prefix+'y:=2;p:={#x# x^2+y*x}.P();a:=.linalg.PolynomialSpace(2,:x);view:=a.Realize(p);saved:=.linalg.ExportGraph([p,view]);y~=3;r:=.linalg.ImportGraph(saved);[r[1].Evaluate(2),p.Evaluate(2),r[2].Reconstruct()==r[1],r[1].reactive];',rt).values;
 expect(String(values[0])).toBe('8');expect(String(values[1])).toBe('10');truth(values[2]);expect(String(values[3])).toBe('0');
 expect(()=>parseAndEvaluate('.linalg.ExportGraph(view);',rt)).toThrow('stale');
 const graph=decodeMathematicalJSON(encodeMathematicalJSON(rt.context.get('saved')));
 first(graph,'polynomial').entries.get('coefficients').values[0]=integer(9);rt.context.set('forged',graph);
 expect(()=>parseAndEvaluate('.linalg.ImportGraph(forged);',rt)).toThrow('reconstruct');
});
tensorTest('derived tensor provenance round trips across views, metric operations and contractions',()=>{
 const values=run('v:=.linalg.VectorSpace({= name="V",dimension=2,lineageLimit=2 });e:=.linalg.Frame(v,"e",:defining);x:=.linalg.Vector([2,3],e);c:=.linalg.Covector([4,5],e);m:=.linalg.Metric(e,[1,0;0,1]);t:=.linalg.TensorProduct(x,x);u:=.linalg.TensorProduct(x,.linalg.TensorProduct(c,x));values:=[x.View(),t.Permute([2,1]),x.Lower(m),x.Lower(m).Raise(m),t.Symmetrize(),t.Antisymmetrize(),u.Contract(1,2)];g:=.linalg.ExportGraph(values);r:=.linalg.ImportGraph(g);[r.Len(),r[1].__type,r[3].__type,r[4]==r[1],r[5]==r[2],r[6].CoordinateStorage().Entries().All((x)->x==0),.linalg.ImportGraph(.linalg.ExportGraph(r)).Len()];').values;
 expect(String(values[0])).toBe('7');expect(values[1].value).toBe('Vector');expect(values[2].value).toBe('Covector');for(const i of [3,4,5])truth(values[i]);expect(String(values[6])).toBe('7');
});
tensorTest('import replays and rejects forged derived origins instead of trusting provenance labels',()=>{
 const rt=runtime();parseAndEvaluate(prefix+'v:=.linalg.VectorSpace("V",2);e:=.linalg.Frame(v,"e",:defining);x:=.linalg.Vector([2,3],e);c:=.linalg.Covector([4,5],e);m:=.linalg.Metric(e,[1,0;0,1]);t:=x.TensorProduct(x);u:=x.TensorProduct(c.TensorProduct(x));values:=[t,t.Permute([2,1]),x.Lower(m),c.Raise(m),t.Symmetrize(),t.Antisymmetrize(),u.Contract(1,2)];',rt);
 for(let i=1;i<=7;i++){
  const graph=parseAndEvaluate('.linalg.ExportGraph(values['+i+']);',rt);
  const root=entries(graph)[Number(graph.entries.get('roots').values[0].value)-1];
  const cells=root.entries.get('components').entries.get('data').values;cells[0]=cells[0].add(integer(1));
  rt.context.set('forgedderivation',graph);
  expect(()=>parseAndEvaluate('.linalg.ImportGraph(forgedderivation);',rt)).toThrow('derivation does not reproduce');
 }
 const graph=parseAndEvaluate('.linalg.ExportGraph(values[1]);',rt);rt.context.set('replaygraph',graph);
 expect(()=>parseAndEvaluate('.linalg.ImportGraph(replaygraph,{= maxReplayWork=1 });',rt)).toThrow('replay work budget');
 expect(()=>parseAndEvaluate('.linalg.ImportGraph(replaygraph,{= maxReplayWork=16777217 });',rt)).toThrow('hard bounds');
});
