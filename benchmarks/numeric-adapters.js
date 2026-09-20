// bun benchmarks/numeric-adapters.js > benchmarks/numeric-adapters-baseline.json
import { pairwise } from '../plugins/float/approximate-algorithms.js';
import { createFloatTensorAdapters, floatTensorToTypedArray } from '../plugins/float/tensor-adapters.js';
import { convertFloat, roundToFormat } from '../plugins/float/ieee754.js';
const api=createFloatTensorAdapters();
const n=65536, iterations=12;
const data=Array.from({length:n},(_,i)=>((i*17)%101-50)/7);
let copiedElements=0, arrays=0;
function referencePairwise(a) {
 if(a.length===0)return 0;if(a.length===1)return a[0];
 const mid=Math.floor(a.length/2);copiedElements+=a.length;arrays+=2;
 return roundToFormat(referencePairwise(a.slice(0,mid))+referencePairwise(a.slice(mid)),'binary64');
}
function measure(fn, repetitions=iterations) {
 for(let i=0;i<3;i++)fn();Bun.gc(true);
 const before=process.memoryUsage(); const t=performance.now();let result;
 for(let i=0;i<repetitions;i++)result=fn();
 const ms=(performance.now()-t)/repetitions;const after=process.memoryUsage();
 return {ms,heapDelta:after.heapUsed-before.heapUsed,arrayBufferDelta:after.arrayBuffers-before.arrayBuffers,result};
}
const old=measure(()=>referencePairwise(data));const optimized=measure(()=>pairwise(data,'binary64'));
const size=48, a=Array.from({length:size*size},(_,i)=>(i%9-4)/8),b=a.map((_,i)=>(i%7-3)/4);
const boxedA=a.map(x=>convertFloat(x,'binary64','float_ieee754')),boxedB=b.map(x=>convertFloat(x,'binary64','float_ieee754'));
const at=api.Tensor(a,[size,size]),bt=api.Tensor(b,[size,size]);
const boxed=measure(()=>{
 const out=[];
 for(let i=0;i<size;i++)for(let j=0;j<size;j++){
 let sum=convertFloat(0,'binary64','float_ieee754');
 for(let k=0;k<size;k++)sum=convertFloat(sum.value+convertFloat(boxedA[i*size+k].value*boxedB[k*size+j].value,'binary64','float_ieee754').value,'binary64','float_ieee754');
 out.push(sum.value);
 }return out;
},4);
const typed=measure(()=>[...floatTensorToTypedArray(api.MatMul(at,bt))],4);
if(!Object.is(old.result,optimized.result)||!boxed.result.every((x,i)=>Object.is(x,typed.result[i])))throw new Error('Deterministic output mismatch');
const checksum=boxed.result.reduce((a,b)=>a+b,0);delete boxed.result;delete typed.result;
console.log(JSON.stringify({runtime:Bun.version,platform:process.platform,architecture:process.arch,date:new Date().toISOString(),
 notes:['Times are per-call warm samples, not thresholds. Heap deltas depend on GC and are not peak memory or isolation guarantees.','Matrix boxed scalar reference represents explicit per-operation Float allocation; no existing public dense MatMul is replaced. Typed kernel includes a defensive output copy.','Float results are approximate, sequential per-product/per-add rounding. Exact sparse kernels remain Rational; no certified evidence generated.'],
 pairwise:{length:n,iterations,reference:old,optimized,referenceTemporaryArraysPerCall:arrays/(iterations+3),referenceCopiedElementsPerCall:copiedElements/(iterations+3),optimizedTemporaryArrays:0},
 matmul:{size,reference:boxed,typed,checksum,equalEveryElement:true,referenceFloatObjectsPerCall:size*size*(1+size*2),typedNumericBufferBytes:size*size*8}},null,2));
