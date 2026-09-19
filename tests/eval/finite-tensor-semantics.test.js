import { expect,test } from "bun:test";
import { Context,createDefaultRegistry,createDefaultSystemContext,parseAndEvaluate,formatValue } from "../../src/index.js";
import { forEachShapedCell } from "../../src/runtime/shaped.js";
const tensorTest=(name,body)=>test(name,body,20000);
const setup='.Plugin.Load("linalg"); v:=.linalg.VectorSpace({= name="V",dimension=2,lineageLimit=2 });e:=.linalg.Frame(v,"e",:defining);f:=.linalg.Frame(v,{= name="f",relativeTo=e,basis=[1,1;0,1] });';
const run=source=>parseAndEvaluate(setup+source);
const flat=value=>{const result=[];
 forEachShapedCell(value,entry=>result.push(String(entry)));
 return result;
 };
const truth=value=>expect(value).not.toBeNull();
tensorTest("Shaped view flatten and reshape follow logical cells, preserving tensor permutation coordinates",()=>{
 const values=parseAndEvaluate('a:={:2x3: 1,2,3;4,5,6}; p:=a.Permute({: 2,1});[p.Flatten(),p.Reshape({: 2,3}),a[1:2,2:3].Flatten()];').values;
 expect(flat(values[0])).toEqual(["1","4","2","5","3","6"]);
 expect(flat(values[1])).toEqual(flat(values[0]));
 expect(flat(values[2])).toEqual(["2","3","5","6"]);
});
tensorTest("permutation commutes with independent frame changes and full views preserve identity",()=>{
 const values=run('w:=.linalg.VectorSpace("W",3);g:=.linalg.Frame(w,"g",:defining);h:=.linalg.Frame(w,{= relativeTo=g,basis=[1,0,1;0,1,0;0,0,1] });t:=.linalg.Tensor({:2x3: 1,2,3;4,5,6},[e,g],[:up,:down]);a:=t.Transform([f,h]).Permute([2,1]);b:=t.Permute({: 2,1}).Transform([h,f]);[a==b,t.Permute([2,1]).Permute([2,1])==t,t.View().SameTensor(t),t.Permute([2,1]).SameTensor(t),t.ComponentSlice({: 1,1:3}),t.View().components.__type];').values;
 truth(values[0]);
 truth(values[1]);
 truth(values[2]);
 expect(values[3]).toBeNull();
 expect(values[4].type).toBe("shaped");
 expect(flat(values[4])).toEqual(["1","2","3"]);
 expect(values[5].value).toBe("Shaped");
 expect(()=>run('t:=.linalg.Tensor([1,2;3,4],[e,e]);t.Permute([1,1]);')).toThrow("every axis");
});
tensorTest("tensor equality compares values across frames while SameTensor compares identities",()=>{
 const values=run('x:=.linalg.Vector([2,3],e);y:=.linalg.Vector([-1,3],f);w:=.linalg.VectorSpace("W",2);g:=.linalg.Frame(w,"g",:defining);[x==y,x!=y,x.SameTensor(y),x.Equal(x.Transform(f)),x==.linalg.Covector([2,3],e),x==.linalg.Vector([2,3],g),x==_,x.components.__type];').values;
 truth(values[0]);
 expect(values[1]).toBeNull();
 expect(values[2]).toBeNull();
 truth(values[3]);
 expect(values[4]).toBeNull();
 expect(values[5]).toBeNull();
 expect(values[6]).toBeNull();
 expect(values[7].value).toBe("Shaped");
});
tensorTest("canonical and chosen dual Frames preserve exact pairings with no metric",()=>{
 const values=run('d:=e.Dual(); chosen:=e.Dual("chosen",[1,1;0,1]);x:=.linalg.Vector([2,3],e);a:=.linalg.Vector([4,5],chosen);b:=.linalg.Covector([9,5],e);t:={:2x2: /Tensor: E@Chosen/ 1,2;3,4};[d.Dual()[:frameidentity]==e[:frameidentity],d[:frameidentity]==e.Dual()[:frameidentity],a.__type,a.Pair(x),a==b,a.Transform(f).Pair(x.Transform(f)),chosen.ChangeMatrix(d),t[:slots][2][:dual],chosen.dualBasis];').values;
 truth(values[0]);
 truth(values[1]);
 expect(values[2].value).toBe("Covector");
 expect(String(values[3])).toBe("33");
 truth(values[4]);
 expect(String(values[5])).toBe("33");
 expect(flat(values[6])).toEqual(["1","1","0","1"]);
 truth(values[7]);
 expect(flat(values[8])).toEqual(["1","1","0","1"]);
 expect(()=>run('e.Dual("bad",[1,2;2,4]);')).toThrow();
 expect(()=>run('{:3: /Vector: E/ 1,2,3};')).toThrow("dimension");
});
tensorTest("metric index changes commute with coordinates and remain exactly invertible",()=>{
 const values=run('metric:=.linalg.Metric(e,[2,1;1,3]);x:=.linalg.Vector([2,3],e);alpha:=x.Lower(metric);changed:=metric.Transform(f);[alpha.components,alpha.Raise(metric)==x,x.Transform(f).Lower(changed)==alpha.Transform(f),x.NormSquared(metric),x.Transform(f).NormSquared(changed),changed[:components],x.Lower(metric).SameTensor(x)];').values;
 expect(flat(values[0])).toEqual(["7","11"]);
 truth(values[1]);
 truth(values[2]);
 expect(String(values[3])).toBe("47");
 expect(String(values[4])).toBe("47");
 expect(flat(values[5])).toEqual(["2","3","3","7"]);
 expect(values[6]).toBeNull();
 for(const source of ['x:=.linalg.Vector([1,2],e);x.Lower();','x:=.linalg.Vector([1,2],e);x.Dot(x);','x:=.linalg.Vector([1,2],e);x.NormSquared();'])expect(()=>run(source)).toThrow("explicit Rational metric");
 expect(()=>run('.linalg.Metric(e,[1,2;0,1]);')).toThrow("symmetric");
 expect(()=>run('.linalg.Metric(e,[1,2;2,4]);')).toThrow();
 expect(()=>run('.linalg.Metric(e,[1:2,0;0,1]);')).toThrow("exact Integer or Rational");
 expect(()=>run('.linalg.Tensor({:2: "x","y"},e);')).toThrow("exact Integer or Rational");
 expect(()=>run('x:=.linalg.Vector([1,2],e);x.Raise(.linalg.Metric(e,[1,0;0,1]));')).toThrow("existing variance");
 expect(()=>run('w:=.linalg.VectorSpace("W",2);g:=.linalg.Frame(w,"g",:defining);.linalg.Vector([1,2],e).Lower(.linalg.Metric(g,[1,0;0,1]));')).toThrow("slot 1");
});
tensorTest("trace uses canonical contractions or an explicit metric for equal-variance slots",()=>{
 const values=run('a:=.linalg.Tensor([1,2;3,4],[e,e],[:up,:down]);b:=.linalg.Tensor([1,2;3,4],[e,e]);c:=.linalg.Tensor([1,2;3,4],[e,e],[:down,:down]);metric:=.linalg.Metric(e,[2,0;0,3]);[a.Trace(),a.Transform(f).Trace(),b.Trace(1,2,metric),c.Trace(1,2,metric),b.Transform(f).Trace(1,2,metric.Transform(f))];').values;
 expect(values.map(String)).toEqual(["5","5","14","11/6","14"]);
 expect(()=>run('.linalg.Tensor([1,2;3,4],[e,e]).Trace();')).toThrow("explicit Rational metric");
 expect(()=>run('.linalg.Tensor([1,2;3,4],[e,e]).Contract(1,2);')).toThrow("Contraction slots 1");
});
tensorTest("symmetry projections commute with coordinates, add back to the tensor and respect axis order",()=>{
 const values=run('t:=.linalg.Tensor([1,2;3,4],[e,f]);s:=t.Symmetrize();a:=t.Antisymmetrize();[s+a==t,s.Transform([f,e])==t.Transform([f,e]).Symmetrize(),a.Transform([f,e])==t.Transform([f,e]).Antisymmetrize(),t.Antisymmetrize([2,1])==a,s.Symmetrize()==s,a.Antisymmetrize()==a,t.Antisymmetrize([1]).Equal(t)];').values;
 values.forEach(truth);
 expect(()=>run('.linalg.Tensor([1,2;3,4],[e,e],[:up,:down]).Symmetrize();')).toThrow("identical variance");
});
tensorTest("bounded tensor powers preserve exact products and reject excessive construction",()=>{
 const values=run('x:=.linalg.Vector([2,3],e);[x.TensorPower(0),x.TensorPower(1).SameTensor(x),x.TensorPower(2).components,x.TensorPower(2).Transform(f)==x.Transform(f).TensorPower(2)];').values;
 expect(String(values[0])).toBe("1");
 truth(values[1]);
 expect(flat(values[2])).toEqual(["4","6","6","9"]);
 truth(values[3]);
 expect(()=>run('.linalg.Vector([1,2],e).TensorPower(9);')).toThrow("zero through eight");
 expect(()=>run('.linalg.Vector([1,2],e).TensorPower(-1);')).toThrow();
});
tensorTest("bang transformations retain actual bounded snapshots and leave lineage unchanged on invalid targets",()=>{
 const runtime={context:new Context(),registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()};
 parseAndEvaluate(setup+'x:=.linalg.Vector([2,3],e);x.Transform!(f);x.Transform!(e);x.Transform!(f);x.Transform!(e);',runtime);
 const values=parseAndEvaluate('[x.identity[:origin].components,x.identity[:representations].Len(),x.identity[:representations].Map((rep)->rep[:representationkey]),x[:equivalentto].components,x.Serialize()[:tensorid],x[:identitykey]];',runtime).values;
 expect(flat(values[0])).toEqual(["2","3"]);
 expect(String(values[1])).toBe("3");
 expect(new Set(values[2].values.map(String)).size).toBe(3);
 expect(flat(values[3])).toEqual(["-1","3"]);
 expect(String(values[4])).toBe(String(values[5]));
 truth(parseAndEvaluate("x[:equivalentto][:equivalentto]==_;",runtime));
 const before=formatValue(parseAndEvaluate('[x.components,x[:representationkey],x.identity[:representations].Len()];',runtime));
 expect(()=>parseAndEvaluate('w:=.linalg.VectorSpace("W",2);g:=.linalg.Frame(w,"g",:defining);x.Transform!(g);',runtime)).toThrow("slot 1");
 expect(formatValue(parseAndEvaluate('[x.components,x[:representationkey],x.identity[:representations].Len()];',runtime))).toBe(before);
});
tensorTest("dual linear maps preserve their chosen coordinate Frames",()=>{
 const values=run('a:=.linalg.LinearMap(v,v,[1,2;0,3],{= sourceFrame=e,targetFrame=e });b:=.linalg.LinearMap(v,v,[1,0;0,3],{= sourceFrame=f,targetFrame=f });ad:=a.Dual();bd:=b.Dual();alpha:=.linalg.Vector([4,5],ad[:sourceframe]);[ad.Apply(alpha)==bd.Apply(alpha),ad.Apply(alpha).components,bd[:sourceframe][:basis],e.Dual().Serialize()[:dualframe],e.Dual()[:frameidentity]==a[:sourceframe].Dual()[:frameidentity]];').values;
 truth(values[0]);
 expect(flat(values[1])).toEqual(["4","23"]);
 expect(flat(values[2])).toEqual(["1","0","-1","1"]);
 truth(values[3]);
 truth(values[4]);
 expect(()=>run('.linalg.LinearMap(v,v,[1,0;0,1],{= sourceFrame=e.Dual() });')).toThrow("use DualSpace");
});
tensorTest("norm and angle require explicit positive metrics and diagnose non-Rational results",()=>{
 const values=run('metric:=.linalg.Metric(e,[1,0;0,1]);x:=.linalg.Vector([3,4],e);y:=.linalg.Vector([1,1],e);[x.Norm(metric),y.Norm(metric)[:status],x.Angle(x,metric),x.Angle(y,metric)[:status],x.Transform(f).Norm(metric.Transform(f)),metric.Serialize()[:kind]];').values;
 expect(String(values[0])).toBe("5");
 expect(values[1].value).toBe("unsupportedCoefficientExtension");
 expect(String(values[2])).toBe("0");
 expect(values[3].value).toBe("unsupportedCoefficientExtension");
 expect(String(values[4])).toBe("5");
 expect(values[5].value).toBe("metric");
 for(const op of ['x.Norm()','x.Angle(x)'])expect(()=>run('x:=.linalg.Vector([3,4],e);'+op)).toThrow("explicit Rational metric");
 expect(()=>run('.linalg.Vector([1,0],e).Norm(.linalg.Metric(e,[1,0;0,-1]));')).toThrow("positive-definite");
 expect(()=>run('x:=.linalg.Vector([0,0],e);x.Angle(x,.linalg.Metric(e,[1,0;0,1]));')).toThrow("nonzero");
});
tensorTest("tensor expansion bounds reject before coordinate growth",()=>{
 expect(()=>run('.linalg.Vector([1,2],e).TensorPower(1/2);')).toThrow();
 expect(()=>run('t:=.linalg.Tensor(.Shaped.Generate({: 2,2,2 },idx->1),e);t.TensorPower(6);')).toThrow("component budget");
 expect(()=>run('t:=.linalg.Tensor(.Shaped.Generate({: 2,2,2,2,2,2,2 },idx->1),e);t.Symmetrize();')).toThrow("one to six");
 expect(()=>run('t:=.linalg.Tensor(.Shaped.Generate({: 2,2,2,2,2,2,2,2 },idx->1),e);t.Symmetrize([1,2,3,4,5,6]);')).toThrow("work budget");
});

tensorTest("incompatible contractions name both slots and spaces",()=>{
 expect(()=>run('.linalg.Tensor([1,2;3,4],e).Contract(3,2);')).toThrow("distinct tensor axes");
 expect(()=>run('x:=.linalg.Vector([1,2],e);x.Pair(x);')).toThrow("one Vector and one Covector");
 expect(()=>run('{:2x2: /Vector: E@E/ 1,2;3,4};')).toThrow("requires exactly one Frame");
 expect(()=>run('w:=.linalg.VectorSpace("W",2);g:=.linalg.Frame(w,"g",:defining);.linalg.Tensor([1,2;3,4],[e,g],[:up,:down]).Contract(1,2);')).toThrow("Contraction slots 1 (V) and 2 (W)");
});
tensorTest("full tensor views commute with frame changes",()=>{
 const values=run('x:=.linalg.Vector([2,3],e);a:=x.View().Transform(f);b:=x.Transform(f).View();[a==b,a.SameTensor(b),a.Components()];').values;
 truth(values[0]);
 truth(values[1]);
 expect(flat(values[2])).toEqual(["-1","3"]);
});
