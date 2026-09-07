import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from '../../src/index.js';
import {Rational} from '@ratmath/core';
import {evaluateRealSemantic} from '../../src/runtime/math-semantic-eval.js';
import {mathBudgets} from '../../src/runtime/math-budgets.js';
const get=(v,k)=>v.entries.get(k);
for(const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate('L(x) -> .ExpressionApply("rix.function.log.real-principal@1",:Log,[x]);'+source,{context:new Context()});
    test(`${mode}: logarithms preserve exact one and certify positive and negative results`,async()=> {
        const result=await run('(L(1).Eval(),L(2).Eval([], {= transcendentalBits=32 }),L(1/2).Eval([], {= transcendentalBits=32 }),L(1/2:2).Eval());');
        expect(String(get(result.values[0],'value'))).toBe('0');
        expect(get(result.values[1],'status').value).toBe('enclosed');
        expect(get(result.values[1],'value')).toBeNull();
        const a=get(result.values[1],'enclosure'),b=get(result.values[2],'enclosure');
        expect(a.low.greaterThan(new Rational(693n,1000n))).toBe(true);
        expect(a.high.lessThan(new Rational(694n,1000n))).toBe(true);
        expect(a.high.subtract(a.low).lessThanOrEqual(new Rational(1n,1n<<32n))).toBe(true);
        expect(b.low.equals(a.high.negate())).toBe(true);
        expect(b.high.equals(a.low.negate())).toBe(true);
        expect(get(result.values[3],'enclosure').low.lessThan(new Rational(0n))).toBe(true);
        expect(get(result.values[3],'resultkind').value).toBe('setEnclosure');
    });
    test(`${mode}: logarithm domains and configurable budgets are explicit`,async()=> {
        const result=await run('(L(0).Eval(),L((-2):0).Eval(),L(0:2).Eval(),L(2).Eval([], {= maxSumTerms=1 }),L(8).Eval([], {= maxExponent=1 }),L(8).Eval([], {= maxExponent=2 }));');
        for(const [i,reason] of ['outsideRealLogarithmDomain','outsideRealLogarithmDomain','logarithmDomainUnresolved','logarithmSeriesBudgetExceeded','logarithmReductionBudgetExceeded'].entries()) {
            expect(get(result.values[i],'status').value).toBe('unresolved');
            expect(get(result.values[i],'reasons').values.map(v=>v.value)).toContain(reason);
        }
        expect(get(result.values[5],'status').value).toBe('enclosed');
        const precision=await run('(L(8).Eval([], {= transcendentalBits=8 }),L(8).Eval([], {= transcendentalBits=40 }));');
        const coarse=get(precision.values[0],'enclosure'),fine=get(precision.values[1],'enclosure');
        expect(fine.low.greaterThanOrEqual(coarse.low)).toBe(true);
        expect(fine.high.lessThanOrEqual(coarse.high)).toBe(true);
        expect(fine.high.subtract(fine.low).lessThanOrEqual(new Rational(1n,1n<<40n))).toBe(true);
        await expect((async()=>run('L(2).Eval([], {= transcendentalBits=1000,maxDigits=10 });'))()).rejects.toThrow('budget');
    });
    test(`${mode}: logarithms support calculus graphs without losing real provenance`,async()=> {
        const result=await run('.Plugin.Load("calculus"); .Plugin.Load("numerics"); expr := .calculus.Log()(::x); r := .ExpressionReal(.numerics.Sqrt(2)); saved := .MathDecodeJSON(.MathEncodeJSON(r)); (expr.Eval([(::x,2)])[:status],L(r).Eval()[:status],L(saved).Eval()[:status],L(1~{pi}).Eval()[:status]);');
        expect(result.values.map(v=>v.value)).toEqual(['enclosed','enclosed','conditional','unresolved']);
    });
}

test('logarithm bounds contain independent unreduced log(1+t) series bounds',()=> {
    const one=new Rational(1n);
    for(let n=1;n<=6;n++) {
        const t=new Rational(BigInt(n),7n);
        // Alternating log(1+t): even partial sums are lower bounds;
        // adding the next positive term gives an upper bound.
        let sum=new Rational(0n),power=one;
        for(let k=1;k<=200;k++) {
            power=power.multiply(t);
            const term=power.divide(new Rational(BigInt(k)));
            sum=k%2 ? sum.add(term) : sum.subtract(term);
        }
        const upper=sum.add(power.multiply(t).divide(new Rational(201n)));
        for(const exponent of [1n,2n,4n,-1n,-2n,-4n]) {
            const invert=exponent<0n,magnitude=new Rational(invert ? -exponent : exponent);
            const x=one.add(t).pow(exponent);
            const result=evaluateRealSemantic('rix.function.log.real-principal@1',[x],{...mathBudgets(),transcendentalbits:16},v=>v,reason=>{throw new Error(reason);});
            expect(result.low.lessThanOrEqual((invert ? upper.negate() : sum).multiply(magnitude))).toBe(true);
            expect(result.high.greaterThanOrEqual((invert ? sum.negate() : upper).multiply(magnitude))).toBe(true);
            expect(result.high.subtract(result.low).lessThanOrEqual(new Rational(1n,1n<<16n))).toBe(true);
        }
    }
});
