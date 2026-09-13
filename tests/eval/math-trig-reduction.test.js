import {test,expect} from 'bun:test';
import {Rational,RationalInterval} from '@ratmath/core';
import {evaluateRealSemantic} from '../../src/runtime/math-semantic-eval.js';
import {mathBudgets} from '../../src/runtime/math-budgets.js';
const run=(x,cosine=false,options={})=>evaluateRealSemantic(cosine?'rix.function.cos@1':'rix.function.sin@1',[new Rational(x)],{...mathBudgets(),transcendentalbits:32,...options},v=>v,r=>{throw new Error(r);});
test('large radian arguments use bounded reduction and preserve parity',()=> {
    for(const x of [100n,1000000n,10n**30n]) for(const cosine of [false,true]) {
        const a=run(x,cosine),b=run(-x,cosine);
        expect(a.high.subtract(a.low).lessThanOrEqual(new Rational(1n,1n<<32n))).toBe(true);
        expect(a.low.greaterThanOrEqual(new Rational(-1n))).toBe(true);
        expect(a.high.lessThanOrEqual(new Rational(1n))).toBe(true);
        expect(String(b)).toBe(String(cosine?a:a.negate()));
    }
    const a=run(1000000n);
    expect(a.low.greaterThan(new Rational(-349994n,1000000n))).toBe(true);
    expect(a.high.lessThan(new Rational(-349993n,1000000n))).toBe(true);
});
test('reduction precision amplification is explicitly budgeted',()=> {
    expect(()=>run(1000000n,false,{maxexponent:4})).toThrow('trigonometricReductionBudgetExceeded');
    expect(()=>run(1000000n,false,{maxsumterms:1})).toThrow('trigonometricPiSeriesBudgetExceeded');
    expect(run(1000000n,false,{maxexponent:32})).toBeDefined();
});

test('intervals use endpoint bounds and correctly signed interior extrema',()=> {
    const range=(a,b,cosine=false)=>evaluateRealSemantic(cosine?'rix.function.cos@1':'rix.function.sin@1',[new RationalInterval(new Rational(a),new Rational(b))],mathBudgets(),v=>v,r=>{throw new Error(r);});
    const peak=range(1n,2n),trough=range(-2n,-1n);
    expect(peak.high.equals(new Rational(1n))).toBe(true);
    expect(peak.low.greaterThan(new Rational(84n,100n))).toBe(true);
    expect(String(trough)).toBe(String(peak.negate()));
    const cosine=range(-1n,1n,true);
    expect(cosine.high.equals(new Rational(1n))).toBe(true);
    expect(cosine.low.greaterThan(new Rational(54n,100n))).toBe(true);
    expect(String(range(-100n,100n))).toBe('-1:1');
    expect(range(0n,1n).high.lessThan(new Rational(85n,100n))).toBe(true);
});
