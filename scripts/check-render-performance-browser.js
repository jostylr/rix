#!/usr/bin/env bun
/** Real Canvas/OffscreenCanvas pixel parity, cache invalidation and fallback acceptance. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
const root=path.resolve(import.meta.dir,'..');
const artifacts=path.resolve(root,'../tmp/r4-render-browser');await mkdir(artifacts,{recursive:true});
const modulePath=path.join(root,'plugins/render-canvas/retained-canvas.js');
const canvasPath=path.join(root,'plugins/render-canvas/canvas-plan.js');
await Bun.write(path.join(artifacts,'worker.js'),`
import {createCanvasWorkerHandler} from ${JSON.stringify(modulePath)};
let canvas;const handle=createCanvasWorkerHandler({postMessage:message=>postMessage(message)});
onmessage=event=>{if(event.data.type==='init'){canvas=event.data.canvas;canvas.getContext('2d',{willReadFrequently:true});}
 if(event.data.type==='pixels'){postMessage({id:event.data.id,type:'pixels',pixels:Array.from(canvas.getContext('2d',{willReadFrequently:true}).getImageData(0,0,120,80).data)});return;}handle(event);};
`);
await Bun.write(path.join(artifacts,'fixture.js'),`
import {createCanvasPainter} from ${JSON.stringify(modulePath)};
import {paintCanvasPlan,createCanvasPlan} from ${JSON.stringify(canvasPath)};
import {coordinateScene} from ${JSON.stringify(path.join(root,'tests/fixtures/graphic-coordinate-scenes.js'))};
const painter=createCanvasPainter(document.querySelector('#retained').getContext('2d',{willReadFrequently:true}));
const reference=document.querySelector('#reference').getContext('2d',{willReadFrequently:true});
const base={schema:'rix.canvas-plan@1',width:120,height:80,backingWidth:120,backingHeight:80,pixelRatio:1,viewport:{transform:[1,0,0,1,0,0]},
 accessibility:{text:'Exact source coordinates; Canvas is an approximate visual projection',objects:[{id:'moving',label:'moving rectangle'}]},hitRegions:[{id:'moving',semanticId:'moving',bounds:{x:10,y:10,width:20,height:20}}]};
const plan=x=>({...base,commands:[['rectangle',0,0,120,80,{fill:'#ffffff'}],['rectangle',x,10,20,20,{fill:'#336699'}],['circle',25,25,10,{fill:'#ee3366',opacity:0.5}]]});
const pixels=context=>Array.from(context.getImageData(0,0,120,80).data);
const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const modes=[];
for(const x of [10,15,60]){const p=plan(x);modes.push(painter.paint(p).mode);paintCanvasPlan(reference,p);const expected=pixels(reference),actual=pixels(document.querySelector('#retained').getContext('2d',{willReadFrequently:true}));if(!equal(expected,actual))throw Error('dirty pixel mismatch at '+x+' '+JSON.stringify(expected.map((v,i)=>v===actual[i]?null:[i,v,actual[i]]).filter(Boolean).slice(0,12)));}
if(painter.paint(plan(60)).mode!=='unchanged')throw Error('unchanged repaint not skipped');
document.querySelector('#retained').width=121;
const resize=painter.paint(plan(60));const resizePixels=pixels(document.querySelector('#retained').getContext('2d',{willReadFrequently:true}));
if(!equal(pixels(reference),pixels(document.querySelector('#retained').getContext('2d',{willReadFrequently:true}))))throw Error('resize invalidation mismatch '+JSON.stringify(resize)+' '+JSON.stringify(pixels(reference).map((v,i)=>[i,v]).filter(([i,v])=>v!==resizePixels[i]).slice(0,8)));
document.querySelector('#retained').width=120;painter.invalidate();painter.paint(plan(60));if(!equal(pixels(reference),pixels(document.querySelector('#retained').getContext('2d',{willReadFrequently:true}))))throw Error('explicit invalidation mismatch');
const ratios=[];
for(const ratio of [1.25,2]){
 const a=document.createElement('canvas'),b=document.createElement('canvas');const ac=a.getContext('2d',{willReadFrequently:true}),bc=b.getContext('2d',{willReadFrequently:true});const retained=createCanvasPainter(ac);
 for(const x of [10.25,15.5,60.75]){const p={...plan(x),pixelRatio:ratio,backingWidth:120*ratio,backingHeight:80*ratio};retained.paint(p);paintCanvasPlan(bc,p);if(!equal(Array.from(ac.getImageData(0,0,120*ratio,80*ratio).data),Array.from(bc.getImageData(0,0,120*ratio,80*ratio).data)))throw Error('fractional DPR mismatch '+ratio);}
 retained.dispose();ratios.push(ratio);
}
const pathPlan={...base,commands:[['path2d','M5 5L90 15L60 70 Z',{fill:'#33aa88'}]]};painter.paint(pathPlan);painter.paint({...pathPlan,commands:[['path2d',pathPlan.commands[0][1],{fill:'#228877'}]]});
const cache=painter.stats;if(!cache.hits)throw Error('path cache was not reused');
const disclosure=createCanvasPlan(coordinateScene(),String,{precision:3});
document.querySelector('#alternative').textContent=disclosure.accessibility.text;
const unsupported=createCanvasPainter(document.createElement('canvas').getContext('2d',{willReadFrequently:true}),{Path:null});
let fallback=false;try{unsupported.paint(pathPlan);}catch(e){fallback=/Path2D|SVG/.test(e.message);}if(!fallback)throw Error('static fallback not diagnosed');
let workerResult={supported:false};
if(typeof OffscreenCanvas==='function'&&typeof HTMLCanvasElement.prototype.transferControlToOffscreen==='function'){
 const worker=new Worker('/worker.bundle.js',{type:'module'});const pending=new Map();let serial=0;
 worker.onmessage=event=>{const done=pending.get(event.data.id);if(done){pending.delete(event.data.id);done(event.data);}};
 const ask=message=>new Promise(resolve=>{const id=++serial;pending.set(id,resolve);worker.postMessage({...message,id});});
 const canvas=document.querySelector('#worker').transferControlToOffscreen();worker.postMessage({type:'init',canvas},[canvas]);
 const first=await ask({type:'paint',plan:plan(10)}),second=await ask({type:'paint',plan:plan(60)});
 if(second.type!=='painted'||second.accessibility.text!==base.accessibility.text||second.hitRegions[0].semanticId!=='moving')throw Error('worker companion mismatch');
 paintCanvasPlan(reference,plan(60));const result=await ask({type:'pixels'});if(!equal(result.pixels,pixels(reference)))throw Error('worker pixel mismatch');
 window.cleanup=()=>{worker.postMessage({type:'dispose'});worker.terminate();};workerResult={supported:true,first:first.result.mode,second:second.result.mode,pixelParity:true};
}
painter.paint(plan(60));painter.dispose();window.result={ratios,modes,resize:resize.mode,cache,worker:workerResult,mainThreadFallback:true,staticFallback:fallback,semanticIds:disclosure.hitRegions.map(item=>item.semanticId)};
`);
const build=await Bun.build({entrypoints:[path.join(artifacts,'fixture.js'),path.join(artifacts,'worker.js')],outdir:artifacts,naming:'[name].bundle.js',target:'browser'});if(!build.success)throw new AggregateError(build.logs,'Browser build failed');
const html='<!doctype html><html lang="en"><meta charset="utf-8"><title>R4 Canvas acceptance</title><style>body{font:16px system-ui;margin:2rem}canvas{width:360px;height:240px;border:1px solid #888}pre{white-space:pre-wrap;overflow-wrap:anywhere}canvas{max-width:100%}</style><h1>Retained Canvas and worker parity</h1><p>Retained painter · full reference · OffscreenCanvas worker</p><canvas id="retained" aria-describedby="alternative"></canvas><canvas id="reference" aria-describedby="alternative"></canvas><canvas id="worker" aria-describedby="alternative"></canvas><pre id="alternative"></pre><script type="module" src="/fixture.bundle.js"></script></html>';
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const name=new URL(request.url).pathname.slice(1);return ['fixture.bundle.js','worker.bundle.js'].includes(name)?new Response(Bun.file(path.join(artifacts,name))):new Response(html,{headers:{'content-type':'text/html'}});}});
let browser;
try{
 const {chromium}=await import(process.env.RIX_PLAYWRIGHT_MODULE||'playwright');browser=await chromium.launchPersistentContext(path.join(artifacts,"profile-"+Date.now()),{headless:true,...(process.env.RIX_CHROME_EXECUTABLE?{executablePath:process.env.RIX_CHROME_EXECUTABLE}:{})});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});
 await page.goto('http://127.0.0.1:'+server.port);await page.waitForFunction(()=>window.result,{},{timeout:20000});const result=await page.evaluate(()=>window.result);
 assert.deepEqual(errors,[]);assert.deepEqual(result.modes,['full','dirty','dirty']);assert.equal(result.staticFallback,true);assert.ok(result.semanticIds.includes('huge-rational'));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:path.join(artifacts,'canvas.png'),fullPage:true});await page.evaluate(()=>window.cleanup?.());await Bun.write(path.join(artifacts,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser?.close();server.stop(true);}
