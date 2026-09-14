import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync,renderOutputHtml,formatValue} from '../../src/index.js';
for(const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
 const run=s=>evaluate('.Plugin.Load("ode"); .Plugin.Load("plot"); y := .calculus.Variable(:y); p := .ode.IVP(.calculus.Constant(1),0,0,0:1,{= events=[.ode.Event(y-1/2,{= name=:half })] });'+s,{context:new Context()});
 test(`${mode}: event overlays retain certified and observed classifications`,async()=>{
  for(const [solver,classification] of [['ValidatedTaylor({= steps=1,order=3,maxSubintervals=1 })','certifiedUniqueEvent'],['RK4({= steps=1 })','observedCandidate']]) {
   const g=await run(`s := p.${solver}; .plot.EventTrajectory(s.IsolateEvents()[1]);`);
   const overlays=g.metadata.get('plot').entries.get('eventoverlays').values;
   expect(overlays).toHaveLength(1);
   expect(overlays[0].entries.get('candidate').entries.get('classification').value).toBe(classification);
   expect(renderOutputHtml(g,formatValue)).toContain('event-1');
  }
 },60000);
 test(`${mode}: event budgets and invalid result records are rejected`,async()=>{
  for(const s of ['s := p.RK4(); .plot.EventTrajectory(s.IsolateEvents()[1],{= maxEvents=0 });','.plot.EventTrajectory({= });']) {
   await expect((async()=>run(s))()).rejects.toThrow();
  }
 },30000);
 test(`${mode}: phase events retain whole-segment bounds and omitted events remain counted`,async()=>{
  const g=await run('p := .ode.IVP([.calculus.Constant(1),.calculus.Constant(2)],0,[0,0],0:1,{= stateNames=[:y,:v],events=[.ode.Event(y-3/4)] }); s := p.ValidatedTaylor({= steps=2,order=3,maxSubintervals=1 }); .plot.EventPhasePortrait(s.IsolateEvents()[1],{= maxSegments=1 });');
  const m=g.metadata.get('plot');
  expect(m.entries.get('eventoverlays').values).toHaveLength(0);
  expect(String(m.entries.get('eventdisplay').entries.get('candidates'))).toBe('1');
  expect(m.entries.get('status').value).toBe('partial');
 },30000);
}
