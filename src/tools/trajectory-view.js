/** Bounded, callback-free queries of retained trajectory plot evidence. */
import {Rational,RationalInterval} from '@ratmath/core';
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
    const interval=v=>new RationalInterval(check(v.low??v),check(v.high??v));
    const spend=()=>{if(++work>maxWork)throw Error('maxScrubWork exceeded');};
    const mode=word(field(policy,'mode'))??'tube';
    if(!['taylor','tube'].includes(mode))throw Error('Invalid scrub mode');
    const maxOrder=limit(field(policy,'maxOrder')??16,'maxScrubOrder');
    const atTime=(coefficients,start,delta,low,high)=>{
        const rows=list(coefficients);
        if(rows.length>maxOrder)throw Error('maxScrubOrder exceeded');
        let value=interval(start),power=check(1);
        for(const coefficient of rows){
            spend();power=check(power.multiply(delta));
            const term=interval(interval(coefficient).multiply(power));
            value=interval(value.add(term));
        }
        const result=value.intersection(new RationalInterval(low,high));
        if(!result)throw Error('Retained Taylor and tube enclosures are inconsistent');
        return result;
    };
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
            let ylo=certified?check(field(record,'low')):interpolate(field(record,'stateStart'),field(record,'stateEnd'));
            let yhi=certified?check(field(record,'high')):ylo;
            let xlo=phase?(certified?check(field(record,'xLow')):interpolate(field(record,'xStart'),field(record,'xEnd'))):t;
            let xhi=phase&&certified?check(field(record,'xHigh')):xlo;
            const taylor=certified&&mode==='taylor'&&list(field(record,'yCoefficients')).length>0;
            if(taylor){
                const delta=check(t.subtract(a));
                const y=atTime(field(record,'yCoefficients'),field(record,'stateStart'),delta,ylo,yhi);
                ylo=y.low;yhi=y.high;
                if(phase){
                    if(!list(field(record,'xCoefficients')).length)throw Error('Missing retained Taylor x coefficients');
                    const x=atTime(field(record,'xCoefficients'),field(record,'xStart'),delta,xlo,xhi);
                    xlo=x.low;xhi=x.high;
                }
            }
            found={id:word(field(record,'id')),status:certified?'enclosed':'approximate',method:taylor?'retainedTaylorIntersection':certified?'wholeRetainedTube':'linearApproximation',xlo,xhi,ylo,yhi,phase};
            break;
        }
        panels.push(found??{status:'uncomputed'});
    }
    return {time:t,panels,work,policy:mode,status:panels.some(p=>p.status==='uncomputed')?'uncomputed':'available'};
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
            const steps=Number(slider.max),start=trajectorySliderTime(graphic,0),end=trajectorySliderTime(graphic,steps);
            const fraction=number(result.time.subtract(start).divide(end.subtract(start)));
            if(Number.isFinite(fraction))slider.value=String(Math.round(Math.max(0,Math.min(1,fraction))*steps));
            const first=result.panels.find(p=>p.id);
            first?navigation?.selectById(first.id,'scrub',false):navigation?.clearSelection();
            readout.textContent=`t=${result.time}: `+result.panels.map((p,i)=>`panel ${i+1}: ${p.status==='uncomputed'?'uncomputed / omitted':`${p.status} y=[${p.ylo}, ${p.yhi}]${p.phase?` x=[${p.xlo}, ${p.xhi}]`:''} (${p.method})`}`).join('; ');
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
                const point=p.status==='approximate'||(p.xlo.equals(p.xhi)&&p.ylo.equals(p.yhi));
                const node=doc.createElementNS('http://www.w3.org/2000/svg',point?'circle':w===0?'line':'rect');
                const attrs=point?{cx:x,cy:y,r:4}:w===0?{x1:x,x2:x,y1:y,y2:y+h}:{x,y,width:w,height:h};
                Object.entries({...attrs,stroke:'#be123c','stroke-width':3,fill:p.status==='approximate'?'#be123c':'none','pointer-events':'none'}).forEach(([k,v])=>node.setAttribute(k,String(v)));
                const panel=svg.querySelector(`[data-rix-semantic-id="linked-panel-${i+1}"]`);
                const container=panel?.querySelector?.('[data-rix-panel-viewport]')||panel;
                if(container){container.append(node);overlays.push(node);}
            });
        } catch(error) {navigation?.clearSelection();readout.textContent=`Time query unavailable: ${error.message}`;}
    };
    slider.addEventListener('input',()=>update(trajectorySliderTime(graphic,Number(slider.value))));
    input.addEventListener('change',()=>update(input.value));
    update(trajectorySliderTime(graphic,0));
}

export function zoomTrajectoryPanel(state,factor,policy,anchor=[0.5,0.5]) {
    const minimum=number(field(policy,'minimum')),maximum=number(field(policy,'maximum'));
    if(![minimum,maximum,factor,...anchor].every(Number.isFinite)||minimum<=0||minimum>1||maximum<1||factor<=0)throw Error('Panel zoom policy is not browser-representable');
    const next=Math.min(maximum,Math.max(minimum,state.zoom*factor));
    const oldWidth=state.width/state.zoom,oldHeight=state.height/state.zoom;
    if(![state.width/next,state.height/next].every(v=>Number.isFinite(v)&&v>0))throw Error('Panel zoom is not browser-representable');
    state.x+=anchor[0]*(oldWidth-state.width/next);
    state.y+=anchor[1]*(oldHeight-state.height/next);
    state.zoom=next;
    return state;
}

export function installTrajectoryPanelZoom(root,svg,graphic,navigation) {
    const policy=field(graphic?.metadata,'panelZoom'),doc=root.ownerDocument;
    if(!policy||!doc?.createElementNS)return [];
    const controls=doc.createElement('div'),select=doc.createElement('select'),readout=doc.createElement('output');
    controls.className='rix-trajectory-panel-controls';select.setAttribute('aria-label','Panel to zoom');readout.setAttribute('aria-live','polite');
    controls.append(select);
    const panels=list(field(graphic.metadata,'panelViews')).map((config,i)=>{
        const container=svg.querySelector(`[data-rix-semantic-id="linked-panel-${i+1}"]`);
        const width=number(field(config,'width')),height=number(field(config,'height'));
        const viewport=doc.createElementNS('http://www.w3.org/2000/svg','svg');
        viewport.setAttribute('width',String(width));viewport.setAttribute('height',String(height));
        viewport.setAttribute('overflow','hidden');viewport.setAttribute('data-rix-panel-viewport',String(i+1));
        if(container){while(container.firstChild)viewport.append(container.firstChild);container.append(viewport);}
        const option=doc.createElement('option');option.value=String(i);option.textContent=`Panel ${i+1}`;select.append(option);
        return {viewport,state:{x:0,y:0,width,height,zoom:1}};
    });
    select.value='0';
    const apply=panel=>{const s=panel.state;panel.viewport.setAttribute('viewBox',`${s.x} ${s.y} ${s.width/s.zoom} ${s.height/s.zoom}`);navigation?.invalidateHitIndex?.();};
    const change=(index,factor,anchor)=>{
        const panel=panels[index];if(!panel)return;
        try {zoomTrajectoryPanel(panel.state,factor,policy,anchor);apply(panel);readout.textContent=`Panel ${index+1}: ${panel.state.zoom}× zoom`;}
        catch(error){readout.textContent=error.message;}
    };
    const button=(label,action)=>{const b=doc.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);controls.append(b);};
    button('Zoom panel in',()=>change(Number(select.value),number(field(policy,'step'))));
    button('Zoom panel out',()=>change(Number(select.value),1/number(field(policy,'step'))));
    button('Reset panel',()=>{const p=panels[Number(select.value)];if(p){Object.assign(p.state,{x:0,y:0,zoom:1});apply(p);readout.textContent=`Panel ${Number(select.value)+1}: reset`;}});
    controls.append(readout);root.insertBefore(controls,svg);
    panels.forEach((p,i)=>{
        apply(p);
        p.viewport.addEventListener('wheel',event=>{
            event.preventDefault();event.stopPropagation();
            const rect=p.viewport.getBoundingClientRect();
            if(rect.width<=0||rect.height<=0)return;
            select.value=String(i);
            const anchor=[(event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height].map(v=>Math.max(0,Math.min(1,v)));
            change(i,event.deltaY<0?number(field(policy,'step')):1/number(field(policy,'step')),anchor);
        },{passive:false});
    });
    return panels;
}
