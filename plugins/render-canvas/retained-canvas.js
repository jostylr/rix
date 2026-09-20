import { paintCanvasPlan } from './canvas-plan.js';

/** LRU bounded by both entry count and retained SVG source code units. */
export function createCanvasPathCache({ maxEntries = 512, maxSourceLength = 1_000_000, Path = globalThis.Path2D } = {}) {
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > 4096 || !Number.isSafeInteger(maxSourceLength) || maxSourceLength < 1 || maxSourceLength > 4_000_000) throw new Error('Invalid Canvas cache limits');
    const entries = new Map();
    let size = 0;
    const stats = { hits: 0, misses: 0, evictions: 0 };
    return {
        get(source) {
            if (typeof Path !== 'function') throw new Error('Canvas paths require Path2D; use the static SVG fallback');
            if (typeof source !== 'string' || source.length > 1_000_000) throw new Error('Canvas path source exceeds budget');
            if (entries.has(source)) { const path = entries.get(source); entries.delete(source); entries.set(source, path); stats.hits++; return path; }
            stats.misses++;
            const path = new Path(source);
            if (source.length > maxSourceLength) return path;
            while (entries.size >= maxEntries || size + source.length > maxSourceLength) { const key = entries.keys().next().value; entries.delete(key); size -= key.length; stats.evictions++; }
            entries.set(source, path); size += source.length;
            return path;
        },
        clear() { entries.clear(); size = 0; },
        get stats() { return { ...stats, entries: entries.size, sourceLength: size }; },
    };
}

function flatBounds(command) {
    const [name, ...args] = command;
    const style = args.at(-1);
    // Curves, transforms, text metrics and clipping need conservative full redraw.
    if (!['rectangle', 'circle'].includes(name) || !style || typeof style !== 'object') return null;
    const pad = style.stroke ? (style.width ?? 1) / 2 + 2 : 2;
    if (!Number.isFinite(pad) || pad < 0) return null;
    const [x, y, a, b] = args;
    const bounds = name === 'rectangle' ? [Math.min(x, x+a), Math.min(y, y+b), Math.abs(a), Math.abs(b)] : [x-a, y-a, 2*a, 2*a];
    if (!bounds.every(Number.isFinite)) return null;
    return [bounds[0]-pad,bounds[1]-pad,bounds[2]+2*pad,bounds[3]+2*pad];
}
function union(bounds) {
    let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
    for (const [a,b,w,h] of bounds) { x=Math.min(x,a);y=Math.min(y,b);right=Math.max(right,a+w);bottom=Math.max(bottom,b+h); }
    return [x,y,right-x,bottom-y];
}
function intersects(a,b) { return a[0]<=b[0]+b[2] && a[0]+a[2]>=b[0] && a[1]<=b[1]+b[3] && a[1]+a[3]>=b[1]; }

function validatePlan(plan, maxCommands) {
    if (!plan || plan.schema !== 'rix.canvas-plan@1' || !Array.isArray(plan.commands) || plan.commands.length > maxCommands) throw new Error('Invalid or over-budget Canvas plan');
    const ratio=plan.pixelRatio ?? 1, width=plan.backingWidth ?? plan.width, height=plan.backingHeight ?? plan.height;
    if (![plan.width,plan.height,width,height,ratio].every(n=>Number.isFinite(n)&&n>0) || width>8192 || height>8192 || width*height>16_777_216 || ratio>16) throw new Error('Canvas dimensions exceed budget');
    if (plan.viewport?.transform && (plan.viewport.transform.length!==6 || !plan.viewport.transform.every(Number.isFinite))) throw new Error('Invalid Canvas transform');
    let sources=0,depth=0;
    const numericCounts={rectangle:4,circle:3,text:2,translate:2,rotate:1,scale:2,clipRect:4};
    for(const command of plan.commands) {
        if(!Array.isArray(command)) throw new Error('Invalid Canvas command');
        const [name,...args]=command;
        if(name==='save') { if(++depth>256) throw new Error('Canvas nesting exceeds budget'); }
        else if(name==='restore') { if(--depth<0) throw new Error('Unbalanced Canvas restore'); }
        else if(name==='path2d') { if(typeof args[0]!=='string' || args[0].length>1_000_000) throw new Error('Canvas path source exceeds budget'); sources+=args[0].length; }
        else if(Object.hasOwn(numericCounts,name)) { if(args.length<numericCounts[name] || !args.slice(0,numericCounts[name]).every(Number.isFinite)) throw new Error('Invalid Canvas geometry'); if(name==='circle' && args[2]<0) throw new Error('Invalid Canvas radius'); }
        else if(name!=='style') throw new Error('Unknown Canvas command');
        if(name==='text') { if(typeof args[2]!=='string' || args[2].length>100_000) throw new Error('Canvas text exceeds budget'); sources+=args[2].length; }
        const hasStyle=['path2d','rectangle','circle','text','style'].includes(name);
        const style=hasStyle ? args.at(-1) : null;
        if(hasStyle) {
            if(!style || typeof style!=='object') throw new Error('Invalid Canvas style');
            for(const key of ['width','size','opacity']) if(style[key]!==undefined && (!Number.isFinite(style[key]) || style[key]<0)) throw new Error('Invalid Canvas style number');
            if(style.dash && (!Array.isArray(style.dash) || style.dash.length>128 || !style.dash.every(n=>Number.isFinite(n)&&n>=0))) throw new Error('Invalid Canvas dash');
        }
        if(sources>4_000_000) throw new Error('Canvas source exceeds budget');
    }
    if(depth!==0) throw new Error('Unbalanced Canvas save');
}

/** Retained state belongs to one host/context; source plans stay portable. */
export function createCanvasPainter(context, options = {}) {
    if(!context || typeof context.save!=='function') throw new Error('Canvas painter requires a 2D context');
    const maxCommands=options.maxCommands ?? 100_000;
    if(!Number.isSafeInteger(maxCommands) || maxCommands<1 || maxCommands>100_000) throw new Error('Invalid Canvas command limit');
    const pathCache = createCanvasPathCache(options);
    let previous = null, previousKey = null;
    return {
        paint(plan) {
            validatePlan(plan,maxCommands);
            const Path = Object.hasOwn(options,'Path') ? options.Path : globalThis.Path2D;
            if(typeof Path!=='function' && plan.commands.some(([name])=>['path2d','rectangle','circle'].includes(name))) throw new Error('Canvas paths require Path2D; use the static SVG fallback');
            if(context.canvas && previous && (context.canvas.width !== (previous.backingWidth || previous.width) || context.canvas.height !== (previous.backingHeight || previous.height))) { previous=null;previousKey=null; }
            const key = JSON.stringify([plan.width,plan.height,plan.backingWidth,plan.backingHeight,plan.pixelRatio,plan.viewport,plan.commands]);
            if (key === previousKey) return { mode:'unchanged', commands:0 };
            const sameFrame = previous && JSON.stringify([previous.width,previous.height,previous.backingWidth,previous.backingHeight,previous.pixelRatio,previous.viewport]) === JSON.stringify([plan.width,plan.height,plan.backingWidth,plan.backingHeight,plan.pixelRatio,plan.viewport]);
            const identity = !plan.viewport?.transform || JSON.stringify(plan.viewport.transform) === '[1,0,0,1,0,0]';
            const oldBounds = previous?.commands.map(flatBounds), newBounds = plan.commands.map(flatBounds);
            let result;
            if (sameFrame && identity && oldBounds.every(Boolean) && newBounds.every(Boolean)) {
                const changed = [];
                for (let i=0;i<Math.max(previous.commands.length,plan.commands.length);i++) if (JSON.stringify(previous.commands[i]) !== JSON.stringify(plan.commands[i])) { if(oldBounds[i]) changed.push(oldBounds[i]); if(newBounds[i]) changed.push(newBounds[i]); }
                let dirty = union(changed);
                const ratio = plan.pixelRatio || 1;
                // Never clip an antialiased curve/stroke halfway through its rasterization.
                // Expanding to the union of all such bounds is conservative and linear.
                const delicate = newBounds.filter((_,i)=>plan.commands[i][0]==='circle' || plan.commands[i].at(-1).stroke);
                if(delicate.length) dirty=union([dirty,...delicate]);
                const right=Math.ceil((dirty[0]+dirty[2])*ratio)/ratio, bottom=Math.ceil((dirty[1]+dirty[3])*ratio)/ratio;
                dirty[0]=Math.floor(dirty[0]*ratio)/ratio;dirty[1]=Math.floor(dirty[1]*ratio)/ratio;dirty[2]=right-dirty[0];dirty[3]=bottom-dirty[1];
                const commands = plan.commands.filter((_,i)=>intersects(newBounds[i],dirty));
                context.save();
                try {
                    context.setTransform(ratio,0,0,ratio,0,0);
                    context.clearRect(...dirty); context.beginPath(); context.rect(...dirty); context.clip();
                    paintCanvasPlan(context,{...plan,commands},{retainBacking:true,pathCache,Path:options.Path});
                } finally { context.restore(); }
                result = {mode:'dirty',commands:commands.length,dirty};
            } else {
                paintCanvasPlan(context,plan,{pathCache,Path:options.Path});
                result = {mode:'full',commands:plan.commands.length};
            }
            // Snapshot protects invalidation when callers mutate their plan in place.
            previous = JSON.parse(JSON.stringify(plan)); previousKey = key;
            return result;
        },
        invalidate() { previous=null;previousKey=null; },
        dispose() { previous=null;previousKey=null;pathCache.clear(); },
        get stats() { return pathCache.stats; },
    };
}

/** Explicit host-selected OffscreenCanvas execution; no automatic workers or I/O. */
export function createCanvasWorkerHandler({ postMessage, Path = globalThis.Path2D } = {}) {
    let painter = null;
    return function handle(message) {
        const {type,id,canvas,plan} = message.data ?? message;
        try {
            if(type==='init') { painter?.dispose(); const context=canvas.getContext('2d'); if(!context) throw new Error('OffscreenCanvas 2D unavailable'); painter=createCanvasPainter(context,{Path}); }
            else if(type==='paint') { if(!painter) throw new Error('Canvas worker is not initialized'); const result=painter.paint(plan); postMessage?.({id,type:'painted',result,accessibility:plan.accessibility,hitRegions:plan.hitRegions}); }
            else if(type==='dispose') { painter?.dispose();painter=null; }
            else throw new Error('Unknown Canvas worker message');
        } catch(error) { postMessage?.({id,type:'error',message:error.message}); }
    };
}
