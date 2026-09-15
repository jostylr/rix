import {test,expect} from 'bun:test';
import {parseAndEvaluate} from '../../src/index.js';
import {queryTrajectoryTime,trajectorySliderTime,installTrajectoryScrubber} from '../../src/tools/trajectory-view.js';
const make=(solver='RK4({= steps=2 })',options='')=>parseAndEvaluate(`.Plugin.Load("ode"); .Plugin.Load("plot"); t := .calculus.Variable(:t); s := .ode.IVP([.calculus.Constant(1),.calculus.Constant(2)],1,[1,2],1:0,{= stateNames=[:x,:v] }).${solver}; .plot.LinkedTrajectory(s,{= components=[1,2],phaseComponents=[1,2] ${options} });`);
test('scrub uses exact backward interpolation and physical-time slider order',()=>{
 const g=make(),r=queryTrajectoryTime(g,'1/3');
 expect(String(r.panels[0].ylo)).toBe('1/3');expect(String(r.panels[1].ylo)).toBe('2/3');
 expect(String(r.panels[2].xlo)).toBe('1/3');expect(r.panels[0].status).toBe('approximate');
 expect(String(trajectorySliderTime(g,0))).toBe('0');expect(String(trajectorySliderTime(g,1000))).toBe('1');
});
test('certified scrub retains tube bounds and discloses omitted coverage',()=>{
 const g=make('ValidatedTaylor({= steps=2,order=3,maxSubintervals=1 })',',maxSegments=1');
 const r=queryTrajectoryTime(g,'3/4');
 const rec=g.metadata.get('panels').values[0].entries.get('records').values[0];
 expect(String(r.panels[0].ylo)).toBe(String(rec.entries.get('low')));
 expect(r.panels[0].status).toBe('enclosed');
 expect(queryTrajectoryTime(g,'1/4').status).toBe('uncomputed');
 expect(queryTrajectoryTime(g,'2').status).toBe('uncomputed');
});
test('scrub work, rational length, and resolution are explicit budgets',()=>{
 expect(()=>queryTrajectoryTime(make('RK4({= steps=2 })',',maxScrubWork=1'),'1/3')).toThrow('maxScrubWork');
 expect(()=>queryTrajectoryTime(make('RK4({= steps=2 })',',maxScrubDigits=2'),'1/333')).toThrow('maxScrubDigits');
 expect(String(trajectorySliderTime(make('RK4({= steps=2 })',',scrubSteps=2000'),1000))).toBe('1/2');
 expect(()=>make('RK4({= steps=2 })',',scrubSteps=0')).toThrow();
});
test('scrubber input updates markers and clears stale selections for missing time',()=>{
 const node=()=>({children:[],listeners:{},attrs:{},append(...values){this.children.push(...values);},setAttribute(k,v){this.attrs[k]=v;},addEventListener(k,f){this.listeners[k]=f;},remove(){this.removed=true;}});
 const doc={createElement:node,createElementNS:node},root=node(),panels=[node(),node(),node()];
 root.ownerDocument=doc;root.insertBefore=(child)=>root.children.push(child);
 const svg={querySelector:s=>panels[Number(s.match(/panel-(\d+)/)[1])-1]};
 let selected=null;let cleared=0;
 installTrajectoryScrubber(root,svg,make('RK4({= steps=2 })',',maxSegments=1'),{selectById:id=>selected=id,clearSelection:()=>{selected=null;cleared++;}});
 const [slider,input,readout]=root.children[0].children;
 expect(readout.textContent).toContain('uncomputed');
 input.value='3/4';input.listeners.change();
 expect(selected).toBe('panel-1-trajectory-1');expect(readout.textContent).toContain('approximate y=[3/4, 3/4]');
 const mark=panels[0].children.at(-1);
 slider.value='0';slider.listeners.input();
 expect(mark.removed).toBe(true);expect(selected).toBeNull();expect(cleared).toBeGreaterThan(0);
});
