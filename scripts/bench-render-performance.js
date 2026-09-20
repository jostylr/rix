import { paintCanvasPlan } from '../plugins/render-canvas/canvas-plan.js';
import { createCanvasPainter } from '../plugins/render-canvas/retained-canvas.js';

// A deterministic CPU-only host isolates path-source parsing and replay costs.
// Browser pixel/offscreen acceptance lives in check-render-performance-browser.js.
let constructions=0, checksum=0;
class CountingPath {
    constructor(source='') { constructions++; this.sum=(source.match(/-?\d+(?:\.\d+)?/g)||[]).reduce((sum,n)=>sum+Number(n),0); }
    rect() {} arc() {}
}
const context={canvas:{},globalAlpha:1,save(){},restore(){},setTransform(){},fill(p){checksum+=p.sum;},stroke(p){checksum+=p.sum;},setLineDash(){}};
const commands=Array.from({length:200},(_,i)=>['path2d',Array.from({length:100},(_,j)=>`${j?'L':'M'}${j} ${i+j}`).join(' '),{stroke:'black'}]);
const plan={schema:'rix.canvas-plan@1',width:640,height:480,commands};
function measure(run) { constructions=0;checksum=0;const start=performance.now();for(let i=0;i<30;i++) {plan.commands[0][2].stroke=i%2?'red':'black';run();}return {milliseconds:performance.now()-start,pathConstructions:constructions,checksum}; }
const before=measure(()=>paintCanvasPlan(context,plan,{Path:CountingPath}));
const painter=createCanvasPainter(context,{Path:CountingPath});
const after=measure(()=>painter.paint(plan));
if(before.checksum!==after.checksum || after.pathConstructions!==200) throw new Error('Render benchmark output mismatch');
console.log(JSON.stringify({schema:'rix.render-performance-baseline@1',runtime:Bun.version,fixture:{paths:200,pointsPerPath:100,frames:30},measurement:'CPU-only counting Path host: parses source numeric tokens; not browser/GPU timing',before,after,cache:painter.stats,limitations:'Wall times vary. Source/command/cache/pixel bounds are cooperative limits, not process memory isolation.'},null,2));
