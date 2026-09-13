import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from '../../src/index.js';
const field=(v,k)=>v.entries.get(k.toLowerCase());
const meta=v=>v.metadata.get('plot');
for(const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate('.Plugin.Load("ode"); .Plugin.Load("plot");'+source,{context:new Context()});
    test(`${mode}: trajectory plots retain whole certified tubes and separate approximations`,async()=> {
        const result=await run('y := .calculus.Variable(:y); p := .ode.IVP(y,0,1,0:1/2); a := p.ValidatedTaylor({= steps=2,order=3,maxSubintervals=1 }); (a,.plot.Trajectory(a),.plot.Trajectory(p.RK4({= steps=2 })));');
        const [solution,certified,approximate]=result.values;
        const records=field(meta(certified),'records').values;
        expect(records).toHaveLength(2);
        expect(field(meta(certified),'status').value).toBe('enclosed');
        expect(field(meta(approximate),'status').value).toBe('approximate');
        expect(field(meta(certified),'series').values).toHaveLength(0);
        expect(field(meta(approximate),'series').values).toHaveLength(2);
        const tube=field(field(solution,'segments').values[0],'tube').values[0];
        expect(String(field(records[0],'low'))).toBe(String(tube.low));
        expect(String(field(records[0],'high'))).toBe(String(tube.high));
        expect(field(field(meta(certified),'evidence'),'plotAddsCertification')).toBeNull();
        expect(certified.children.filter(child=>child.kind==='rectangle')).toHaveLength(2);
    },30000);
    test(`${mode}: backward vectors and display budgets keep coverage visible`,async()=> {
        const result=await run('t := .calculus.Variable(:t); p := .ode.IVP([t,2*t],1,[1/2,1],1:0,{= stateNames=[:x,:y] }); .plot.Trajectory(p.ValidatedTaylor({= steps=2,order=3,maxSubintervals=1 }),{= component=2,maxSegments=1 });');
        const m=meta(result),records=field(m,'records').values;
        expect(records).toHaveLength(1);
        expect(String(field(records[0],'tStart'))).toBe('1');
        expect(String(field(records[0],'tEnd'))).toBe('1/2');
        expect(field(m,'status').value).toBe('partial');
        const unresolved=field(m,'unresolvedRegions').values[0];
        expect(String(field(unresolved,'time'))).toBe('1/2:0');
        expect(field(unresolved,'reason').value).toBe('displayBudgetExceeded');
        expect(String(field(field(m,'evidence'),'component'))).toBe('2');
    },30000);
    test(`${mode}: failed certified segments are not drawn as solutions`,async()=> {
        const result=await run('y := .calculus.Variable(:y); p := .ode.IVP(10*y,0,1,0:1); .plot.Trajectory(p.ValidatedTaylor({= steps=1,order=3,maxSubintervals=1 }));');
        const m=meta(result);
        expect(field(m,'records').values).toHaveLength(0);
        expect(field(m,'unresolvedRegions').values).toHaveLength(1);
        expect(field(m,'status').value).toBe('partial');
        expect(field(field(m,'unresolvedRegions').values[0],'reason').value).toBe('unresolvedSourceSegment');
    });
    test(`${mode}: trajectory selections and budgets reject invalid requests`,async()=> {
        for(const options of ['{= component=0 }','{= component=2 }','{= maxSegments=0 }','{= xScale=:log10 }','{= xDomain=[0,1] }','{= tickCount=6,maxTicks=5 }']) {
            await expect((async()=>run(`p := .ode.IVP(.calculus.Constant(1),0,0,0:1).RK4(); .plot.Trajectory(p,${options});`))()).rejects.toThrow();
        }
    },30000);
    test(`${mode}: partial accepted prefixes and raised display budgets retain their distinctions`,async()=> {
        const result=await run('y := .calculus.Variable(:y); p := .ode.IVP(y,0,1,0:1); .plot.Trajectory(p.AdaptiveValidatedTaylor({= steps=1,order=3,maxAttempts=2,maxSubintervals=1 }),{= maxSegments=1001,tickCount=3,maxTicks=30 });');
        const m=meta(result);
        expect(field(m,'records').values).toHaveLength(1);
        const unresolved=field(m,'unresolvedRegions').values[0];
        expect(String(field(unresolved,'time'))).toBe('1/2:1');
        expect(field(unresolved,'reason').value).toBe('uncomputedTime');
        expect(String(field(field(m,'sampling'),'maxSegments'))).toBe('1001');
    },30000);
}
