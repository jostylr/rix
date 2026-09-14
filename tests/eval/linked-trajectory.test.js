import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync,renderOutputHtml,formatValue} from '../../src/index.js';
import {linkedGraphicSelectionIds} from '../../src/tools/graphic-view.js';
for(const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
 const run=s=>evaluate('.Plugin.Load("ode"); .Plugin.Load("plot"); t := .calculus.Variable(:t); s := .ode.IVP([t,2*t],1,[1/2,1],1:0,{= stateNames=[:x,:v] }).ValidatedTaylor({= steps=2,order=3,maxSubintervals=1 });'+s,{context:new Context()});
 test(`${mode}: linked panels retain common segment identities`,async()=>{
  const g=await run('.plot.LinkedTrajectory(s,{= components=[1,2],phaseComponents=[1,2] });');
  expect(g.children).toHaveLength(3);
  expect(g.metadata.get('panels').values).toHaveLength(3);
  expect(linkedGraphicSelectionIds(g,'panel-2-trajectory-1')).toEqual(['panel-1-trajectory-1','panel-2-trajectory-1','panel-3-trajectory-1']);
  const html=renderOutputHtml(g,formatValue);
  expect(html).toContain('panel-3-trajectory-2');
  expect(html).toContain('translate(640 0)');
 },60000);
 test(`${mode}: linked budgets and component selections are checked`,async()=>{
  for(const opts of ['{= components=[] }','{= components=[1,2],maxPanels=1 }','{= phaseComponents=[1] }','{= components=[3] }','{= columns=0 }']) {
   await expect((async()=>run(`.plot.LinkedTrajectory(s,${opts});`))()).rejects.toThrow();
  }
 },60000);
 test(`${mode}: linked event views share overlay identities and accept raised budgets`,async()=>{
  const g=await run('.plot.LinkedEvents(s.IsolateEvents(.ode.Event(t-3/4))[1],{= components=[1,2],phaseComponents=[1,2],maxPanels=10,maxEvents=101 });');
  expect(linkedGraphicSelectionIds(g,'panel-2-event-1')).toEqual(['panel-1-event-1','panel-2-event-1','panel-3-event-1']);
  expect(g.metadata.get('panels').values.every(p=>p.entries.get('eventoverlays').values.length===1)).toBe(true);
 },60000);
}
