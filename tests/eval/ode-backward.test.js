import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from '../../src/index.js';
import {Rational} from '@ratmath/core';
import {evaluateRealSemantic} from '../../src/runtime/math-semantic-eval.js';
import {mathBudgets} from '../../src/runtime/math-budgets.js';
const get=(v,k)=>v.entries.get(k.toLowerCase());
for(const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate('.Plugin.Load("ode");'+source,{context:new Context()});
    test(`${mode}: all ODE methods preserve descending time orientation`,async()=> {
        const value=await run('p := .ode.IVP(.calculus.Constant(1),1,1,1:0); (p,p.Euler({= steps=2 }),p.RK4({= steps=2 }),p.AdaptiveRK4({= initialSteps=2 }),p.ValidatedPicard({= steps=2,maxSubintervals=1 }),p.ValidatedTaylor2({= steps=2,maxSubintervals=1 }),p.AdaptiveValidatedTaylor2({= steps=2,maxSubintervals=1 }),p.ValidatedTaylor({= steps=2,order=3,maxSubintervals=1 }),p.AdaptiveValidatedTaylor({= steps=2,order=3,maxSubintervals=1 }));');
        expect(get(value.values[0],'direction').value).toBe('backward');
        for(const [i,solution] of value.values.slice(1).entries()) {
            expect(String(get(solution,'finalState').values[0])).toBe(i<3?'0':'0:0');
            const points=get(solution,'points').values;
            expect(String(points[0].values[0])).toBe('1');
            expect(String(points.at(-1).values[0])).toBe('0');
            expect(String(get(solution,'interval'))).toBe('1:0');
        }
        const dense=await run('p := .ode.IVP(.calculus.Constant(1),1,1,1:0); (p.RK4({= steps=2 }).At(3/4),p.ValidatedTaylor({= steps=2,order=3,maxSubintervals=1 }).At(3/4));');
        expect(dense.values.map(String)).toEqual(['3/4','3/4:3/4']);
    },60000);
    test(`${mode}: absolute contraction and odd-order remainder bounds cannot be bypassed`,async()=> {
        const result=await run('y := .calculus.Variable(:y); failed := .ode.IVP(10*y,1,1,1:0).ValidatedTaylor({= steps=1,order=3,maxSubintervals=1 }); partial := .ode.IVP(y,1,1,1:0).AdaptiveValidatedTaylor({= steps=1,order=3,maxAttempts=2,maxSubintervals=1 }); odd := .ode.IVP(y,1,1,1:1/2).ValidatedTaylor({= steps=2,order=3,maxSubintervals=1 }); (failed,partial,odd);');
        const [failed,partial,odd]=result.values;
        expect(get(failed,'certified')).toBeNull();
        expect(get(partial,'status').value).toBe('partial');
        expect(String(get(partial,'coveredInterval'))).toBe('1:1/2');
        expect(get(partial,'finalState')).toBeNull();
        for(const segment of get(odd,'segments').values) {
            expect(get(segment,'remainderBound').greaterThan(new Rational(0n))).toBe(true);
            expect(get(segment,'contractionBound').greaterThan(new Rational(0n))).toBe(true);
        }
        const reference=evaluateRealSemantic('rix.function.exp@1',[new Rational(-1n,2n)],mathBudgets(),v=>v,r=>{throw new Error(r);});
        const endpoint=get(odd,'finalState').values[0];
        expect(endpoint.low.lessThanOrEqual(reference.low)).toBe(true);
        expect(endpoint.high.greaterThanOrEqual(reference.high)).toBe(true);
    },60000);
    test(`${mode}: event directions are defined in increasing physical time`,async()=> {
        const result=await run('y := .calculus.Variable(:y); rising := .ode.Event(y-1/2,{= direction=:rising }); falling := .ode.Event(y-1/2,{= direction=:falling }); p := .ode.IVP(.calculus.Constant(1),1,1,1:0,{= events=[rising,falling] }); a := p.ValidatedTaylor({= steps=1,order=3,maxSubintervals=1 }).IsolateEvents(); b := p.RK4({= steps=1 }).IsolateEvents(); (a[1][:certifiedCandidates],a[2][:certifiedCandidates],a[1][:candidates][1][:interval],b[1][:candidates].Len(),b[2][:candidates].Len());');
        expect(result.values.map(String)).toEqual(['1','0','1/2:1/2','1','0']);
    },60000);
    test(`${mode}: initial time must match the oriented start`,async()=> {
        await expect((async()=>run('.ode.IVP(.calculus.Constant(1),1,1,0:1);'))()).rejects.toThrow('oriented start');
    });
    test(`${mode}: backward vector flow preserves coordinate order`,async()=> {
        const result=await run('t := .calculus.Variable(:t); .ode.IVP([t,2*t],1,[1/2,1],1:0,{= stateNames=[:x,:y] }).ValidatedTaylor({= order=3,steps=2,maxSubintervals=1 })[:finalState];');
        expect(result.values.map(String)).toEqual(['0:0','0:0']);
    },30000);
    test(`${mode}: forward/backward round trips retain the initial state and minimum-step limits`,async()=> {
        const result=await run('y := .calculus.Variable(:y); f := .ode.IVP(y,0,1,0:1/2).ValidatedTaylor({= steps=2,order=3,maxSubintervals=1 }); b := .ode.IVP(y,1/2,f[:finalState][1],1/2:0).ValidatedTaylor({= steps=2,order=3,maxSubintervals=1 }); limited := .ode.IVP(y,1,1,1:0).AdaptiveValidatedTaylor({= steps=1,order=3,minimumStep=3/4,maxSubintervals=1 }); (b[:finalState][1],limited[:work][:stopReason]);');
        expect(result.values[0].low.lessThanOrEqual(new Rational(1n))).toBe(true);
        expect(result.values[0].high.greaterThanOrEqual(new Rational(1n))).toBe(true);
        expect(result.values[1].value).toBe('minimumStepReached');
    },60000);
}
