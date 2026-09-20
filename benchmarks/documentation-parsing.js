import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Context,createDefaultRegistry,createDefaultSystemContext} from '../src/index.js';
import {runFence} from '../documentation/scripts/check-examples.js';
const cells=12;
const fence={file:'parse-benchmark.md',source:'f := x -> x^2 + 1; f(3)',attrs:{parse:'true'}};
function measure(eager){Bun.gc(true);const heap=process.memoryUsage().heapUsed,start=performance.now();const results=[];for(let i=0;i<cells;i++){
 // Reproduce the former unused eager evaluator setup for a parse-only fence.
 if(eager){const runtime={context:new Context(),registry:createDefaultRegistry(),systemContext:createDefaultSystemContext()};assert.ok(runtime.context);}
 results.push(runFence(fence));
 }return {milliseconds:performance.now()-start,heapDelta:process.memoryUsage().heapUsed-heap,checksum:createHash('sha256').update(JSON.stringify(results)).digest('hex'),passed:results.every(r=>r.status==='pass')};}
const before=measure(true),after=measure(false);assert.equal(before.checksum,after.checksum);assert.ok(after.passed);
console.log(JSON.stringify({schema:'rix.documentation-parse-performance@1',runtime:Bun.version,cells,before,after,limitations:'Eager reference reconstructs the removed per-fence evaluator initialization. Hidden setup and executable fences still initialize an evaluator. Times and GC-sensitive heap deltas are observations, not isolation limits.'},null,2));
