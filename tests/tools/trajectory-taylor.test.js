import {test,expect} from 'bun:test';
import {parseAndEvaluate,parseAndEvaluateAsync,Context} from '../../src/index.js';
import {queryTrajectoryTime} from '../../src/tools/trajectory-view.js';
import {RationalInterval} from '@ratmath/core';
const source=(solver,options='')=>`.Plugin.Load("ode"); .Plugin.Load("plot"); x := .calculus.Variable(:x); v := .calculus.Variable(:v); s := .ode.IVP([x,-v],1,[1,1],1:1/2,{= stateNames=[:x,:v] }).${solver}; (s.At(7/8),.plot.LinkedTrajectory(s,{= components=[1,2],phaseComponents=[1,2] ${options} }));`;
for(const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
 test(`${mode}: retained Taylor scrubbing matches At for both Taylor formats and negative time steps`,async()=>{
  for(const solver of ['ValidatedTaylor2({= steps=2,maxSubintervals=1 })','ValidatedTaylor({= steps=2,order=4,maxSubintervals=1 })']) {
   const fixture=mode==='async'?source(solver).replace('[x,-v]','[.calculus.Constant(1),.calculus.Constant(2)]'):source(solver);
   const result=await evaluate(fixture,{context:new Context()});
   const [at,g]=result.values,r=queryTrajectoryTime(g,'7/8');
   for(let i=0;i<2;i++){
    expect(String(r.panels[i].ylo)).toBe(String(at.values[i].low));
    expect(String(r.panels[i].yhi)).toBe(String(at.values[i].high));
    expect(r.panels[i].method).toBe('retainedTaylorIntersection');
   }
   expect(String(r.panels[2].xlo)).toBe(String(at.values[0].low));
   expect(String(r.panels[2].yhi)).toBe(String(at.values[1].high));
   const record=g.metadata.get('panels').values[0].entries.get('records').values[0];
   expect(r.panels[0].yhi.subtract(r.panels[0].ylo).lessThan(record.entries.get('high').subtract(record.entries.get('low')))).toBe(true);
  }
 },120000);
}
test('Taylor scrub budgets fail explicitly and can be raised',()=>{
 const solver='ValidatedTaylor({= steps=2,order=4,maxSubintervals=1 })';
 const make=options=>parseAndEvaluate(source(solver,options)).values[1];
 expect(()=>queryTrajectoryTime(make(',maxScrubOrder=2'),'7/8')).toThrow('maxScrubOrder');
 expect(()=>queryTrajectoryTime(make(',maxScrubWork=3'),'7/8')).toThrow('maxScrubWork');
 expect(queryTrajectoryTime(make(',maxScrubOrder=32'),'7/8').panels[0].method).toBe('retainedTaylorIntersection');
 expect(queryTrajectoryTime(make(',scrubMode=:tube,maxScrubOrder=1'),'7/8').panels[0].method).toBe('wholeRetainedTube');
});
test('Picard sources retain explicit whole-tube fallback',()=>{
 const g=parseAndEvaluate(source('ValidatedPicard({= steps=2,maxSubintervals=1 })')).values[1];
 expect(queryTrajectoryTime(g,'7/8').panels[0].method).toBe('wholeRetainedTube');
});
test('point-valued Taylor enclosures remain exact, and inconsistent imported coefficients fail',()=>{
 const g=parseAndEvaluate('.Plugin.Load("ode"); .Plugin.Load("plot"); s := .ode.IVP(.calculus.Constant(1),0,0,0:1).ValidatedTaylor({= steps=1,order=3,maxSubintervals=1 }); .plot.LinkedTrajectory(s);');
 const r=queryTrajectoryTime(g,'1/4');
 expect(String(r.panels[0].ylo)).toBe('1/4');expect(String(r.panels[0].yhi)).toBe('1/4');
 expect(String(queryTrajectoryTime(g,0).panels[0].yhi)).toBe('0');
 const record=g.metadata.get('panels').values[0].entries.get('records').values[0];
 record.entries.set('ycoefficients',{type:'array',values:[new RationalInterval('100','100')]});
 expect(()=>queryTrajectoryTime(g,'1/4')).toThrow('inconsistent');
});
