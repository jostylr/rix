import { expect,test } from 'bun:test';
import { Integer } from '@ratmath/core';
import { Context,createDefaultRegistry,createDefaultSystemContext,parseAndEvaluate,formatValue } from '../../src/index.js';
import { encodeMathematicalJSON,decodeMathematicalJSON } from '../../src/runtime/math-json.js';
const run=source=>parseAndEvaluate('.Plugin.Load("linalg");'+source);
const ints=value=>value.values.map(String);
const truth=value=>expect(String(value)).toBe('1');
const check=(name,body)=>test(name,body,30000);
check('characteristic and minimal polynomials distinguish repeated eigenspaces from Jordan chains',()=>{
 const values=run('a:=[2,0;0,2] ~!: :Matrix;b:=[2,1;0,2] ~!: :Matrix;c:=[0,1,0;0,0,1;0,0,0] ~!: :Matrix;[a.CharacteristicPolynomial().Coefficients(),a.MinimalPolynomial().Coefficients(),b.MinimalPolynomial().Coefficients(),c.MinimalPolynomial().Coefficients(),a.RationalEigenspaces()[:diagonalizableoverrational],b.RationalEigenspaces()[:diagonalizableoverrational],c.RationalEigenspaces().Verify()];').values;
 expect(ints(values[0])).toEqual(['1','-4','4']);expect(ints(values[1])).toEqual(['1','-2']);expect(ints(values[2])).toEqual(['1','-4','4']);expect(ints(values[3])).toEqual(['1','0','0','0']);truth(values[4]);expect(values[5]).toBeNull();truth(values[6]);
});
check('rational eigenvalues carry exact nullspaces and replayable annihilation evidence',()=>{
 const values=run('s:=.linalg.RationalEigenspaces([1/2,1;0,2/3]);[s.Roots(),s.Spaces().Map((space)->space[:geometricmultiplicity]),s[:residual],s.Verify(),.linalg.VerifySpectral(.MathDecodeJSON(.MathEncodeJSON(s.Record()))),s.CharacteristicPolynomial().Coefficients()];').values;
 expect(ints(values[0])).toEqual(['1/2','2/3']);expect(ints(values[1])).toEqual(['1','1']);expect(ints(values[2])).toEqual(['1']);truth(values[3]);truth(values[4]);expect(ints(values[5])).toEqual(['1','-7/6','1/3']);
});
check('endomorphism spectral calculations align distinct source and target Frames',()=>{
 const values=run('v:=.linalg.VectorSpace("V",2);e:=.linalg.Frame(v,"e",:defining);f:=.linalg.Frame(v,{= basis=[1,1;0,1] });a:=.linalg.LinearMap(v,v,[2,-3;0,3],{= sourceFrame=e,targetFrame=f });[.linalg.CharacteristicPolynomial(a).Coefficients(),.linalg.RationalEigenspaces(a).Verify()];').values;
 expect(ints(values[0])).toEqual(['1','-5','6']);truth(values[1]);
 expect(()=>run('v:=.linalg.VectorSpace("V",2);w:=.linalg.VectorSpace("W",2);a:=.linalg.LinearMap(v,w,[1,0;0,1]);.linalg.CharacteristicPolynomial(a);')).toThrow('endomorphism');
});
check('irreducible residuals and incomplete bounded searches have distinct explicit outcomes',()=>{
 const values=run('a:=.linalg.RationalEigenspaces([0,-1;1,0]);b:=.linalg.RationalEigenspaces([101,0;0,103],:x,{= maxRootTrials=1 });[a.Roots(),a[:residual],a[:canonicalforms][:extensionfieldrequired],a[:rootsearch][:complete],b[:rootsearch][:complete],b[:rootsearch][:reason],b[:canonicalforms][:extensionfieldrequired],b[:diagonalizableoverrational],b.Verify(),.linalg.VerifySpectral(b.Record())];').values;
 expect(ints(values[0])).toEqual([]);expect(ints(values[1])).toEqual(['1','0','1']);truth(values[2]);truth(values[3]);expect(values[4]).toBeNull();expect(values[5].value).toBe('rootTrialBudget');expect(formatValue(values[6])).toBe('?');expect(formatValue(values[7])).toBe('?');truth(values[8]);truth(values[9]);
});
check('spectral evidence rejects tampered source, basis, polynomial and unsupported fields',()=>{
 const rt={context:new Context(),registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()};
 const record=parseAndEvaluate('.Plugin.Load("linalg");.linalg.RationalEigenspaces([1,0;0,2]).Record();',rt);
 const changes=[
  r=>r.entries.get('source').values[0].values[0]=new Integer(9n),
  r=>r.entries.get('minimal').values[0]=new Integer(9n),
  r=>r.entries.get('eigenspaces').values[0].entries.get('basis').values[0].values[0]=new Integer(9n),
  r=>r.entries.set('callback',{type:'string',value:'not allowed'}),
 ];
 for(const change of changes){const copy=decodeMathematicalJSON(encodeMathematicalJSON(record));change(copy);rt.context.set('incoming',copy);expect(()=>parseAndEvaluate('.linalg.VerifySpectral(incoming);',rt)).toThrow();}
});
check('spectral services preserve scoped variables and enforce finite exact inputs',()=>{
 truth(run('s:=.linalg.RationalEigenspaces([1,0;0,2],::t);s.Verify();'));
 for(const source of ['.linalg.CharacteristicPolynomial([1,2,3;4,5,6]);','.linalg.MinimalPolynomial([1:2,0;0,1]);','.linalg.RationalEigenspaces([1,0;0,2],:x,{= maxDimension=1 });','.linalg.RationalEigenspaces([1,0;0,2],:x,{= maxRootTrials=100001 });'])expect(()=>run(source)).toThrow();
});

check('zero and scalar matrices and partial root discovery have replayable exact outcomes',()=>{
 const values=run('z:=.linalg.RationalEigenspaces([0,0;0,0]);s:=.linalg.RationalEigenspaces({:1x1: 5});p:=.linalg.RationalEigenspaces([0,0;0,101],:x,{= maxRootTrials=1 });c:=.linalg.RationalEigenspaces([1,0;0,2],:x,{= maxRootCandidates=1 });[z.Roots(),z.MinimalPolynomial().Coefficients(),z[:diagonalizableoverrational],s.Roots(),p.Roots(),p[:residual],p[:rootsearch][:reason],p.Verify(),c[:rootsearch][:reason],c.Verify()];').values;
 expect(ints(values[0])).toEqual(['0']);expect(ints(values[1])).toEqual(['1','0']);truth(values[2]);expect(ints(values[3])).toEqual(['5']);expect(ints(values[4])).toEqual(['0']);expect(ints(values[5])).toEqual(['-101','1']);expect(values[6].value).toBe('rootTrialBudget');truth(values[7]);expect(values[8].value).toBe('rootCandidateBudget');truth(values[9]);
});

check('spectral size and shape limits reject before traversing or coercing scalar entries',()=>{
 expect(()=>run('.linalg.CharacteristicPolynomial([["not a scalar"],["not a scalar"]],:x,{= maxDimension=1 });')).toThrow('dimension budget');
 expect(()=>run('.linalg.CharacteristicPolynomial([["not a scalar",0,0],[0,0,0]]);')).toThrow('square Rational matrix');
 expect(()=>run('.linalg.CharacteristicPolynomial({:2x3: "x","x","x";"x","x","x"});')).toThrow('square Rational matrix');
});
