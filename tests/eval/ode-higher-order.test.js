import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from '../../src/index.js';
import {Rational} from '@ratmath/core';
import {evaluateRealSemantic} from '../../src/runtime/math-semantic-eval.js';
import {mathBudgets} from '../../src/runtime/math-budgets.js';
const get=(v,k)=>v.entries.get(k.toLowerCase());
const reference=(id,x)=>evaluateRealSemantic(id,[x],mathBudgets(),v=>v,r=>{throw new Error(r);});
for(const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate('.Plugin.Load("ode");'+source,{context:new Context()});
    test(`${mode}: fourth-order exponential flow retains a checked remainder and dense output`,async()=> {
        const result=await run('y := .calculus.Variable(:y); p := .ode.IVP(y,0,1,0:1/2); a := p.ValidatedTaylor({= order=2,steps=2,maxSubintervals=1 }); b := p.ValidatedTaylor({= order=4,steps=2,maxSubintervals=1 }); (a,b,b.At(1/4));');
        const [a,b,dense]=result.values;
        expect(get(b,'certified').value).toBe(1n);
        const low=get(a,'finalState').values[0],high=get(b,'finalState').values[0];
        expect(high.high.subtract(high.low).lessThan(low.high.subtract(low.low))).toBe(true);
        expect(high.low.lessThan(new Rational(164873n,100000n))).toBe(true);
        expect(high.high.greaterThan(new Rational(164872n,100000n))).toBe(true);
        expect(get(get(b,'wrappingControl'),'order').value).toBe(4n);
        expect(get(get(b,'segments').values[0],'taylorCoefficients').values).toHaveLength(4);
        expect(dense).toBeDefined();
        const e=reference('rix.function.exp@1',new Rational(1n,2n));
        expect(high.low.lessThanOrEqual(e.low)).toBe(true);
        expect(high.high.greaterThanOrEqual(e.high)).toBe(true);
    });
    test(`${mode}: order limits can be raised and adaptive exhaustion retains a prefix`,async()=> {
        const result=await run('t := .calculus.Variable(:t); p := .ode.IVP(t^3,0,0,0:1); a := p.ValidatedTaylor({= order=9,maxOrder=9,steps=1,maxSubintervals=1 }); y := .calculus.Variable(:y); b := .ode.IVP(y,0,1,0:1).AdaptiveValidatedTaylor({= order=3,steps=1,maxAttempts=1,maxSubintervals=1 }); (a,b);');
        expect(String(get(result.values[0],'finalState').values[0])).toBe('1/4:1/4');
        expect(get(result.values[1],'status').value).toBe('partial');
        expect(get(result.values[1],'finalState')).toBeNull();
        await expect((async()=>run('y := .calculus.Variable(:y); .ode.IVP(y,0,1,0:1).ValidatedTaylor({= order=5,maxOrder=4 });'))()).rejects.toThrow('order');
    },30000);
    test(`${mode}: vector Taylor flow and semantic forcing use checked ranges`,async()=> {
        const result=await run('x := .calculus.Variable(:x); y := .calculus.Variable(:y); t := .calculus.Variable(:t); a := .ode.IVP([y,-x],0,[1,0],0:1/4,{= stateNames=[:x,:y] }).ValidatedTaylor({= order=4,steps=2,maxSubintervals=1 }); b := .ode.IVP(.calculus.Sin()(t),0,0,0:1/4).ValidatedTaylor({= order=4,steps=2,maxSubintervals=1,rangeOptions={= semanticBudgets={= transcendentalBits=24 } } }); (a,b);');
        for(const solution of result.values) expect(get(solution,'certified').value).toBe(1n);
        const oscillator=get(result.values[0],'finalState').values;
        expect(oscillator[0].low.lessThan(new Rational(969n,1000n))).toBe(true);
        expect(oscillator[1].high.lessThan(new Rational(0n))).toBe(true);
        expect(get(result.values[1],'finalState').values[0].low.greaterThan(new Rational(0n))).toBe(true);
        const cosine=reference('rix.function.cos@1',new Rational(1n,4n));
        expect(oscillator[0].low.lessThanOrEqual(cosine.low)).toBe(true);
        expect(oscillator[0].high.greaterThanOrEqual(cosine.high)).toBe(true);
        const forced=get(result.values[1],'finalState').values[0],one=new Rational(1n);
        expect(forced.low.lessThanOrEqual(one.subtract(cosine.high))).toBe(true);
        expect(forced.high.greaterThanOrEqual(one.subtract(cosine.low))).toBe(true);
    },60000);
}
