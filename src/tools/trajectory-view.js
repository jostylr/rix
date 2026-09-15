/** Bounded, callback-free queries of retained trajectory plot evidence. */
import {Rational} from '@ratmath/core';
const field=(v,k)=>v instanceof Map?v.get(k.toLowerCase()):v?.entries instanceof Map?v.entries.get(k.toLowerCase()):v?.[k];
const list=v=>Array.isArray(v)?v:v?.values||[];
const word=v=>v?.value??v;
const q=v=>new Rational(v);
const number=v=>Number(q(v).numerator)/Number(q(v).denominator);
const limit=(v,name)=>{const n=number(v);if(!Number.isSafeInteger(n)||n<1)throw Error(`Invalid ${name}`);return n;};

export function queryTrajectoryTime(graphic,time) {
    const metadata=graphic.metadata, policy=field(metadata,'scrub');
    const maxWork=limit(field(policy,'maxWork'),'maxScrubWork');
    const maxDigits=limit(field(policy,'maxDigits'),'maxScrubDigits');
    let work=0;
    const check=v=>{if(String(v).length>maxDigits)throw Error('maxScrubDigits exceeded');return q(v);};
    const t=check(time), panels=[];
    for(const panel of list(field(metadata,'panels'))) {
        if(++work>maxWork)throw Error('maxScrubWork exceeded');
        let found=null;
        for(const record of list(field(panel,'records'))) {
            if(++work>maxWork)throw Error('maxScrubWork exceeded');
            const a=check(field(record,'tStart')),b=check(field(record,'tEnd'));
            if(t.lessThan(a.lessThan(b)?a:b)||t.greaterThan(a.greaterThan(b)?a:b))continue;
            const certified=word(field(record,'kind'))==='certifiedTube';
            const phase=word(field(panel,'rendering'))==='odeProjectedTubeBoxes';
            const interpolate=(start,end)=>check(check(start).add(check(check(end).subtract(check(start))).multiply(check(t.subtract(a).divide(b.subtract(a))))));
            const ylo=certified?check(field(record,'low')):interpolate(field(record,'stateStart'),field(record,'stateEnd'));
            const yhi=certified?check(field(record,'high')):ylo;
            const xlo=phase?(certified?check(field(record,'xLow')):interpolate(field(record,'xStart'),field(record,'xEnd'))):t;
            const xhi=phase&&certified?check(field(record,'xHigh')):xlo;
            found={id:word(field(record,'id')),status:certified?'enclosed':'approximate',xlo,xhi,ylo,yhi,phase};
            break;
        }
        panels.push(found??{status:'uncomputed'});
    }
    return {time:t,panels,work,policy:'wholeRetainedTube',status:panels.some(p=>p.status==='uncomputed')?'uncomputed':'available'};
}

export function trajectorySliderTime(graphic,step) {
    const metadata=graphic.metadata,steps=limit(field(field(metadata,'scrub'),'steps'),'scrubSteps');
    if(!Number.isSafeInteger(step)||step<0||step>steps)throw Error('Invalid scrub position');
    const interval=field(field(list(field(metadata,'panels'))[0],'evidence'),'requestedInterval');
    return q(interval.low).add(q(interval.high).subtract(q(interval.low)).multiply(new Rational(BigInt(step),BigInt(steps))));
}

export function installTrajectoryScrubber(root,svg,graphic,navigation) {
    if(!field(graphic?.metadata,'scrub')||!root.ownerDocument?.createElement)return;
    const doc=root.ownerDocument,controls=doc.createElement('div'),slider=doc.createElement('input'),input=doc.createElement('input'),readout=doc.createElement('output');
    controls.className='rix-trajectory-controls';
    slider.type='range';slider.min='0';slider.max=String(limit(field(field(graphic.metadata,'scrub'),'steps'),'scrubSteps'));slider.step='1';slider.value='0';
    slider.setAttribute('aria-label','Trajectory time');input.setAttribute('aria-label','Exact trajectory time');
    readout.setAttribute('aria-live','polite');
    controls.append(slider,input,readout);root.insertBefore(controls,svg);
    const overlays=[];
    const update=time=>{
        overlays.splice(0).forEach(node=>node.remove());
        try {
            const result=queryTrajectoryTime(graphic,time);
            input.value=String(result.time);
            const first=result.panels.find(p=>p.id);
            first?navigation?.selectById(first.id,'scrub',false):navigation?.clearSelection();
            readout.textContent=`t=${result.time}: `+result.panels.map((p,i)=>`panel ${i+1}: ${p.status==='uncomputed'?'uncomputed / omitted':`${p.status} y=[${p.ylo}, ${p.yhi}]${p.phase?` x=[${p.xlo}, ${p.xhi}]`:''}`}`).join('; ');
            result.panels.forEach((p,i)=>{
                if(!p.id)return;
                const config=list(field(graphic.metadata,'panelViews'))[i];
                const project=(value,axis)=>{
                    const lo=q(field(config,axis+'min')),hi=q(field(config,axis+'max'));
                    const margin=number(field(config,'margin')),size=number(field(config,axis==='x'?'width':'height'));
                    const fraction=number(value.subtract(lo).divide(hi.subtract(lo)));
                    return axis==='x'?margin+fraction*(size-2*margin):size-margin-fraction*(size-2*margin);
                };
                const x=project(p.xlo,'x'),y=project(p.yhi,'y'),w=project(p.xhi,'x')-x,h=project(p.ylo,'y')-y;
                if(![x,y,w,h].every(Number.isFinite))return;
                const node=doc.createElementNS('http://www.w3.org/2000/svg',p.status==='approximate'?'circle':w===0?'line':'rect');
                const attrs=p.status==='approximate'?{cx:x,cy:y,r:4}:w===0?{x1:x,x2:x,y1:y,y2:y+h}:{x,y,width:w,height:h};
                Object.entries({...attrs,stroke:'#be123c','stroke-width':3,fill:p.status==='approximate'?'#be123c':'none','pointer-events':'none'}).forEach(([k,v])=>node.setAttribute(k,String(v)));
                const container=svg.querySelector(`[data-rix-semantic-id="linked-panel-${i+1}"]`);
                if(container){container.append(node);overlays.push(node);}
            });
        } catch(error) {navigation?.clearSelection();readout.textContent=`Time query unavailable: ${error.message}`;}
    };
    slider.addEventListener('input',()=>update(trajectorySliderTime(graphic,Number(slider.value))));
    input.addEventListener('change',()=>update(input.value));
    update(trajectorySliderTime(graphic,0));
}
