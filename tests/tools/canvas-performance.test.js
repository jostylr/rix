import { expect, test } from 'bun:test';
import { createCanvasPathCache, createCanvasPainter, createCanvasWorkerHandler } from '../../plugins/render-canvas/retained-canvas.js';
class Path { constructor(source) { this.source=source; } rect() {} arc() {} }
function context() {
    const calls=[];
    const ctx={canvas:{width:100,height:100},globalAlpha:1,calls};
    for(const method of ['save','restore','setTransform','clearRect','beginPath','rect','clip','fill','stroke','setLineDash','translate','rotate','scale','fillText','strokeText']) ctx[method]=(...args)=>calls.push([method,...args]);
    return ctx;
}
const rectangle=(x,id='stable')=>['rectangle',x,10,10,10,{fill:'red',hitId:id}];
const plan=(commands)=>({schema:'rix.canvas-plan@1',width:100,height:100,commands,accessibility:{text:'Retained exact source',objects:[{id:'stable'}]},hitRegions:[{id:'stable'}]});
test('bounded LRU shares geometry across styles and invalidates source changes',()=>{
    const cache=createCanvasPathCache({maxEntries:2,maxSourceLength:12,Path});
    const a=cache.get('M0 0'); expect(cache.get('M0 0')).toBe(a);
    cache.get('M1 1');cache.get('M2 2');expect(cache.stats).toMatchObject({hits:1,misses:3,entries:2,evictions:1});
    expect(cache.get('M0 0')).not.toBe(a);cache.get('1234567890123');expect(cache.stats.sourceLength).toBeLessThanOrEqual(12);
    cache.clear();expect(cache.stats.entries).toBe(0);
});
test('retained canvas dirties moved and removed marks, repaints overlaps and skips unrelated marks',()=>{
    const ctx=context(), painter=createCanvasPainter(ctx,{Path});
    const first=plan([rectangle(10),rectangle(12,'overlap'),rectangle(80,'far')]);
    expect(painter.paint(first).mode).toBe('full');expect(painter.paint(first).mode).toBe('unchanged');
    first.commands[0][1]=20;
    expect(painter.paint(first)).toMatchObject({mode:'dirty',commands:2});
    expect(ctx.calls.some(([op])=>op==='clip')).toBe(true);
    first.commands.splice(0,1);expect(painter.paint(first).mode).toBe('dirty');
    first.width=200;expect(painter.paint(first).mode).toBe('full');
    painter.dispose();expect(painter.paint(first).mode).toBe('full');
});
test('paths reuse cache while transformed scenes conservatively redraw',()=>{
    const ctx=context(), painter=createCanvasPainter(ctx,{Path});
    const first=plan([['path2d','M0 0 L10 10',{stroke:'red'}]]);
    painter.paint(first);first.commands[0][2].stroke='blue';expect(painter.paint(first).mode).toBe('full');expect(painter.stats.hits).toBe(1);
    first.commands[0][1]='M0 0 L20 20';painter.paint(first);expect(painter.stats.misses).toBe(2);
    expect(()=>painter.paint(plan(Array(100001).fill(rectangle(0))))).toThrow('over-budget');
});
test('worker protocol returns semantic/accessibility companion and contains lifecycle errors',()=>{
    const messages=[],handle=createCanvasWorkerHandler({Path,postMessage:m=>messages.push(m)});
    handle({type:'paint',id:0,plan:plan([])});expect(messages[0].type).toBe('error');
    handle({type:'init',canvas:{getContext:()=>context()}});handle({type:'paint',id:1,plan:plan([rectangle(1)])});
    expect(messages[1]).toMatchObject({type:'painted',id:1,hitRegions:[{id:'stable'}],accessibility:{objects:[{id:'stable'}]}});
    handle({type:'dispose'});handle({type:'paint',id:2,plan:plan([])});expect(messages[2].type).toBe('error');
});
test('preflight rejects malformed/big plans without clearing previous output and notices resize',()=>{
    const ctx=context(),painter=createCanvasPainter(ctx,{Path});const valid=plan([rectangle(1)]);painter.paint(valid);const count=ctx.calls.length;
    for(const invalid of [{...valid,width:9000},plan([rectangle(NaN)]),plan([['restore']]),plan([['path2d','M'.repeat(1_000_001),{}]])]) expect(()=>painter.paint(invalid)).toThrow();
    expect(ctx.calls.length).toBe(count);ctx.canvas.width=50;expect(painter.paint(valid).mode).toBe('full');
    painter.invalidate();expect(painter.paint(valid).mode).toBe('full');
    expect(()=>createCanvasPainter(ctx,{maxCommands:Infinity})).toThrow();
});
