import { expect,test } from 'bun:test';
import { Integer } from '@ratmath/core';
import { Context,createDefaultRegistry,createDefaultSystemContext,parseAndEvaluate,formatValue } from '../../src/index.js';
import { encodeMathematicalJSON,decodeMathematicalJSON } from '../../src/runtime/math-json.js';
import { forEachShapedCell } from '../../src/runtime/shaped.js';
const run=source=>parseAndEvaluate('.Plugin.Load("linalg");'+source);
const truth=value=>expect(String(value)).toBe('1');
const check=(name,body)=>test(name,body,30000);
const flat=value=>{const out=[];forEachShapedCell(value,x=>out.push(String(x)));return out;};
const terms=value=>value.values.map(x=>[x.entries.get('indices').values.map(String),String(x.entries.get('value'))]);
check('sparse coordinates combine duplicates, remove zeros and use numeric lexicographic order',()=>{
 const values=run('s:=.linalg.SparseCoordinates([{= indices=[10],value=1},{= indices=[2],value=3},{= indices=[2],value=-1},{= indices=[1],value=0},{= indices=[10],value=-1},{= indices=[3],value=1/2}],[12]);[s.Entries(),s.Materialize(),s.Verify(),s.Get([1]),s.Get([3]),s.SupportSize(),s.Size()];').values;
 expect(terms(values[0])).toEqual([[['2'],'2'],[['3'],'1/2']]);expect(flat(values[1])).toEqual(['0','2','1/2','0','0','0','0','0','0','0','0','0']);truth(values[2]);expect(String(values[3])).toBe('0');expect(String(values[4])).toBe('1/2');expect(String(values[5])).toBe('2');expect(String(values[6])).toBe('12');
});
check('logical dense views convert to sparse storage without changing order or scalar domain',()=>{
 const values=run('s:=.linalg.SparseCoordinates([], [3,2]);d:={:2x3: 1,0,2;0,3,0}.Permute({: 2,1});a:=s.Add(d);[a.Materialize(),a.Equal(d),a.Scale(0).SupportSize(),a.Permute([2,1]).Materialize()];').values;
 expect(flat(values[0])).toEqual(['1','0','0','3','2','0']);truth(values[1]);expect(String(values[2])).toBe('0');expect(flat(values[3])).toEqual(['1','0','2','0','3','0']);
});
const finite='v:=.linalg.VectorSpace({= name="V",dimension=2,lineageLimit=2 });e:=.linalg.Frame(v,"e",:defining);f:=.linalg.Frame(v,{= basis=[1,1;0,1] });s:=.linalg.SparseCoordinates([{= indices=[1],value=2},{= indices=[2],value=3}],[2]);x:=.linalg.Vector(s,e);y:=.linalg.Vector([2,3],e);';
check('finite sparse tensors preserve exact dense arithmetic, identity and frame laws',()=>{
 const checks=['x==y','(3*x/2)==(3*y/2)','x.Transform(f)==y.Transform(f)','x.Transform(f).Transform(e)==x','x.View().SameTensor(x)','x.Transform(f).SameTensor(x)','x.TensorPower(2)==y.TensorPower(2)'];
 checks.forEach(expression=>truth(run(finite+expression+';')));
 expect(String(run(finite+'(x-y).components.SupportSize();'))).toBe('0');
 expect(String(run(finite+'a:=.linalg.Covector(s,e);a.Transform(f).Pair(x.Transform(f));'))).toBe('13');
 const products='a:=.linalg.Covector(s,e);b:=.linalg.Covector([2,3],e);t:=x.TensorProduct(a);d:=y.TensorProduct(b);';
 ['t==d','t.Contract(1,2)==d.Contract(1,2)','t.Permute([2,1])==d.Permute([2,1])'].forEach(expression=>truth(run(finite+products+expression+';')));
});
check('finite support works across countable monomial Frames without creating infinite arrays',()=>{
 const values=run('px:=.linalg.PolynomialSpace({= maxDegree=:unbounded,variable=:x });p:=.p`3*x^10+2`;r:=px.Realize(p);t:=r.Vector().TensorProduct(r.Vector());[px.Frame().BasisAt(3).Coefficients(),r.Vector().components.Entries(),r.Reconstruct()==p,r.SameSource(p),r.Vector().SameSource(p),t.components.SupportSize(),t.Permute([2,1])==t,(r.Vector()+r.Vector())==px.Realize(2*p).Vector(),px.Reconstruct(r.Vector()-r.Vector())==.p`0`,r.Vector().Transform(px.Frame()).SameTensor(r.Vector())];').values;
 expect(values[0].values.map(String)).toEqual(['1','0','0','0']);expect(terms(values[1])).toEqual([[['0'],'2'],[['10'],'3']]);[2,3,4,6,7,8,9].forEach(i=>truth(values[i]));expect(String(values[5])).toBe('4');
 expect(()=>run('px:=.linalg.PolynomialSpace(:unbounded);px.Realize(.p`x`).Vector().components.Materialize();')).toThrow('finite projection');
 expect(()=>run('px:=.linalg.PolynomialSpace(:unbounded);.linalg.Frame(px[:space],"another",:defining);')).toThrow('monomial Frame');
});
check('bounded inclusion and projection preserve source identity and verify the discarded part exactly',()=>{
 const values=run('px:=.linalg.PolynomialSpace(:unbounded);b:=px.Bounded(2);p:=.p`x^5+3*x^2+2`;source:=px.Realize(p);q:=b.Project(source);included:=px.Include(q.Realization());small:=.p`x+1`;r:=b.Realize(small);[q.Verify(),.linalg.VerifyProjection(.MathDecodeJSON(.MathEncodeJSON(q.Record()))),q.Vector().components,q.Remainder().Coefficients(),included.Reconstruct()+q.Remainder()==p,px.Include(r).SameSource(r),px.Include(r).Vector().SameTensor(r.Vector()),b.Project(px.Realize(small))[:exactinclusion]];').values;
 [0,1,4,5,7].forEach(i=>truth(values[i]));expect(values[6]).toBeNull();expect(flat(values[2])).toEqual(['2','0','3']);expect(values[3].values.map(String)).toEqual(['1','0','0','0','0','0']);
 for(const source of ['a:=.linalg.PolynomialSpace(:unbounded);b:=.linalg.PolynomialSpace(:unbounded);a.Bounded(2).Project(b.Realize(.p`x`));','a:=.linalg.PolynomialSpace(:unbounded);a.Include(.linalg.PolynomialSpace(2).Realize(.p`x`));'])expect(()=>run(source)).toThrow(/ambient|Bounded/);
});
check('sparse transport is inert, canonical, bounded and rejects forged projection evidence',()=>{
 const rt={context:new Context(),registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()};
 const record=parseAndEvaluate('.Plugin.Load("linalg");.linalg.SparseCoordinates([{= indices=[0],value=2},{= indices=[4],value=3}],[:countable]).Record();',rt);
 const changes=[r=>r.entries.get('terms').values.reverse(),r=>r.entries.get('terms').values.push(r.entries.get('terms').values[0]),r=>r.entries.get('terms').values[0].entries.set('value',new Integer(0n)),r=>r.entries.get('terms').values[0].entries.get('indices').values[0]=new Integer(-1n),r=>r.entries.get('budgets').entries.set('maxsupport',new Integer(2049n)),r=>r.entries.set('callback',{type:'string',value:'forged'})];
 for(const change of changes){const copy=decodeMathematicalJSON(encodeMathematicalJSON(record));change(copy);rt.context.set('incoming',copy);expect(()=>parseAndEvaluate('.linalg.RestoreCoordinates(incoming);',rt)).toThrow();}
 rt.context.set('incoming',decodeMathematicalJSON(encodeMathematicalJSON(record)));truth(parseAndEvaluate('.linalg.RestoreCoordinates(incoming).Verify();',rt));
 const projection=parseAndEvaluate('px:=.linalg.PolynomialSpace(:unbounded);px.Bounded(1).Project(px.Realize(.p`x^3+1`)).Record();',rt);
 projection.entries.get('discarded').values[0]=new Integer(7n);rt.context.set('incoming',projection);expect(()=>parseAndEvaluate('.linalg.VerifyProjection(incoming);',rt)).toThrow('does not reproduce');
});
check('support, work, axis, degree and materialization budgets reject excessive work',()=>{
 const cases=[
  '.linalg.SparseCoordinates([{= indices=[1],value=1:2}],[2]);',
  '.linalg.SparseCoordinates([{= indices=[0],value=1}],[2]);',
  '.linalg.SparseCoordinates([{= indices=[2],value=1}],[:countable],{= maxIndex=1 });',
  '.linalg.SparseCoordinates([{= indices=[1],value=1},{= indices=[2],value=1}],[2],{= maxSupport=1 });',
  '.linalg.SparseCoordinates([{= indices=[1],value=1},{= indices=[2],value=1}],[2],{= maxWork=1 });',
  '.linalg.SparseCoordinates([],[100,100]).Materialize(100);',
  's:=.linalg.SparseCoordinates([{= indices=[1],value=1},{= indices=[2],value=1}],[2],{= maxSupport=2 });s.TensorProduct(s);',
  'px:=.linalg.PolynomialSpace(:unbounded,:x,{= maxIndex=2 });px.Realize(.p`x^3`);',
  'px:=.linalg.PolynomialSpace(:unbounded,:x,{= maxIndex=2 });px.Frame().BasisAt(3);',
  'px:=.linalg.PolynomialSpace(:unbounded);px.Realize(.p`y`);',
  '.linalg.SparseCoordinates([],[2],{= maxWork=1048577 });',
 ];for(const source of cases)expect(()=>run(source)).toThrow();
 expect(()=>run(finite+'.linalg.ExportGraph(x);')).toThrow('finite dense');
});

check('sparse matrix actions and metric changes agree with dense operations, including rectangular maps',()=>{
 const values=run(finite+'w:=.linalg.VectorSpace("W",3);g:=.linalg.Frame(w,"g",:defining);m:=.linalg.LinearMap(v,w,[1,2;3,0;0,4]);a:=.linalg.Covector(.linalg.SparseCoordinates([{= indices=[1],value=2},{= indices=[3],value=5}],[3]),g);b:=.linalg.Covector([2,0,5],g);metric:=.linalg.Metric(e,[2,1;1,3]);[m.Apply(x)==m.Apply(y),m.Pullback(a)==m.Pullback(b),a.Pair(m.Apply(x))==m.Pullback(a).Pair(x),x.Lower(metric)==y.Lower(metric),x.Lower(metric).Raise(metric)==x,x.NormSquared(metric),x.Transform(f).NormSquared(metric.Transform(f))];').values;
 values.slice(0,5).forEach(truth);expect(values.slice(5).map(String)).toEqual(['47','47']);
});

check('sparse symmetry and contraction commute with frame changes and preserve decomposition identities',()=>{
 const values=run(finite+'storage:=.linalg.CoordinateStorage(.linalg.SparseCoordinates([],[2,2]).Add([1,2;3,4]));t:=.linalg.Tensor(storage,[e,f]);d:=.linalg.Tensor([1,2;3,4],[e,f]);s:=t.Symmetrize();a:=t.Antisymmetrize();[s+a==t,s==d.Symmetrize(),a==d.Antisymmetrize(),s.Transform([f,e])==t.Transform([f,e]).Symmetrize(),t.Antisymmetrize([2,1])==a,s.Symmetrize()==s,a.Antisymmetrize()==a,t.TensorProduct(.linalg.Covector([2,3],e)).Contract(1,3)==d.TensorProduct(.linalg.Covector([2,3],e)).Contract(1,3)];').values;
 values.forEach(truth);
});

check('countable zero, finite-support pairing and successive bounded projections remain exact',()=>{
 const values=run('px:=.linalg.PolynomialSpace(:unbounded);small:=px.Bounded(0);large:=px.Bounded(4);r:=px.Realize(.p`x^5+3*x^2+2`);zero:=px.Realize(.p`0`);covector:=.linalg.Covector(.linalg.SparseCoordinates([{= indices=[0],value=7},{= indices=[2],value=2}],[:countable]),px.Frame());first:=large.Project(r);second:=small.Project(px.Include(first.Realization()));[zero.Vector().components.SupportSize(),zero.Reconstruct()==.p`0`,covector.Pair(r.Vector()),second.Verify(),second.Realization().Reconstruct()==.p`2`,second.Remainder()+first.Remainder()+second.Realization().Reconstruct()==r.Domain(),zero.Vector().TensorProduct(r.Vector()).components.SupportSize()];').values;
 expect(String(values[0])).toBe('0');truth(values[1]);expect(String(values[2])).toBe('20');values.slice(3,6).forEach(truth);expect(String(values[6])).toBe('0');
 expect(()=>run('px:=.linalg.PolynomialSpace(:unbounded);.linalg.DualSpace(px[:space]);')).toThrow('full dual');
 for(const value of ['px','px.Frame()','px[:space]'])expect(()=>run(`px:=.linalg.PolynomialSpace(:unbounded);.linalg.ExportGraph(${value});`)).toThrow('countable monomial identities');
});
