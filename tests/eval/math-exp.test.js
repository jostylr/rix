import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from '../../src/index.js';
import {Rational} from '@ratmath/core';
import {evaluateRealSemantic} from '../../src/runtime/math-semantic-eval.js';
import {mathBudgets} from '../../src/runtime/math-budgets.js';
const get=(v,k)=>v.entries.get(k);
for(const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate('E(x) -> .ExpressionApply("rix.function.exp@1",:Exp,[x]);'+source,{context:new Context()});
    test(`${mode}: exponential evaluation returns exact zero case and certified enclosures`,async()=> {
        const value=await run('(E(0).Eval(),E(1).Eval([], {= transcendentalBits=32 }),E(-1).Eval([], {= transcendentalBits=32 }));');
        expect(String(get(value.values[0],'value'))).toBe('1');
        expect(get(value.values[1],'status').value).toBe('enclosed');
        expect(get(value.values[1],'value')).toBeNull();
        const positive=get(value.values[1],'enclosure'),negative=get(value.values[2],'enclosure');
        expect(positive.low.greaterThan(new Rational(2718n,1000n))).toBe(true);
        expect(positive.high.lessThan(new Rational(2719n,1000n))).toBe(true);
        expect(positive.high.subtract(positive.low).lessThanOrEqual(new Rational(1n,1n<<32n))).toBe(true);
        expect(negative.low.multiply(positive.low).lessThanOrEqual(new Rational(1n))).toBe(true);
        expect(negative.high.multiply(positive.high).greaterThanOrEqual(new Rational(1n))).toBe(true);
    });
    test(`${mode}: precision, reduction and series limits are configurable`,async()=> {
        const result=await run('(E(2).Eval([], {= transcendentalBits=8 }),E(2).Eval([], {= transcendentalBits=40 }),E(1).Eval([], {= maxSumTerms=1 }),E(4).Eval([], {= maxExponent=1 }));');
        const coarse=get(result.values[0],'enclosure'),fine=get(result.values[1],'enclosure');
        expect(fine.low.greaterThanOrEqual(coarse.low)).toBe(true);
        expect(fine.high.lessThanOrEqual(coarse.high)).toBe(true);
        expect(get(result.values[2],'reasons').values.map(v=>v.value)).toContain('exponentialSeriesBudgetExceeded');
        expect(get(result.values[3],'reasons').values.map(v=>v.value)).toContain('exponentialReductionBudgetExceeded');
        const interval=await run('E((-1):1).Eval();');
        expect(get(interval,'enclosure').low.lessThan(new Rational(1n))).toBe(true);
        expect(get(interval,'enclosure').high.greaterThan(new Rational(2n))).toBe(true);
        await expect((async()=>run('E(1).Eval([], {= transcendentalBits=1000,maxDigits=10 });'))()).rejects.toThrow('budget');
    });
    test(`${mode}: calculus graphs and frozen real provenance survive exponential evaluation`,async()=> {
        const result=await run('.Plugin.Load("calculus"); .Plugin.Load("numerics"); expr := .calculus.Exp()(::x); r := .ExpressionReal(.numerics.Sqrt(2)); saved := .MathDecodeJSON(.MathEncodeJSON(r)); (expr.Eval([(::x,1)])[:status],E(r).Eval()[:status],E(saved).Eval()[:status],E(1~{pi}).Eval()[:status]);');
        expect(result.values.map(v=>v.value)).toEqual(['enclosed','enclosed','conditional','unresolved']);
    });
}

test('exponential enclosures contain much tighter independent unreduced series bounds',()=> {
    for(let numerator=-14;numerator<=14;numerator++) {
        const x=new Rational(BigInt(numerator),7n),a=x.abs();
        let sum=new Rational(1n),term=sum;
        for(let k=1;k<=80;k++) {term=term.multiply(a).divide(new Rational(BigInt(k)));sum=sum.add(term);}
        // |x| <= 2: the remaining ratio is <= 2/82, so 3 times
        // the first omitted term is a conservative independent tail bound.
        const tail=term.multiply(a).divide(new Rational(81n)).multiply(new Rational(3n));
        let lower=sum,upper=sum.add(tail);
        if(numerator<0) [lower,upper]=[upper.reciprocal(),lower.reciprocal()];
        const result=evaluateRealSemantic('rix.function.exp@1',[x],{...mathBudgets(),transcendentalbits:16},v=>v,reason=>{throw new Error(reason);});
        expect((result.low ?? result).lessThanOrEqual(lower)).toBe(true);
        expect((result.high ?? result).greaterThanOrEqual(upper)).toBe(true);
    }
});
