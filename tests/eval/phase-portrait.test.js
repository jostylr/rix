import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync,renderOutputHtml,formatValue} from '../../src/index.js';
const field=(v,k)=>v.entries.get(k.toLowerCase());
const meta=v=>v.metadata.get('plot');
for(const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate('.Plugin.Load("ode"); .Plugin.Load("plot");'+source,{context:new Context()});
    const problem='t := .calculus.Variable(:t); p := .ode.IVP([t,2*t],1,[1/2,1],1:0,{= stateNames=[:x,:y] });';
    test(`${mode}: phase portrait projects certified backward tubes without inventing a curve`,async()=> {
        const result=await run(problem+'s := p.ValidatedTaylor({= steps=2,order=3,maxSubintervals=1 }); (s,.plot.PhasePortrait(s,{= xComponent=2,yComponent=1 }));');
        const [solution,graphic]=result.values,m=meta(graphic);
        const records=field(m,'records').values;
        const tubes=field(field(solution,'segments').values[0],'tube').values;
        expect(field(m,'kind').value).toBe('phase_portrait');
        expect(field(m,'status').value).toBe('enclosed');
        expect(field(m,'series').values).toHaveLength(0);
        expect(records).toHaveLength(2);
        expect(String(field(records[0],'xLow'))).toBe(String(tubes[1].low));
        expect(String(field(records[0],'xHigh'))).toBe(String(tubes[1].high));
        expect(String(field(records[0],'low'))).toBe(String(tubes[0].low));
        expect(String(field(records[0],'high'))).toBe(String(tubes[0].high));
        expect(String(field(records[0],'tStart'))).toBe('1');
        expect(field(field(m,'evidence'),'plotAddsCertification')).toBeNull();
        expect(graphic.children.filter(child=>child.kind==='rectangle')).toHaveLength(2);
    },30000);
    test(`${mode}: approximate paths retain component order and configurable display limits`,async()=> {
        const graphic=await run(problem+'.plot.PhasePortrait(p.RK4({= steps=2 }),{= maxSegments=1001,tickCount=3,maxTicks=30 });');
        const m=meta(graphic),series=field(m,'series').values;
        expect(field(m,'status').value).toBe('approximate');
        expect(series).toHaveLength(2);
        expect(field(series[0],'data').values[0].values.map(String)).toEqual(['1/2','1']);
        expect(field(series[1],'data').values[1].values.map(String)).toEqual(['0','0']);
        expect(String(field(field(m,'sampling'),'maxSegments'))).toBe('1001');
    },30000);
    test(`${mode}: omitted phase coverage is a warning, not a fabricated spatial region`,async()=> {
        const graphic=await run(problem+'.plot.PhasePortrait(p.RK4({= steps=2 }),{= maxSegments=1 });');
        const m=meta(graphic),unresolved=field(m,'unresolvedRegions').values;
        expect(field(m,'status').value).toBe('partial');
        expect(String(field(unresolved[0],'time'))).toBe('1/2:0');
        expect(field(unresolved[0],'reason').value).toBe('displayBudgetExceeded');
        expect(graphic.children.filter(child=>child.kind==='rectangle')).toHaveLength(0);
        expect(renderOutputHtml(graphic,formatValue)).toContain('phase-uncomputed');
    },30000);
    test(`${mode}: phase selection, clipping, and tick budgets are validated`,async()=> {
        for(const options of ['{= xComponent=0 }','{= yComponent=3 }','{= yComponent=1 }','{= yComponent=3/2 }','{= xDomain=[0,1/4] }','{= yDomain=[0,1/4] }','{= maxSegments=0 }','{= tickCount=6,maxTicks=5 }']) {
            await expect((async()=>run(problem+`.plot.PhasePortrait(p.RK4({= steps=2 }),${options});`))()).rejects.toThrow();
        }
    },30000);
    test(`${mode}: failed source tubes remain undisplayed`,async()=> {
        const graphic=await run('x := .calculus.Variable(:x); y := .calculus.Variable(:y); p := .ode.IVP([10*x,10*y],0,[1,1],0:1,{= stateNames=[:x,:y] }); .plot.PhasePortrait(p.ValidatedTaylor({= steps=1,order=3,maxSubintervals=1 }));');
        const m=meta(graphic);
        expect(field(m,'records').values).toHaveLength(0);
        expect(field(m,'status').value).toBe('partial');
        expect(field(field(m,'unresolvedRegions').values[0],'reason').value).toBe('unresolvedSourceSegment');
    },30000);
    test(`${mode}: stationary forward solutions get nondegenerate axes`,async()=> {
        const graphic=await run('z := .calculus.Constant(0); p := .ode.IVP([z,z],0,[1,2],0:1,{= stateNames=[:x,:y] }); .plot.PhasePortrait(p.RK4({= steps=1 }));');
        const m=meta(graphic),view=field(m,'view');
        expect(field(m,'status').value).toBe('approximate');
        expect(String(field(view,'xmin'))).toBe('0');
        expect(String(field(view,'xmax'))).toBe('2');
        expect(String(field(view,'ymin'))).toBe('1');
        expect(String(field(view,'ymax'))).toBe('3');
    },30000);
}
