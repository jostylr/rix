import {test,expect} from 'bun:test';
import {Context,parseAndEvaluate,parseAndEvaluateAsync} from '../../src/index.js';
import {Rational,RationalInterval} from '@ratmath/core';
import {evaluateRealSemantic} from '../../src/runtime/math-semantic-eval.js';
import {mathBudgets} from '../../src/runtime/math-budgets.js';
const get=(v,k)=>v.entries.get(k);
const setup='S(x) -> .ExpressionApply("rix.function.sin@1",:Sin,[x]); C(x) -> .ExpressionApply("rix.function.cos@1",:Cos,[x]);';
for(const [mode,evaluate] of [['sync',parseAndEvaluate],['async',parseAndEvaluateAsync]]) {
    const run=source=>evaluate(setup+source,{context:new Context()});
    test(`${mode}: sine and cosine give exact zero cases and certified point bounds`,async()=> {
        const result=await run('(S(0).Eval(),C(0).Eval(),S(1).Eval([], {= transcendentalBits=32 }),C(1).Eval([], {= transcendentalBits=32 }),S(-1).Eval([], {= transcendentalBits=32 }),C(-1).Eval([], {= transcendentalBits=32 }));');
        expect(String(get(result.values[0],'value'))).toBe('0');
        expect(String(get(result.values[1],'value'))).toBe('1');
        for(const report of result.values.slice(2)) {
            expect(get(report,'status').value).toBe('enclosed');
            expect(get(report,'value')).toBeNull();
            const range=get(report,'enclosure');
            expect(range.high.subtract(range.low).lessThanOrEqual(new Rational(1n,1n<<32n))).toBe(true);
        }
        const [s,c,negativeS,negativeC]=result.values.slice(2).map(v=>get(v,'enclosure'));
        expect(s.low.greaterThan(new Rational(84147n,100000n))).toBe(true);
        expect(s.high.lessThan(new Rational(84148n,100000n))).toBe(true);
        expect(c.low.greaterThan(new Rational(54030n,100000n))).toBe(true);
        expect(c.high.lessThan(new Rational(54031n,100000n))).toBe(true);
        expect(negativeS.low.equals(s.high.negate())).toBe(true);
        expect(negativeS.high.equals(s.low.negate())).toBe(true);
        expect(String(negativeC)).toBe(String(c));
    });
    test(`${mode}: interval bounds cover internal extrema rather than only endpoints`,async()=> {
        const result=await run('(S(1:2).Eval(),C((-1):1).Eval(),S((-4):4).Eval(),C(0:0).Eval());');
        for(const report of result.values.slice(0,3)) {
            expect(get(report,'status').value).toBe('enclosed');
            expect(get(report,'resultkind').value).toBe('setEnclosure');
            expect(get(report,'enclosure').high.equals(new Rational(1n))).toBe(true);
        }
        expect(String(get(result.values[2],'enclosure'))).toBe('-1:1');
        expect(String(get(result.values[3],'value'))).toBe('1');
    });
    test(`${mode}: trigonometric precision and work budgets are configurable`,async()=> {
        const result=await run('(S(8).Eval([], {= transcendentalBits=8 }),S(8).Eval([], {= transcendentalBits=40 }),C(1).Eval([], {= maxSumTerms=1 }),C(1).Eval([], {= maxSumTerms=64 }));');
        const coarse=get(result.values[0],'enclosure'),fine=get(result.values[1],'enclosure');
        expect(fine.low.greaterThanOrEqual(coarse.low)).toBe(true);
        expect(fine.high.lessThanOrEqual(coarse.high)).toBe(true);
        expect(get(result.values[2],'reasons').values.map(v=>v.value)).toContain('trigonometricSeriesBudgetExceeded');
        expect(get(result.values[3],'status').value).toBe('enclosed');
        await expect((async()=>run('S(1).Eval([], {= transcendentalBits=1000,maxDigits=10 });'))()).rejects.toThrow('budget');
        await expect((async()=>run('S(100).Eval([], {= transcendentalBits=8,maxDigits=10 });'))()).rejects.toThrow('budget');
    });
    test(`${mode}: calculus graphs, serialization and stored real provenance remain coherent`,async()=> {
        const result=await run('.Plugin.Load("calculus"); .Plugin.Load("numerics"); expr := .calculus.Sin()(::x)+.calculus.Cos()(::x); r := .ExpressionReal(.numerics.Sqrt(2)); saved := .MathDecodeJSON(.MathEncodeJSON(r)); (expr.Eval([(::x,0)])[:value],.MathDecodeJSON(.MathEncodeJSON(expr)).Eval([(::x,0)])[:status],S(r).Eval()[:status],C(saved).Eval()[:status],S(1~{pi^2}).Eval()[:status]);');
        expect(String(result.values[0])).toBe('1');
        // Decoding creates fresh graph identities: the original ::x is not its input.
        expect(result.values.slice(1).map(v=>v.value)).toEqual(['unresolved','enclosed','conditional','unresolved']);
        const inert=await run('a := .ExpressionApply("rix.function.sin@1",:NotACall,[0]); (.MathDecodeJSON(.MathEncodeJSON(a)).Eval()[:value],.ExpressionApply(:unknown,:Sin,[0]).Eval()[:status]);');
        expect(String(inert.values[0])).toBe('0');
        expect(inert.values[1].value).toBe('unresolved');
    });
}

test('trigonometric enclosures contain independent fixed-degree Taylor remainder bounds',()=> {
    const one=new Rational(1n);
    for(const cosine of [false,true]) for(const x of [new Rational(-8n),new Rational(-7n,3n),new Rational(1n,7n),new Rational(3n,2n),new Rational(8n)]) {
        let sum=new Rational(0n),power=one,factorial=1n;
        for(let degree=0;degree<=100;degree++) {
            if(degree) {power=power.multiply(x);factorial*=BigInt(degree);}
            if(degree%2===(cosine ? 0 : 1)) {
                const term=power.divide(new Rational(factorial));
                sum=Math.floor(degree/2)%2 ? sum.subtract(term) : sum.add(term);
            }
        }
        // Taylor's theorem: every real derivative of sin/cos has magnitude <= 1.
        const error=power.multiply(x).abs().divide(new Rational(factorial*101n));
        const result=evaluateRealSemantic(cosine ? 'rix.function.cos@1' : 'rix.function.sin@1',[x],{...mathBudgets(),transcendentalbits:24},v=>v,reason=>{throw new Error(reason);});
        expect(result.low.lessThanOrEqual(sum.subtract(error))).toBe(true);
        expect(result.high.greaterThanOrEqual(sum.add(error))).toBe(true);
        expect(result.high.subtract(result.low).lessThanOrEqual(new Rational(1n,1n<<24n))).toBe(true);
    }
});

test('interval kernel encloses point kernels throughout a domain crossing extrema',()=> {
    for(const id of ['rix.function.sin@1','rix.function.cos@1']) {
        const evaluate=value=>evaluateRealSemantic(id,[value],{...mathBudgets(),transcendentalbits:32},v=>v,reason=>{throw new Error(reason);});
        const range=evaluate(new RationalInterval(new Rational(1n),new Rational(2n)));
        for(let n=8;n<=16;n++) {
            const point=evaluate(new Rational(BigInt(n),8n));
            expect(range.low.lessThanOrEqual(point.low)).toBe(true);
            expect(range.high.greaterThanOrEqual(point.high)).toBe(true);
        }
    }
});
