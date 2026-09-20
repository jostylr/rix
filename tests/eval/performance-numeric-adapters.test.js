import { expect, test } from 'bun:test';
import { Integer, Rational } from '@ratmath/core';
import { parseAndEvaluate, parseAndEvaluateAsync, formatValue } from '../../src/index.js';
import { createFloatTensorAdapters, floatTensorFromTypedArray, floatTensorToTypedArray } from '../../plugins/float/tensor-adapters.js';
import { createShaped, createShapedView } from '../../src/runtime/shaped.js';
import { deepCopyValue } from '../../src/runtime/cell.js';
import { encodeTaskValue } from '../../src/runtime/task-worker-protocol.js';
import { pairwise } from '../../plugins/float/approximate-algorithms.js';
const api=createFloatTensorAdapters();
const str=value=>({type:'string',value});

test('typed tensor adapters own copies, retain shape, Float32 rounding, signed zero and reject forged handles',()=>{
 const source=new Float32Array([1/3,-0,Infinity,NaN]);
 const tensor=floatTensorFromTypedArray(source,[2,2]);source[0]=7;
 const copy=floatTensorToTypedArray(tensor);expect(copy[0]).toBe(Math.fround(1/3));expect(Object.is(copy[1],-0)).toBe(true);expect(Number.isNaN(copy[3])).toBe(true);
 copy[0]=9;expect(floatTensorToTypedArray(tensor)[0]).toBe(Math.fround(1/3));
 expect(api.ToShaped(tensor).shape).toEqual([2,2]);
 expect(formatValue(tensor)).toBe('FloatTensor(binary32, 2×2; approximate)');
 expect(api.ToShaped(tensor).data[2].diagnostics).toContain('nonFiniteInput');
 expect(api.ToShaped(tensor).data[0].diagnostics).toEqual([]);
 expect(()=>api.ToShaped({...tensor})).toThrow('live Float tensor');
 expect(()=>floatTensorFromTypedArray(source,[262145])).toThrow('budget');
 expect(()=>floatTensorFromTypedArray(source,[2,3])).toThrow('mismatch');
});
test('Shaped strided adapter and exact input conversion preserve explicit approximate boundary',()=>{
 const exact=createShaped([2,2],[new Rational(1n,3n),new Integer(2n),new Integer(3n),new Integer(4n)]);
 const view=createShapedView(exact,{shape:[2,2],strides:[1,2],offset:0});
 const tensor=api.Tensor(view,undefined,str('binary32'));
 expect([...floatTensorToTypedArray(tensor)]).toEqual([Math.fround(1/3),3,2,4]);
 expect(tensor.entries.get('certified')).toBe(null);expect(tensor.entries.get('status').value).toBe('approximate');
 expect(exact.data[0]).toBeInstanceOf(Rational);
});
test('Float matrix kernels agree with scalar sequential rounding and bound work',()=>{
 const a=api.Tensor([1,2,3,4],[2,2],str('binary32'));
 const b=api.Tensor([5,6],[2],str('binary32'));
 expect([...floatTensorToTypedArray(api.MatMul(a,b))]).toEqual([17,39]);
 expect(()=>api.MatMul(a,api.Tensor([1,2],[2]))).toThrow('formats');
 const large=api.Tensor(new Array(256*256).fill(1),[256,256]);
 expect(()=>api.MatMul(large,large)).toThrow('work budget');
 const overflow=api.MatMul(api.Tensor([3e38],[1,1],str('binary32')),api.Tensor([2],[1],str('binary32')));
 expect(overflow.entries.get('diagnostics').values.map(x=>x.value)).toContain('overflow');
 expect(api.ToShaped(overflow).data[0].diagnostics).toContain('overflow');
 expect(api.ToShaped(overflow).data[0].operation).toBe('tensorMatMul');
});
test('public Float tensor plugin APIs work without granting exact evidence',()=>{
 const value=parseAndEvaluate('.Plugin.Load("float"); a=.float.Tensor([1,2,3,4],[2,2],:binary32); b=.float.Tensor([5,6],[2],:binary32); nested={= value=a }; alias=nested[:value]; .float.ToShaped(.float.MatMul(alias,b));');
 expect(value.data.map(x=>x.value)).toEqual([17,39]);
});
test('allocation-free pairwise index recursion preserves old binary32/binary64 operation tree',()=>{
 const old=(a,f)=>a.length===0?0:a.length===1?a[0]:f(old(a.slice(0,Math.floor(a.length/2)),f)+old(a.slice(Math.floor(a.length/2)),f));
 for(const format of ['binary32','binary64']) for(const n of [0,1,2,7,1025]) {
 const data=Array.from({length:n},(_,i)=>(i%3===0?1e8:1)/(i+1));
 const round=format==='binary32'?Math.fround:x=>x;
 expect(Object.is(pairwise(data,format),old(data,round))).toBe(true);
 }
});
test('finite sparse MatMul/Apply stay exact without dense materialization',()=>{
 const result=parseAndEvaluate(`.Plugin.Load("linalg");
 a=.linalg.SparseCoordinates([{= indices=[1,2],value=1/3},{= indices=[50000,1],value=2 }],[50000,50000],{= maxIndex=65536 });
 b=.linalg.SparseCoordinates([{= indices=[2,1],value=3},{= indices=[1,50000],value=1/7 }],[50000,50000],{= maxIndex=65536 });
 c=a.MatMul(b); v=.linalg.SparseCoordinates([{= indices=[2],value=6 }],[50000],{= maxIndex=65536 });
 [c.Get([1,1]),c.Get([50000,50000]),c.SupportSize(),a.Apply(v).Get([1]),c.Verify()];`);
 expect(result.values.map(String)).toEqual(['1','2/7','2','2','1']);
},30000);
test('sparse products reject dimension/countable/work violations and canonicalize cancellation',()=>{
 const prefix='.Plugin.Load("linalg"); a=.linalg.SparseCoordinates([{= indices=[1,1],value=1},{= indices=[1,2],value=1 }],[1,2]);';
 const value=parseAndEvaluate(prefix+'b=.linalg.SparseCoordinates([{= indices=[1,1],value=1},{= indices=[2,1],value=-1 }],[2,1]); a.MatMul(b).SupportSize();');
 expect(String(value)).toBe('0');
 expect(()=>parseAndEvaluate(prefix+'a.MatMul(a);')).toThrow('dimensions');
 expect(()=>parseAndEvaluate('.Plugin.Load("linalg");a=.linalg.SparseCoordinates([],[2,:countable]);a.MatMul(a);')).toThrow('finite');
 expect(()=>parseAndEvaluate('.Plugin.Load("linalg");a=.linalg.SparseCoordinates([{= indices=[1,1],value=1},{= indices=[1,2],value=1}],[2,2],{= maxWork=2});a.MatMul(a);')).toThrow('work budget');
},30000);

test('snapshot aliases share read-only buffers while unsupported worker transfer fails closed',()=>{
 const tensor=api.Tensor([1e40,2],[2],str('binary32'));
 const copied=deepCopyValue({type:'sequence',values:[tensor,tensor]});
 expect(copied.values[0]).toBe(copied.values[1]);
 const output=api.ToShaped(copied.values[0]);
 expect(output.data[0].diagnostics).toContain('overflow');
 expect(output.data[1].diagnostics).toEqual([]);
 output.data[1]=null;
 expect(api.ToShaped(tensor).data[1].value).toBe(2);
 expect(()=>encodeTaskValue(tensor)).toThrow();
});

test('materialized Float cells retain semantic methods and diagnostics',()=>{
 const result=parseAndEvaluate('.Plugin.Load("float"); t=.float.Tensor([10^50],[1],:binary32); x=.float.ToShaped(t)[1]; [x.Format(),x.Diagnostics(),x.Classify()];');
 expect(result.values[0].value).toBe('binary32');
 expect(result.values[1].values.map(x=>x.value)).toContain('overflow');
 expect(result.values[2].entries.get('operation').value).toBe('tensorConvert');
});

test('async Float tensor materialization resolves semantic cells and preserves provenance', async () => {
 const value = await parseAndEvaluateAsync('.Plugin.Load("float"); a=.float.Tensor([1,2,3,4],[2,2],:binary32); b=.float.Tensor([5,6],[2],:binary32); .float.ToShaped(.float.MatMul(a,b));');
 expect(value.data.map(cell=>cell.value)).toEqual([17,39]);
 expect(value.data.every(cell=>cell.type==='float_ieee754')).toBe(true);
 expect(value.data.map(cell=>cell.operation)).toEqual(['tensorMatMul','tensorMatMul']);
 const overflow=await parseAndEvaluateAsync('.Plugin.Load("float"); t=.float.Tensor([10^50],[1],:binary32); x=.float.ToShaped(t)[1]; [x.Format(),x.Diagnostics(),x.Classify()];');
 expect(overflow.values[0].value).toBe('binary32');
 expect(overflow.values[1].values.map(x=>x.value)).toContain('overflow');
 expect(overflow.values[2].entries.get('operation').value).toBe('tensorConvert');
});
