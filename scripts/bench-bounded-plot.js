import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createDefaultSystemContext,Context,parseAndEvaluate,formatValue,renderOutputHtml} from '../src/index.js';
import {Integer} from '@ratmath/core';
const integer=n=>new Integer(BigInt(n));
const array=values=>({type:'sequence',values});
const context=new Context();
const systemContext=createDefaultSystemContext();
const rows=array(Array.from({length:4096},(_,i)=>array([integer(i),integer((i*37)%101-50)])));
const grid=array(Array.from({length:64},(_,r)=>array(Array.from({length:64},(_,c)=>integer((r*7+c*13)%101)))));
context.setFresh('benchrows',rows);context.setFresh('benchgrid',grid);
parseAndEvaluate('.Plugin.Load("plot");',{context,systemContext});
const cases=[['line-all','.plot.Line(benchrows)'],['line-bounded','.plot.BoundedLine(benchrows,{= maxPoints=128 })'],['heatmap-1024','.plot.HeatMapData(benchgrid,[0,64],[0,64],{= maxCells=1024 })'],['heatmap-64','.plot.HeatMapData(benchgrid,[0,64],[0,64],{= maxCells=64 })']];
const results=[];
for(const [name,source] of cases){
 Bun.gc(true);const before=process.memoryUsage().heapUsed;const start=performance.now();
 const graphic=parseAndEvaluate(source,{context,systemContext});const evaluated=performance.now();const html=renderOutputHtml(graphic,formatValue);const ended=performance.now();
 const result={name,inputCount:4096,evaluateMs:Math.round((evaluated-start)*100)/100,renderMs:Math.round((ended-evaluated)*100)/100,heapDeltaBytes:process.memoryUsage().heapUsed-before,children:graphic.children.length,htmlBytes:Buffer.byteLength(html),sha256:createHash('sha256').update(html).digest('hex')};const replay=renderOutputHtml(parseAndEvaluate(source,{context,systemContext}),formatValue);
 assert.equal(createHash('sha256').update(replay).digest('hex'),result.sha256,'Repeated input must produce identical portable output');
 result.deterministicReplay=true;results.push(result);console.log(JSON.stringify(result));
}
const report={schema:'rix.plot.performance@1',runtime:Bun.version,platform:process.platform,architecture:process.arch,date:new Date().toISOString(),notes:['One bounded workload per case after plugin initialization; timing is observational, not a pass/fail threshold.','All 4096 source values are validated; bounding reduces retained scene/output size, not inputscan cost.','Heap delta includes temporary allocations; it is not retained-memory usage or hard memory isolation.'],results};
const path=process.argv[2];if(path){mkdirSync(new URL('../benchmarks/',import.meta.url),{recursive:true});writeFileSync(path,JSON.stringify(report,null,2)+'\n');}
